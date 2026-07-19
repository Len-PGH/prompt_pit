/* The Prompt Pit — audience vote client */
(function () {
  'use strict';
  var socket = io({ transports: ['websocket', 'polling'] });
  var $ = function (id) { return document.getElementById(id); };
  var state = null;
  var myVote = {}; // matchId -> 'a'|'b'

  // stable per-device token
  var token = '';
  try {
    token = localStorage.getItem('pp_voter') || '';
    if (!token) {
      token = 'v' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('pp_voter', token);
    }
    myVote = JSON.parse(localStorage.getItem('pp_votes') || '{}') || {};
  } catch (e) { token = 'v' + Date.now(); }

  function saveVotes() {
    try { localStorage.setItem('pp_votes', JSON.stringify(myVote)); } catch (e) {}
  }

  function nameOf(id) {
    if (!state) return '—';
    for (var i = 0; i < state.contestants.length; i++) if (state.contestants[i].id === id) return state.contestants[i].name;
    return '—';
  }

  function cast(side) {
    if (!state || !state.votingOpen) return;
    socket.emit('vote', { side: side, token: token }, function (res) {
      if (res && res.ok) {
        myVote[state.currentMatchId] = side;
        saveVotes();
        paintPicked();
        if (navigator.vibrate) navigator.vibrate(30);
      }
    });
  }

  $('ch-a').addEventListener('click', function () { cast('a'); });
  $('ch-b').addEventListener('click', function () { cast('b'); });

  function paintPicked() {
    var mine = state ? myVote[state.currentMatchId] : null;
    $('ch-a').classList.toggle('picked', mine === 'a');
    $('ch-b').classList.toggle('picked', mine === 'b');
  }

  function render(s) {
    state = s;
    $('v-sub').textContent = s.subtitle;
    var m = s.matches[s.currentMatchId];

    if (s.votingOpen && m.a && m.b) {
      $('choices').style.display = 'flex';
      $('closed').style.display = 'none';
      $('v-match').textContent = m.label;
      $('ch-a-name').textContent = nameOf(m.a);
      $('ch-b-name').textContent = nameOf(m.b);
      paintPicked();
    } else {
      $('choices').style.display = 'none';
      $('closed').style.display = 'block';
      if (s.phase === 'champion' && s.champion) {
        $('v-match').textContent = '';
        $('closed-big').textContent = '🏆 ' + nameOf(s.champion) + ' wins!';
        $('closed-sub').textContent = 'Champion of The Prompt Pit.';
      } else {
        $('v-match').textContent = m ? m.label : '';
        $('closed-big').textContent = 'Voting is closed';
        $('closed-sub').textContent = 'Hang tight — the next round is coming up.';
      }
    }
  }

  socket.on('state', render);
})();
