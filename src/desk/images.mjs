// The desk's pictures (public/desk/, from DEsk's renders), loaded once and shared. `deskImage(name)`
// is the decoded image or null; `whenDeskImages(names)` resolves when all are in; `deskProgress()`
// tells the lamp-up how far the room has come.
const cache = new Map();
export const deskUrl = (name) => `/desk/${name}`;

function entry(name) {
  let e = cache.get(name);
  if (!e) {
    const image = new Image();
    image.decoding = 'async';
    e = { image, ok: false };
    e.promise = new Promise((resolve) => {
      image.onload = () => { e.ok = true; resolve(image); };
      image.onerror = () => { e.failed = true; resolve(null); };
    });
    image.src = deskUrl(name);
    cache.set(name, e);
  }
  return e;
}
export const deskImage = (name) => { const e = entry(name); return e.ok ? e.image : null; };
export const whenDeskImages = (names) => Promise.all(names.map((n) => entry(n).promise));

// What the desk shows at once, before anything is touched (DEsk's load(): the room, the drawer band,
// the clock, the overlays).
export const FIRST = Object.freeze(['desk-wood.webp', 'edge-console.webp', 'edge-clock.webp', 'edge-post.webp', 'plate-console.webp',
  'plate-shelf.webp', 'clock-face.webp', 'clock-digits.webp', 'clock-keys.webp', 'post0.webp', 'post-letter.webp', 'drawer-band.webp']);
export const VIEW_IMAGES = Object.freeze({ shelf: ['film-shelf.webp', 'view-shelf.webp'], console: ['film-console.webp', 'view-console.webp'], post: ['film-post.webp', 'view-post-box.webp', 'view-post-empty.webp', 'letter-blank.webp'] });
export function deskProgress(names = FIRST) {
  return names.reduce((n, name) => n + (cache.get(name)?.ok || cache.get(name)?.failed ? 1 : 0), 0) / names.length;
}
