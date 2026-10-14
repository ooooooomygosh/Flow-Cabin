// About two physical pixels per grain, bounded to keep a wall of canvases cheap.
// Low-resolution originals stay low-resolution; this does not invent detail.
export function artworkResolution(cssSide, dpr = 1, sourceSide = 800) {
  const display = Number.isFinite(cssSide) && cssSide > 0 ? cssSide : 192;
  const density = Number.isFinite(dpr) ? Math.max(1, Math.min(2, dpr)) : 1;
  const target = Math.max(96, Math.min(256, Math.ceil(display * density / 2 / 16) * 16));
  return Math.max(1, Math.min(target, Number.isFinite(sourceSide) && sourceSide > 0 ? Math.floor(sourceSide) : target));
}
