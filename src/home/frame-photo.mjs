// 相框照片: one small picture the person chose, shown inside the wall frame.
// Kept as a downscaled data URL in this device's local storage (no file paths,
// no network); it never points at the original photo. Not part of backups yet.
export const FRAME_PHOTO_KEY = 'flow-cabin-frame-photo-v1';
export const FRAME_PHOTO_EVENT = 'cabin:frame-photo';
// Pixel-art sized: the frame's blank area is about 26 × 40 room pixels, so a
// 120 × 150 picture stays crisp when the room is zoomed in and costs ~20 KB.
export const FRAME_PHOTO_SIZE = Object.freeze({ width: 120, height: 150 });
const MAX_LENGTH = 200_000;
const PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

export function normalizeFramePhoto(value) {
  if (!value || typeof value !== 'object') return null;
  if (typeof value.src !== 'string' || value.src.length > MAX_LENGTH || !PATTERN.test(value.src)) return null;
  return { src: value.src, name: typeof value.name === 'string' ? value.name.slice(0, 80) : '', at: Number.isFinite(value.at) ? value.at : 0 };
}
export function readFramePhoto(storage = globalThis.localStorage) {
  try { return normalizeFramePhoto(JSON.parse(storage.getItem(FRAME_PHOTO_KEY) || 'null')); } catch { return null; }
}
export function writeFramePhoto(photo, storage = globalThis.localStorage) {
  const next = normalizeFramePhoto(photo);
  if (!next) throw Error('这张图片太大或格式不支持，请换一张 JPG / PNG / WebP。');
  storage.setItem(FRAME_PHOTO_KEY, JSON.stringify(next));
  globalThis.dispatchEvent?.(new Event(FRAME_PHOTO_EVENT));
  return next;
}
export function clearFramePhoto(storage = globalThis.localStorage) {
  storage.removeItem(FRAME_PHOTO_KEY);
  globalThis.dispatchEvent?.(new Event(FRAME_PHOTO_EVENT));
}
// Centre crop that fills `target` without stretching: the source rectangle to draw.
export function coverCrop(width, height, target = FRAME_PHOTO_SIZE) {
  if (!(width > 0 && height > 0)) throw Error('图片尺寸无效。');
  const scale = Math.max(target.width / width, target.height / height);
  const w = target.width / scale, h = target.height / scale;
  return { sx: (width - w) / 2, sy: (height - h) / 2, sw: w, sh: h };
}
