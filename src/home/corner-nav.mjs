// How the home moves between the whole room and its three close views.
// Pure: CabinHome feeds it pointer, wheel and key input and gets back offsets,
// snap targets and timings, so the feel is pinned by unit tests.
export const ZONE_ORDER = Object.freeze(['music', 'work', 'life']);
export const ZONE_NAMES = Object.freeze({ all: '全屋', music: '听歌角', work: '工作角', life: '生活角' });
// A corner is wherever its furniture stands: the camera aims at the middle of that furniture and the
// floor around its feet is the click area. The spots are the default layout's, for a room missing all of it.
export const ZONE_FURNITURE = Object.freeze({ music: ['deck', 'records', 'speaker'], work: ['desk', 'chair'], life: ['bed', 'plant', 'tea'] });
export const ZONE_SPOTS = Object.freeze({ music: { x: 771, y: 521, floor: { x: 771, y: 596 } }, work: { x: 380, y: 458, floor: { x: 380, y: 529 } }, life: { x: 600, y: 614, floor: { x: 600, y: 669 } } });
// `boxes`: furniture as overview rectangles [{ type, x, y, w, h }].
export function zoneSpots(boxes = []) {
  return Object.fromEntries(ZONE_ORDER.map(zone => {
    const mine = boxes.filter(box => ZONE_FURNITURE[zone].includes(box.type));
    if (!mine.length) return [zone, ZONE_SPOTS[zone]];
    const mean = pick => Math.round(mine.reduce((sum, box) => sum + pick(box), 0) / mine.length), x = mean(b => b.x + b.w / 2);
    return [zone, { x, y: mean(b => b.y + b.h / 2), floor: { x, y: mean(b => b.y + b.h) } }];
  }));
}
export const ZONE_KEY = 'flow-cabin-home-zone-v1';
export const PHONE_WIDTH = 700;
// Overview → corner: dolly in, then cross-fade; the reverse on the way out.
export const TIMING = Object.freeze({ zoom: 320, reveal: 200, fadeOut: 200, zoomOut: 360, reduced: 120, decodeBudget: 1500 });
export const ZOOM = 2.6, PUSH = 1.08;

const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
export const isZone = zone => zone === 'all' || ZONE_ORDER.includes(zone);
export const zoneIndex = zone => ZONE_ORDER.indexOf(zone);
export function neighbour(zone, step) { const i = zoneIndex(zone) + step; return zoneIndex(zone) >= 0 && i >= 0 && i < ZONE_ORDER.length ? ZONE_ORDER[i] : null; }

// iOS-style resistance past the first or last page: the further you pull, the less it gives.
export function rubberBand(overshoot, dimension, constant = .55) {
  if (!dimension || !overshoot) return 0;
  return Math.sign(overshoot) * (1 - 1 / (Math.abs(overshoot) * constant / dimension + 1)) * dimension;
}
// Track offset (px) for a finger that moved `dx` from page `index`; free inside the strip, elastic at its ends.
export function dragOffset(dx, index, width, count = ZONE_ORDER.length) {
  const max = index * width, min = -(count - 1 - index) * width;
  if (dx > max) return max + rubberBand(dx - max, width);
  if (dx < min) return min + rubberBand(dx - min, width);
  return dx;
}
// Pointer speed (px/ms) over the last `window` ms of samples [{ x, t }]; 0 when the finger rested.
export function velocity(samples, window = 100) {
  if (samples.length < 2) return 0;
  const last = samples.at(-1);
  if (last.t - samples.at(-2).t > window) return 0;
  const first = samples.find(s => last.t - s.t <= window) || samples.at(-2);
  const span = last.t - first.t;
  return span > 0 ? (last.x - first.x) / span : 0;
}
export const FLING = .3, TAP_SLOP = 8;
export const commitDistance = width => clamp(width * .3, 56, 240);
// Which page a released drag settles on: a quick flick turns the page, a slow drag must pass the threshold,
// flicking back against the drag cancels it, and one gesture never skips a page.
export function snapIndex({ index, dx, velocity: v = 0, width, count = ZONE_ORDER.length }) {
  if (Math.abs(dx) < TAP_SLOP) return index;
  const direction = dx < 0 ? 1 : -1;
  let step = 0;
  if (Math.abs(v) >= FLING) step = Math.sign(v) === Math.sign(dx) ? direction : 0;
  else if (Math.abs(dx) >= commitDistance(width)) step = direction;
  return clamp(index + step, 0, count - 1);
}
// How long the strip takes to settle: faster when it was flung, never sluggish, never a jump.
export function settleDuration(remaining, v = 0) {
  const distance = Math.abs(remaining);
  if (!distance) return 0;
  const speed = Math.abs(v);
  return Math.round(clamp(speed >= FLING ? distance / speed * 1.8 : 260 + distance * .12, 200, 460));
}
// Horizontal trackpad scrolling turns one page per gesture once it travels this far.
export const wheelDistance = width => clamp(width * .12, 60, 140);
// Page dots: how lit each dot is while the strip sits between pages (`progress` is a fractional page index).
export const dotLevels = (progress, count = ZONE_ORDER.length) => Array.from({ length: count }, (_, i) => Math.max(0, 1 - Math.abs(i - progress)));

// ← → walk the corners (bumping at the ends), 1/2/3 jump to one, 0 or Esc go back to the whole room.
export function keyTarget(key, zone) {
  if (/^[1-3]$/.test(key)) { const next = ZONE_ORDER[Number(key) - 1]; return next === zone ? null : { to: next }; }
  if (key === '0' || key === 'Escape') return zone === 'all' ? null : { to: 'all' };
  if ((key === 'ArrowLeft' || key === 'ArrowRight') && zone !== 'all') {
    const step = key === 'ArrowRight' ? 1 : -1, next = neighbour(zone, step);
    return next ? { to: next } : { edge: step };
  }
  return null;
}

// The last place is remembered per device; a fresh phone starts in the listening corner.
export function readZone(storage, width) {
  try { const saved = storage?.getItem(ZONE_KEY); if (isZone(saved)) return saved; } catch {}
  return width < PHONE_WIDTH ? 'music' : 'all';
}
export function saveZone(storage, zone) { if (!isZone(zone)) return false; try { storage?.setItem(ZONE_KEY, zone); return true; } catch { return false; } }
// Crossing the phone breakpoint only re-picks the place while the whole room is shown.
export const zoneAfterResize = (zone, phone) => zone === 'all' && phone ? 'music' : zone;

// The overview camera: fit the 1200×800 room into the frame, or dolly toward `focus` by `zoom`.
export function worldCamera(width, height, focus = null, zoom = 1) {
  const fit = Math.max(.01, Math.min(width / 1200, height / 800));
  if (!focus || zoom === 1) return { x: width / 2 - 600 * fit, y: height / 2 - 400 * fit, scale: fit };
  const scale = fit * zoom;
  return { x: width / 2 - focus.x * scale, y: height / 2 - focus.y * scale, scale };
}
export const cameraTransform = ({ x, y, scale }) => `translate(${x}px, ${y}px) scale(${scale})`;
