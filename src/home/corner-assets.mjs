// One in-memory cache for the close-view manifests and decoded corner art, shared by
// the idle preloader and HomeCorner, so walking into a corner never waits on the network.
// Decoded images are kept for the two most recent themes (≈19 MB each).
const manifests = new Map(), resolved = new Map(), images = new Map(), recent = [];
const KEEP_THEMES = 2;
export const cornerUrl = (theme, file) => `/room-scenes/v21/${theme}/corners/${file}`;

export function cornerManifest(theme) {
  if (!manifests.has(theme)) manifests.set(theme, fetch(cornerUrl(theme, 'manifest.json')).then(r => { if (!r.ok) throw Error('近景没有加载成功。'); return r.json(); })
    .then(manifest => { resolved.set(theme, manifest); return manifest; }, error => { manifests.delete(theme); throw error.name === 'TypeError' ? Error('近景没有加载成功，请检查网络后重试。') : error; }));
  return manifests.get(theme);
}
export const peekCornerManifest = theme => resolved.get(theme) || null;

function touch(theme) {
  const at = recent.indexOf(theme); if (at >= 0) recent.splice(at, 1); recent.push(theme);
  while (recent.length > KEEP_THEMES) { const old = recent.shift(); for (const [url, entry] of images) if (entry.theme === old) { images.delete(url); entry.image.src = ''; } }
}
export function decodeCorner(theme, file) {
  const url = cornerUrl(theme, file); touch(theme);
  let entry = images.get(url);
  if (!entry) {
    const image = new Image(); image.decoding = 'async';
    entry = { theme, image, ready: false };
    image.src = url;
    entry.promise = (image.decode ? image.decode() : new Promise((done, fail) => { image.onload = done; image.onerror = fail; }))
      .then(() => { entry.ready = true; return image; }, () => { if (images.get(url) === entry) images.delete(url); throw Error('近景图片没有加载成功。'); });
    images.set(url, entry);
  }
  return entry.promise;
}
export const isCornerDecoded = (theme, file) => Boolean(file && images.get(cornerUrl(theme, file))?.ready);
export function isCornerReady(theme, zone) { const view = peekCornerManifest(theme)?.views?.[zone]; return Boolean(view && isCornerDecoded(theme, view.image)); }
// Manifest + decoded art of one corner: what the camera waits for before the cross-fade.
export async function cornerReady(theme, zone) {
  const view = (await cornerManifest(theme)).views?.[zone];
  if (!view) throw Error('这个角落还没有近景。');
  await decodeCorner(theme, view.image);
  return view;
}
// Warm every corner of a theme one after another (so decodes never pile up); `alive()` stops the chain.
export async function preloadCorners(theme, zones, alive = () => true) {
  const manifest = await cornerManifest(theme);
  for (const zone of zones) { if (!alive()) return false; const view = manifest.views?.[zone]; if (view) await decodeCorner(theme, view.image).catch(() => {}); }
  return alive();
}
// Run `task` when the main thread is idle (or after `timeout`); returns a cancel function.
export function whenIdle(task, timeout = 1500) {
  if (globalThis.requestIdleCallback) { const id = requestIdleCallback(task, { timeout }); return () => cancelIdleCallback(id); }
  const id = setTimeout(task, 400); return () => clearTimeout(id);
}
