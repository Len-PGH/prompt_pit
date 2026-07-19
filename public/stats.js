/* The Prompt Pit — live stats page.
 * Polls /api/stats (PII-safe: names + GitHub only) and renders the bracket,
 * per-contestant channel vote breakdown, judges' points, and sabotage log.
 * All dynamic values go in via textContent — never innerHTML — so contestant
 * names / GitHub / sabotage text can't inject markup. */
'use strict';

var ROUND_LABEL = { R1: 'Round 1 · 8 → 4', SF: 'Semi-Finals · 4 → 2', F: 'Grand Finale' };
var ROUND_ORDER = ['R1', 'SF', 'F'];

function el(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

function fmtTime(ms) {
  if (!ms) return '';
  var d = new Date(ms);
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

function renderChamp(data) {
  var box = document.getElementById('champ');
  if (data.champion && data.champion.name) {
    document.getElementById('champName').textContent = data.champion.name;
    var gh = document.getElementById('champGh');
    gh.textContent = data.champion.github ? '@' + data.champion.github : '';
    box.classList.add('show');
  } else {
    box.classList.remove('show');
  }
}

function renderTotals(data) {
  var t = data.totals || { web: 0, sms: 0, call: 0 };
  var host = document.getElementById('totals');
  clear(host);
  var defs = [['web', 'Web / QR', t.web], ['sms', 'SMS', t.sms], ['call', 'Phone', t.call],
              ['', 'All votes', (t.web || 0) + (t.sms || 0) + (t.call || 0)]];
  defs.forEach(function (d) {
    var c = el('span', 'chip ' + d[0]);
    c.appendChild(document.createTextNode(d[1] + ' '));
    c.appendChild(el('b', null, String(d[2])));
    host.appendChild(c);
  });
}

function slot(name, votes, isWin, decided) {
  var s = el('div', 'slot' + (name ? (isWin ? ' win' : (decided ? ' lose' : '')) : ' tbd'));
  s.appendChild(el('span', 'nm', name || 'TBD'));
  s.appendChild(el('span', 'vt', name ? (votes + ' votes') : ''));
  return s;
}

function renderBracket(data) {
  var host = document.getElementById('rounds');
  clear(host);
  var byRound = {};
  (data.matches || []).forEach(function (m) { (byRound[m.round] = byRound[m.round] || []).push(m); });
  ROUND_ORDER.forEach(function (r) {
    if (!byRound[r]) return;
    var col = el('div', 'round');
    col.appendChild(el('h3', null, ROUND_LABEL[r] || r));
    byRound[r].forEach(function (m) {
      var card = el('div', 'match');
      card.appendChild(el('div', 'ml', m.label));
      card.appendChild(slot(m.a, m.votes.a, m.winnerSide === 'a', m.done));
      card.appendChild(slot(m.b, m.votes.b, m.winnerSide === 'b', m.done));
      col.appendChild(card);
    });
    host.appendChild(col);
  });
}

function renderBoard(data) {
  var tbl = document.getElementById('board');
  clear(tbl);
  var head = el('tr');
  [['name', 'Contestant'], ['', 'W–L'], ['', 'Web'], ['', 'SMS'], ['', 'Phone'],
   ['', 'Votes'], ['', 'Judges']].forEach(function (h) {
    var th = el('th', h[0], h[1]); head.appendChild(th);
  });
  tbl.appendChild(head);
  var rows = data.contestants || [];
  if (!rows.length) {
    var tr = el('tr'); var td = el('td', 'name'); td.colSpan = 7;
    td.appendChild(el('span', 'gh', 'No contestants seeded yet.')); tr.appendChild(td); tbl.appendChild(tr);
    return;
  }
  rows.forEach(function (c) {
    var tr = el('tr');
    var nameTd = el('td', 'name');
    nameTd.appendChild(document.createTextNode(c.name));
    if (c.github) { nameTd.appendChild(document.createTextNode(' ')); nameTd.appendChild(el('span', 'gh', '@' + c.github)); }
    tr.appendChild(nameTd);
    tr.appendChild(el('td', null, c.wins + '–' + c.losses));
    tr.appendChild(el('td', 'cweb', String(c.web)));
    tr.appendChild(el('td', 'csms', String(c.sms)));
    tr.appendChild(el('td', 'ccall', String(c.call)));
    tr.appendChild(el('td', 'tot', String(c.votes)));
    tr.appendChild(el('td', null, String(c.judges)));
    tbl.appendChild(tr);
  });
}

function renderSabotage(data) {
  var host = document.getElementById('sab');
  clear(host);
  var list = data.sabotages || [];
  if (!list.length) {
    var li = el('li'); li.appendChild(el('span', 'empty', 'No sabotages spun yet.')); host.appendChild(li);
    return;
  }
  list.forEach(function (s) {
    var li = el('li');
    li.appendChild(el('span', 'txt', s.text || ''));
    var meta = (s.matchLabel || '') +
      (s.a && s.b ? ' · ' + s.a + ' vs ' + s.b : '') +
      (s.at ? ' · ' + fmtTime(s.at) : '');
    li.appendChild(el('span', 'meta', meta));
    host.appendChild(li);
  });
}

function render(data) {
  document.getElementById('event').textContent = data.event || 'THE PROMPT PIT';
  renderChamp(data);
  renderTotals(data);
  renderBracket(data);
  renderBoard(data);
  renderSabotage(data);
}

function tick() {
  fetch('/api/stats', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      document.getElementById('livelabel').textContent = 'LIVE';
      render(d);
    })
    .catch(function () {
      document.getElementById('livelabel').textContent = 'reconnecting…';
    });
}

tick();
setInterval(tick, 2000);
