'use strict';

/**
 * The Prompt Pit — live control server for ClueCon 2026 Vibe Coding Championship.
 *
 * Serves three surfaces over one HTTP + Socket.IO endpoint:
 *   /operator  private control panel (key-gated)
 *   /stage     esports-style projector display
 *   /vote      audience mobile voting page
 *
 * The server holds the single source of truth for event state and broadcasts
 * it to every connected client on change. Timers are server-authoritative.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

// Minimal, dependency-free .env loader for local `node server.js` runs.
// In the container, config comes from Docker `--env-file` instead (the .env
// file is deliberately NOT copied into the image — see .dockerignore).
// Existing environment variables always win; .env only fills gaps.
(function loadDotEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    for (const raw of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = raw.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
      if (!m) continue; // skips blanks and #-comments
      let [, k, v] = m;
      if (v && ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))) {
        v = v.slice(1, -1);
      }
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch (e) { /* non-fatal: fall back to real env */ }
})();

const PORT = parseInt(process.env.PORT || '3000', 10);
// Operator key: from env, else a stable random one printed at boot.
const OPERATOR_KEY = process.env.OPERATOR_KEY || crypto.randomBytes(4).toString('hex');
// Shared secret for the phone/SMS vote bridge (the SignalWire voice service).
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || crypto.randomBytes(12).toString('hex');

