/** Collision-aware placement for the room cat's speech bubble.
 * `base` is the bubble's rect at its default spot (centred above the cat),
 * `cat` the cat's rect, `obstacles` rects it must not cover (record cells,
 * toolbar, console, footer, paging, focus panel). Returns the first candidate
 * with no overlap that stays on screen, else the least-bad one. */
export const BUBBLE_OBSTACLES = '.room-record-slot, .room-empty, .scene-deck, .app-titlebar, .cabin-toolbar > *, .room-turntable, .room-now-playing, .room-shelf-navigation, .focus-dock, .immersive-exit, .focus-badge';
const area = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
const shift = (r, dx, dy) => ({ left: r.left + dx, right: r.right + dx, top: r.top + dy, bottom: r.bottom + dy });
export function chooseBubbleOffset(base, cat, obstacles, view, gap = 6, consoleRect = null) {
  const w = base.right - base.left, h = base.bottom - base.top, catMid = (cat.top + cat.bottom) / 2;
  const toSide = (cat.right - cat.left) / 2 + w / 2 + gap, down = catMid - h / 2 - base.top;
  const candidates = [
    ['top', 0, 0], ['top', -(w / 2 - 14), 0], ['top', w / 2 - 14, 0],
    ['right', toSide, down], ['left', -toSide, down],
    ['top', 0, -h - gap], ['top', -(w / 2 - 14), -h - gap], ['top', w / 2 - 14, -h - gap]
  ];
  // Console present and the cat sits left of its right edge: the bubble would be painted into/over it, so lean right (tie-break only: `cost` stays pure overlap).
  const lean = Boolean(consoleRect && (cat.left + cat.right) / 2 < consoleRect.right);
  let best = null;
  for (const [side, dx, dy] of candidates) {
    const r = shift(base, dx, dy);
    const off = Math.max(0, view.left - r.left) + Math.max(0, r.right - view.right) + Math.max(0, view.top - r.top) + Math.max(0, r.bottom - view.bottom);
    const cost = obstacles.reduce((sum, o) => sum + area(r, o), 0) + off * h * 4, bias = lean && dx < 0 ? 1 : 0;
    if (!best || cost < best.cost || (cost === best.cost && bias < best.bias)) best = { side, dx: Math.round(dx), dy: Math.round(dy), cost, bias };
    if (cost === 0 && bias === 0) break;
  }
  return best;
}

/** The room cat stands on the scene's painted floor (`floor`, art px from scene-catalog,
 * exposed as --scene-floor): its CSS `bottom` in px for a stage `height` px tall whose
 * art is drawn at `sceneY` with scale `k`. Never closer than CAT_FLOOR_MIN to the
 * window edge (the art floor can be cropped away). null without a scene floor. */
export const CAT_FLOOR_MIN = 28;
export function catFloorOffset({ height, sceneY = 0, k = 1, floor }) {
  if (!Number.isFinite(floor) || !Number.isFinite(height)) return null;
  return Math.max(CAT_FLOOR_MIN, Math.round(height - sceneY - floor * k));
}

/** Choose where the room cat sits (and where its bubble goes) so neither covers
 * a record cell or a panel: floor spots along its baseline, or perched on top of
 * the turntable console. Keeps the current spot while it is still clear. */
export const CAT_OBSTACLES = BUBBLE_OBSTACLES;
const inset = (r, k) => { const dx = (r.right - r.left) * k, dy = (r.bottom - r.top) * k; return { left: r.left + dx, right: r.right - dx, top: r.top + dy, bottom: r.bottom }; };
/** preferPerch: the cat wants to be back on the console top (immersive hover held);
 * any clear perch spot wins over staying on the floor. */
export function chooseCatSpot({ cat, floorTop = cat.top, bubble, obstacles, consoleRect, view, home, preferPerch = false }) {
  const w = cat.right - cat.left, h = cat.bottom - cat.top;
  const spots = [];
  for (let x = view.left + 8; x <= view.right - w - 8; x += Math.max(8, w / 4)) spots.push({ perch: false, left: x, top: floorTop });
  if (consoleRect) for (let x = consoleRect.left; x <= consoleRect.right - w; x += Math.max(8, w / 4)) spots.push({ perch: true, left: x, top: consoleRect.top - h });
  const offscreen = (r) => Math.max(0, view.left - r.left) + Math.max(0, r.right - view.right) + Math.max(0, view.top - r.top) + Math.max(0, r.bottom - view.bottom);
  const evaluate = (spot) => {
    const body = inset({ left: spot.left, right: spot.left + w, top: spot.top, bottom: spot.top + h }, .14);
    let cost = obstacles.reduce((sum, o) => sum + area(body, o), 0) * 2 + offscreen(body) * h * 4, bubblePick = null;
    if (bubble) {
      const dx = spot.left - cat.left, dy = spot.top - cat.top;
      bubblePick = chooseBubbleOffset(shift(bubble, dx, dy), { left: spot.left, right: spot.left + w, top: spot.top, bottom: spot.top + h }, obstacles, view, 6, consoleRect);
      cost += bubblePick.cost;
    }
    return { ...spot, cost, bubble: bubblePick, distance: Math.abs(spot.left - home) + (spot.perch ? w : 0) };
  };
  const current = evaluate({ perch: Boolean(cat.perch), left: cat.left, top: cat.top });
  // A perched cat needs its perch: console visible, feet on its top edge, mostly over it.
  if (cat.perch && !(consoleRect && Math.abs(cat.top + h - consoleRect.top) <= 2 && Math.min(cat.left + w, consoleRect.right) - Math.max(cat.left, consoleRect.left) >= w / 2)) current.cost = Infinity;
  if (preferPerch && !cat.perch && consoleRect) {
    const perch = spots.filter((s) => s.perch).map(evaluate).filter((s) => s.cost <= Math.min(current.cost, 1)).sort((a, b) => a.cost - b.cost || a.distance - b.distance)[0];
    if (perch) return perch;
  }
  if (current.cost === 0) return current;
  return spots.map(evaluate).reduce((best, s) => (s.cost < best.cost - 1 || (Math.abs(s.cost - best.cost) <= 1 && s.distance < best.distance)) ? s : best, current.cost === Infinity ? { ...current, cost: Number.MAX_VALUE } : current);
}
