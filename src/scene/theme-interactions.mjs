// Visit-local rituals. Only the seaside wind uses the existing backed-up sound mix.
export const THEME_OBJECTS = Object.freeze({
  forest: Object.freeze({ label: '照料窗边植物', box: [278, 452, 116, 144] }),
  seaside: Object.freeze({ label: '开合海风窗', box: [84, 172, 284, 284] }),
  // The shelf console occupies the lower-left corner at 960×600. Keep this
  // hit target on the telescope tube to its right instead of covering the
  // player or relying on a z-index exception.
  starlight: Object.freeze({ label: '使用望远镜', box: [270, 530, 100, 100] }),
  warm: Object.freeze({ label: '泡一杯琥珀茶', box: [292, 388, 112, 88] })
});

export function tendPlant(plant, action) {
  if (action === 'water') return { ...plant, water: Math.min(2, plant.water + 1) };
  if (action === 'turn') return { ...plant, facing: plant.facing === 1 ? -1 : 1 };
  return plant;
}
export const TEA_BREW_MS = 4000;
export const freshTea = () => ({ phase: 'empty', readyAt: 0, sips: 0 });
export function teaAction(tea, action, now = 0) {
  if (action === 'brew' && tea.phase === 'empty') return { phase: 'brewing', readyAt: now + TEA_BREW_MS, sips: 3 };
  if (action === 'ready' && tea.phase === 'brewing' && now >= tea.readyAt) return { ...tea, phase: 'ready' };
  if (action === 'sip' && tea.phase === 'ready') {
    const sips = Math.max(0, tea.sips - 1);
    return { ...tea, sips, phase: sips ? 'ready' : 'finished' };
  }
  if (action === 'refill' && tea.phase === 'finished') return freshTea();
  return tea;
}

// Original imaginary constellations, deliberately not a real-sky chart.
export const STAR_PATTERNS = Object.freeze([
  { id: 'sail', name: '小帆船', message: '给明天留一阵顺风。', points: [[58, 95], [104, 95], [104, 28], [150, 87], [182, 95], [158, 118], [80, 118]] },
  { id: 'leaf', name: '一片叶', message: '慢慢生长，也很好。', points: [[60, 120], [95, 87], [68, 55], [108, 34], [176, 25], [163, 76], [126, 105]] },
  { id: 'cup', name: '热茶杯', message: '为自己留一小段暖意。', points: [[65, 52], [145, 52], [176, 61], [170, 88], [141, 89], [129, 113], [82, 113], [65, 52]] }
].map(pattern => Object.freeze({ ...pattern, points: Object.freeze(pattern.points.map(point => Object.freeze(point))) })));
export function connectStar(pattern, progress, index) {
  return Number.isInteger(progress) && progress >= 0 && progress < pattern.points.length && index === progress ? progress + 1 : progress;
}
export function starAtPoint(pattern, progress, x, y) {
  // Prefer the next point: a closed shape may finish on its first star.
  const next = pattern.points[progress];
  if (next && Math.hypot(next[0] - x, next[1] - y) <= 12) return progress;
  return pattern.points.findIndex(([sx, sy]) => Math.hypot(sx - x, sy - y) <= 12);
}
