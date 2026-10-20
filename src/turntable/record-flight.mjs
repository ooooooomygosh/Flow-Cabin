// Records travel: double-click a sleeve and it lifts off the shelf, the disc
// slides out, and only the vinyl lands on the platter; "加入待播" sends a small
// sleeve to the queue button. Web Animations on a throwaway element, so the
// room's layout is never touched. Respects reduced motion.
//
// Pixel grammar: the flight steps. It is a handful of poses on a whole-pixel
// arc, not a glide — a smooth cubic-bezier would resample the cover art and
// move the sleeve by fractions of a pixel.
import { playDeckSound } from './deck-sfx.mjs';
import { reducedMotion as reduced } from '../motion-preference.mjs';
const rectOf = (value) => value?.getBoundingClientRect ? value.getBoundingClientRect() : value;
const safeImage = (src) => /^(https:|data:image\/|blob:|\/)/.test(String(src || '')) ? String(src).replace(/"/g, '%22') : '';

// The arc: `steps` poses, each held until the next, on whole pixels.
export const FLIGHT_STEPS = 8;
/** The flight path: a parabola over the chord, one whole-pixel pose per step.
 *  `lift` is how high the record rises above the straight line (px). */
export function flightFrames({ dx = 0, dy = 0, lift = 0, scale = 1, steps = FLIGHT_STEPS } = {}) {
  const frames = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(dx * t), y = Math.round(dy * t - lift * 4 * t * (1 - t));
    // The sleeve lifts a little on the way out, then shrinks onto the platter.
    const bulge = 1 + .08 * Math.sin(Math.PI * t);
    const s = Math.round((1 + (scale - 1) * t) * bulge * 100) / 100;
    frames.push({ transform: `translate(${x}px, ${y}px) scale(${s})`, offset: i / steps, easing: 'steps(1, end)' });
  }
  return frames;
}

export function flyRecord({ from, to, cover = '', vinyl = '#16110e', mode = 'load', target = null } = {}) {
  const start = rectOf(from), end = rectOf(to);
  if (!start || !end || !start.width || !end.width || reduced() || typeof document === 'undefined' || !document.body.animate) return Promise.resolve(false);
  const size = Math.min(start.width, start.height), layer = document.createElement('div');
  layer.className = `record-flight is-${mode}`; layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = `left:${Math.round(start.left + (start.width - size) / 2)}px;top:${Math.round(start.top + (start.height - size) / 2)}px;width:${size}px;height:${size}px;--flight-vinyl:${vinyl}`;
  const image = safeImage(cover);
  layer.innerHTML = `<span class="record-flight-disc"><i style="${image ? `background-image:url(&quot;${image}&quot;)` : ''}"></i></span><span class="record-flight-sleeve" style="${image ? `background-image:url(&quot;${image}&quot;)` : ''}"></span>`;
  document.body.append(layer);
  target?.classList.add('is-awaiting-record');
  const dx = end.left + end.width / 2 - (start.left + start.width / 2), dy = end.top + end.height / 2 - (start.top + start.height / 2);
  const scale = mode === 'queue' ? Math.max(.12, 28 / size) : Math.max(.15, Math.min(end.width, end.height * 1.6) / size * .62);
  const lift = Math.round(Math.min(60, Math.abs(dx) * .18));
  const duration = mode === 'queue' ? 520 : 720;
  const sleeve = layer.querySelector('.record-flight-sleeve'), disc = layer.querySelector('.record-flight-disc');
  if (mode === 'load') playDeckSound('sleeve', .7);
  const path = layer.animate(flightFrames({ dx, dy, lift, scale }), { duration, easing: 'linear', fill: 'forwards' });
  if (mode === 'load') {
    // The vinyl slides out of the sleeve and spins: stepped, so the disc turns
    // in frames instead of gliding.
    disc.animate([
      { transform: 'translateX(0) rotate(0deg)', offset: 0, easing: 'steps(1, end)' },
      { transform: 'translateX(46%) rotate(140deg)', offset: .35, easing: 'steps(1, end)' },
      { transform: 'translateX(0) rotate(420deg)', offset: 1 }
    ], { duration, easing: 'linear', fill: 'forwards' });
    sleeve.animate([
      { opacity: 1, offset: 0, easing: 'steps(1, end)' },
      { opacity: 1, offset: .38, easing: 'steps(1, end)' },
      { opacity: 0, transform: `translateX(${-Math.round(size * .3)}px)`, offset: 1 }
    ], { duration, easing: 'linear', fill: 'forwards' });
  } else {
    disc.style.opacity = '0';
    sleeve.animate([{ opacity: 1, offset: 0, easing: 'steps(1, end)' }, { opacity: 1, offset: .8, easing: 'steps(1, end)' }, { opacity: 0, offset: 1 }], { duration, easing: 'linear', fill: 'forwards' });
  }
  return path.finished.catch(() => {}).then(() => {
    layer.remove(); target?.classList.remove('is-awaiting-record');
    if (target) {
      if (mode === 'queue') target.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'steps(4, end)' });
      else target.querySelector?.('.scene-deck-record')?.animate([{ transform: 'translateY(-6px)', opacity: 0 }, { opacity: 1, offset: .25 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: 'steps(4, end)' });
    }
    return true;
  });
}
