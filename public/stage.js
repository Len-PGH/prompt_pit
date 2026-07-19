/* The Prompt Pit — stage display client */
(function () {
  'use strict';
  var socket = io({ transports: ['websocket', 'polling'] });

  var $ = function (id) { return document.getElementById(id); };
  var state = null;
  var nameById = {};
  var githubById = {};
  var challenges = [];

  function fmtClock(sec) {
    sec = Math.max(0, sec | 0);
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function applyClock(remaining, running, duration) {
    var el = $('clock');
    el.textContent = fmtClock(remaining);
    el.classList.toggle('run', !!running);
    el.classList.remove('warn', 'danger');
    if (remaining <= 10) el.classList.add('danger');
    else if (remaining <= 60) el.classList.add('warn');
  }

  var PHASE_LABEL = {
    idle: 'Standby', intro: 'Get Ready', compete: 'Building', draw: 'The Draw',
    judging: 'Judging', voting: 'Vote Now', results: 'Results', champion: 'Champion'
  };

  function scoreTotal(scoreObj) {
    var t = 0;
    for (var k in scoreObj) if (Object.prototype.hasOwnProperty.call(scoreObj, k)) t += scoreObj[k] || 0;
    return t;
  }

  function veil(el, hidden) { if (el) el.classList.toggle('veil', !!hidden); }

  function initials(name) {
    if (!name) return '—';
    var parts = String(name).trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return String(name).trim().slice(0, 2).toUpperCase();
  }
  function seedOf(id) {
    if (!id || !state) return 0;
    for (var i = 0; i < state.contestants.length; i++) if (state.contestants[i].id === id) return i + 1;
    return 0;
  }
  function winsOf(id) {
    if (!id || !state) return 0;
    var w = 0;
    for (var k in state.matches) {
      if (!Object.prototype.hasOwnProperty.call(state.matches, k)) continue;
      var mm = state.matches[k];
      if (mm.winner && mm[mm.winner] === id) w++;
    }
    return w;
  }

  function renderFighter(prefix, side, match, votesVisible, scoreVisible) {
    var id = match ? match[side] : null;
    $(prefix + '-name').textContent = id ? (nameById[id] || id) : '—';
    $(prefix + '-gh').textContent = id && githubById[id] ? githubById[id] : '';
    $(prefix + '-mono').textContent = id ? initials(nameById[id] || id) : '—';
    var seed = seedOf(id);
    $(prefix + '-seed').textContent = seed ? ('Seed ' + seed) : '';
    var wins = winsOf(id);
    $(prefix + '-wins').textContent = id ? (wins + (wins === 1 ? ' win' : ' wins')) : '';
    var votes = match ? match.votes[side] : 0;
    var other = match ? match.votes[side === 'a' ? 'b' : 'a'] : 0;
    var total = votes + other;
    var vc = $(prefix + '-votes');
    vc.firstChild.nodeValue = String(votes);
    var pct = total > 0 ? Math.round((votes / total) * 100) : 0;
    $(prefix + '-bar').style.width = pct + '%';
    $(prefix + '-score').textContent = match ? scoreTotal(match.scores[side]) : 0;
    var fighter = $(prefix === 'fa' ? 'fa' : 'fb');
    var isWin = !!(match && match.winner === side);
    fighter.classList.toggle('win', isWin);
    // dim the loser once a winner is declared (results / champion phases)
    var resultPhase = state && (state.phase === 'results' || state.phase === 'champion');
    fighter.classList.toggle('lose', !!(match && match.winner && resultPhase && match.winner !== side && id));

    // reveal gating driven by Show Flow phase
    veil(vc, !votesVisible);
    veil($(prefix + '-bar').parentNode, !votesVisible);
    veil(fighter.querySelector('.score-total'), !scoreVisible);
  }

  var BANNER = {
    intro: { cls: 'intro', txt: '◆ Get Ready' },
    compete: { cls: 'compete', txt: 'Building' },
    judging: { cls: 'judging', txt: 'Judging' },
    results: { cls: 'results', txt: 'Results' }
  };
  function renderPhaseChrome(s) {
    // banner across the matchup
    var pb = $('phase-banner');
    var b = BANNER[s.phase];
    pb.className = 'phase-banner';
    if (b) { pb.classList.add('show', b.cls); $('phase-banner-txt').textContent = b.txt; }

    // standby holding screen (register board takes priority when its QR is up)
    var standby = $('standby');
    if (s.phase === 'idle' && s.qrShow !== 'register') {
      standby.classList.add('show');
      $('sb-sub').textContent = s.subtitle;
      var m = s.matches[s.currentMatchId];
      $('sb-next').textContent = (m && (m.a || m.b)) ? ('Next up · ' + m.label) : '';
    } else {
      standby.classList.remove('show');
    }
  }

  function renderBracket(s) {
    var cols = [
      { lbl: 'Round 1', ids: ['R1M1', 'R1M2', 'R1M3', 'R1M4'] },
      { lbl: 'Semis', ids: ['SF1', 'SF2'] },
      { lbl: 'Finale', ids: ['F1'] }
    ];
    var host = $('bracket');
    host.textContent = '';
    cols.forEach(function (col) {
      var c = document.createElement('div');
      c.className = 'bcol';
      var lbl = document.createElement('div');
      lbl.className = 'lbl';
      lbl.textContent = col.lbl;
      c.appendChild(lbl);
      col.ids.forEach(function (mid) {
        var m = s.matches[mid];
        var box = document.createElement('div');
        box.className = 'bmatch' + (mid === s.currentMatchId ? ' cur' : '');
        ['a', 'b'].forEach(function (side) {
          var row = document.createElement('div');
          row.className = 'bteam ' + side + (m.winner === side ? ' won' : '');
          var nm = document.createElement('span');
          nm.textContent = m[side] ? (nameById[m[side]] || m[side]) : '—';
          var sc = document.createElement('span');
          sc.className = 's';
          sc.textContent = m.votes[side] || 0;
          row.appendChild(nm);
          row.appendChild(sc);
          box.appendChild(row);
        });
        c.appendChild(box);
      });
      host.appendChild(c);
    });
  }

  function renderChallenge(s) {
    var ch = null;
    for (var i = 0; i < s.challenges.length; i++) if (s.challenges[i].id === s.challengeId) ch = s.challenges[i];
    if (!ch) return;
    $('ch-title').textContent = ch.title;
    $('ch-tag').textContent = ch.tagline;
    $('ch-brief').textContent = ch.brief;
  }

  // Pretty-print a US/E.164 number, e.g. +14122860700 -> +1 (412) 286-0700.
  function fmtPhone(n) {
    var d = String(n || '').replace(/[^\d+]/g, '');
    var m = d.match(/^\+?1?(\d{3})(\d{3})(\d{4})$/);
    return m ? ('+1 (' + m[1] + ') ' + m[2] + '-' + m[3]) : (n || '');
  }

  // Small corner float — VOTE only. Registration uses the full pre-show board.
  function renderQr(s) {
    var f = $('qr-float');
    if (s.qrShow === 'vote' && s.qr && s.qr.vote) {
      $('qr-img').src = s.qr.vote;
      $('qr-big').textContent = 'Vote Now!';
      $('qr-sub').textContent = 'Scan to pick your winner';
      $('qr-url').textContent = (s.publicUrl || '').replace(/\/+$/, '') + '/vote';
      // Call + SMS option (only if a voting number is configured).
      var ph = $('qr-phone');
      if (s.voteNumber) {
        $('qr-phone-num').textContent = fmtPhone(s.voteNumber);
        ph.style.display = '';
      } else {
        ph.style.display = 'none';
      }
      f.classList.add('show');
    } else {
      f.classList.remove('show');
    }
  }

  // Full-screen pre-show registration board — shows when QR mode = register.
  function renderPreshow(s) {
    var board = $('preshow');
    if (s.qrShow !== 'register') { board.classList.remove('show'); return; }
    board.classList.add('show');
    $('ps-qr-img').src = (s.qr && s.qr.register) ? s.qr.register : '';
    $('ps-url').textContent = (s.publicUrl || '').replace(/\/+$/, '') + '/register';
    $('ps-count').textContent = s.registrantCount || 0;

    var counts = s.challengeCounts || {};
    var selectable = challenges.filter(function (c) { return c.selectable; });
    var max = 1;
    selectable.forEach(function (c) { if ((counts[c.id] || 0) > max) max = counts[c.id]; });
    var host = $('ps-bars');
    host.textContent = '';
    selectable.forEach(function (c) {
      var n = counts[c.id] || 0;
      var row = document.createElement('div'); row.className = 'psrow';
      var lbl = document.createElement('div'); lbl.className = 'lbl'; lbl.textContent = c.title;
      var track = document.createElement('div'); track.className = 'track';
      var i = document.createElement('i'); i.style.width = Math.round((n / max) * 100) + '%'; track.appendChild(i);
      var num = document.createElement('div'); num.className = 'num'; num.textContent = n;
      row.appendChild(lbl); row.appendChild(track); row.appendChild(num);
      host.appendChild(row);
    });
  }

  // ---- sabotage reel ----
  var reelTimer = null;
  function startReel(s) {
    $('sab').classList.add('show');
    $('reel').classList.remove('landed');
    $('sab-hint').textContent = 'Spinning the wheel of chaos…';
    if (reelTimer) return;
    var entries = s.sabotage.entries;
    reelTimer = setInterval(function () {
      if (!entries.length) return;
      var i = Math.floor(Math.random() * entries.length);
      $('reel-slot').textContent = entries[i];
    }, 80);
  }
  function stopReel() {
    if (reelTimer) { clearInterval(reelTimer); reelTimer = null; }
  }
  function landReel(text) {
    stopReel();
    $('reel-slot').textContent = text;
    $('reel').classList.add('landed');
    $('sab-hint').textContent = 'New requirement — adapt or perish!';
  }

  function renderSabotage(s) {
    if (s.sabotage.spinning) {
      startReel(s);
    } else if (s.sabotage.lastResult) {
      landReel(s.sabotage.lastResult.text);
      $('sab').classList.add('show');
    } else {
      stopReel();
      $('sab').classList.remove('show');
    }
  }

  // ---- random draw ----
  var drawTimer = null;
  var drawRevealing = false;
  function startDrawReel(candidates) {
    $('draw').classList.add('show');
    $('draw-reel').classList.remove('landed');
    $('draw-grid').textContent = '';
    $('draw-hint').textContent = 'Drawing eight contestants…';
    if (drawTimer) return;
    drawTimer = setInterval(function () {
      if (!candidates.length) return;
      $('draw-slot').textContent = candidates[Math.floor(Math.random() * candidates.length)];
    }, 70);
  }
  function stopDrawReel() {
    if (drawTimer) { clearInterval(drawTimer); drawTimer = null; }
  }
  function landDraw(result) {
    stopDrawReel();
    drawRevealing = true;
    $('draw').classList.add('show');
    $('draw-reel').classList.add('landed');
    $('draw-slot').textContent = 'Your Eight!';
    $('draw-hint').textContent = 'Let the Prompt Pit begin.';
    var grid = $('draw-grid');
    grid.textContent = '';
    (result || []).forEach(function (r, i) {
      var cell = document.createElement('div');
      cell.className = 'draw-cell';
      cell.style.animationDelay = (i * 0.12) + 's';
      var seed = document.createElement('div'); seed.className = 'seed'; seed.textContent = 'SEED ' + r.seed;
      var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = r.name;
      var gh = document.createElement('div'); gh.className = 'gh'; gh.textContent = r.github ? ('@' + r.github) : '';
      cell.appendChild(seed); cell.appendChild(nm); cell.appendChild(gh);
      grid.appendChild(cell);
    });
    // auto-dismiss after the reveal so the stage returns to the bracket
    setTimeout(function () {
      drawRevealing = false;
      $('draw').classList.remove('show');
    }, 8000);
  }
  function renderDraw(s) {
    if (s.draw && s.draw.drawing) {
      startDrawReel(s.draw.candidates || []);
    } else if (!drawRevealing) {
      stopDrawReel();
      $('draw').classList.remove('show');
    }
  }

  // ---- round winner flash ----
  var winFlashTimer = null;
  function buildWfConfetti(side) {
    var host = $('wf-confetti');
    host.textContent = '';
    var colors = side === 'a'
      ? ['#40E0D0', '#6e9eff', '#ffffff', '#601BE6']
      : ['#F72A72', '#601BE6', '#ffffff', '#ff6da0'];
    for (var i = 0; i < 90; i++) {
      var p = document.createElement('i');
      p.style.left = (Math.random() * 100) + '%';
      p.style.background = colors[i % colors.length];
      p.style.animationDuration = (2 + Math.random() * 2.2) + 's';
      p.style.animationDelay = (Math.random() * 0.6) + 's';
      p.style.transform = 'rotate(' + (Math.random() * 360) + 'deg)';
      host.appendChild(p);
    }
  }
  function playWinFlash(side, name) {
    var el = $('winflash');
    el.classList.remove('a', 'b');
    el.classList.add(side === 'b' ? 'b' : 'a');
    $('wf-name').textContent = name || '—';
    buildWfConfetti(side);
    el.classList.add('show');
    clearTimeout(winFlashTimer);
    winFlashTimer = setTimeout(function () {
      el.classList.remove('show');
      $('wf-confetti').textContent = '';
    }, 3000);
  }

  // ---- champion ----
  var confettiBuilt = false;
  function buildConfetti() {
    if (confettiBuilt) return;
    confettiBuilt = true;
    var host = $('confetti');
    var colors = ['#16e0ff', '#ff3d81', '#ffd34d', '#3dff9e', '#b98cff'];
    for (var i = 0; i < 80; i++) {
      var p = document.createElement('i');
      p.style.left = (Math.random() * 100) + '%';
      p.style.background = colors[i % colors.length];
      p.style.animationDuration = (2.5 + Math.random() * 3) + 's';
      p.style.animationDelay = (Math.random() * 3) + 's';
      p.style.transform = 'rotate(' + (Math.random() * 360) + 'deg)';
      host.appendChild(p);
    }
  }
  function renderChampion(s) {
    if (s.phase === 'champion' && s.champion) {
      $('champ-name').textContent = nameById[s.champion] || s.champion;
      $('champ').classList.add('show');
      buildConfetti();
      $('confetti').style.display = 'block';
    } else {
      $('champ').classList.remove('show');
      $('confetti').style.display = 'none';
    }
  }

  function render(s) {
    state = s;
    nameById = {};
    githubById = {};
    challenges = s.challenges || [];
    s.contestants.forEach(function (c) { nameById[c.id] = c.name; githubById[c.id] = c.github || ''; });

    // header
    $('ev-name').textContent = s.eventName.replace(/^THE\s+/i, '') || 'Prompt Pit';
    $('ev-the').textContent = /^the\b/i.test(s.eventName) ? 'The' : '';
    $('sub-badge').textContent = s.subtitle;
    var badge = $('phase-badge');
    badge.textContent = PHASE_LABEL[s.phase] || s.phase;
    badge.classList.toggle('live', s.phase === 'compete' || s.phase === 'voting');

    var match = s.matches[s.currentMatchId];
    $('round-label').textContent = match ? match.label : '';

    applyClock(s.timer.remainingSec, s.timer.running, s.timer.durationSec);
    var votesVisible = s.votingOpen || s.phase === 'voting' || s.phase === 'results' || s.phase === 'champion';
    var scoreVisible = s.phase === 'judging' || s.phase === 'results' || s.phase === 'champion';
    renderFighter('fa', 'a', match, votesVisible, scoreVisible);
    renderFighter('fb', 'b', match, votesVisible, scoreVisible);
    renderPhaseChrome(s);
    renderBracket(s);
    renderChallenge(s);
    renderQr(s);
    renderPreshow(s);
    renderSabotage(s);
    renderDraw(s);
    renderChampion(s);
  }

  var loadingHidden = false;
  socket.on('state', function (s) {
    render(s);
    if (!loadingHidden) {
      loadingHidden = true;
      var loading = $('loading');
      if (loading) { loading.classList.add('hide'); setTimeout(function () { loading.style.display = 'none'; }, 400); }
    }
  });
  socket.on('tick', function (d) {
    if (!state) return;
    state.timer.remainingSec = d.remainingSec;
    applyClock(d.remainingSec, true, state.timer.durationSec);
  });
  socket.on('timeup', function () {
    applyClock(0, false, 0);
  });
  socket.on('sabotage', function (r) {
    landReel(r.text);
    $('sab').classList.add('show');
  });
  socket.on('draw', function (result) {
    landDraw(result);
  });
  socket.on('winner', function (w) {
    // The final's champion takeover handles itself; flash only for round wins.
    if (w && !w.champion) playWinFlash(w.side, w.name);
  });

  socket.on('connect', function () { $('disc').style.display = 'none'; });
  socket.on('disconnect', function () { $('disc').style.display = 'inline-flex'; });
})();
