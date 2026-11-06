// What a sheet does on its way out, played on a copy of it so the sheet itself can close at once
// (the room underneath is usable again the moment it is put away). Moves after DEsk
// (https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors): folding away takes 1.1 s, in halves
// and quarters, the last 45 % of it travelling to the packet's place; throwing away crumples for 0.42 s
// and then flies off, away from the lamp, toward the bin at the front right.
import { playSfx } from '../props/sfx.mjs';
import { reducedMotion } from '../motion-preference.mjs';
import { PACES, readPace } from '../props/motion.mjs';

const pace = () => PACES[readPace()] || 1;

function ghostOf(node) {
  const r = node.getBoundingClientRect();
  const ghost = document.createElement('div');
  ghost.className = `${node.className} sheet-ghost`;
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  ghost.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;--curl:${node.style.getPropertyValue('--curl') || '19px'}`;
  for (const child of node.children) ghost.append(child.cloneNode(true));
  // Canvases copy blank: paint the corner across, and keep the body scrolled where it was.
  const from = node.querySelectorAll('canvas'), to = ghost.querySelectorAll('canvas');
  from.forEach((c, i) => { try { to[i].width = c.width; to[i].height = c.height; to[i].getContext('2d')?.drawImage(c, 0, 0); } catch { /* tainted or empty */ } });
  document.body.append(ghost);
  const bodies = node.querySelectorAll('.cabin-dialog-body'), copies = ghost.querySelectorAll('.cabin-dialog-body');
  bodies.forEach((b, i) => { if (copies[i]) copies[i].scrollTop = b.scrollTop; });
  return { ghost, r };
}

const finish = (animation, ghost, done) => {
  const end = () => { ghost.remove(); done?.(); };
  animation.finished.then(end, end);
};

// Thrown away: crumpled, then off toward the front right.
export function tossSheet(node) {
  playSfx('paper-toss');
  if (!node || reducedMotion() || typeof node.animate !== 'function') return;
  const { ghost, r } = ghostOf(node);
  ghost.style.transformOrigin = '50% 50%';
  const dx = innerWidth - 80 - (r.left + r.width / 2), dy = innerHeight - 60 - (r.top + r.height / 2);
  const animation = ghost.animate([
    { transform: 'none', opacity: 1, offset: 0 },
    { transform: 'scale(.94, .9) rotate(1.5deg)', opacity: 1, offset: 0.18 },
    { transform: 'scale(.42) rotate(-9deg)', opacity: 1, offset: 0.42, easing: 'cubic-bezier(.4, 0, .9, .6)' },
    { transform: `translate(${dx * 0.55}px, ${dy * 0.28}px) scale(.24) rotate(70deg)`, opacity: 1, offset: 0.7 },
    { transform: `translate(${dx}px, ${dy}px) scale(.12) rotate(150deg)`, opacity: 0, offset: 1 },
  ], { duration: 980 * pace(), easing: 'linear', fill: 'forwards' });
  setTimeout(() => playSfx('paper-land'), 900 * pace());
  finish(animation, ghost);
}

// Folded away into a packet at `to` ({ x, y, w, h } on screen); `done` puts the packet down.
export function foldSheet(node, to, done) {
  playSfx('paper-unpress');
  if (!node || reducedMotion() || typeof node.animate !== 'function' || !to) { done?.(); return; }
  const { ghost, r } = ghostOf(node);
  ghost.classList.add('is-folding');
  const half = `translate(0px, ${r.height * 0.25}px) scale(1, .5)`, quarter = `translate(${r.width * 0.25}px, ${r.height * 0.25}px) scale(.5, .5)`;
  const end = `translate(${to.x - r.left}px, ${to.y - r.top}px) scale(${to.w / r.width}, ${to.h / r.height})`;
  const animation = ghost.animate([
    { transform: 'none', filter: 'brightness(1)', offset: 0 },
    { transform: half, filter: 'brightness(.94)', offset: 0.28 },
    { transform: quarter, filter: 'brightness(.97)', offset: 0.55, easing: 'cubic-bezier(.45, 0, .55, 1)' },
    { transform: end, filter: 'brightness(1)', offset: 1 },
  ], { duration: 1100 * pace(), easing: 'cubic-bezier(.3, 0, .3, 1)', fill: 'forwards' });
  setTimeout(() => playSfx('paper-press'), 300 * pace());
  setTimeout(() => playSfx('paper-land'), 1050 * pace());
  finish(animation, ghost, done);
}
