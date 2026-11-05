// The paper's fibre, as DEsk draws it (draw.c paper_tile_make, noise2p, fbm_p;
// https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors): value noise that
// repeats, stretched along the sheet for fibres, with a few dark specks. Pure maths — no DOM.

export const hash21 = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const mod = (a, n) => ((a % n) + n) % n;

// Value noise that tiles with periods px, py.
export function noise2p(x, y, px, py) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const x0 = mod(xi, px), x1 = (x0 + 1) % px, y0 = mod(yi, py), y1 = (y0 + 1) % py;
  const a = hash21(x0, y0), b = hash21(x1, y0), c = hash21(x0, y1), d = hash21(x1, y1);
  const top = a + (b - a) * u, bottom = c + (d - c) * u;
  return top + (bottom - top) * v;
}
export function fbm(x, y, px, py) {
  let sum = 0, amp = 0.5, f = 1;
  for (let i = 0; i < 5; i++) { sum += amp * noise2p(x * f, y * f, px * f, py * f); amp *= 0.5; f *= 2; }
  return sum;
}

// RGBA bytes of a size×size paper tile (cream, #F1EEE6 at its mean) that repeats seamlessly.
export function paperTile(size = 128) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x * 20 / size, v = y * 20 / size;
    const fibre = fbm(u * 5, v * 2, 100, 40);
    const speck = noise2p(u * 30, v * 30, 600, 600) ** 6;
    const k = 0.965 + fibre * 0.055 - speck * 0.10;
    const i = (y * size + x) * 4;
    data[i] = Math.round(0.947 * k * 255); data[i + 1] = Math.round(0.933 * k * 255); data[i + 2] = Math.round(0.902 * k * 255); data[i + 3] = 255;
  }
  return data;
}

// Film grain: a faint light-or-dark speckle (draw.c grain_tile_make), alpha only up to ~17%.
export function grainTile(size = 96) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const h = hash21(x * 1.7 + 3, y * 2.3 + 5), light = hash21(x + 11, y + 17) > 0.5, i = (y * size + x) * 4;
    const value = light ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = value;
    data[i + 3] = Math.round(Math.abs(h - 0.5) * 2 * 44 * 0.35);
  }
  return data;
}
