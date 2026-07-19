/* The Prompt Pit — shared Material UI behaviors (ripple). Loaded on every page. */
(function () {
  'use strict';
  var SELECTOR = '.btn, .go, .choice, .ch, .stepper button, .k-scopes label, .again, .copy, .kit .copy';
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest(SELECTOR) : null;
    if (!t || t.disabled) return;
    t.classList.add('ripple-host');
    var rect = t.getBoundingClientRect();
    var d = Math.max(rect.width, rect.height);
    var ink = document.createElement('span');
    ink.className = 'ripple-ink';
    ink.style.width = ink.style.height = d + 'px';
    ink.style.left = (e.clientX - rect.left - d / 2) + 'px';
    ink.style.top = (e.clientY - rect.top - d / 2) + 'px';
    t.appendChild(ink);
    setTimeout(function () { if (ink.parentNode) ink.parentNode.removeChild(ink); }, 600);
  }, true);
})();
