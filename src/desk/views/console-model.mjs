// The record player's console: DEsk's Control Panel (https://github.com/fyzugx/DEsk, MIT, (c) 2026
// The DEsk authors) with the record player's state on it. What each part of the panel is for, what
// the tube says, and where a needle, a handle or a pointer goes, as pure functions (tested); the
// geometry is measured on DEsk's picture by scripts/desk-plates.py (plates.json › consoleView).
import { PLATES, PHONE, viewLayout } from '../layout.mjs';

export const CV = PLATES.consoleView;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number.isFinite(Number(v)) ? Number(v) : lo));

export const REPEAT_LABEL = Object.freeze({ off: '顺序播放', all: '整张循环', one: '单曲循环' });
export const REPEAT_SHORT = Object.freeze({ off: '顺序', all: '整张', one: '单曲' });
const STATE_WORD = { playing: '播放中', paused: '已暂停', busy: '连接中', error: '没接上', idle: '待播放', empty: '空唱机' };

// What the panel's things are for. DEsk's names are kept beside ours so the mapping reads both ways.
//   tube (CPU / MEM)        -> what is playing: title, artist, a lyric line, the trace of the music, the time
//   meters (电池 / ens33)    -> the music's level and its held peak
//   volume knob (音量)       -> the music's volume (press to mute)
//   levers (无线 / 蓝牙)     -> 随机 / 循环
//   faders (台灯 / 屏幕)     -> 台灯 (the room's light) / 环境音
//   push buttons (锁定 / 关机 / 重启 / 注销) -> 待播 / 上一首 / 播放·暂停 / 下一首
//   key (电源)               -> 音源
//   front plate (控制面板 ↑) -> 唱机 ↑, back down to the desk
export const PARTS = Object.freeze([
  { id: 'crt', desk: 'CPU / MEM', name: '屏幕' },
  { id: 'meters', desk: '电池 / ens33', name: '电平表' },
  { id: 'volume', desk: '音量', name: '音量' },
  { id: 'shuffle', desk: '无线', name: '随机' },
  { id: 'repeat', desk: '蓝牙', name: '循环' },
  { id: 'lamp', desk: '台灯', name: '台灯' },
  { id: 'ambience', desk: '屏幕', name: '环境音' },
  { id: 'queue', desk: '锁定', name: '待播' },
  { id: 'previous', desk: '关机', name: '上一首' },
  { id: 'play', desk: '重启', name: '播放' },
  { id: 'next', desk: '注销', name: '下一首' },
  { id: 'source', desk: '电源', name: '音源' },
  { id: 'plate', desk: '控制面板 ↑', name: '唱机 ↑' },
]);
export const BUTTONS = Object.freeze(['queue', 'previous', 'play', 'next'].map((id, i) => ({ id, caption: PARTS.find((p) => p.id === id).name, at: CV.buttons[i] })));
export const FADERS = Object.freeze([{ id: 'lamp', name: '台灯', ...CV.faders[0] }, { id: 'ambience', name: '环境音', ...CV.faders[1] }]);
export const LEVERS = Object.freeze([{ id: 'shuffle', name: '随机', ...CV.levers[0] }, { id: 'repeat', name: '循环', ...CV.levers[1] }]);

// The deck as the console sees it.
export function consoleState({ item = null, provider = 'visual', playback = null, system = null, spinning = false } = {}) {
  const visual = provider === 'visual', follow = provider === 'system', audible = !visual && !follow && Boolean(playback);
  const busy = audible && ['loading', 'searching', 'buffering'].includes(playback.status);
  const playing = follow ? Boolean(system?.playing) : visual ? Boolean(item && spinning) : Boolean(playback?.playing);
  const failed = audible && playback.status === 'error' ? playback.error || '这首暂时放不了' : '';
  const screen = !item && !(follow && system?.active) ? 'empty'
    : follow ? (system?.playing ? 'playing' : system?.active ? 'paused' : 'idle')
    : !audible ? (spinning ? 'playing' : 'idle')
    : playback.playing ? 'playing' : busy ? 'busy' : playback.status === 'error' ? 'error' : playback.status === 'paused' ? 'paused' : 'idle';
  return { visual, follow, audible, busy, playing, failed, screen, word: STATE_WORD[screen] };
}

// Columns a line takes in the tube's monospace face: a CJK character (or a full-width one) is two.
const wide = (ch) => /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]|[\u{20000}-\u{3fffd}]/u.test(ch);
export const textCols = (text) => [...String(text || '')].reduce((n, ch) => n + (wide(ch) ? 2 : 1), 0);
export function fitText(text, cols) {
  const chars = [...String(text || '').replace(/\s+/g, ' ').trim()];
  if (textCols(chars.join('')) <= cols) return chars.join('');
  let out = '', n = 0;
  for (const ch of chars) { const w = wide(ch) ? 2 : 1; if (n + w > cols - 1) break; out += ch; n += w; }
  return `${out.trimEnd()}…`;
}
const two = (n) => String(Math.max(0, Math.floor(n))).padStart(2, '0');
export const clockText = (seconds) => { const s = Math.max(0, Math.floor(Number(seconds) || 0)); return `${two(s / 60)}:${two(s % 60)}`; };

