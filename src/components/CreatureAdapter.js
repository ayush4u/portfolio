// Mascot adapter. Mounts Jello (src/jello) after the DOM is ready and keeps it out of the chat panel.
// If a different module sets window.Creature with mount(el), it is used instead.
// If mounting fails, the CSS blob in .blobbox stays as the fallback.
import Jello from '../jello/jello.js';
import '../jello/jello.css';

export function initCreature() {
  const root = document.getElementById('creature-root');
  const rq = matchMedia('(prefers-reduced-motion: reduce)');
  const panel = document.getElementById('chat-panel');
  let api = null;
  try {
    if (window.Creature && typeof window.Creature.mount === 'function' && root) {
      window.Creature.mount(root, { reducedMotion: rq.matches });
      api = window.Creature;
    } else {
      Jello.mount({ chatPanel: panel, safeZone: 96, reducedMotion: rq.matches, hero: '#jello-hero' });
      api = Jello;
    }
    document.body.classList.add('creature-mounted');
    const fab = document.getElementById('chat-toggle');
    if (fab && api === Jello && typeof Jello.badge === 'function') Jello.badge(fab, { reducedMotion: rq.matches });
  } catch (err) {
    console.warn('Mascot mount failed, keeping CSS blob', err);
    return;
  }
  const call = (fn, v) => { if (typeof api[fn] === 'function') api[fn](v); };
  rq.addEventListener('change', (e) => call('setReducedMotion', e.matches));
  window.addEventListener('chat:thinking', (e) => call('setThinking', !!e.detail));
  window.addEventListener('chat:open', (e) => call('setChatOpen', !!e.detail));
}
