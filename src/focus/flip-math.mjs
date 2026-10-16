// The flip of a digit card, after gluqlo's render_digits (alexanderk23/gluqlo,
// gluqlo.c; ISC-style licence, notice in public/licenses/gluqlo-LICENSE.txt):
// a 2D squash toward the hinge with the leaf darkening as it turns away, then
// the new bottom half grows back from the hinge, brightening. No 3D, no
// rotation: whole pixel rows only. Six frames at 24 fps (250 ms), drawn only
// when a digit changes; reduced motion shows the final frame (gluqlo -noanim).
export const FLIP_FRAMES = 6, FLIP_FPS = 24;
// Frame f of FLIP_FRAMES: which half is the moving leaf, how much of it is left
// (scale of the half height) and its brightness (1 = lit, 0 = edge-on, dark).
export function flipFrame(f, frames = FLIP_FRAMES) {
  const half = frames / 2, step = Math.max(0, Math.min(frames - 1, Math.round(f)));
  if (step + 1 <= half) { const t = step / (half - 1); return { leaf: 'top', scale: 1 - t, light: 1 - t }; }
  const t = (step - half + 1) / half;
  return { leaf: 'bottom', scale: t, light: t };
}
// Rows the leaf covers at this frame: never 0, so the card edge stays visible.
export const leafRows = (half, scale) => Math.max(1, Math.round(half * scale));
// Which card positions changed between two strings (same length); otherwise all.
export function changedCards(from, to) {
  const a = String(from ?? ''), b = String(to ?? '');
  if (a.length !== b.length) return [...b].map((_, i) => i);
  return [...b].flatMap((ch, i) => ch === a[i] ? [] : [i]);
}