// What the tube says. Lines are fitted to the tube's width at their height (the glass is round).
export const CRT_COLS = Object.freeze({ head: 16, sub: 28, line: 28, foot: 24 });
export function crtLines({ state, item = null, trackName = '', trackIndex = 0, trackCount = 0, artist = '', album = '', lyric = '', status = '', position = 0, duration = 0, shelfEmpty = false }) {
  if (state.screen === 'empty') {
    return { head: '架子还空着', sub: shelfEmpty ? '先放上第一张唱片' : '去唱片架挑一张', line: '按播放键，去唱片架', foot: fitText(`--:-- ${state.word}`, CRT_COLS.foot), progress: null };
  }
  const head = fitText(trackName || item?.title || '', CRT_COLS.head);
  const sub = fitText([artist, album && album !== trackName ? album : ''].filter(Boolean).join(' · ') || item?.title || '', CRT_COLS.sub);
  const line = fitText(state.failed || lyric || (state.visual ? '仅展示 · 没有声音' : status) || '', CRT_COLS.line);
  const count = trackCount > 0 ? `${two(trackIndex + 1)}/${two(trackCount)} ` : '';
  const time = state.visual ? '--:--' : duration > 0 ? `${clockText(position)}/${clockText(duration)}` : clockText(position);
  return { head, sub, line, foot: fitText(`${count}${time} ${state.word}`, CRT_COLS.foot), progress: duration > 0 ? clamp(position / duration) : null };
}

// A meter's needle: DEsk's cc_needle swings 0.62 rad either side of straight up.
export const NEEDLE_RAD = 0.62;
export function needleTip(meter, t) {
  const a = -NEEDLE_RAD + 2 * NEEDLE_RAD * clamp(t, -0.05, 1.05);
  return { x: meter.pivot[0] + Math.sin(a) * meter.len, y: meter.pivot[1] - Math.cos(a) * meter.len, deg: a * 180 / Math.PI };
}
// The scale printed on a meter's card: twenty divisions, every fifth long (cc_scale_arc).
export function meterScale(meter, radius = meter.len * 1.12) {
  return Array.from({ length: 21 }, (_, i) => {
    const a = -NEEDLE_RAD + 2 * NEEDLE_RAD * i / 20, long = i % 5 === 0, inner = radius * (long ? .84 : .92);
    const at = (r) => ({ x: meter.pivot[0] + Math.sin(a) * r, y: meter.pivot[1] - Math.cos(a) * r });
    return { i, long, a: at(inner), b: at(radius) };
  });
}

// A fader's handle: where its middle is for a value, and the value under a point along its slot.
export const faderX = (fader, v) => fader.run[0] + (fader.run[1] - fader.run[0]) * clamp(v);
export const faderValue = (fader, x) => clamp((x - fader.run[0]) / (fader.run[1] - fader.run[0]));
export function faderKey(value, key, step = .05) {
  const v = clamp(value), round = (n) => Math.round(clamp(n) * 100) / 100;
  return ({ ArrowUp: round(v + step), ArrowRight: round(v + step), ArrowDown: round(v - step), ArrowLeft: round(v - step), PageUp: round(v + .1), PageDown: round(v - .1), Home: 0, End: 1 })[key] ?? null;
}

// The desk lamp (台灯 fader): a level 0..1, remembered; the room's dim switch (recipes, 睡前模式)
// is the same thing seen as on / off, so each follows the other.
export const LAMP_KEY = 'flow-cabin-desk-lamp-v1';
export const LAMP_DIM = .35;
export function readLamp(storage = globalThis.localStorage, dim = false) {
  try { const v = Number(storage?.getItem(LAMP_KEY)); if (storage?.getItem(LAMP_KEY) !== null && Number.isFinite(v)) return clamp(v); } catch { /* storage closed */ }
  return dim ? LAMP_DIM : 1;
}
export const lampIsDim = (level) => clamp(level) < .5;
// The level to show when the dim switch was thrown elsewhere: unchanged if it already agrees.
export const lampFollowing = (level, dim) => lampIsDim(level) === Boolean(dim) ? clamp(level) : dim ? LAMP_DIM : 1;
// How bright the room is drawn at a lamp level (never black: the tube and the lamps still glow).
export const lampBrightness = (level) => .42 + .58 * clamp(level);

// A caption round the bottom of a push button's brass ring, as an SVG arc (left to right, through the bottom).
export function captionArc(cx, cy, r, spread = 1.05) {
  const a0 = Math.PI / 2 + spread, a1 = Math.PI / 2 - spread;
  const p = (a) => `${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`;
  return `M${p(a0)} A${r} ${r} 0 0 0 ${p(a1)}`;
}

// The phone: the panel is fitted to the window's width, cut to its controls (x 235..1165 of the picture).
export const PHONE_CROP = Object.freeze({ x: 235, w: 930, top: 64 });

// Where the console's picture lies in a window: covering it as every view does, or on a phone,
// fitted to the width and cut to the controls (the paper slips go under it).
export function consoleLayout(width, height) {
  if (width >= PHONE) { const v = viewLayout(width, height); return { phone: false, s: v.s, ox: v.ox, oy: v.oy, frameH: height }; }
  const s = width / PHONE_CROP.w;
  return { phone: true, s, ox: -PHONE_CROP.x * s, oy: -PHONE_CROP.top * s, frameH: (PLATES.h - PHONE_CROP.top - 36) * s };
}