// Crash-safe persistence. State is snapshotted to DATA_DIR/state.json and
// restored on boot, so a container/laptop restart resumes the live show.
// If DATA_DIR isn't writable (no volume mounted), we degrade gracefully to
// in-memory only.
const DATA_DIR = process.env.DATA_DIR || '/data';
const STATE_FILE = path.join(DATA_DIR, 'state.json');
let persistOk = false;
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.accessSync(DATA_DIR, fs.constants.W_OK);
  persistOk = true;
} catch (e) {
  persistOk = false;
}
let persistTimer = null;
function schedulePersist() {
  if (!persistOk || persistTimer) return;
  persistTimer = setTimeout(function () { persistTimer = null; persistNow(); }, 800);
}
function persistNow() {
  if (!persistOk) return;
  try {
    const blob = JSON.stringify({ v: 1, savedAt: Date.now(), state, registrations, opkeys, auditLog });
    fs.writeFileSync(STATE_FILE + '.tmp', blob);
    fs.renameSync(STATE_FILE + '.tmp', STATE_FILE); // atomic swap
  } catch (e) { /* non-fatal */ }
}
// Reload a snapshot at boot. Returns true if a valid snapshot was restored.
function restoreSnapshot() {
  if (!persistOk) return false;
  try {
    if (!fs.existsSync(STATE_FILE)) return false;
    const blob = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (!blob || !blob.state || !blob.state.matches) return false;
    state = blob.state;
    registrations = Array.isArray(blob.registrations) ? blob.registrations : [];
    opkeys = Array.isArray(blob.opkeys) ? blob.opkeys : [];
    auditLog = Array.isArray(blob.auditLog) ? blob.auditLog : [];
    // Refresh static catalog from code so challenge edits/deploys take effect.
    state.challenges = CHALLENGES;
    state.criteria = CRITERIA;
    // Always reflect the current env's voting number (may change between runs).
    state.voteNumber = process.env.VOTE_NUMBER || '';
    // Backfill fields added after older snapshots were written, and self-heal
    // any voteBreakdown left stale by the pre-fix reseed bug: if a side has no
    // votes, its channel breakdown must be zero too (Stage reads votes, Stats
    // reads the breakdown — they must never disagree).
    for (const mid of Object.keys(state.matches || {})) {
      const m = state.matches[mid];
      if (!m.voteBreakdown) m.voteBreakdown = blankBreakdown();
      const v = m.votes || { a: 0, b: 0 };
      for (const side of ['a', 'b']) {
        if (!v[side]) m.voteBreakdown[side] = { web: 0, sms: 0, call: 0 };
      }
    }
    if (state.sabotage && !Array.isArray(state.sabotage.history)) state.sabotage.history = [];
    // Never auto-resume a running timer across a restart — freeze it so the
    // operator explicitly restarts. Compute the leftover time it had.
    if (state.timer) {
      if (state.timer.running && state.timer.endsAt) {
        state.timer.remainingSec = Math.max(0, Math.round((state.timer.endsAt - Date.now()) / 1000));
      }
      state.timer.running = false;
      state.timer.endsAt = null;
    }
    // Clear transient animation flags that shouldn't survive a restart.
    if (state.sabotage) state.sabotage.spinning = false;
    if (state.draw) state.draw.drawing = false;
    return true;
  } catch (e) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

const DEFAULT_CONTESTANTS = [
  'Contestant 1', 'Contestant 2', 'Contestant 3', 'Contestant 4',
  'Contestant 5', 'Contestant 6', 'Contestant 7', 'Contestant 8',
];

const CHALLENGES = [
  {
    id: 'worst-ivr',
    selectable: true,
    title: 'Build the Worst IVR',
    tagline: 'Create the most frustrating phone tree imaginable.',
    brief: 'Design a phone menu so infuriating it loops forever, transfers to itself, and never lets a human through. Judged on humor, creativity, and audience groans.',
  },
  {
    id: 'rogue-agent',
    selectable: true,
    title: 'AI Voice Agent Gone Rogue',
    tagline: 'A support agent that slowly becomes emotionally unstable.',
    brief: 'Build a fake AI support agent that starts helpful and gradually spirals into an existential crisis. Strong potential for live comedy and improv.',
  },
  {
    id: 'fix-disaster',
    selectable: true,
    title: 'Fix This Disaster',
    tagline: 'Intentionally broken code. First to make it work wins.',
    brief: 'You receive sabotaged code / prompts. First contestant to get it functional takes the round.',
  },
  {
    id: 'prompt-golf',
    selectable: true,
    title: 'Prompt Golf',
    tagline: 'Best output, fewest prompt characters.',
    brief: 'Hit the target output using the shortest prompt possible. Lowest character count that lands the goal wins.',
  },
  {
    id: 'carrier-or-chaos',
    selectable: true,
    title: 'Carrier-Grade or Chaos?',
    tagline: 'Build a telecom dashboard / alert / call flow.',
    brief: 'Build something operational — a dashboard, telecom alert, or call flow. Audience votes whether they would trust it in production.',
  },
  {
    id: 'audience-sabotage',
    selectable: false,
    title: 'Finale: Audience Sabotage',
    tagline: 'The crowd adds a new requirement every few minutes.',
    brief: 'Head-to-head finale. Spin the Sabotage Wheel to inject surprise requirements mid-build. Adapt or die.',
  },
];

const DEFAULT_SABOTAGE = [
  'Pirate voice mode — everything must sound like a pirate',
  'Respond ONLY in SIP error codes',
  'Upsell caller ID on every interaction',
  'Add hold music that is just kazoo',
  'The agent now speaks exclusively in haiku',
  'Every response must rhyme',
  'Add a mandatory 10-second dramatic pause',
  'Convert all output to ALL CAPS SHOUTING',
  'The IVR now insults the caller (politely)',
  'Everything must reference cats',
  'Add a surprise German translation step',
  'The agent is convinced it is a lighthouse',
  'Charge the caller $0.99 per word (announce it)',
  'Add a conspiracy-theory subplot',
  'The system must now yodel between menu options',
];

const CRITERIA = [
  { key: 'functionality', label: 'Functionality' },
  { key: 'creativity', label: 'Creativity' },
  { key: 'crowd', label: 'Crowd Reaction' },
  { key: 'adaptability', label: 'Adaptability' },
  { key: 'entertainment', label: 'Entertainment' },
  { key: 'shipit', label: 'Would It Ship?' },
];

// Bracket topology: which slot a match winner feeds into.
const ADVANCES = {
  R1M1: { to: 'SF1', slot: 'a' },
  R1M2: { to: 'SF1', slot: 'b' },
  R1M3: { to: 'SF2', slot: 'a' },
  R1M4: { to: 'SF2', slot: 'b' },
  SF1: { to: 'F1', slot: 'a' },
  SF2: { to: 'F1', slot: 'b' },
};

const MATCH_ORDER = ['R1M1', 'R1M2', 'R1M3', 'R1M4', 'SF1', 'SF2', 'F1'];
const PHASES = ['idle', 'intro', 'compete', 'judging', 'voting', 'results', 'champion'];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function blankScore() {
  const s = {};
  for (const c of CRITERIA) s[c.key] = 0;
  return s;
}
// Per-channel audience-vote tally for a match (web QR, SMS, phone call).
function blankBreakdown() {
  return { a: { web: 0, sms: 0, call: 0 }, b: { web: 0, sms: 0, call: 0 } };
}
// Live countdown view — computes remaining from endsAt when running so REST
// callers (the voice/SMS agent) see the true time left, not a stale snapshot.
function timerView() {
  const t = state.timer || {};
  let remaining = t.remainingSec || 0;
  if (t.running && t.endsAt) remaining = Math.max(0, Math.round((t.endsAt - Date.now()) / 1000));
  return { running: !!t.running, remainingSec: remaining, durationSec: t.durationSec || 0 };
}
function sumScore(s) {
  let t = 0;
  for (const c of CRITERIA) t += (s && s[c.key]) || 0;
  return t;
}
// Set the winner for the current match, advance the bracket, and fire the
// reveal event. Shared by manual (setWinner) and auto (declareWinner).
function applyWinner(side) {
  const cur = state.matches[state.currentMatchId];
  cur.winner = side;
  const winnerId = cur[side];
  const adv = ADVANCES[state.currentMatchId];
  if (adv) state.matches[adv.to][adv.slot] = winnerId;
  else state.champion = winnerId;
  state.phase = state.champion ? 'champion' : 'results';
  io.emit('winner', {
    side: side,
    id: winnerId,
    name: (state.contestants.find((c) => c.id === winnerId) || {}).name || '',
    champion: !!state.champion,
  });
}

function newMatch(round, label, durationSec) {
  return {
    round,
    label,
    a: null, // contestant id
    b: null,
    winner: null, // 'a' | 'b'
    scores: { a: blankScore(), b: blankScore() },
    votes: { a: 0, b: 0 },
    voteBreakdown: blankBreakdown(), // { a: {web,sms,call}, b: {...} }
  };
}

function initialState() {
  return {
    eventName: 'THE PROMPT PIT',
    subtitle: 'ClueCon 2026 · Vibe Coding Championship',
    contestants: DEFAULT_CONTESTANTS.map((name, i) => ({ id: 'c' + (i + 1), name, github: '' })),
    matches: {
      R1M1: newMatch('R1', 'Round 1 · Match 1'),
      R1M2: newMatch('R1', 'Round 1 · Match 2'),
      R1M3: newMatch('R1', 'Round 1 · Match 3'),
      R1M4: newMatch('R1', 'Round 1 · Match 4'),
      SF1: newMatch('SF', 'Semi-Final 1'),
      SF2: newMatch('SF', 'Semi-Final 2'),
      F1: newMatch('F', 'Grand Finale'),
    },
    currentMatchId: 'R1M1',
    phase: 'idle',
    challengeId: 'worst-ivr',
    challenges: CHALLENGES,
    criteria: CRITERIA,
    timer: {
      durationSec: 300,
      remainingSec: 300,
      running: false,
      endsAt: null, // epoch ms when running
    },
    votingOpen: false,
    sabotage: {
      entries: DEFAULT_SABOTAGE.slice(),
      lastResult: null,
      spinning: false,
      history: [], // [{ text, at, matchId, matchLabel, a, b }] newest-first
    },
    publicUrl: process.env.PUBLIC_URL || '',
    // Public voting phone number (call + SMS). Shown on the Stage vote card.
    voteNumber: process.env.VOTE_NUMBER || '',
    // QR data URLs for each public destination (vote + register).
    qr: { vote: '', register: '' },
    // Which QR the Stage shows: 'vote' | 'register' | null.
    qrShow: null,
    // Public-safe registrant count (the roster itself, with emails, is kept
    // OUT of this broadcast object — see `registrations` below).
    registrantCount: 0,
    // Public-safe per-challenge pick tally { challengeId: count } — no PII.
    challengeCounts: {},
    // Random-draw animation state (names only, no PII).
    draw: { drawing: false, candidates: [], result: null },
    champion: null,
  };
}

let state = initialState();

// Registrant pool — SERVER-SIDE ONLY. Holds PII (email) and is never included
// in the global `state` broadcast. Full roster is pushed only to authenticated
// operator sockets via the 'roster' event.
let registrations = [];

// ---------------------------------------------------------------------------
// Operator keys (scoped, API-key style) — SERVER-SIDE ONLY. Secrets never go
// into the global broadcast; the management list (masked) is pushed only to
// key-admin operators via the 'opkeys' event.
// ---------------------------------------------------------------------------
// Sections a key can be scoped to. '*' = full access (master).
const SCOPES = ['flow', 'match', 'timer', 'scoring', 'voting', 'sabotage', 'registration', 'event', 'keys'];
// Map each operator command to the scope it requires.
const SCOPE_FOR = {
  setPhase: 'flow',
  selectMatch: 'match', setChallenge: 'match',
  timerSet: 'timer', timerStart: 'timer', timerPause: 'timer', timerReset: 'timer', timerAdjust: 'timer',
  setScore: 'scoring', clearScores: 'scoring', setWinner: 'scoring', declareWinner: 'scoring', clearWinner: 'scoring',
  openVoting: 'voting', closeVoting: 'voting', resetVotes: 'voting', setQr: 'voting',
  spinSabotage: 'sabotage', setSabotageEntries: 'sabotage', clearSabotageResult: 'sabotage',
  drawContestants: 'registration', removeRegistrant: 'registration', clearRegistrations: 'registration', setContestants: 'registration', renameContestants: 'registration',
  setEventName: 'event', setPublicUrl: 'event', resetEvent: 'event',
  createKey: 'keys', revokeKey: 'keys',
};
let opkeys = [];        // [{id,label,key,scopes,master,createdAt,createdBy,revoked,revokedAt,lastUsedAt,useCount,lastIp,lastUa}]
let auditLog = [];      // [{at, action, detail, by, ip}]
const activeByKey = new Map(); // keyId -> Set(socketId) (runtime only)

function hasScope(scopes, needed) {
  if (!Array.isArray(scopes)) return false;
  return scopes.indexOf('*') !== -1 || scopes.indexOf(needed) !== -1;
}
function ipOf(socket) {
  const h = socket.handshake.headers || {};
  const xff = (h['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = xff || h['cf-connecting-ip'] || socket.handshake.address || '';
  return String(ip).replace(/^::ffff:/, '').slice(0, 60);
}
function uaOf(socket) {
  return String((socket.handshake.headers || {})['user-agent'] || '').slice(0, 200);
}
function newSecret() { return crypto.randomBytes(12).toString('hex'); }
function findKeyBySecret(secret) {
  if (typeof secret !== 'string' || !secret) return null;
  const given = Buffer.from(secret);
  for (const k of opkeys) {
    if (k.revoked) continue;
    const kb = Buffer.from(k.key);
    if (kb.length === given.length && crypto.timingSafeEqual(kb, given)) return k;
  }
  return null;
}
function activeCount(keyId) {
  const s = activeByKey.get(keyId);
  return s ? s.size : 0;
}
function addActive(keyId, socketId) {
  let s = activeByKey.get(keyId);
  if (!s) { s = new Set(); activeByKey.set(keyId, s); }
  s.add(socketId);
}
function removeActive(keyId, socketId) {
  const s = activeByKey.get(keyId);
  if (s) { s.delete(socketId); if (!s.size) activeByKey.delete(keyId); }
}
function logAudit(action, detail, by, ip) {
  auditLog.unshift({ at: Date.now(), action, detail, by: by || '', ip: ip || '' });
  if (auditLog.length > 100) auditLog.length = 100;
}
// Bootstrap / re-sync the master key from the env OPERATOR_KEY (source of truth).
function ensureMasterKey() {
  let m = opkeys.find((k) => k.master);
  if (!m) {
    m = {
      id: crypto.randomUUID(), label: 'Master key (.env)', key: OPERATOR_KEY, scopes: ['*'], master: true,
      createdAt: Date.now(), createdBy: 'system', revoked: false, revokedAt: null,
      lastUsedAt: null, useCount: 0, lastIp: null, lastUa: null,
    };
    opkeys.unshift(m);
  } else {
    m.key = OPERATOR_KEY; m.scopes = ['*']; m.revoked = false;
  }
}
// Masked, secret-free view for the management UI.
function sanitizeKeysList() {
  return opkeys.map((k) => ({
    id: k.id, label: k.label, scopes: k.scopes, master: k.master,
    masked: '••••' + String(k.key).slice(-4),
    createdAt: k.createdAt, createdBy: k.createdBy,
    revoked: k.revoked, revokedAt: k.revokedAt,
    lastUsedAt: k.lastUsedAt, useCount: k.useCount || 0,
    lastIp: k.lastIp, lastUa: k.lastUa, active: activeCount(k.id),
  }));
}
function broadcastKeys() {
  io.to('keyadmins').emit('opkeys', { scopeList: SCOPES, keys: sanitizeKeysList(), audit: auditLog.slice(0, 40) });
}

// Seed the first-round contestant slots from the seed list.
function seedBracket() {
  const c = state.contestants;
  state.matches.R1M1.a = c[0] ? c[0].id : null;
  state.matches.R1M1.b = c[1] ? c[1].id : null;
  state.matches.R1M2.a = c[2] ? c[2].id : null;
  state.matches.R1M2.b = c[3] ? c[3].id : null;
  state.matches.R1M3.a = c[4] ? c[4].id : null;
  state.matches.R1M3.b = c[5] ? c[5].id : null;
  state.matches.R1M4.a = c[6] ? c[6].id : null;
  state.matches.R1M4.b = c[7] ? c[7].id : null;
}
seedBracket();

// Per-match voter dedupe: matchId -> Set(voterToken)
const voters = new Map();

// ---------------------------------------------------------------------------
// Timer (server-authoritative)
// ---------------------------------------------------------------------------

let timerInterval = null;

function tick() {
  const t = state.timer;
  if (!t.running || t.endsAt == null) return;
  const remaining = Math.max(0, Math.round((t.endsAt - Date.now()) / 1000));
  t.remainingSec = remaining;
  if (remaining <= 0) {
    t.running = false;
    t.endsAt = null;
    stopTimerLoop();
    broadcast();
    io.emit('timeup', { matchId: state.currentMatchId });
    return;
  }
  io.emit('tick', { remainingSec: remaining });
}

function startTimerLoop() {
  if (timerInterval) return;
  timerInterval = setInterval(tick, 250);
}
function stopTimerLoop() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeText(v, max = 120) {
  if (typeof v !== 'string') return '';
  // Strip control chars; length-cap. Rendering side uses textContent so this
  // is defense-in-depth, not the only XSS guard.
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, max);
}

function clampScore(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(10, Math.max(0, Math.round(n)));
}

function validEmail(v) {
  if (typeof v !== 'string') return false;
  // Deliberately loose — enough to reject obvious junk, not RFC-perfect.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 200;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Only challenges flagged `selectable` may be chosen at registration (the
// finale is reached, not opted into). Enforced server-side, not just in the UI.
const SELECTABLE_CHALLENGE_IDS = new Set(CHALLENGES.filter((c) => c.selectable).map((c) => c.id));
// Validate + dedupe a contestant's selected challenge ids against the catalog.
function parseChallengeSelection(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const id of v.slice(0, 50)) {
    if (typeof id === 'string' && SELECTABLE_CHALLENGE_IDS.has(id) && out.indexOf(id) === -1) out.push(id);
  }
  return out.slice(0, SELECTABLE_CHALLENGE_IDS.size);
}

// Rebuild bracket + downstream state from the current contestants list.
function reseedFromContestants() {
  for (const id of MATCH_ORDER) {
    const m = state.matches[id];
    m.winner = null;
    m.votes = { a: 0, b: 0 };
    m.voteBreakdown = blankBreakdown();
    m.scores = { a: blankScore(), b: blankScore() };
    if (!id.startsWith('R1')) { m.a = null; m.b = null; }
  }
  seedBracket();
  state.champion = null;
  state.currentMatchId = 'R1M1';
  state.votingOpen = false;
  voters.clear();
}

async function regenQr() {
  state.qr = { vote: '', register: '' };
  if (!state.publicUrl) return;
  const base = state.publicUrl.replace(/\/+$/, '');
  const opts = { margin: 1, width: 480, color: { dark: '#0a0a0f', light: '#ffffffff' } };
  try {
    state.qr.vote = await QRCode.toDataURL(base + '/vote', opts);
    state.qr.register = await QRCode.toDataURL(base + '/register', opts);
  } catch (e) {
    state.qr = { vote: '', register: '' };
  }
}

function broadcast() {
  io.emit('state', state);
  schedulePersist();
}

// Record one vote into the current match, deduped by a stable voter token
// (web device token, or a phone number for call/SMS). Shared by the web
// socket path and the phone/SMS bridge. Returns {ok, side, already?, error?}.
function recordVote(token, side, channel) {
  if (!state.votingOpen) return { ok: false, error: 'voting closed' };
  if (side !== 'a' && side !== 'b') return { ok: false, error: 'bad side' };
  token = sanitizeText(token, 80);
  if (!token) return { ok: false, error: 'bad token' };
  const ch = channel === 'sms' ? 'sms' : channel === 'call' ? 'call' : 'web';
  const matchId = state.currentMatchId;
  const m = state.matches[matchId];
  if (!m.a || !m.b) return { ok: false, error: 'match not ready' };
  if (!m.voteBreakdown) m.voteBreakdown = blankBreakdown();
  let set = voters.get(matchId);
  if (!set) { set = new Map(); voters.set(matchId, set); }
  const prev = set.get(token); // { side, channel } | undefined
  if (prev && prev.side === side) return { ok: true, side: side, already: true };
  if (prev) {
    // Allow switching sides — undo the previous tally in its own channel bucket.
    m.votes[prev.side] = Math.max(0, m.votes[prev.side] - 1);
    const pc = prev.channel || 'web';
    m.voteBreakdown[prev.side][pc] = Math.max(0, (m.voteBreakdown[prev.side][pc] || 0) - 1);
  }
  set.set(token, { side, channel: ch });
  m.votes[side] += 1;
  m.voteBreakdown[side][ch] = (m.voteBreakdown[side][ch] || 0) + 1;
  broadcast();
  return { ok: true, side: side };
}

// Push the full roster (incl. email) to authenticated operators ONLY.
function broadcastRoster() {
  io.to('operators').emit('roster', registrations);
}

// Aggregate per-challenge pick counts (PII-safe) for the public state.
function recomputeChallengeCounts() {
  const counts = {};
  SELECTABLE_CHALLENGE_IDS.forEach((id) => { counts[id] = 0; });
  for (const r of registrations) {
    for (const id of r.challenges || []) {
      if (Object.prototype.hasOwnProperty.call(counts, id)) counts[id] += 1;
    }
  }
  state.challengeCounts = counts;
}

// Contestant-facing starter kits. Whitelisted files ONLY — the *.SOLUTION.yaml
// file is intentionally never referenced or served.
const STARTER_FILES = [
  { id: 'worst-ivr', file: 'worst-ivr.starter.yaml', lang: 'yaml' },
  { id: 'rogue-agent', file: 'rogue-agent.starter.yaml', lang: 'yaml' },
  { id: 'fix-disaster', file: 'fix-this-disaster.broken.yaml', lang: 'yaml' },
  { id: 'prompt-golf', file: 'prompt-golf.starter.txt', lang: 'text' },
  { id: 'carrier-or-chaos', file: 'carrier-or-chaos.starter.yaml', lang: 'yaml' },
];
let STARTERS = [];
function loadStarters() {
  STARTERS = STARTER_FILES.map((s) => {
    let code = '';
    try { code = fs.readFileSync(path.join(__dirname, 'scaffolds', s.file), 'utf8'); } catch (e) { code = ''; }
    const ch = CHALLENGES.find((c) => c.id === s.id);
    return { id: s.id, title: ch ? ch.title : s.id, file: s.file, lang: s.lang, code };
  }).filter((s) => s.code);
}
loadStarters();

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const app = express();
app.disable('x-powered-by');

// --- Reverse proxy: /agent* and /sms -> the internal voice/SMS container ---
// So the whole show (web + phone + SMS) lives behind ONE cloudflared URL. This
// is mounted BEFORE express.json so the raw request body streams through.
const VOICE_UPSTREAM = process.env.VOICE_UPSTREAM || 'http://prompt-pit-voice:8100';
function proxyToVoice(req, res) {
  let u;
  try { u = new URL(VOICE_UPSTREAM); } catch (e) { return res.status(500).end(); }
  const headers = Object.assign({}, req.headers, { host: u.host });
  // Tell the SWML agent its real public base so its SWAIG callback URLs use the
  // app tunnel (the agent honors these with SWML_TRUST_PROXY_HEADERS=true).
  if (state.publicUrl) {
    try {
      const p = new URL(state.publicUrl);
      headers['x-forwarded-host'] = p.host;
      headers['x-forwarded-proto'] = 'https';
    } catch (e) { /* ignore */ }
  }
  const pr = http.request(
    { hostname: u.hostname, port: u.port || 80, path: req.originalUrl, method: req.method, headers },
    (pres) => { res.writeHead(pres.statusCode, pres.headers); pres.pipe(res); }
  );
  pr.on('error', () => { if (!res.headersSent) res.status(502).json({ error: 'voice service unreachable' }); });
  req.pipe(pr);
}
app.use((req, res, next) => {
  if (req.path === '/sms' || req.path === '/agent' || req.path.startsWith('/agent/')) {
    // eslint-disable-next-line no-console
    console.log('[APP-IN] ' + new Date().toISOString() + ' ' + req.method + ' ' + req.originalUrl
      + ' ip=' + (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '?')
      + ' ua=' + JSON.stringify(req.headers['user-agent'] || ''));
    return proxyToVoice(req, res);
  }
  next();
});

app.use(express.json({ limit: '32kb' }));

// Security headers (defense-in-depth; no external dep needed).
// CSP: scripts are same-origin files only (no inline JS anywhere); inline
// <style> + style attrs need 'unsafe-inline' for style-src; Google Fonts +
// QR data: URLs + same-origin websockets are allowed explicitly.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');
app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR, { index: false }));

