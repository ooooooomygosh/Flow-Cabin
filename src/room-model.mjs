import { CAMERA_ANCHOR, DECK_BAND, getRoomScene } from './scene-catalog.mjs';
export const ROOM_SIZE = { width: 1448, height: 1086 };
// The shelf band (art px) that must stay between the toolbar and footer: the
// shelf, plus the shelf-top deck where a scene has one. Short windows shrink
// the art to fit. Scenes carry their own band; without one it is derived from
// the shelf geometry — in ONE place, so the layout and the panel-avoidance
// test can never disagree about where the shelf is.
export function bandOf(geometry) {
  const rows = Array.isArray(geometry?.rows) ? geometry.rows : [], columns = Array.isArray(geometry?.columns) ? geometry.columns : [];
  const last = rows.length ? rows[rows.length - 1] : [0, 0];
  const lastBottom = last[0] + last[1];
  const first = rows.length ? rows[0] : [0, 0];
  const lastColumn = columns.length ? columns[columns.length - 1] : [0, 0];
  const band = geometry?.band || {};
  return {
    left: band.left ?? (columns.length ? columns[0][0] : 0),
    right: band.right ?? (columns.length ? lastColumn[0] + lastColumn[1] : 0),
    top: band.top ?? (lastBottom > DECK_BAND.bottom ? first[0] : 200),
    bottom: band.bottom ?? Math.max(DECK_BAND.bottom, lastBottom)
  };
}
// Shelf geometry lives in scene-catalog.mjs only; callers pass the scene's.
export function roomGeometry(width, height, safeArea, geometry = getRoomScene('warm').geometry) {
  // Fill both edges. Keep the cabinet's centre anchored while the floor is cropped.
  const coverScale = Math.max(width / ROOM_SIZE.width, height / ROOM_SIZE.height);
  const safeTop = Math.max(0, safeArea?.top || 0), safeBottom = Math.max(0, safeArea?.bottom || 0);
  const band = bandOf(geometry);
  const shelfTop = band.top, shelfBottom = band.bottom;
  const safeLeft = Math.max(0, safeArea?.left || 0), safeRight = Math.max(0, safeArea?.right || 0);
  const bandLeft = band.left, bandRight = band.right;
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
  const band = bandOf(geometry);
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
  const list = Array.isArray(items) ? items : [];
  const cols = Number.isFinite(columns) && columns > 0 ? Math.floor(columns) : 4;
  const visible = Number.isFinite(visibleRows) && visibleRows > 0 ? Math.floor(visibleRows) : 3;
  const rows = Math.ceil(list.length / cols), maxRow = Math.max(0, rows - visible);
  const startRow = Math.max(0, Math.min(maxRow, Math.round(row) || 0));
  return { startRow, maxRow, rows, items: list.slice(startRow * cols, (startRow + visible) * cols) };
}
export function trackNames(item) {
  const tracks = Array.isArray(item?.tracks) ? item.tracks : [];
  return tracks.map((track) => typeof track === 'string' ? track : track?.title || track?.name || '').filter(Boolean);
}
