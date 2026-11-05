// The red seven-segment time ("0:06", "10:00") needs a glass as wide as its digits. Same geometry
// as LedDigits (src/props/Led.jsx): digits w wide with `gap` between, and 11 units round the colon.
export const COLON_GAP = 11;
export function ledTimeSize(text, { w = 12, h = 20, gap = 4, pad = 3 } = {}) {
  const [a, b = ''] = String(text).split(':'), row = (n) => (n ? n * w + (n - 1) * gap : 0);
  const width = b ? row(a.length) + gap + COLON_GAP + row(b.length) : row(a.length);
  return { width: width + pad * 2, height: h + pad * 2, x: pad, y: pad };
}