app.get('/', (_req, res) => res.redirect('/stage'));
app.get('/stage', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'stage.html')));
app.get('/operator', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'operator.html')));
app.get('/vote', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'vote.html')));
app.get('/register', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'register.html')));
app.get('/stats', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'stats.html')));
app.get('/how', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'how.html')));
app.get('/api/starters', (_req, res) => res.json(STARTERS));
// The app's public tunnel URL, so the voice service can point SignalWire at it.
app.get('/api/public', (_req, res) => res.json({ publicUrl: state.publicUrl || '' }));
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// --- Phone/SMS vote bridge (used by the SignalWire voice service) ---
// Public-safe view of the current matchup so the voice agent knows the choices.
app.get('/api/current', (_req, res) => {
  const m = state.matches[state.currentMatchId];
  const nameOf = (id) => (state.contestants.find((c) => c.id === id) || {}).name || null;
  res.json({
    votingOpen: state.votingOpen,
    matchId: state.currentMatchId,
    label: m ? m.label : '',
    round: m ? m.round : '',
    a: { name: nameOf(m && m.a) },
    b: { name: nameOf(m && m.b) },
    timer: timerView(),
  });
});
// Richer PII-safe snapshot for the voice/SMS agent so a caller can ask what's
// happening: active challenge, current matchup, live standings, and the bracket.
// Names only — never emails/GitHub or any roster PII.
app.get('/api/showinfo', (_req, res) => {
  const nameOf = (id) => (state.contestants.find((c) => c.id === id) || {}).name || null;
  const cur = state.matches[state.currentMatchId] || null;
  const ch = (state.challenges || CHALLENGES).find((c) => c.id === state.challengeId) || null;

  // Live standings — announced during voting, after close, and once decided.
  // (Operator chose to broadcast running totals to phone/SMS callers.)
  let standings = { revealed: false };
  if (cur && cur.a && cur.b) {
    const bd = cur.voteBreakdown || blankBreakdown();
    const aTotal = sumScore(cur.scores.a) + cur.votes.a;
    const bTotal = sumScore(cur.scores.b) + cur.votes.b;
    const leaderSide = aTotal === bTotal ? null : (aTotal > bTotal ? 'a' : 'b');
    standings = {
      revealed: true,
      votingOpen: state.votingOpen,
      a: { name: nameOf(cur.a), judges: sumScore(cur.scores.a), votes: cur.votes.a, total: aTotal, byChannel: bd.a },
      b: { name: nameOf(cur.b), judges: sumScore(cur.scores.b), votes: cur.votes.b, total: bTotal, byChannel: bd.b },
      leader: leaderSide ? nameOf(cur[leaderSide]) : null,
      tie: leaderSide === null,
      winner: cur.winner ? nameOf(cur[cur.winner]) : null,
    };
  }

  // Bracket progression (names + status only).
  const bracket = MATCH_ORDER.map((id) => {
    const mm = state.matches[id];
    return {
      id,
      label: mm.label,
      round: mm.round,
      a: nameOf(mm.a),
      b: nameOf(mm.b),
      winner: mm.winner ? nameOf(mm[mm.winner]) : null,
      done: !!mm.winner,
    };
  });
  const decided = bracket.filter((b) => b.done).length;
  const ROUND_NAME = { R1: 'Round 1 (8 → 4)', SF: 'Semi-Finals (4 → 2)', F: 'Grand Finale' };

  res.json({
    event: state.eventName,
    phase: state.phase,
    votingOpen: state.votingOpen,
    champion: state.champion ? nameOf(state.champion) : null,
    challenge: ch ? { title: ch.title, tagline: ch.tagline, brief: ch.brief } : null,
    match: cur ? { label: cur.label, round: cur.round, a: nameOf(cur.a), b: nameOf(cur.b) } : null,
    timer: timerView(),
    standings,
    bracketStats: {
      roundName: cur ? (ROUND_NAME[cur.round] || cur.round) : null,
      matchesDecided: decided,
      matchesTotal: MATCH_ORDER.length,
      contestantsRemaining: state.champion ? 1 : Math.max(1, state.contestants.length - decided),
    },
    bracket,
  });
});

