// A sticky note flying from where it was to the day it was stuck on, springing a little at the
// end like paper that lands. Reduced motion: no flight, only the sound.
import { EASE_DRAWER, moveSeconds } from '../../props/motion.mjs';
import { playSfx } from '../../props/sfx.mjs';
import { reducedMotion } from '../../motion-preference.mjs';

export function flyNote({ from, to, text = '', color = '#FCE066', doc = globalThis.document }) {
  const land = () => { playSfx('paper-press'); to?.setAttribute?.('data-landed', ''); setTimeout(() => to?.removeAttribute?.('data-landed'), 700); };
  if (!doc || !from || !to || reducedMotion()) { land(); return null; }
  const a = from, b = to.getBoundingClientRect();
  const el = doc.createElement('div');
  el.className = 'desk-flying-note'; el.textContent = text.slice(0, 14); el.setAttribute('aria-hidden', 'true');
  el.style.setProperty('--note', color);
  // A modal <dialog> sits in the top layer, above anything outside it: fly inside it.
  (to.closest('dialog') || doc.body).appendChild(el);
  const sw = 96, sh = 64, dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const wantX = a.left + a.width / 2 - sw / 2, wantY = a.top + a.height / 2 - sh / 2;
  el.style.left = `${wantX}px`; el.style.top = `${wantY}px`;
  // A filtered ancestor (the paper's lamp shadow) re-bases `position: fixed`: measure and correct.
  const placed = el.getBoundingClientRect(); el.style.left = `${wantX + (wantX - placed.left)}px`; el.style.top = `${wantY + (wantY - placed.top)}px`;
  const scale = Math.max(0.22, Math.min(0.5, b.width / sw));
  let animation = null;
  try {
    animation = el.animate([
      { transform: 'translate(0, 0) rotate(-3deg) scale(1)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) rotate(2deg) scale(${scale})`, opacity: 1, offset: 0.92 },
      { transform: `translate(${dx}px, ${dy}px) rotate(2deg) scale(${scale})`, opacity: 0 }
    ], { duration: Math.round(moveSeconds(0.55) * 1000), easing: EASE_DRAWER, fill: 'forwards' });
  } catch { animation = null; }
  let landed = false;
  const done = () => { if (landed) return; landed = true; el.remove(); land(); };
  if (animation) { animation.addEventListener('finish', done); animation.addEventListener('cancel', done); } else done();
  return el;
}
