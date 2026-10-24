// One lyric look per room. The room readout, the fullscreen stage and the desktop
// lyric bar all draw from the same skin, so lyrics feel like part of the cabin.
//   base / fill / glow: unsung text, sung text, the halo behind the sung part
//   stroke: outline that keeps desktop lyrics readable over any wallpaper
//   particle: what drifts behind the words (lyric-particles.mjs)
//   enter: how a new line arrives
export const LYRIC_SKINS = Object.freeze({
  pixel: { name: '像素', font: 'pixel', base: '#e9dcc0', fill: '#ffd36b', glow: '#ff9b3d', stroke: '#2b1d14', accent: '#7fd1c7', backdrop: ['#1b1712', '#3a2a1c'], particle: 'pixels', enter: 'step' },
  warm: { name: '琥珀', font: 'serif', base: '#f1dcc0', fill: '#ffb86b', glow: '#ff7a2f', stroke: '#2a160c', accent: '#ffcf8a', backdrop: ['#1d120c', '#4a2615'], particle: 'embers', enter: 'rise' },
  'night-study': { name: '月夜', font: 'serif', base: '#c9d2e6', fill: '#f2f5ff', glow: '#8aa4ff', stroke: '#0c1020', accent: '#ffe6a6', backdrop: ['#0b0f1c', '#1d2440'], particle: 'ink', enter: 'blur' },
  forest: { name: '林间', font: 'sans', base: '#cfe0c4', fill: '#f4ffd6', glow: '#b7f06a', stroke: '#0f1a0e', accent: '#ffe58a', backdrop: ['#0d1a10', '#21391f'], particle: 'fireflies', enter: 'rise' },
  seaside: { name: '海边', font: 'sans', base: '#d5ecf2', fill: '#ffffff', glow: '#5fd0ff', stroke: '#0a2230', accent: '#ffd9a8', backdrop: ['#0b2232', '#1f4f68'], particle: 'foam', enter: 'wave' },
  starlight: { name: '星光', font: 'sans', base: '#d9d3f2', fill: '#fff6d0', glow: '#c39bff', stroke: '#120b25', accent: '#9fe7ff', backdrop: ['#0b0820', '#271b4f'], particle: 'stars', enter: 'blur' },
  'rain-train': { name: '雨夜列车', font: 'sans', base: '#c7d3dc', fill: '#e9f6ff', glow: '#6fb7ff', stroke: '#0a1118', accent: '#ffb35c', backdrop: ['#080d12', '#1b2733'], particle: 'rain', enter: 'slide' },
  greenhouse: { name: '温室', font: 'sans', base: '#e2ecd6', fill: '#fff2f6', glow: '#ff9ec4', stroke: '#16200f', accent: '#b6f0a0', backdrop: ['#111c0f', '#2e4426'], particle: 'petals', enter: 'rise' }
});
// Fixed looks for the desktop bar, independent of the room.
export const FIXED_SKINS = Object.freeze({
  paper: { name: '纸灯', font: 'sans', base: '#f6efe2', fill: '#ffcf70', glow: '#ff9f43', stroke: '#2b2118', accent: '#ffe2a8', backdrop: ['#1f1a14', '#3b3025'], particle: 'none', enter: 'rise' },
  neon: { name: '霓虹', font: 'sans', base: '#bfe9ff', fill: '#ff5fd2', glow: '#ff2fb9', stroke: '#14001a', accent: '#5ff4ff', backdrop: ['#0a0316', '#24063a'], particle: 'stars', enter: 'blur' },
  mono: { name: '素白', font: 'sans', base: '#e8e8e8', fill: '#ffffff', glow: '#ffffff', stroke: '#000000', accent: '#cccccc', backdrop: ['#111111', '#2a2a2a'], particle: 'none', enter: 'rise' }
});
export const FONT_STACKS = Object.freeze({
  pixel: "var(--px-font-cn, 'HarmonyOS Sans SC'), 'PingFang SC', 'Microsoft YaHei', sans-serif",
  serif: "'Noto Serif SC', 'Songti SC', 'STSong', 'SimSun', serif",
  sans: "'HarmonyOS Sans SC', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif"
});
export function skinFor(theme, choice = 'cabin') {
  if (choice && choice !== 'cabin' && FIXED_SKINS[choice]) return { id: choice, ...FIXED_SKINS[choice] };
  const id = LYRIC_SKINS[theme] ? theme : 'pixel';
  return { id, ...LYRIC_SKINS[id] };
}
// CSS custom properties for a skin; components style themselves with var(--lyric-*).
export function skinStyle(skin) {
  return { '--lyric-base': skin.base, '--lyric-fill': skin.fill, '--lyric-glow': skin.glow, '--lyric-stroke': skin.stroke, '--lyric-accent': skin.accent,
    '--lyric-backdrop-a': skin.backdrop[0], '--lyric-backdrop-b': skin.backdrop[1], '--lyric-font': FONT_STACKS[skin.font] || FONT_STACKS.sans };
}
// Mix two #rrggbb colours; t = share of `b`.
export function mixHex(a, b, t) {
  const pa = a.match(/\w\w/g).map(h => parseInt(h, 16)), pb = b.match(/\w\w/g).map(h => parseInt(h, 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
// Lyrics printed on paper in the room (the lyric book, the projection card): dark ink,
// the room's glow colour deepened enough to read on a light page.
export function paperStyle(skin) {
  return { ...skinStyle(skin), '--lyric-base': '#5d503d', '--lyric-fill': mixHex(skin.glow, '#2a1d12', .5), '--lyric-glow': `${mixHex(skin.glow, '#ffffff', .2)}38`, '--lyric-stroke': 'transparent' };
}