// Per-contestant lineup for the voice/SMS agent — everything on the bracket card,
// phrased per person: who they are, when they go, and whether they're on stage
// now / won & advanced / were eliminated / up next / champion. Names only.
function computeLineup() {
  const nameOf = (id) => (state.contestants.find((c) => c.id === id) || {}).name || null;
  const cur = state.matches[state.currentMatchId] || null;
  // Which matches each contestant appears in, in bracket order.
  const appear = {};
  for (const c of state.contestants) appear[c.id] = [];
  for (const mid of MATCH_ORDER) {
    const m = state.matches[mid];
    for (const side of ['a', 'b']) {
      if (m[side] && appear[m[side]]) appear[m[side]].push({ mid, side, m });
    }
  }
  const contestants = state.contestants.map((c, i) => {
    const mine = appear[c.id];
    let wins = 0, losses = 0;
    for (const e of mine) if (e.m.winner) (e.m.winner === e.side ? wins++ : losses++);
    let status, detail;
    if (state.champion === c.id) {
      status = 'champion';
      detail = `${c.name} is the champion`;
    } else if (cur && (cur.a === c.id || cur.b === c.id) && !cur.winner) {
      const opp = nameOf(cur[cur.a === c.id ? 'b' : 'a']);
      status = 'on_stage';
      detail = `${c.name} is on stage now in ${cur.label}` + (opp ? ` against ${opp}` : '');
    } else if (losses > 0) {
      const lost = mine.find((e) => e.m.winner && e.m.winner !== e.side);
      const by = lost ? nameOf(lost.m[lost.m.winner]) : null;
      status = 'eliminated';
      detail = `${c.name} was eliminated in ${lost ? lost.m.label : 'an earlier round'}` + (by ? ` by ${by}` : '');
    } else if (wins > 0) {
      const won = mine.filter((e) => e.m.winner === e.side).slice(-1)[0];
      const adv = won ? ADVANCES[won.mid] : null;
      status = 'advanced';
      if (adv) {
        const nm = state.matches[adv.to];
        const opp = nameOf(nm[adv.slot === 'a' ? 'b' : 'a']);
        detail = `${c.name} won ${won.m.label} and ` +
          (opp ? `faces ${opp} next in ${nm.label}` : `advances to ${nm.label}`);
      } else {
        detail = `${c.name} won ${won ? won.m.label : 'their match'}`;
      }
    } else {
      const first = mine[0];
      status = 'upcoming';
      if (first) {
        const opp = nameOf(first.m[first.side === 'a' ? 'b' : 'a']);
        detail = `${c.name} hasn't competed yet — up in ${first.m.label}` + (opp ? ` against ${opp}` : '');
      } else {
        detail = `${c.name} isn't placed in the bracket yet`;
      }
    }
    return { name: c.name, seed: i + 1, status, record: `${wins}-${losses}`, detail };
  });
  return {
    champion: state.champion ? nameOf(state.champion) : null,
    currentMatch: cur && cur.a && cur.b ? { label: cur.label, a: nameOf(cur.a), b: nameOf(cur.b) } : null,
    contestants,
  };
}
app.get('/api/lineup', (_req, res) => res.json(computeLineup()));

