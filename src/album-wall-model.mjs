export const WALL_STORAGE_KEY = 'album-circle-wall-v1';
export const WALL_DEFAULTS = Object.freeze({ layout: 'grid', columns: 5, gap: 12, margin: 40, border: 0, background: '#12191b', textColor: '#edf4ef', title: '我的专辑墙', author: '', showNames: true, showArtists: true, font: 'bundled', sort: 'selection', scale: 2 });
// The wall's in-memory identity (dedupe, React keys); not persisted. Vinyl styles use record-library albumKey.
export function wallKey(item) { return item.externalIds?.qqAlbumMid ? `qq:${item.externalIds.qqAlbumMid}` : item.externalIds?.itunesCollectionId ? `itunes:${item.externalIds.itunesCollectionId}` : `${item.artist}\n${item.title}`; }
const number = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Math.round(Number(value)))) : fallback;
export function normalizeWall(value = {}) {
  return { ...WALL_DEFAULTS,
    layout: value.layout === 'ranked' ? 'ranked' : 'grid', columns: number(value.columns, 5, 1, 12), gap: number(value.gap, 12, 0, 60), margin: number(value.margin, 40, 0, 160), border: number(value.border, 0, 0, 12), scale: number(value.scale, 2, 1, 3),
    background: /^#[0-9a-f]{6}$/i.test(value.background) ? value.background : WALL_DEFAULTS.background, textColor: /^#[0-9a-f]{6}$/i.test(value.textColor) ? value.textColor : WALL_DEFAULTS.textColor,
    title: String(value.title ?? WALL_DEFAULTS.title).slice(0, 120), author: String(value.author || '').slice(0, 80),
    showNames: value.showNames !== false, showArtists: value.showArtists !== false,
    font: typeof value.font === 'string' && value.font.length < 160 && !/[\x00-\x1f"'\\;{}<>]/.test(value.font) ? value.font : 'bundled',
    sort: ['title', 'artist', 'year'].includes(value.sort) ? value.sort : 'selection'
  };
}
export function orderAlbums(items, sort) {
  const ordered = [...items];
  if (sort === 'title' || sort === 'artist') ordered.sort((a, b) => String(a[sort] || '').localeCompare(String(b[sort] || ''), 'zh'));
  if (sort === 'year') ordered.sort((a, b) => (Number(a.year) || 0) - (Number(b.year) || 0));
  return ordered;
}
export function wallGeometry(count, options) {
  const o = normalizeWall(options), cover = 220, width = o.columns * cover + (o.columns - 1) * o.gap;
  const top = o.margin + (o.title ? 72 : 0) + (o.author ? 36 : 0), cells = [];
  let offset = 0, y = top, row = 0;
  while (offset < count) {
    const columns = o.layout === 'ranked' ? Math.min(o.columns, row === 0 ? 3 : row === 1 ? 4 : o.columns) : o.columns;
    const size = (width - (columns - 1) * o.gap) / columns;
    for (let column = 0; column < columns && offset < count; column++) cells.push({ index: offset++, x: o.margin + column * (size + o.gap), y, size });
    y += size + o.gap; row++;
  }
  return { width: width + o.margin * 2 + ((o.showNames || o.showArtists) ? 390 : 0), height: (count ? y - o.gap : top + 220) + o.margin, cells, listX: o.margin + width + 34, listTop: top, contentWidth: width };
}
export function readWall(storage) {
  try {
    const raw = storage.getItem(WALL_STORAGE_KEY); if (!raw || raw.length > 512000) return { options: { ...WALL_DEFAULTS }, selected: [] };
    const data = JSON.parse(raw), keys = new Set();
    const selected = (Array.isArray(data.selected) ? data.selected : []).filter((item) => {
      if (!item || item.type !== 'album' || typeof item.title !== 'string' || typeof item.artist !== 'string' || typeof item.cover !== 'string') return false;
      const key = wallKey(item); if (keys.has(key)) return false; keys.add(key); return true;
    }).slice(0, 100).map((item) => ({ ...item, title: item.title.slice(0, 300), artist: item.artist.slice(0, 300), cover: item.cover.slice(0, 3000) }));
    return { options: normalizeWall(data.options), selected };
  } catch { return { options: { ...WALL_DEFAULTS }, selected: [] }; }
}
