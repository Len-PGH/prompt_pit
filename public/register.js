/* The Prompt Pit — contestant portal / registration client */
(function () {
  'use strict';
  var socket = io({ transports: ['websocket', 'polling'] });
  var $ = function (id) { return document.getElementById(id); };

  var selected = new Set();     // challenge ids the contestant picked
  var challengeTitle = {};      // id -> title (for the success screen)
  var built = false;
  var starters = [];            // [{id,title,lang,code}] from /api/starters

  // Fetch contestant starter kits once (contestant-safe files only).
  fetch('/api/starters').then(function (r) { return r.json(); })
    .then(function (data) { starters = Array.isArray(data) ? data : []; })
    .catch(function () { starters = []; });

  function showErr(text) { var m = $('msg'); m.textContent = text; m.className = 'msg err'; }
  function clearErr() { $('msg').className = 'msg'; }

  // Build the challenge cards + judging chips once, from server state.
  function buildOnce(s) {
    if (built) return;
    built = true;

    var host = $('challenges');
    host.textContent = '';
    (s.challenges || []).forEach(function (c) {
      challengeTitle[c.id] = c.title;
      if (!c.selectable) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ch';
      btn.setAttribute('data-id', c.id);
      var ttl = document.createElement('div'); ttl.className = 'ttl'; ttl.textContent = c.title;
      var tg = document.createElement('div'); tg.className = 'tg'; tg.textContent = c.tagline;
      var tick = document.createElement('div'); tick.className = 'tick'; tick.textContent = '✓';
      btn.appendChild(tick); btn.appendChild(ttl); btn.appendChild(tg);
      btn.addEventListener('click', function () {
        if (selected.has(c.id)) { selected.delete(c.id); btn.classList.remove('on'); }
        else { selected.add(c.id); btn.classList.add('on'); }
      });
      host.appendChild(btn);
    });

    // finale note (non-selectable challenges shown as info)
    var finale = (s.challenges || []).filter(function (c) { return !c.selectable; });
    if (finale.length) {
      $('finale-note').textContent = '★ ' + finale[0].title + ' — ' + finale[0].tagline +
        ' Reached only by the two finalists; nothing to pick here.';
    }

    // judging chips
    var chost = $('criteria');
    chost.textContent = '';
    (s.criteria || []).forEach(function (c) {
      var chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = c.label;
      chost.appendChild(chip);
    });

    // prefill from a previous registration on this device
    try {
      var saved = JSON.parse(localStorage.getItem('pp_reg') || 'null');
      if (saved) {
        $('f-name').value = saved.name || '';
        $('f-github').value = saved.github || '';
        $('f-email').value = saved.email || '';
        (saved.challenges || []).forEach(function (id) {
          selected.add(id);
          var b = host.querySelector('.ch[data-id="' + id + '"]');
          if (b) b.classList.add('on');
        });
      }
    } catch (e) {}
  }

  function renderPicks(hostEl, ids) {
    hostEl.textContent = '';
    if (!ids.length) {
      var none = document.createElement('span'); none.className = 'chip'; none.textContent = 'No challenge selected';
      hostEl.appendChild(none); return;
    }
    ids.forEach(function (id) {
      var chip = document.createElement('span'); chip.className = 'chip';
      chip.textContent = challengeTitle[id] || id;
      hostEl.appendChild(chip);
    });
  }

  function renderStarters(pickedIds) {
    var host = $('starters');
    host.textContent = '';
    if (!starters.length) {
      var m = document.createElement('div'); m.className = 'hint'; m.textContent = 'Starter kits will be available on-site.';
      host.appendChild(m); return;
    }
    var pickedSet = {};
    pickedIds.forEach(function (id) { pickedSet[id] = true; });
    // picked challenges first
    var ordered = starters.slice().sort(function (a, b) {
      return (pickedSet[b.id] ? 1 : 0) - (pickedSet[a.id] ? 1 : 0);
    });
    ordered.forEach(function (s, idx) {
      var kit = document.createElement('div');
      kit.className = 'kit' + (idx === 0 ? ' open' : '');

      var head = document.createElement('div'); head.className = 'kit-h';
      var kt = document.createElement('div'); kt.className = 'kt';
      if (pickedSet[s.id]) { var star = document.createElement('span'); star.className = 'star'; star.textContent = '★'; kt.appendChild(star); }
      kt.appendChild(document.createTextNode(s.title));
      var grp = document.createElement('div'); grp.className = 'grp';
      var copy = document.createElement('button'); copy.className = 'copy'; copy.type = 'button'; copy.textContent = 'Copy';
      var chev = document.createElement('span'); chev.className = 'chev'; chev.textContent = '▶';
      grp.appendChild(copy); grp.appendChild(chev);
      head.appendChild(kt); head.appendChild(grp);

      var pre = document.createElement('pre');
      var code = document.createElement('code');
      code.textContent = s.code; // textContent — never innerHTML
      pre.appendChild(code);

      head.addEventListener('click', function (e) {
        if (e.target === copy) return;
        kit.classList.toggle('open');
      });
      copy.addEventListener('click', function (e) {
        e.stopPropagation();
        var done = function () { copy.textContent = 'Copied ✓'; copy.classList.add('ok'); setTimeout(function () { copy.textContent = 'Copy'; copy.classList.remove('ok'); }, 1500); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(s.code).then(done, function () { fallbackCopy(s.code); done(); });
        } else { fallbackCopy(s.code); done(); }
      });

      kit.appendChild(head); kit.appendChild(pre);
      host.appendChild(kit);
    });
  }

  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) {}
  }

  function showDone(name, ids) {
    $('done-who').textContent = name;
    renderPicks($('done-picks'), ids);
    renderStarters(ids);
    $('portal').style.display = 'none';
    $('done').style.display = 'block';
    window.scrollTo(0, 0);
  }

  $('reg-form').addEventListener('submit', function (e) {
    e.preventDefault();
    clearErr();
    var name = $('f-name').value.trim();
    var github = $('f-github').value.trim().replace(/^@+/, '');
    var email = $('f-email').value.trim();
    if (!name) { showErr('Please enter a team or player name.'); return; }
    if (!github) { showErr('Please enter your GitHub username.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showErr('Please enter a valid email.'); return; }

    var picks = Array.from(selected);
    var go = $('go');
    go.disabled = true;
    socket.emit('register', { name: name, github: github, email: email, challenges: picks }, function (res) {
      go.disabled = false;
      if (res && res.ok) {
        try { localStorage.setItem('pp_reg', JSON.stringify({ name: name, github: github, email: email, challenges: picks })); } catch (e2) {}
        showDone(name, picks);
      } else {
        showErr((res && res.error) ? res.error : 'Something went wrong — try again.');
      }
    });
  });

  $('edit').addEventListener('click', function () {
    $('done').style.display = 'none';
    $('portal').style.display = 'block';
  });

  socket.on('state', function (s) {
    $('r-sub').textContent = s.subtitle;
    $('count').textContent = s.registrantCount || 0;
    buildOnce(s);
  });
})();