// Aggregated end-of-show stats — PII-safe (names + GitHub only). Winner of each
// bracket match, per-contestant vote totals broken down by channel (web/SMS/
// phone), judges' points, and the full sabotage log.
app.get('/api/stats', (_req, res) => {
  const cById = (id) => state.contestants.find((c) => c.id === id) || null;
  const nameOf = (id) => (cById(id) || {}).name || null;

  // Per-contestant aggregates across every match they appeared in.
  const per = {};
  const bump = (id) => {
    if (!id) return null;
    if (!per[id]) {
      const c = cById(id) || {};
      per[id] = { id, name: c.name || id, github: c.github || '',
        web: 0, sms: 0, call: 0, votes: 0, judges: 0,
        wins: 0, losses: 0, matches: 0 };
    }
    return per[id];
  };

  const matches = MATCH_ORDER.map((id) => {
    const m = state.matches[id];
    const bd = m.voteBreakdown || blankBreakdown();
    for (const side of ['a', 'b']) {
      const p = bump(m[side]);
      if (!p) continue;
      p.matches += 1;
      p.web += bd[side].web || 0;
      p.sms += bd[side].sms || 0;
      p.call += bd[side].call || 0;
      p.votes += m.votes[side] || 0;
      p.judges += sumScore(m.scores[side]);
      if (m.winner) (m.winner === side ? p.wins += 1 : p.losses += 1);
    }
    return {
      id, label: m.label, round: m.round,
      a: nameOf(m.a), b: nameOf(m.b),
      winner: m.winner ? nameOf(m[m.winner]) : null,
      winnerSide: m.winner || null,
      votes: { a: m.votes.a, b: m.votes.b },
      byChannel: bd,
      judges: { a: sumScore(m.scores.a), b: sumScore(m.scores.b) },
      done: !!m.winner,
    };
  });

  const contestants = Object.values(per).sort((x, y) =>
    y.wins - x.wins || y.votes - x.votes || y.judges - x.judges);

  res.json({
    event: state.eventName,
    champion: state.champion ? { name: nameOf(state.champion), github: (cById(state.champion) || {}).github || '' } : null,
    totals: {
      web: contestants.reduce((n, c) => n + c.web, 0),
      sms: contestants.reduce((n, c) => n + c.sms, 0),
      call: contestants.reduce((n, c) => n + c.call, 0),
    },
    matches,
    contestants,
    sabotages: (state.sabotage && state.sabotage.history) || [],
  });
});

