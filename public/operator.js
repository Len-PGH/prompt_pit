/* The Prompt Pit — operator control client */
(function () {
  'use strict';
  var socket = io({ transports: ['websocket', 'polling'] });
  var $ = function (id) { return document.getElementById(id); };
  var state = null;
  var criteria = [];
  var authed = false;
  var challengeTitleById = {};
  var lastRoster = [];
  var activeIds = [];   // currently-active challenge ids (for roster pills)

  // ---------- key gate ----------
  var savedKey = '';
  try { savedKey = localStorage.getItem('pp_key') || ''; } catch (e) {}

  var myScopes = [];
  var isMaster = false;

  function tryAuth(key) {
    socket.emit('auth', { key: key }, function (res) {
      if (res && res.ok) {
        authed = true;
        myScopes = res.scopes || [];
        isMaster = !!res.master;
        try { localStorage.setItem('pp_key', key); } catch (e) {}
        $('gate').style.display = 'none';
        $('app').style.display = 'block';
        $('dot-auth').classList.add('ok');
        applyScopes();
      } else {
        authed = false;
        $('dot-auth').classList.remove('ok');
        $('gate-msg').textContent = 'Wrong key — check the server console.';
        $('gate').style.display = 'block';
        $('app').style.display = 'none';
      }
    });
  }

  $('key-go').addEventListener('click', function () { tryAuth($('key-input').value.trim()); });
  $('key-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') tryAuth(this.value.trim()); });

  // ---------- op helper ----------
  function toast(msg, kind) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast ' + (kind || 'ok');
    t.style.display = 'block';
    clearTimeout(t._t);
    t._t = setTimeout(function () { t.style.display = 'none'; }, 2200);
  }
  function op(type, extra) {
    var msg = extra || {};
    msg.type = type;
    socket.emit('op', msg, function (res) {
      if (!res || !res.ok) toast((res && res.error) || 'error', 'err');
    });
  }

  function fmtClock(sec) {
    sec = Math.max(0, sec | 0);
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function nameOf(id) {
    if (!state) return id;
    for (var i = 0; i < state.contestants.length; i++) if (state.contestants[i].id === id) return state.contestants[i].name;
    return id || '—';
  }
  function notFocused(el) { return document.activeElement !== el; }

  // ---------- static wiring ----------
  document.querySelectorAll('.ph').forEach(function (b) {
    b.addEventListener('click', function () { op('setPhase', { phase: b.dataset.ph }); });
  });
  document.querySelectorAll('[data-dur]').forEach(function (b) {
    b.addEventListener('click', function () { op('timerSet', { seconds: parseInt(b.dataset.dur, 10) }); });
  });
  document.querySelectorAll('[data-adj]').forEach(function (b) {
    b.addEventListener('click', function () { op('timerAdjust', { delta: parseInt(b.dataset.adj, 10) }); });
  });
  $('t-start').addEventListener('click', function () { op('timerStart'); });
  $('t-pause').addEventListener('click', function () { op('timerPause'); });
  $('t-reset').addEventListener('click', function () { op('timerReset'); });

  $('v-open').addEventListener('click', function () { op('openVoting'); });
  $('v-close').addEventListener('click', function () { op('closeVoting'); });
  $('v-reset').addEventListener('click', function () { op('resetVotes'); });
  $('pub-set').addEventListener('click', function () { op('setPublicUrl', { url: $('pub-url').value.trim() }); });
  $('qr-vote').addEventListener('click', function () { op('setQr', { show: 'vote' }); });
  $('qr-register').addEventListener('click', function () { op('setQr', { show: 'register' }); });
  $('qr-off').addEventListener('click', function () { op('setQr', { show: 'off' }); });

  $('draw-btn').addEventListener('click', function () {
    if (window.confirm('Randomly draw 8 contestants from the pool? This reseeds the bracket and clears current scores/votes.')) {
      op('drawContestants');
    }
  });
  $('reg-clear').addEventListener('click', function () {
    if (window.confirm('Clear the ENTIRE registrant pool? This cannot be undone.')) op('clearRegistrations');
  });

  $('w-auto').addEventListener('click', function () {
    socket.emit('op', { type: 'declareWinner' }, function (res) {
      if (res && res.ok) {
        var mm = state.matches[state.currentMatchId];
        toast('🏆 ' + nameOf(mm[res.side]) + ' wins  (' + res.aTotal + ' vs ' + res.bTotal + ')');
      } else {
        toast((res && res.error) || 'error', 'err');
      }
    });
  });
  $('w-a').addEventListener('click', function () { op('setWinner', { side: 'a' }); });
  $('w-b').addEventListener('click', function () { op('setWinner', { side: 'b' }); });
  $('w-clear').addEventListener('click', function () { op('clearWinner'); });
  $('sc-clear').addEventListener('click', function () { op('clearScores'); });

  $('sab-spin').addEventListener('click', function () { op('spinSabotage'); });
  $('sab-clear').addEventListener('click', function () { op('clearSabotageResult'); });
  $('sab-save').addEventListener('click', function () {
    var entries = $('sab-entries').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    op('setSabotageEntries', { entries: entries });
    toast('Sabotage entries saved');
  });

  $('c-save').addEventListener('click', function () {
    var names = [];
    for (var i = 1; i <= 8; i++) names.push(($('c' + i) ? $('c' + i).value.trim() : ''));
    // Non-destructive: updates names only — votes, scores, bracket + GitHub stay intact.
    op('renameContestants', { names: names });
    toast('Contestant names updated');
  });
  var cReseed = $('c-reseed');
  if (cReseed) cReseed.addEventListener('click', function () {
    if (!window.confirm('Reseed the bracket from these names? This CLEARS all votes, scores, winners and the champion, and starts over at Round 1.')) return;
    var names = [];
    for (var i = 1; i <= 8; i++) names.push(($('c' + i) ? $('c' + i).value.trim() : ''));
    op('setContestants', { names: names });
    toast('Bracket reseeded');
  });
  $('ev-save').addEventListener('click', function () {
    op('setEventName', { eventName: $('ev-name').value.trim(), subtitle: $('ev-sub').value.trim() });
    toast('Event info saved');
  });
  $('reset-event').addEventListener('click', function () {
    if (window.confirm('Reset the ENTIRE event? Scores, winners and votes will be cleared.')) op('resetEvent');
  });

  // ---------- dynamic build (once) ----------
  var built = false;
  function buildOnce(s) {
    if (built) return;
    built = true;

    // challenges — options are (re)built in render() to match the active set.
    $('challenge-sel').addEventListener('change', function () {
      op('setChallenge', { challengeId: $('challenge-sel').value });
    });

    // contestants
    var ch = $('contestants');
    for (var i = 1; i <= 8; i++) {
      var l = document.createElement('label');
      l.className = 'fld';
      l.style.marginBottom = '6px';
      var span = document.createElement('span');
      span.textContent = 'Seed ' + i;
      var inp = document.createElement('input');
      inp.id = 'c' + i; inp.maxLength = 40;
      l.appendChild(span); l.appendChild(inp);
      ch.appendChild(l);
    }

    // score grid
    criteria = s.criteria;
    var g = $('score-grid');
    g.textContent = '';
    var head = document.createElement('div');
    criteria.forEach(function (c) {
      makeScoreRow(g, c);
    });
  }

  function stepper(side, key) {
    var wrap = document.createElement('div');
    wrap.className = 'stepper';
    var minus = document.createElement('button'); minus.textContent = '−';
    var val = document.createElement('span'); val.className = 'val'; val.id = 'sv-' + side + '-' + key; val.textContent = '0';
    var plus = document.createElement('button'); plus.textContent = '+';
    minus.addEventListener('click', function () { adjustScore(side, key, -1); });
    plus.addEventListener('click', function () { adjustScore(side, key, 1); });
    wrap.appendChild(minus); wrap.appendChild(val); wrap.appendChild(plus);
    return wrap;
  }
  function makeScoreRow(g, c) {
    var aStep = stepper('a', c.key);
    var label = document.createElement('div'); label.className = 'cl'; label.textContent = c.label;
    var bStep = stepper('b', c.key);
    // order: A | label | B
    g.appendChild(aStep);
    g.appendChild(label);
    g.appendChild(bStep);
  }
  function adjustScore(side, key, delta) {
    if (!state) return;
    var m = state.matches[state.currentMatchId];
    var cur = (m.scores[side][key] || 0) + delta;
    cur = Math.max(0, Math.min(10, cur));
    op('setScore', { side: side, criterion: key, value: cur });
  }

  function renderMatchList(s) {
    var host = $('match-list');
    if (host._built) {
      updateMatchList(s); return;
    }
    host._built = true;
    host.textContent = '';
    var order = ['R1M1', 'R1M2', 'R1M3', 'R1M4', 'SF1', 'SF2', 'F1'];
    order.forEach(function (mid) {
      var b = document.createElement('button');
      b.className = 'btn small matchbtn';
      b.id = 'mb-' + mid;
      b.addEventListener('click', function () { op('selectMatch', { matchId: mid }); });
      host.appendChild(b);
    });
    updateMatchList(s);
  }
  function updateMatchList(s) {
    var order = ['R1M1', 'R1M2', 'R1M3', 'R1M4', 'SF1', 'SF2', 'F1'];
    order.forEach(function (mid) {
      var b = $('mb-' + mid);
      if (!b) return;
      var m = s.matches[mid];
      b.textContent = '';
      var strong = document.createElement('strong');
      strong.textContent = m.label;
      var small = document.createElement('small');
      small.textContent = nameOf(m.a) + '  vs  ' + nameOf(m.b);
      b.appendChild(strong); b.appendChild(small);
      b.classList.toggle('sel', mid === s.currentMatchId);
    });
  }

  // Visual bracket (R1 → SF → F). Click a match to make it active.
  function renderBracket(s) {
    var host = $('bracket'); if (!host) return;
    var cols = [
      { h: 'Round 1', ids: ['R1M1', 'R1M2', 'R1M3', 'R1M4'] },
      { h: 'Semi-Finals', ids: ['SF1', 'SF2'] },
      { h: 'Grand Finale', ids: ['F1'] },
    ];
    host.textContent = '';
    cols.forEach(function (col) {
      var c = document.createElement('div'); c.className = 'br-col';
      var h = document.createElement('h4'); h.textContent = col.h; c.appendChild(h);
      col.ids.forEach(function (mid) {
        var m = s.matches[mid]; if (!m) return;
        var box = document.createElement('div');
        box.className = 'br-m' + (mid === s.currentMatchId ? ' sel' : '');
        box.addEventListener('click', function () { op('selectMatch', { matchId: mid }); });
        var lbl = document.createElement('div'); lbl.className = 'br-lbl'; lbl.textContent = m.label;
        box.appendChild(lbl);
        ['a', 'b'].forEach(function (side) {
          var slot = document.createElement('div');
          var cls = 'br-slot ' + side;
          if (!m[side]) cls += ' tbd';
          else if (m.winner) cls += (m.winner === side ? ' win' : ' lose');
          slot.className = cls;
          var nm = document.createElement('span'); nm.className = 'nm';
          nm.textContent = m[side] ? nameOf(m[side]) : 'TBD';
          var v = document.createElement('span'); v.className = 'v';
          v.textContent = m[side] ? String((m.votes && m.votes[side]) || 0) : '';
          slot.appendChild(nm); slot.appendChild(v);
          box.appendChild(slot);
        });
        c.appendChild(box);
      });
      host.appendChild(c);
    });
  }

  // ---------- render ----------
  function render(s) {
    state = s;
    buildOnce(s);

    $('now-round').textContent = s.matches[s.currentMatchId].label;
    $('now-phase').textContent = s.phase;
    document.querySelectorAll('.ph').forEach(function (b) { b.classList.toggle('sel', b.dataset.ph === s.phase); });

    // clock
    var oc = $('op-clock');
    oc.textContent = fmtClock(s.timer.remainingSec);
    oc.classList.toggle('run', s.timer.running);

    // challenge (declared here; hoisted within this scope)
    function renderActiveChallenges(st) {
      var host = $('active-challenges'); if (!host) return;
      var list = (st.challenges || []).filter(function (c) { return c.activatable; });
      var activeN = list.filter(function (c) { return c.selectable; }).length;
      if ($('active-count')) $('active-count').textContent = activeN + ' of ' + list.length + ' active';
      var sig = list.map(function (c) { return c.id + (c.selectable ? '1' : '0'); }).join(',');
      if (host._sig === sig) return;   // avoid rebuilding (and fighting a mid-click)
      host._sig = sig; host.innerHTML = '';
      list.forEach(function (c) {
        var lab = document.createElement('label');
        lab.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer';
        var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!c.selectable; cb.value = c.id;
        cb.style.cssText = 'width:17px;height:17px';
        cb.addEventListener('change', function () {
          var ids = [];
          host.querySelectorAll('input[type=checkbox]').forEach(function (x) { if (x.checked) ids.push(x.value); });
          if (!ids.length) { cb.checked = true; toast('Keep at least one challenge active', 'err'); return; }
          op('setActiveChallenges', { ids: ids });
        });
        var span = document.createElement('span'); span.textContent = c.title;
        lab.appendChild(cb); lab.appendChild(span); host.appendChild(lab);
      });
    }

    // (Re)build the match-challenge dropdown to match the active set (+ the
    // finale, and whatever's currently selected so it's always representable).
    function renderChallengeOptions(st) {
      var sel = $('challenge-sel'); if (!sel) return;
      var opts = (st.challenges || []).filter(function (c) {
        return c.selectable || !c.activatable || c.id === st.challengeId;
      });
      var sig = opts.map(function (c) { return c.id + (c.selectable ? '1' : '0'); }).join(',');
      if (sel._sig !== sig) {
        sel._sig = sig; sel.innerHTML = '';
        opts.forEach(function (c) {
          var o = document.createElement('option');
          o.value = c.id; o.textContent = c.title + (c.activatable ? '' : ' · finale');
          sel.appendChild(o);
        });
      }
      if (notFocused(sel)) sel.value = st.challengeId;
    }

    // challenge
    renderChallengeOptions(s);
    var ch = null;
    var hadTitles = Object.keys(challengeTitleById).length > 0;
    s.challenges.forEach(function (c) { if (c.id === s.challengeId) ch = c; challengeTitleById[c.id] = c.title; });
    // Track the active set; when it changes, repaint the roster so each
    // participant's pills reflect the currently-active challenges.
    var actIds = (s.challenges || []).filter(function (c) { return c.selectable; }).map(function (c) { return c.id; });
    if (actIds.join(',') !== activeIds.join(',')) { activeIds = actIds; if (lastRoster.length) renderRoster(lastRoster); }
    $('challenge-brief').textContent = ch ? ch.brief : '';
    renderActiveChallenges(s);
    // if the roster came in before we knew challenge titles, repaint it now
    if (!hadTitles && lastRoster.length) renderRoster(lastRoster);

    // match list
    renderMatchList(s);
    renderBracket(s);

    // voting
    var m = s.matches[s.currentMatchId];
    $('v-a').textContent = 'A · ' + nameOf(m.a) + ': ' + m.votes.a;
    $('v-b').textContent = 'B · ' + nameOf(m.b) + ': ' + m.votes.b;
    $('v-open').classList.toggle('sel', s.votingOpen);
    if (notFocused($('pub-url'))) $('pub-url').value = s.publicUrl || '';
    var qrLive = s.qr && (s.qr.vote || s.qr.register);
    $('pub-state').textContent = qrLive ? '✓ QR live' : (s.publicUrl ? '…' : 'no URL yet');
    $('qr-vote').classList.toggle('sel', s.qrShow === 'vote');
    $('qr-register').classList.toggle('sel', s.qrShow === 'register');

    // registrant count (roster arrives via its own event)
    $('reg-count').textContent = (s.registrantCount || 0) + ' in pool';

    // per-challenge pick counts
    var cc = s.challengeCounts || {};
    var ccHost = $('chal-counts');
    ccHost.textContent = '';
    var ids = (s.challenges || []).filter(function (c) { return c.selectable; }).map(function (c) { return c.id; });
    var max = 1;
    ids.forEach(function (id) { if ((cc[id] || 0) > max) max = cc[id]; });
    if (!ids.length) {
      // nothing yet
    } else {
      var h = document.createElement('div'); h.className = 'cc-h'; h.textContent = 'Picks per challenge';
      ccHost.appendChild(h);
      ids.forEach(function (id) {
        var n = cc[id] || 0;
        var row = document.createElement('div'); row.className = 'ccrow';
        var nm = document.createElement('span'); nm.textContent = challengeTitleById[id] || id; nm.style.maxWidth = '48%'; nm.style.overflow = 'hidden'; nm.style.textOverflow = 'ellipsis'; nm.style.whiteSpace = 'nowrap';
        var bar = document.createElement('span'); bar.className = 'bar';
        var i = document.createElement('i'); i.style.width = Math.round((n / max) * 100) + '%'; bar.appendChild(i);
        var b = document.createElement('b'); b.textContent = n;
        row.appendChild(nm); row.appendChild(bar); row.appendChild(b);
        ccHost.appendChild(row);
      });
    }

    // scores
    $('sc-a-name').textContent = 'A · ' + nameOf(m.a);
    $('sc-b-name').textContent = 'B · ' + nameOf(m.b);
    criteria.forEach(function (c) {
      var a = $('sv-a-' + c.key), b = $('sv-b-' + c.key);
      if (a) a.textContent = m.scores.a[c.key] || 0;
      if (b) b.textContent = m.scores.b[c.key] || 0;
    });

    // winner highlight
    $('w-a').classList.toggle('sel', m.winner === 'a');
    $('w-b').classList.toggle('sel', m.winner === 'b');

    // sabotage
    $('sab-last').textContent = s.sabotage.lastResult ? ('Last: ' + s.sabotage.lastResult.text) : '';
    if (notFocused($('sab-entries'))) $('sab-entries').value = s.sabotage.entries.join('\n');

    // contestants + event (only when not being edited)
    for (var i = 0; i < s.contestants.length; i++) {
      var el = $('c' + (i + 1));
      if (el && notFocused(el)) el.value = s.contestants[i].name;
    }
    if (notFocused($('ev-name'))) $('ev-name').value = s.eventName;
    if (notFocused($('ev-sub'))) $('ev-sub').value = s.subtitle;
  }

  // ---- roster (operator-only; includes private email) ----
  function renderRoster(list) {
    var host = $('roster');
    host.textContent = '';
    if (!list || !list.length) {
      var e = document.createElement('div');
      e.className = 'empty';
      e.textContent = 'No registrations yet. Show the Register QR on stage.';
      host.appendChild(e);
      return;
    }
    list.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'rreg';
      var nm = document.createElement('div'); nm.className = 'nm';
      nm.textContent = r.name + (r.github ? ('  @' + r.github) : '');
      var meta = document.createElement('div'); meta.className = 'meta';
      meta.textContent = r.email;
      var x = document.createElement('button'); x.className = 'x'; x.textContent = '✕';
      x.title = 'Remove';
      x.addEventListener('click', function () { op('removeRegistrant', { id: r.id }); });
      row.appendChild(nm);
      row.appendChild(x);
      row.appendChild(meta);
      // Only show pills for challenges that are currently active.
      var picks = (r.challenges || []).filter(function (id) { return activeIds.indexOf(id) !== -1; });
      if (picks.length) {
        var tags = document.createElement('div');
        tags.className = 'rtags';
        picks.forEach(function (id) {
          var t = document.createElement('span');
          t.className = 'rtag';
          t.textContent = challengeTitleById[id] || id;
          tags.appendChild(t);
        });
        row.appendChild(tags);
      }
      host.appendChild(row);
    });
  }
  socket.on('roster', function (list) { lastRoster = list || []; renderRoster(lastRoster); });

  // ---- scope gating ----
  function canScope(s) { return myScopes.indexOf('*') !== -1 || myScopes.indexOf(s) !== -1; }
  function applyScopes() {
    var cards = document.querySelectorAll('[data-scope]');
    for (var i = 0; i < cards.length; i++) {
      cards[i].style.display = canScope(cards[i].getAttribute('data-scope')) ? '' : 'none';
    }
  }

  // ---- operator key management ----
  var scopesBuilt = false;
  function buildScopeChecks(list) {
    if (scopesBuilt) return;
    scopesBuilt = true;
    var host = $('k-scopes');
    host.textContent = '';
    (list || []).forEach(function (s) {
      if (s === 'keys') return; // key-admin stays master-only
      var lab = document.createElement('label');
      var cb = document.createElement('input');
      cb.type = 'checkbox'; cb.value = s; cb.className = 'kscope-cb';
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode(' ' + s));
      host.appendChild(lab);
    });
  }
  function fmtWhen(ts) {
    if (!ts) return 'never';
    try { return new Date(ts).toLocaleString(); } catch (e) { return '' + ts; }
  }
  function shortUa(ua) {
    if (!ua) return '';
    var m = ua.match(/(Firefox|Edg|Chrome|Safari)\/[\d.]+/);
    var os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
    return ((m ? m[0].replace('Edg', 'Edge') : 'browser') + (os ? ' · ' + os : ''));
  }
  var showIps = false;
  var lastKeysPayload = null;
  function ipDisplay(ip) { return ip ? (showIps ? ip : '***') : ''; }
  if ($('ip-toggle')) {
    $('ip-toggle').addEventListener('click', function () {
      showIps = !showIps;
      this.textContent = showIps ? '🙈 Hide IPs' : '👁 Show IPs';
      if (lastKeysPayload) renderKeys(lastKeysPayload);
    });
  }
  function renderKeys(payload) {
    lastKeysPayload = payload;
    buildScopeChecks(payload.scopeList);
    var host = $('keys-list');
    host.textContent = '';
    (payload.keys || []).forEach(function (k) {
      var row = document.createElement('div');
      row.className = 'krow' + (k.revoked ? ' revoked' : '');
      var nm = document.createElement('div'); nm.className = 'knm'; nm.textContent = k.label;
      if (k.master) { var mt = document.createElement('span'); mt.className = 'master-tag'; mt.textContent = 'MASTER'; nm.appendChild(mt); }
      var status = document.createElement('div'); status.className = 'kstatus';
      var st = document.createElement('span');
      if (k.revoked) { st.className = 'rev'; st.textContent = 'revoked'; }
      else if (k.active > 0) { st.className = 'live'; st.textContent = '● active (' + k.active + ')'; }
      else if (k.lastUsedAt) { st.className = 'idle'; st.textContent = 'idle'; }
      else { st.className = 'idle'; st.textContent = 'never used'; }
      status.appendChild(st);
      var meta = document.createElement('div'); meta.className = 'kmeta';
      meta.textContent = k.masked + ' · by ' + k.createdBy + ' · used ' + (k.useCount || 0) + '× · last ' + fmtWhen(k.lastUsedAt)
        + (k.lastIp ? ' · ' + ipDisplay(k.lastIp) : '') + (k.lastUa ? ' · ' + shortUa(k.lastUa) : '');
      var scopes = document.createElement('div'); scopes.className = 'kscopes';
      (k.scopes || []).forEach(function (s) { var c = document.createElement('span'); c.className = 'ks'; c.textContent = (s === '*' ? 'all' : s); scopes.appendChild(c); });
      row.appendChild(nm);
      if (!k.master && !k.revoked) {
        var x = document.createElement('button'); x.className = 'krevoke'; x.textContent = '✕'; x.title = 'Revoke';
        x.addEventListener('click', function () { if (window.confirm('Revoke key "' + k.label + '"? Any live session using it is kicked immediately.')) op('revokeKey', { id: k.id }); });
        row.appendChild(x);
      }
      row.appendChild(status);
      row.appendChild(meta);
      row.appendChild(scopes);
      host.appendChild(row);
    });
    var alog = $('keys-audit');
    alog.textContent = '';
    (payload.audit || []).forEach(function (a) {
      var r = document.createElement('div'); r.className = 'arow';
      var b = document.createElement('b'); b.textContent = a.action;
      r.appendChild(document.createTextNode(fmtWhen(a.at) + '  '));
      r.appendChild(b);
      r.appendChild(document.createTextNode('  ' + (a.detail || '') + (a.by ? '  — by ' + a.by : '') + (a.ip ? ' (' + ipDisplay(a.ip) + ')' : '')));
      alog.appendChild(r);
    });
  }
  socket.on('opkeys', renderKeys);
  socket.on('revoked', function () {
    authed = false;
    try { localStorage.removeItem('pp_key'); } catch (e) {}
    $('app').style.display = 'none';
    $('gate').style.display = 'block';
    $('gate-msg').textContent = 'This key was revoked.';
    $('dot-auth').classList.remove('ok');
  });

  var lastSecret = '';
  if ($('k-create')) {
    $('k-create').addEventListener('click', function () {
      var label = $('k-label').value.trim();
      var scopes = [];
      document.querySelectorAll('.kscope-cb').forEach(function (cb) { if (cb.checked) scopes.push(cb.value); });
      if (!scopes.length) { $('k-msg').textContent = 'pick at least one scope'; return; }
      socket.emit('op', { type: 'createKey', label: label, scopes: scopes }, function (res) {
        if (res && res.ok && res.secret) {
          lastSecret = res.secret;
          $('k-secret-val').textContent = res.secret;
          $('k-secret').style.display = 'block';
          $('k-label').value = '';
          document.querySelectorAll('.kscope-cb').forEach(function (cb) { cb.checked = false; });
          $('k-msg').textContent = '';
        } else {
          $('k-msg').textContent = (res && res.error) || 'error';
        }
      });
    });
    $('k-copy').addEventListener('click', function () {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(lastSecret);
      $('k-copy').textContent = 'Copied ✓';
      setTimeout(function () { $('k-copy').textContent = 'Copy'; }, 1500);
    });
  }

  socket.on('state', render);
  socket.on('tick', function (d) {
    if (!state) return;
    state.timer.remainingSec = d.remainingSec;
    $('op-clock').textContent = fmtClock(d.remainingSec);
  });

  socket.on('connect', function () {
    $('dot-conn').classList.add('ok');
    var loading = $('loading');
    if (loading) { loading.classList.add('hide'); setTimeout(function () { loading.style.display = 'none'; }, 400); }
    if (savedKey) tryAuth(savedKey);
  });
  socket.on('disconnect', function () {
    $('dot-conn').classList.remove('ok');
    $('dot-auth').classList.remove('ok');
  });
})();
