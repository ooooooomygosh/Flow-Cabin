import { CAMERA_ANCHOR, DECK_BAND, getRoomScene } from './scene-catalog.mjs';
export const ROOM_SIZE = { width: 1448, height: 1086 };
// Shelf geometry lives in scene-catalog.mjs only; callers pass the scene's.
export function roomGeometry(width, height, safeArea, geometry = getRoomScene('warm').geometry) {
  // Fill both edges. Keep the cabinet's centre anchored while the floor is cropped.
  const coverScale = Math.max(width / ROOM_SIZE.width, height / ROOM_SIZE.height);
  const safeTop = Math.max(0, safeArea?.top || 0), safeBottom = Math.max(0, safeArea?.bottom || 0);
  const lastBottom = geometry.rows.at(-1)[0] + geometry.rows.at(-1)[1];
  // `band` (art px) is what must stay between the toolbar and footer: the shelf, plus
  // the shelf-top deck where a scene has one. Short windows shrink the art to fit.
  const shelfTop = geometry.band?.top ?? (lastBottom > DECK_BAND.bottom ? geometry.rows[0][0] : 200);
  const shelfBottom = geometry.band?.bottom ?? Math.max(DECK_BAND.bottom, lastBottom);
  const safeLeft = Math.max(0, safeArea?.left || 0), safeRight = Math.max(0, safeArea?.right || 0);
  const bandLeft = geometry.band?.left ?? geometry.columns[0][0], bandRight = geometry.band?.right ?? geometry.columns.at(-1)[0] + geometry.columns.at(-1)[1];
  const scale = safeArea ? Math.min(coverScale, Math.max(100, height - safeTop - safeBottom) / (shelfBottom - shelfTop), Math.max(100, width - safeLeft - safeRight) / (bandRight - bandLeft)) : coverScale;
  const artWidth = ROOM_SIZE.width * scale, artHeight = ROOM_SIZE.height * scale;
  let left = artWidth < width ? (width - artWidth) / 2 : Math.max(width - artWidth, Math.min(0, width / 2 - CAMERA_ANCHOR.x * scale));
  if (safeArea) left = Math.max(safeLeft - bandLeft * scale, Math.min(left, width - safeRight - bandRight * scale));
  let top = Math.max(height - artHeight, Math.min(0, height / 2 - CAMERA_ANCHOR.y * scale));
  if (safeArea) top = Math.max(safeTop - shelfTop * scale, Math.min(top, height - safeBottom - shelfBottom * scale));
  return { width: artWidth, height: artHeight, left, top };
}
// A floating tool occupies its actual rectangle, not an entire side of the room.
// Keep the largest usable shelf/deck band, then prefer the smallest camera move.
export function roomGeometryAroundPanel(width, height, safeArea, geometry, panel) {
  const base = roomGeometry(width, height, safeArea, geometry);
  if (!panel || !safeArea) return base;
  const band = geometry.band || { left: geometry.columns[0][0], right: geometry.columns.at(-1)[0] + geometry.columns.at(-1)[1], top: 200, bottom: DECK_BAND.bottom };
  const bounds = art => { const k = art.width / ROOM_SIZE.width; return { left: art.left + band.left * k, right: art.left + band.right * k, top: art.top + band.top * k, bottom: art.top + band.bottom * k }; };
  const overlaps = art => { const b = bounds(art); return b.left < panel.right + 12 && b.right > panel.left - 12 && b.top < panel.bottom + 12 && b.bottom > panel.top - 12; };
  if (!overlaps(base)) return base;
  const candidates = [
    { right: width - panel.left + 12 }, { left: panel.right + 12 },
    { top: panel.bottom + 12 }, { bottom: height - panel.top + 12 }
  ].map(inset => roomGeometry(width, height, Object.fromEntries(Object.entries({ ...safeArea, ...inset }).map(([key, value]) => [key, Math.max(value, safeArea[key] || 0)])), geometry)).filter(art => !overlaps(art));
  candidates.sort((a, b) => b.width - a.width || (Math.abs(a.left - base.left) + Math.abs(a.top - base.top)) - (Math.abs(b.left - base.left) + Math.abs(b.top - base.top)));
  return candidates[0] || base;
}
export function shelfWindow(items, row, columns = 4, visibleRows = 3) {
  const rows = Math.ceil(items.length / columns), maxRow = Math.max(0, rows - visibleRows);
  const startRow = Math.max(0, Math.min(maxRow, Math.round(row) || 0));
  return { startRow, maxRow, rows, items: items.slice(startRow * columns, (startRow + visibleRows) * columns) };
}
export function trackNames(item) {
  const tracks = Array.isArray(item?.tracks) ? item.tracks : [];
  return tracks.map((track) => typeof track === 'string' ? track : track?.title || track?.name || '').filter(Boolean);
}
