import './styles/main.css';
import './styles/scoreboard.css';
import { initChatbot } from './components/Chatbot.js';
import { trackVisit } from './components/Tracker.js';
import { initScoreboard } from './components/Scoreboard.js';
import { initCreature } from './components/CreatureAdapter.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Scroll reveal: cards drop in, doodles draw themselves
function initMotion() {
  document.querySelectorAll('.card,.tl,.photo').forEach((e) => e.classList.add('rv'));
  document.querySelectorAll('section svg, .arrow svg').forEach((v) => {
    v.classList.add('draw');
    v.querySelectorAll('path').forEach((p) => p.setAttribute('pathLength', '1'));
  });
  const targets = document.querySelectorAll('.rv, svg.draw');
  if (reduced || !('IntersectionObserver' in window)) { targets.forEach((e) => e.classList.add('in')); return; }
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: 0.15 });
  targets.forEach((e) => io.observe(e));
}

// Blob gently follows the cursor (fallback mascot)
function initBlobFollow() {
  const blob = document.querySelector('.blob');
  if (!blob || reduced || !matchMedia('(pointer:fine)').matches) return;
  addEventListener('mousemove', (e) => {
    const r = blob.getBoundingClientRect();
    const c = (v) => Math.max(-12, Math.min(12, v));
    blob.style.translate = `${c((e.clientX - r.left - r.width / 2) / 40)}px ${c((e.clientY - r.top - r.height / 2) / 40)}px`;
  });
}

// Project filter chips
function initFilters() {
  const chips = document.querySelectorAll('#filters .chip');
  chips.forEach((chip) => chip.addEventListener('click', () => {
    chips.forEach((c) => c.classList.toggle('on', c === chip));
    const f = chip.dataset.f;
    document.querySelectorAll('.sticker').forEach((s) =>
      s.classList.toggle('hide', f !== 'all' && !s.dataset.cat.split(' ').includes(f)));
  }));
}

function boot() {
  initMotion();
  initFilters();
  initChatbot();
  initScoreboard();
  initCreature();
  if (!document.body.classList.contains('creature-mounted')) initBlobFollow();
  trackVisit();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