// Record a vote from phone/SMS. Gated by the internal shared secret so only
// the voice service can call it (never exposed to the public tunnel usefully).
app.post('/api/external-vote', (req, res) => {
  const tok = req.get('x-internal-token') || '';
  if (tok.length !== INTERNAL_TOKEN.length ||
      !crypto.timingSafeEqual(Buffer.from(tok), Buffer.from(INTERNAL_TOKEN))) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }
  const body = req.body || {};
  const side = body.side === 'a' || body.side === 'b' ? body.side : null;
  const channel = body.channel === 'sms' ? 'sms' : 'call';
  const voter = sanitizeText(body.voter, 40);
  if (!side || !voter) return res.status(400).json({ ok: false, error: 'need side + voter' });
  // Namespace phone voters so they can't collide with web device tokens.
  const r = recordVote(channel + ':' + voter, side, channel);
  res.json(r);
});

// Local-only endpoint used by the cloudflared launcher to report the public URL.
// Only accepts connections from loopback so the tunnel itself can't rewrite it.
app.post('/api/public-url', (req, res) => {
  const ra = req.socket.remoteAddress || '';
  const isLocal = ra === '127.0.0.1' || ra === '::1' || ra === '::ffff:127.0.0.1';
  if (!isLocal) return res.status(403).json({ error: 'forbidden' });
  const url = sanitizeText(req.body && req.body.url, 200);
  if (!/^https?:\/\//.test(url)) return res.status(400).json({ error: 'bad url' });
  state.publicUrl = url;
  regenQr().then(() => broadcast());
  res.json({ ok: true, publicUrl: url });
});

const server = http.createServer(app);
// maxHttpBufferSize kept small — every payload here is tiny; this caps a
// large-message memory-abuse vector.
const io = new Server(server, { cors: { origin: false }, maxHttpBufferSize: 64 * 1024 });

// ---------------------------------------------------------------------------
// Socket.IO
// ---------------------------------------------------------------------------

// Simple per-socket vote rate limit.
const VOTE_COOLDOWN_MS = 400;

// Per-socket registration rate limit.
const REGISTER_COOLDOWN_MS = 1500;
const MAX_REGISTRANTS = 256;

io.on('connection', (socket) => {
  socket.data.isOperator = false;
  socket.data.scopes = [];
  socket.data.keyId = null;
  socket.data.lastVote = 0;
  socket.data.lastRegister = 0;

  // Send current state immediately.
  socket.emit('state', state);
  socket.emit('hello', { criteria: CRITERIA });

  // ---- Operator authentication (scoped, multi-key) ----
  socket.on('auth', (payload, ack) => {
    // Brute-force guard: min interval between attempts + per-socket fail cap.
    const now = Date.now();
    if (now - (socket.data.lastAuth || 0) < 300 || (socket.data.authFails || 0) >= 15) {
      if (typeof ack === 'function') ack({ ok: false, error: 'too many attempts' });
      return;
    }
    socket.data.lastAuth = now;
    const rec = findKeyBySecret(payload && payload.key);
    if (rec) {
      socket.data.authFails = 0;
      socket.data.isOperator = true;
      socket.data.keyId = rec.id;
      socket.data.scopes = rec.scopes;
      socket.data.isMaster = !!rec.master;
      socket.join('operators');
      // usage tracking
      rec.lastUsedAt = Date.now();
      rec.useCount = (rec.useCount || 0) + 1;
      rec.lastIp = ipOf(socket);
      rec.lastUa = uaOf(socket);
      addActive(rec.id, socket.id);
      // Operators get the full roster (with emails); nobody else does.
      socket.emit('roster', registrations);
      // Key-admins get the management list.
      if (hasScope(rec.scopes, 'keys')) {
        socket.join('keyadmins');
        socket.emit('opkeys', { scopeList: SCOPES, keys: sanitizeKeysList(), audit: auditLog.slice(0, 40) });
      }
      broadcastKeys();
      schedulePersist();
      if (typeof ack === 'function') ack({ ok: true, scopes: rec.scopes, master: !!rec.master, label: rec.label });
    } else {
      socket.data.authFails = (socket.data.authFails || 0) + 1;
      socket.data.isOperator = false;
      socket.data.scopes = [];
      socket.data.keyId = null;
      socket.leave('operators');
      socket.leave('keyadmins');
      if (typeof ack === 'function') ack({ ok: false });
    }
  });

  socket.on('disconnect', function () {
    if (socket.data.keyId) {
      removeActive(socket.data.keyId, socket.id);
      broadcastKeys();
    }
  });

  function requireOp() {
    return socket.data.isOperator === true;
  }

  // ---- Public self-registration (no auth) ----
  socket.on('register', (payload, ack) => {
    const now = Date.now();
    if (now - socket.data.lastRegister < REGISTER_COOLDOWN_MS) {
      if (typeof ack === 'function') ack({ ok: false, error: 'slow down' });
      return;
    }
    socket.data.lastRegister = now;

    const name = sanitizeText(payload && payload.name, 40);
    const github = sanitizeText(payload && payload.github, 60).replace(/^@+/, '');
    const email = sanitizeText(payload && payload.email, 200);
    const challenges = parseChallengeSelection(payload && payload.challenges);
    if (!name) { if (typeof ack === 'function') ack({ ok: false, error: 'name required' }); return; }
    if (!github) { if (typeof ack === 'function') ack({ ok: false, error: 'github username required' }); return; }
    if (!validEmail(email)) { if (typeof ack === 'function') ack({ ok: false, error: 'valid email required' }); return; }
    if (registrations.length >= MAX_REGISTRANTS) {
      if (typeof ack === 'function') ack({ ok: false, error: 'registration full' });
      return;
    }
    // Dedupe by email (case-insensitive): update the existing entry.
    const lower = email.toLowerCase();
    const existing = registrations.find((r) => r.email.toLowerCase() === lower);
    if (existing) {
      existing.name = name;
      existing.github = github;
      existing.challenges = challenges;
      if (typeof ack === 'function') ack({ ok: true, updated: true });
    } else {
      registrations.push({ id: crypto.randomUUID(), name, github, email, challenges, at: now });
      if (typeof ack === 'function') ack({ ok: true });
    }
    state.registrantCount = registrations.length;
    recomputeChallengeCounts();
    broadcast();
    broadcastRoster();
  });

  // ---- Audience voting (public, no auth) ----
  socket.on('vote', (payload, ack) => {
    const now = Date.now();
    if (now - socket.data.lastVote < VOTE_COOLDOWN_MS) {
      if (typeof ack === 'function') ack({ ok: false, error: 'slow down' });
      return;
    }
    socket.data.lastVote = now;
    const r = recordVote(payload && payload.token, payload && payload.side, 'web');
    if (typeof ack === 'function') ack(r);
  });

  // ---- Operator actions ----
  socket.on('op', async (msg, ack) => {
    if (!requireOp()) {
      if (typeof ack === 'function') ack({ ok: false, error: 'unauthorized' });
      return;
    }
    const type = msg && msg.type;
    const need = Object.prototype.hasOwnProperty.call(SCOPE_FOR, type) ? SCOPE_FOR[type] : null;
    if (need && !hasScope(socket.data.scopes, need)) {
      if (typeof ack === 'function') ack({ ok: false, error: 'forbidden: needs "' + need + '" scope' });
      return;
    }
    try {
      const result = await handleOp(msg || {}, socket);
      if (typeof ack === 'function') ack(Object.assign({ ok: true }, result || {}));
    } catch (e) {
      if (typeof ack === 'function') ack({ ok: false, error: String(e.message || e) });
    }
    broadcast();
  });
});

// ---------------------------------------------------------------------------
// Operator command handler
// ---------------------------------------------------------------------------

async function handleOp(msg, socket) {
  const { type } = msg;
  const m = () => state.matches[state.currentMatchId];

  switch (type) {
    case 'setPhase': {
      if (!PHASES.includes(msg.phase)) throw new Error('bad phase');
      state.phase = msg.phase;
      break;
    }

    case 'selectMatch': {
      // Whitelist against known match ids — never index state.matches with raw
      // input (e.g. "__proto__" would resolve to Object.prototype).
      if (MATCH_ORDER.indexOf(msg.matchId) === -1) throw new Error('bad match');
      state.currentMatchId = msg.matchId;
      // Reset timer to default duration for the new match if idle.
      if (!state.timer.running) {
        state.timer.remainingSec = state.timer.durationSec;
        state.timer.endsAt = null;
      }
      break;
    }

    case 'setChallenge': {
      if (!CHALLENGES.find((c) => c.id === msg.challengeId)) throw new Error('bad challenge');
      state.challengeId = msg.challengeId;
      break;
    }

    // ---- Timer ----
    case 'timerSet': {
      const sec = Math.max(5, Math.min(3600, parseInt(msg.seconds, 10) || 300));
      state.timer.durationSec = sec;
      if (!state.timer.running) state.timer.remainingSec = sec;
      break;
    }
    case 'timerStart': {
      const t = state.timer;
      if (t.remainingSec <= 0) t.remainingSec = t.durationSec;
      t.running = true;
      t.endsAt = Date.now() + t.remainingSec * 1000;
      startTimerLoop();
      break;
    }
    case 'timerPause': {
      const t = state.timer;
      if (t.running && t.endsAt) {
        t.remainingSec = Math.max(0, Math.round((t.endsAt - Date.now()) / 1000));
      }
      t.running = false;
      t.endsAt = null;
      stopTimerLoop();
      break;
    }
    case 'timerReset': {
      const t = state.timer;
      t.running = false;
      t.endsAt = null;
      t.remainingSec = t.durationSec;
      stopTimerLoop();
      break;
    }
    case 'timerAdjust': {
      // add/subtract seconds on the fly
      const delta = parseInt(msg.delta, 10) || 0;
      const t = state.timer;
      t.remainingSec = Math.max(0, t.remainingSec + delta);
      if (t.running) t.endsAt = Date.now() + t.remainingSec * 1000;
      break;
    }

    // ---- Scoring ----
    case 'setScore': {
      const cur = m();
      const side = msg.side;
      if (side !== 'a' && side !== 'b') throw new Error('bad side');
      if (!CRITERIA.find((c) => c.key === msg.criterion)) throw new Error('bad criterion');
      cur.scores[side][msg.criterion] = clampScore(msg.value);
      break;
    }
    case 'clearScores': {
      const cur = m();
      cur.scores = { a: blankScore(), b: blankScore() };
      break;
    }

    // ---- Voting ----
    case 'openVoting': {
      state.votingOpen = true;
      state.phase = 'voting';
      state.qrShow = 'vote';
      break;
    }
    case 'closeVoting': {
      state.votingOpen = false;
      if (state.qrShow === 'vote') state.qrShow = null;
      break;
    }
    case 'resetVotes': {
      const cur = m();
      cur.votes = { a: 0, b: 0 };
      cur.voteBreakdown = blankBreakdown();
      voters.delete(state.currentMatchId);
      break;
    }

    // ---- Winner / bracket advancement ----
    // Manual override (used for exact ties or operator discretion).
    case 'setWinner': {
      const side = msg.side;
      if (side !== 'a' && side !== 'b') throw new Error('bad side');
      const cur = m();
      if (!cur[side]) throw new Error('no contestant in that slot');
      applyWinner(side);
      break;
    }

    // Auto: decide from judges' score total + audience votes.
    case 'declareWinner': {
      const cur = m();
      if (!cur.a || !cur.b) throw new Error('need both contestants');
      const aT = sumScore(cur.scores.a) + cur.votes.a;
      const bT = sumScore(cur.scores.b) + cur.votes.b;
      let side;
      if (aT !== bT) side = aT > bT ? 'a' : 'b';
      else if (cur.votes.a !== cur.votes.b) side = cur.votes.a > cur.votes.b ? 'a' : 'b';
      else {
        const ja = sumScore(cur.scores.a);
        const jb = sumScore(cur.scores.b);
        if (ja !== jb) side = ja > jb ? 'a' : 'b';
        else throw new Error('exact tie — use manual override');
      }
      applyWinner(side);
      return { side: side, aTotal: aT, bTotal: bT };
    }
    case 'clearWinner': {
      const cur = m();
      const adv = ADVANCES[state.currentMatchId];
      if (adv) state.matches[adv.to][adv.slot] = null;
      if (!adv) state.champion = null;
      cur.winner = null;
      break;
    }

    // ---- Sabotage wheel ----
    case 'spinSabotage': {
      const entries = state.sabotage.entries;
      if (!entries.length) throw new Error('no sabotage entries');
      state.sabotage.spinning = true;
      broadcast();
      // Server picks the result; stage animates to it.
      const idx = crypto.randomInt(0, entries.length);
      const chosen = entries[idx];
      // brief spin window
      await new Promise((r) => setTimeout(r, 2600));
      state.sabotage.spinning = false;
      state.sabotage.lastResult = { index: idx, text: chosen, at: Date.now() };
      // Log every spin so the stats page can show what each match got hit with.
      const scur = state.matches[state.currentMatchId];
      const snameOf = (id) => (state.contestants.find((c) => c.id === id) || {}).name || null;
      if (!Array.isArray(state.sabotage.history)) state.sabotage.history = [];
      state.sabotage.history.unshift({
        text: chosen,
        at: state.sabotage.lastResult.at,
        matchId: state.currentMatchId,
        matchLabel: scur ? scur.label : '',
        a: scur ? snameOf(scur.a) : null,
        b: scur ? snameOf(scur.b) : null,
      });
      if (state.sabotage.history.length > 50) state.sabotage.history.length = 50;
      io.emit('sabotage', state.sabotage.lastResult);
      break;
    }
    case 'setSabotageEntries': {
      if (!Array.isArray(msg.entries)) throw new Error('bad entries');
      state.sabotage.entries = msg.entries
        .slice(0, 100)
        .map((e) => sanitizeText(e, 160))
        .filter(Boolean)
        .slice(0, 40);
      break;
    }
    case 'clearSabotageResult': {
      state.sabotage.lastResult = null;
      break;
    }

    // ---- Contestants (manual entry) ----
    case 'setContestants': {
      if (!Array.isArray(msg.names)) throw new Error('bad names');
      const names = msg.names.slice(0, 8).map((n) => sanitizeText(n, 40));
      state.contestants = names.slice(0, 8).map((name, i) => ({
        id: 'c' + (i + 1),
        name: name || 'Contestant ' + (i + 1),
        github: '',
      }));
      reseedFromContestants();
      break;
    }
    // Non-destructive: fix a name/typo WITHOUT touching votes, scores, the
    // bracket, GitHub handles, or the current match. Names are looked up by
    // contestant id everywhere, so a rename keeps Stage + Stats perfectly in
    // sync. Empty entries are left unchanged (won't blank an existing name).
    case 'renameContestants': {
      if (!Array.isArray(msg.names)) throw new Error('bad names');
      for (let i = 0; i < state.contestants.length && i < msg.names.length; i++) {
        const nm = sanitizeText(msg.names[i], 40);
        if (nm) state.contestants[i].name = nm;
      }
      break;
    }

    // ---- Registration / random draw ----
    case 'removeRegistrant': {
      const id = sanitizeText(msg.id, 64);
      registrations = registrations.filter((r) => r.id !== id);
      state.registrantCount = registrations.length;
      recomputeChallengeCounts();
      broadcastRoster();
      break;
    }
    case 'clearRegistrations': {
      registrations = [];
      state.registrantCount = 0;
      recomputeChallengeCounts();
      broadcastRoster();
      break;
    }
    case 'drawContestants': {
      if (registrations.length < 2) throw new Error('need at least 2 registrants');
      // Public shuffle animation uses names only (no PII on stage).
      const candidates = registrations.map((r) => r.name);
      state.draw = { drawing: true, candidates, result: null };
      state.phase = 'draw';
      broadcast();
      await sleep(3600);
      // Cryptographic Fisher–Yates shuffle, then take up to 8.
      const pool = registrations.slice();
      for (let i = pool.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
      }
      const chosen = pool.slice(0, Math.min(8, pool.length));
      state.contestants = chosen.map((r, i) => ({ id: 'c' + (i + 1), name: r.name, github: r.github || '' }));
      reseedFromContestants();
      state.draw = {
        drawing: false,
        candidates,
        result: state.contestants.map((c, i) => ({ seed: i + 1, name: c.name, github: c.github })),
        at: Date.now(),
      };
      state.phase = 'intro';
      io.emit('draw', state.draw.result);
      break;
    }
    case 'clearDraw': {
      state.draw = { drawing: false, candidates: [], result: null };
      break;
    }

    // ---- Stage QR control ----
    case 'setQr': {
      const show = msg.show;
      if (show !== 'vote' && show !== 'register' && show !== null && show !== 'off') throw new Error('bad qr mode');
      state.qrShow = (show === 'off') ? null : show;
      break;
    }

    // ---- Operator key management (requires 'keys' scope) ----
    case 'createKey': {
      const label = sanitizeText(msg.label, 40) || 'Operator';
      let scopes = Array.isArray(msg.scopes) ? msg.scopes.filter((s) => SCOPES.indexOf(s) !== -1) : [];
      scopes = Array.from(new Set(scopes));
      if (!scopes.length) throw new Error('pick at least one scope');
      if (opkeys.filter((k) => !k.revoked).length >= 50) throw new Error('too many active keys');
      const byRec = socket && opkeys.find((k) => k.id === socket.data.keyId);
      const byLabel = (byRec && byRec.label) || 'unknown';
      const secret = newSecret();
      const rec = {
        id: crypto.randomUUID(), label, key: secret, scopes, master: false,
        createdAt: Date.now(), createdBy: byLabel, revoked: false, revokedAt: null,
        lastUsedAt: null, useCount: 0, lastIp: null, lastUa: null,
      };
      opkeys.push(rec);
      logAudit('key.created', label + '  [' + scopes.join(', ') + ']', byLabel, socket ? ipOf(socket) : '');
      broadcastKeys();
      schedulePersist();
      return { secret: secret, id: rec.id, label: label };
    }
    case 'revokeKey': {
      const id = sanitizeText(msg.id, 64);
      const rec = opkeys.find((k) => k.id === id);
      if (!rec) throw new Error('no such key');
      if (rec.master) throw new Error('cannot revoke the master key');
      rec.revoked = true;
      rec.revokedAt = Date.now();
      // Immediately kick any live sessions using this key.
      const set = activeByKey.get(id);
      if (set) {
        for (const sid of Array.from(set)) {
          const s = io.sockets.sockets.get(sid);
          if (s) {
            s.data.isOperator = false; s.data.scopes = []; s.data.keyId = null;
            s.leave('operators'); s.leave('keyadmins');
            s.emit('revoked');
          }
        }
        activeByKey.delete(id);
      }
      const byRec = socket && opkeys.find((k) => k.id === socket.data.keyId);
      logAudit('key.revoked', rec.label, (byRec && byRec.label) || '', socket ? ipOf(socket) : '');
      broadcastKeys();
      schedulePersist();
      break;
    }

    case 'setEventName': {
      state.eventName = sanitizeText(msg.eventName, 40) || 'THE PROMPT PIT';
      state.subtitle = sanitizeText(msg.subtitle, 80) || state.subtitle;
      break;
    }

    case 'setPublicUrl': {
      const url = sanitizeText(msg.url, 200);
      if (url && !/^https?:\/\//.test(url)) throw new Error('bad url');
      state.publicUrl = url;
      await regenQr();
      break;
    }

    case 'resetEvent': {
      stopTimerLoop();
      const savedName = state.eventName;
      const savedSub = state.subtitle;
      const savedContestants = state.contestants;
      const savedSabotage = state.sabotage.entries;
      const savedUrl = state.publicUrl;
      // NOTE: the registrant pool is intentionally preserved across a reset.
      state = initialState();
      state.eventName = savedName;
      state.subtitle = savedSub;
      state.contestants = savedContestants;
      state.sabotage.entries = savedSabotage;
      state.publicUrl = savedUrl;
      state.registrantCount = registrations.length;
      recomputeChallengeCounts();
      seedBracket();
      voters.clear();
      await regenQr();
      break;
    }

    default:
      throw new Error('unknown op: ' + type);
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function lanIps() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const name of Object.keys(nets)) {
    for (const ni of nets[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

server.listen(PORT, '0.0.0.0', async () => {
  const restored = restoreSnapshot();
  ensureMasterKey();
  recomputeChallengeCounts();
  await regenQr();
  persistNow();
  const ips = lanIps();
  /* eslint-disable no-console */
  console.log('\n==================================================');
  console.log('  THE PROMPT PIT — control server is LIVE');
  console.log('==================================================');
  if (persistOk) {
    console.log('  Persistence  : ON (' + STATE_FILE + ')' + (restored ? ' — restored previous show' : ''));
  } else {
    console.log('  Persistence  : OFF (no writable ' + DATA_DIR + ' — mount a volume)');
  }
  console.log('  Operator key : ' + OPERATOR_KEY);
  console.log('  Internal tok : ' + INTERNAL_TOKEN + '  (phone/SMS vote bridge)');
  console.log('  Local        : http://localhost:' + PORT);
  for (const ip of ips) {
    console.log('  LAN          : http://' + ip + ':' + PORT);
  }
  console.log('');
  console.log('  Stage    →  /stage');
  console.log('  Operator →  /operator   (key: ' + OPERATOR_KEY + ')');
  console.log('  Vote     →  /vote');
  console.log('==================================================\n');
  /* eslint-enable no-console */
});
