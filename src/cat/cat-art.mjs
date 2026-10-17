// Art slots for the cat's care states (spec from the team, docs/cat-care.md):
// transparent PNG at 1x, drawn nearest-neighbour. Poses 64×64; eating is a horizontal strip
// of 64×64 frames at 120 ms each; stickers 32×32. Files live in public/cat/ (beauty, PR #55).
// A slot is ready when its PNG exists at build time (Vite glob below); until then the room
// draws the placeholder (PixelCat + CSS) and requests nothing.
export const CAT_ART_BASE = '/cat/';
const present = (() => {
  try { return new Set(Object.keys(import.meta.glob('../../public/cat/*.png')).map((path) => path.split('/').pop().replace(/\.png$/, ''))); } catch { return new Set(); }
})();
export const hasArt = (name) => present.has(name);
export const CAT_POSES = Object.freeze({
  'cat-sleep-books': { size: 64, ready: hasArt('cat-sleep-books'), when: 'sleeping (night or long idle)' },
  'cat-wait': { size: 64, ready: hasArt('cat-wait'), when: 'mood 还不错, idle' },
  'cat-desk': { size: 64, ready: hasArt('cat-desk'), when: 'mood 开心 during a focus round' },
  'cat-rub': { size: 64, ready: hasArt('cat-rub'), when: 'mood 开心, idle or just petted' },
  'cat-droopy': { size: 64, ready: hasArt('cat-droopy'), when: 'mood 无精打采' }
});
export const CAT_EATING = Object.freeze({ file: 'cat-eat', size: 64, frames: 8, frameMs: 120, ready: hasArt('cat-eat') });
export const STICKERS = Object.freeze(Object.fromEntries(['sticker-best-day', 'sticker-streak', 'sticker-fed'].map((name) => [name, { size: 32, ready: hasArt(name), url: `/cat/${name}.png` }])));

// Which pose a state maps to.
export function catArtPose({ tier = 'ok', pose = 'idle', phase = 'idle', pettedRecently = false } = {}) {
  if (pose === 'sleep') return 'cat-sleep-books';
  if (tier === 'sleepy') return 'cat-droopy';
  if (tier === 'happy') return phase === 'focus' ? 'cat-desk' : 'cat-rub';
  return pettedRecently ? 'cat-rub' : 'cat-wait';
}
export const artUrl = (name) => `${CAT_ART_BASE}${name}.png`;
// The overlay to draw, or null while the slot is still a placeholder.
export function catArtLayer(state, { poses = CAT_POSES, eating = CAT_EATING } = {}) {
  if (state.eating) return eating.ready ? { kind: 'eating', url: artUrl(eating.file), frames: eating.frames, frameMs: eating.frameMs, size: eating.size } : null;
  const name = catArtPose(state); return poses[name]?.ready ? { kind: 'pose', name, url: artUrl(name), size: poses[name].size } : null;
}
