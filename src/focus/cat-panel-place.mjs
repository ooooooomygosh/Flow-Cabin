// Where the 小猫 card goes, given the cat's box: right, else left, else above/below; never over the cat.
export function catPanelPlace(cat, panel, view, gap = 12, edge = 12) {
  const { w, h } = panel, x = cat.right + gap + w <= view.w - edge ? cat.right + gap : cat.left - gap - w >= edge ? cat.left - gap - w : null;
  if (x !== null) return { x, y: Math.max(edge, Math.min(cat.top - 40, view.h - edge - h)) };
  const left = Math.max(edge, Math.min(cat.left + (cat.right - cat.left) / 2 - w / 2, view.w - edge - w));
  return cat.top - gap - h >= edge ? { x: left, y: cat.top - gap - h } : { x: left, y: Math.min(cat.bottom + gap, Math.max(edge, view.h - edge - h)) };
}
