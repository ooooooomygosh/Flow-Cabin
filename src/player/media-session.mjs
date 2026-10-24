// OS media controls (lock screen, taskbar flyout, macOS Now Playing): the pure
// parts — metadata for the song (a playlist song's own artist / album), the
// position-state arguments, and covers the OS can actually load.
import { trackNames } from '../room-model.mjs';
import { trackArtist, trackAlbum } from '../track-meta.mjs';

export const SEEK_STEP_S = 10;
// MediaSession.setPositionState throws on a bad duration, a position past the end
// or a zero rate. Returns the argument object, or null to clear the state.
export function positionState({ duration, position, rate = 1 } = {}) {
  const length = Number(duration), at = Number(position), speed = Number(rate);
  if (!Number.isFinite(length) || length <= 0) return null;
  return { duration: length, position: Math.max(0, Math.min(length, Number.isFinite(at) ? at : 0)), playbackRate: Number.isFinite(speed) && speed > 0 ? speed : 1 };
}
// The song on the deck as the OS shows it. `actualTrack` is the matched recording's title.
export function sessionMetadata(record, trackIndex = 0, actualTrack = '') {
  if (!record) return null;
  const title = actualTrack || trackNames(record)[trackIndex] || record.title || '';
  const artist = trackArtist(record, trackIndex) || (record.type === 'playlist' ? '' : record.artist || '');
  const album = trackAlbum(record, trackIndex) || (record.type === 'playlist' ? record.title || '' : '');
  return { title, artist, album };
}
// The OS fetches artwork itself, outside the page: only https and data: images work.
// Local / relative / blob covers are converted to a data URL first (coverDataUrl).
export const remoteArtwork = (cover) => typeof cover === 'string' && /^https:\/\//i.test(cover);
export const inlineArtwork = (cover) => typeof cover === 'string' && /^data:image\/(png|jpe?g|webp|gif|svg\+xml)[;,]/i.test(cover);
export const needsConversion = (cover) => typeof cover === 'string' && Boolean(cover) && !remoteArtwork(cover) && !inlineArtwork(cover);
export function artworkList(cover) {
  if (remoteArtwork(cover)) return [{ src: cover, sizes: '512x512' }];
  if (inlineArtwork(cover)) return [{ src: cover, sizes: '512x512', type: `image/${/^data:image\/([\w+]+)/i.exec(cover)[1].toLowerCase().replace('jpg', 'jpeg')}` }];
  return [];
}

// Browser only: draw a same-origin cover into a small JPEG data URL (cached per source).
const converted = new Map();
export function coverDataUrl(src, { size = 256, doc = globalThis.document } = {}) {
  if (!needsConversion(src)) return Promise.resolve(remoteArtwork(src) || inlineArtwork(src) ? src : '');
  if (converted.has(src)) return converted.get(src);
  const ImageClass = doc?.defaultView?.Image || globalThis.Image;
  if (!doc || typeof ImageClass !== 'function') return Promise.resolve('');
  const task = new Promise((resolve) => {
    const image = new ImageClass(); image.decoding = 'async';
    image.onload = () => { try { const canvas = doc.createElement('canvas'), side = Math.min(image.naturalWidth, image.naturalHeight) || size, edge = Math.min(size, side); canvas.width = canvas.height = edge; const context = canvas.getContext('2d'); context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, edge, edge); resolve(canvas.toDataURL('image/jpeg', .86)); } catch { resolve(''); } };
    image.onerror = () => resolve('');
    image.src = src;
  });
  converted.set(src, task);
  if (converted.size > 24) converted.delete(converted.keys().next().value);
  return task;
}
