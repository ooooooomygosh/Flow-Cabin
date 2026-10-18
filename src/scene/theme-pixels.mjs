// Original integer-grid drawings. Canvas scales with nearest-neighbour sampling.
const rect = (ctx, colour, x, y, width, height) => {
  ctx.fillStyle = colour; ctx.fillRect(x, y, width, height);
};
function line(ctx, colour, x, y, endX, endY) {
  const dx = Math.abs(endX - x), sx = x < endX ? 1 : -1;
  const dy = -Math.abs(endY - y), sy = y < endY ? 1 : -1;
  let error = dx + dy;
  while (true) {
    rect(ctx, colour, x, y, 1, 1);
    if (x === endX && y === endY) break;
    const twice = error * 2;
    if (twice >= dy) { error += dy; x += sx; }
    if (twice <= dx) { error += dx; y += sy; }
  }
}
export function drawPlant(ctx, { water = 0, facing = 1 }) {
  ctx.clearRect(0, 0, 96, 96);
  rect(ctx, '#393a2c', 20, 87, 57, 4);
  rect(ctx, '#6a4f37', 30, 65, 37, 21);
  rect(ctx, '#b38c59', 33, 68, 31, 18);
  rect(ctx, '#ceae75', 29, 62, 39, 6);
  rect(ctx, water ? '#3c392a' : '#716044', 33, 60, 31, 4);
  rect(ctx, '#6c814c', 46, 24, 4, 38);
  const leaves = [[0, 0], [1, 16], [0, 29], [1, 35]];
  for (const [side, height] of leaves) {
    const right = (side ? 1 : -1) * facing > 0;
    const x = right ? 50 : 26, y = 18 + height + (water ? 0 : 7);
    rect(ctx, '#40583c', x, y + 4, 20, 9);
    rect(ctx, water === 2 ? '#a8bd75' : '#839662', x + 3, y, 14, 10);
    rect(ctx, '#bac58a', x + 5, y + 2, 8, 2);
    line(ctx, '#4d663e', 48, y + 13, right ? x + 5 : x + 16, y + 7);
  }
  if (water) for (let i = 0; i < water; i++) {
    rect(ctx, '#8ebfc0', 39 + i * 12, 73, 3, 6);
    rect(ctx, '#c4dfcf', 40 + i * 12, 72, 1, 3);
  }
}
export function drawTea(ctx, { phase, sips }) {
  ctx.clearRect(0, 0, 96, 96);
  rect(ctx, '#68482e', 14, 79, 68, 5);
  rect(ctx, '#c5a372', 18, 76, 60, 3);
  rect(ctx, '#402f26', 27, 33, 42, 43);
  rect(ctx, '#e6c991', 30, 36, 36, 37);
  rect(ctx, '#b69a6e', 33, 68, 30, 5);
  rect(ctx, '#dec08b', 69, 42, 12, 5);
  rect(ctx, '#dec08b', 77, 45, 5, 16);
  rect(ctx, '#dec08b', 68, 59, 12, 5);
  rect(ctx, '#795539', 32, 38, 32, 7);
  if (sips > 0) {
    const level = phase === 'brewing' ? 43 : 64 - sips * 7;
    rect(ctx, phase === 'brewing' ? '#bf985b' : '#a86a34', 33, level, 30, 66 - level);
    rect(ctx, '#e5b65c', 36, level, 22, 3);
  }
  if (phase === 'brewing' || phase === 'ready') {
    for (const x of [36, 49, 60]) {
      line(ctx, '#e2d2ab', x, 27, x + 2, 21);
      line(ctx, '#e2d2ab', x + 2, 21, x, 15);
    }
  }
  if (phase === 'empty') rect(ctx, '#8e9c5a', 38, 55, 14, 4);
}
export function drawSeaWindow(ctx, open) {
  ctx.clearRect(0, 0, 96, 96);
  const colour = '#d5c9a4';
  // A casement, drawn inside the existing round sea window.
  const topX = open ? 69 : 48, bottomX = open ? 66 : 48;
  line(ctx, colour, 48, 6, topX, 17);
  line(ctx, colour, topX, 17, bottomX, 79);
  line(ctx, colour, bottomX, 79, 48, 91);
  line(ctx, '#a09f87', 48, 6, 48, 91);
  rect(ctx, '#6d7969', open ? 64 : 45, 47, 6, 9);
  if (open) {
    line(ctx, '#d9e7d3', 12, 63, 34, 63);
    line(ctx, '#d9e7d3', 19, 70, 43, 70);
    line(ctx, '#a8c8bd', 7, 78, 28, 78);
  }
}
export function drawStarChart(ctx, { pattern, progress = 0 }) {
  ctx.clearRect(0, 0, 240, 144);
  rect(ctx, '#182534', 0, 0, 240, 144);
  for (let i = 0; i < 53; i++) rect(ctx, i % 3 ? '#5e7282' : '#a3a697', (i * 47 + 13) % 236, (i * 31 + 7) % 140, 1, 1);
  for (let i = 1; i < progress; i++) line(ctx, '#c9b885', ...pattern.points[i - 1], ...pattern.points[i]);
  pattern.points.forEach(([x, y], i) => {
    const colour = i < progress ? '#ffe1a1' : '#8297a0';
    rect(ctx, colour, x - 2, y, 5, 1); rect(ctx, colour, x, y - 2, 1, 5);
    if (i === progress) {
      for (const offset of [-6, 6]) { rect(ctx, '#e9c781', x - 6, y + offset, 13, 1); rect(ctx, '#e9c781', x + offset, y - 6, 1, 13); }
    }
  });
}
