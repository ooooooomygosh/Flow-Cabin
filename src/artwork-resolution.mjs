// Exactly two physical pixels per grain wherever the bounds allow, so the
// nearest-neighbour upscale is an even 2× (no 1-/2-px cell plaid, which the old
// 16-px rounding produced, e.g. 144 grains on 280 px). Small sleeves keep a fine
// floor of 96 grains; large ones cap at 256 to keep a wall of canvases cheap.
// Low-resolution originals stay low-resolution; this does not invent detail.
export function artworkResolution(cssSide, dpr = 1, sourceSide = 800) {
  const display = Number.isFinite(cssSide) && cssSide > 0 ? cssSide : 192;
  const density = Number.isFinite(dpr) ? Math.max(1, Math.min(2, dpr)) : 1;
  const target = Math.max(96, Math.min(256, Math.round(display * density / 2)));
  return Math.max(1, Math.min(target, Number.isFinite(sourceSide) && sourceSide > 0 ? Math.floor(sourceSide) : target));
}

// Scene covers share one 64×64 backing; resizing the room needs no repaint.
// Original artwork remains untouched for cards, exports and user data.
export const roomArtworkResolution = (sourceSide = 64) => Math.max(1, Math.min(64, Number.isFinite(sourceSide) && sourceSide > 0 ? Math.floor(sourceSide) : 64));
