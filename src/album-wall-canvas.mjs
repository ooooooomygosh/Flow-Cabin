import { wallGeometry, normalizeWall } from './album-wall-model.mjs';
import { createCoverCache } from './lib/cover-cache.mjs';
async function fetchCoverBlob(value) {
  // Local and inline artwork is read directly; catalog artwork uses the existing desktop proxy.
  const url = new URL(value, window.location.href);
  const target = url.protocol === 'data:' || url.origin === window.location.origin ? value : `/desktop-image?url=${encodeURIComponent(value)}`;
  const response = await fetch(target, { credentials: 'omit', signal: AbortSignal.timeout(18000) });
  if (!response.ok) return null;
  const blob = await response.blob();
  return blob.type.startsWith('image/') && blob.size <= 8 * 1024 * 1024 ? blob : null;
}
// Full-resolution artwork belongs to wall export/preview only. Evicted bitmaps are closed and the
// whole cache is released once the wall has been idle for a while (see lib/cover-cache.mjs).
const covers = createCoverCache({ load: async (value) => { const blob = await fetchCoverBlob(value); return blob ? await createImageBitmap(blob) : null; } });
export const loadWallCover = (value) => covers.get(value);
export const releaseWallCovers = () => covers.release();
// Shelf colour sampling never populates the full-resolution wall cache.
// The temporary resized bitmap is always released, even if canvas readback fails.
export async function readCoverPixels(value) {
  if (!value) return null;
  let image;
  try {
    const blob = await fetchCoverBlob(value);
    if (!blob) return null;
    image = await createImageBitmap(blob, { resizeWidth: 48, resizeHeight: 48, resizeQuality: 'low' });
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 48;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, 48, 48);
    return context.getImageData(0, 0, 48, 48).data;
  } catch { return null; }
  finally { image?.close(); }
}
function wrap(context, text, width) {
  const lines = []; let line = '';
  for (const character of String(text)) { const next = line + character; if (line && context.measureText(next).width > width) { lines.push(line.trim()); line = character; } else line = next; }
  if (line) lines.push(line.trim());
  return lines;
}
export async function paintWall(canvas, albums, value, images, requestedScale = 1) {
  const o = normalizeWall(value), geometry = wallGeometry(albums.length, o);
  const family = o.font === 'bundled' ? 'HarmonyOS Sans SC Bundled' : o.font;
  await Promise.all([document.fonts.load(`400 22px ${JSON.stringify(family)}`), document.fonts.load(`700 42px ${JSON.stringify(family)}`)]);
  let ctx = canvas.getContext('2d'); ctx.font = `400 22px ${JSON.stringify(family)}, sans-serif`;
  const lines = albums.map((album, index) => ({ index, title: o.showNames ? wrap(ctx, album.title, 318) : [], artist: o.showArtists ? wrap(ctx, album.artist, 318) : [] }));
  const listHeight = lines.reduce((sum, line) => sum + line.title.length * 29 + line.artist.length * 26 + 20, 0);
  const height = Math.ceil(Math.max(geometry.height, geometry.listTop + listHeight + o.margin)), width = Math.ceil(geometry.width), scale = requestedScale;
  if (width * scale > 8192 || height * scale > 8192 || width * height * scale * scale > 36000000) throw new Error('图片过大，请增加列数、减少专辑或降低下载倍率。');
  canvas.width = width * scale; canvas.height = height * scale; ctx = canvas.getContext('2d'); ctx.scale(scale, scale);
  ctx.fillStyle = o.background; ctx.fillRect(0, 0, width, height); ctx.fillStyle = o.textColor; ctx.textBaseline = 'top';
  let titleY = o.margin;
  if (o.title) { ctx.font = `700 42px ${JSON.stringify(family)}, sans-serif`; ctx.fillText(o.title, o.margin, titleY, geometry.contentWidth); titleY += 66; }
  if (o.author) { ctx.font = `400 24px ${JSON.stringify(family)}, sans-serif`; ctx.fillText(o.author, o.margin, titleY, geometry.contentWidth); }
  for (const cell of geometry.cells) {
    const image = images[cell.index], album = albums[cell.index];
    ctx.fillStyle = o.textColor; ctx.fillRect(cell.x, cell.y, cell.size, cell.size);
    const inset = o.border, size = cell.size - inset * 2;
    if (image) { const side = Math.min(image.width, image.height); ctx.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, cell.x + inset, cell.y + inset, size, size); }
    else { ctx.fillStyle = '#344144'; ctx.fillRect(cell.x + inset, cell.y + inset, size, size); ctx.fillStyle = '#f0f5f1'; ctx.font = `400 18px ${JSON.stringify(family)}, sans-serif`; wrap(ctx, album.title, size - 28).slice(0, 5).forEach((line, index) => ctx.fillText(line, cell.x + 14, cell.y + 22 + 26 * index)); }
  }
  if (o.showNames || o.showArtists) {
    let y = geometry.listTop;
    for (const line of lines) {
      ctx.fillStyle = o.textColor; ctx.globalAlpha = .56; ctx.font = `400 18px ${JSON.stringify(family)}, sans-serif`; ctx.fillText(String(line.index + 1).padStart(2, '0'), geometry.listX, y + 3); ctx.globalAlpha = 1;
      ctx.font = `700 22px ${JSON.stringify(family)}, sans-serif`;
      line.title.forEach((text) => { ctx.fillText(text, geometry.listX + 42, y); y += 29; });
      ctx.font = `400 21px ${JSON.stringify(family)}, sans-serif`; ctx.globalAlpha = .7;
      line.artist.forEach((text) => { ctx.fillText(text, geometry.listX + 42, y); y += 26; }); ctx.globalAlpha = 1; y += 20;
    }
  }
  return { width: canvas.width, height: canvas.height, missing: images.filter((image) => !image).length };
}
// Kept for existing importers; the helper lives in lib/download.mjs.
export { downloadBlob } from './lib/download.mjs';
