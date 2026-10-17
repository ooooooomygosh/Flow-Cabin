// Records travel: double-click a sleeve and it lifts off the shelf, the disc
// slides out, and only the vinyl lands on the platter; "加入待播" sends a small
// sleeve to the queue button. Web Animations on a throwaway element, so the
// room's layout is never touched. Respects reduced motion.
import { playDeckSound } from './deck-sfx.mjs';
import { reducedMotion as reduced } from '../motion-preference.mjs';
const rectOf = (value) => value?.getBoundingClientRect ? value.getBoundingClientRect() : value;
const safeImage = (src) => /^(https:|data:image\/|blob:|\/)/.test(String(src || '')) ? String(src).replace(/"/g, '%22') : '';

export function flyRecord({ from, to, cover = '', vinyl = '#16110e', mode = 'load', target = null } = {}) {
  const start = rectOf(from), end = rectOf(to);
  if (!start || !end || !start.width || !end.width || reduced() || typeof document === 'undefined' || !document.body.animate) return Promise.resolve(false);
  const size = Math.min(start.width, start.height), layer = document.createElement('div');
  layer.className = `record-flight is-${mode}`; layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = `left:${start.left + (start.width - size) / 2}px;top:${start.top + (start.height - size) / 2}px;width:${size}px;height:${size}px;--flight-vinyl:${vinyl}`;
  const image = safeImage(cover);
  layer.innerHTML = `<span class="record-flight-disc"><i style="${image ? `background-image:url(&quot;${image}&quot;)` : ''}"></i></span><span class="record-flight-sleeve" style="${image ? `background-image:url(&quot;${image}&quot;)` : ''}"></span>`;
  document.body.append(layer);
  target?.classList.add('is-awaiting-record');
  const dx = end.left + end.width / 2 - (start.left + start.width / 2), dy = end.top + end.height / 2 - (start.top + start.height / 2);
  const scale = mode === 'queue' ? Math.max(.12, 28 / size) : Math.max(.15, Math.min(end.width, end.height * 1.6) / size * .62);
  const arc = Math.min(-60, -Math.abs(dx) * .18);
  const duration = mode === 'queue' ? 520 : 720;
  const sleeve = layer.querySelector('.record-flight-sleeve'), disc = layer.querySelector('.record-flight-disc');
  if (mode === 'load') playDeckSound('sleeve', .7);
  const path = layer.animate([
    { transform: 'translate(0,0) scale(1) rotate(0deg)', offset: 0 },
    { transform: `translate(${dx * .15}px,${arc * .7}px) scale(${1.08}) rotate(-4deg)`, offset: .22 },
    { transform: `translate(${dx * .6}px,${dy * .55 + arc}px) scale(${(1 + scale) / 2}) rotate(2deg)`, offset: .62 },
    { transform: `translate(${dx}px,${dy}px) scale(${scale}) rotate(0deg)`, offset: 1 }
  ], { duration, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' });
  if (mode === 'load') {
    disc.animate([{ transform: 'translateX(0) rotate(0deg)' }, { transform: 'translateX(46%) rotate(140deg)', offset: .35 }, { transform: 'translateX(0) rotate(420deg)' }], { duration, easing: 'ease-in-out', fill: 'forwards' });
    sleeve.animate([{ opacity: 1 }, { opacity: 1, offset: .38 }, { opacity: 0, transform: 'translateX(-30%) rotate(-8deg)' }], { duration, easing: 'ease-out', fill: 'forwards' });
  } else {
    disc.style.opacity = '0';
    sleeve.animate([{ opacity: 1 }, { opacity: 1, offset: .8 }, { opacity: 0 }], { duration, fill: 'forwards' });
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
