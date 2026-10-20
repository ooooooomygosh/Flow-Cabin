// Continuous sky for the cabin windows: the sun's altitude (vendored SunCalc for a chosen
// city, or a fixed 6:30–18:30 curve on the local clock) picks colours from keyframes laid out
// in sun-altitude space, with separate morning and evening sets (dawn is rose, dusk is amber).
// Pure: callers decide how often to sample (once a minute; CSS interpolates in between).
import { getMoonIllumination, getMoonPosition, getPosition, getTimes } from './sky-suncalc.mjs';
import { timeOfDay } from './room-ambience.mjs';

const clamp01 = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
// Fixed curve for "no place": rises 6:30, peaks 50° at 12:30, sets 18:30 local time.
export function syntheticSun(date = new Date()) {
  // 算不出时间就当午夜：宁可直接给一段夜空，也不让 NaN 传进颜色。
  const time = date instanceof Date ? date.getTime() : Number(date);
  const clock = Number.isFinite(time) ? new Date(time) : null;
  const hour = clock ? clock.getHours() + clock.getMinutes() / 60 + clock.getSeconds() / 3600 : 0;
  const angle = 2 * Math.PI * (hour - 6.5) / 24;
  return { altitude: 50 * Math.sin(angle), azimuth: ((90 + (hour - 6.5) / 12 * 180) % 360 + 360) % 360, rising: hour >= .5 && hour < 12.5, noonAltitude: 50, hour };
}
// Bucket strings stay those of timeOfDay(); with a real sun they follow light, not the clock.
export function skyBucket({ altitude, rising, noonAltitude = 50 }) {
  // 算不出高度时按夜里处理：宁可暗一点，也不要给出一段坏掉的天空。
  if (!Number.isFinite(altitude)) return 'night';
  if (altitude < -6) return 'night';
  if (rising) return altitude < Math.max(6, noonAltitude * .7) ? 'morning' : 'day';
  return altitude < Math.max(6, noonAltitude * .35) ? 'dusk' : 'day';
}
export function skyState(date = new Date(), city = null) {
  const illumination = getMoonIllumination(date);
  const moon = { phase: Number.isFinite(illumination.phase) ? illumination.phase : 0, fraction: Number.isFinite(illumination.fraction) ? illumination.fraction : 0, waxing: illumination.waxing === true };
  const lat = Number(city?.lat), lng = Number(city?.lng);
  // 城市坐标坏掉时退回本机曲线：天空照常画，不给 NaN。
  const place = city && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  if (!place) {
    const sun = syntheticSun(date), bucket = timeOfDay(Math.floor(sun.hour));
    // Without a place the moon keeps the night company; its phase is still the real one.
    return { altitude: sun.altitude, azimuth: sun.azimuth, rising: sun.rising, noonAltitude: 50, bucket, synthetic: true, moon: { ...moon, altitude: bucket === 'night' ? 35 : -10 } };
  }
  const { lat: latitude, lng: longitude } = place, now = getPosition(date, latitude, longitude), later = getPosition(new Date(date.valueOf() + 6e5), latitude, longitude);
  const noon = getTimes(date, latitude, longitude).solarNoon, noonAltitude = getPosition(noon, latitude, longitude).altitude;
  const state = { altitude: Number.isFinite(now.altitude) ? now.altitude : 0, azimuth: Number.isFinite(now.azimuth) ? now.azimuth : 0, rising: later.altitude >= now.altitude, noonAltitude: Number.isFinite(noonAltitude) ? noonAltitude : 50, synthetic: false };
  return { ...state, bucket: skyBucket(state), moon: { ...moon, altitude: getMoonPosition(date, latitude, longitude).altitude } };
}

// Keyframes: sun altitude (deg) → sky top / horizon, window glow + room ambient (soft-light,
// alpha = strength) and the night shade (multiply). Hue-shifted: night leans blue-violet,
// dawn rose, noon neutral, dusk amber → magenta afterglow.
const NIGHT = { top: '#0b1030', horizon: '#1a2244', glow: '#3a4a8a00', ambient: '#2a356000', shade: '#2e3466a0' };
export const SKY_KEYS = Object.freeze({
  morning: [
    [-18, NIGHT],
    [-10, { top: '#141c48', horizon: '#2e2e5e', glow: '#4a4f9000', ambient: '#3a3a7000', shade: '#343a7090' }],
    [-4, { top: '#2a3470', horizon: '#8a5a80', glow: '#c87a8a38', ambient: '#6a5a9028', shade: '#4a4a8058' }],
    [0, { top: '#4a5c9a', horizon: '#f0a07a', glow: '#ffb08a7a', ambient: '#e8c0d066', shade: '#7a6a9020' }],
    [4, { top: '#7896c8', horizon: '#ffd09a', glow: '#ffd6a88c', ambient: '#fff0d673', shade: '#ffffff00' }],
    [12, { top: '#86b2e4', horizon: '#f0e6cc', glow: '#d9ecff8c', ambient: '#fff3d673', shade: '#ffffff00' }],
    [30, { top: '#6aa4e4', horizon: '#cfe6f4', glow: '#fffbe866', ambient: '#ffe9c066', shade: '#ffffff00' }],
    [90, { top: '#5a9ae2', horizon: '#c0dff4', glow: '#fffbe860', ambient: '#fff2d860', shade: '#ffffff00' }]
  ],
  evening: [
    [-18, NIGHT],
    [-10, { top: '#121a44', horizon: '#36306a', glow: '#4a3a8000', ambient: '#3a2a6000', shade: '#343a7090' }],
    [-4, { top: '#2a2a68', horizon: '#b8587a', glow: '#d0607a5c', ambient: '#7a40704c', shade: '#3e3a7260' }],
    [0, { top: '#4a4690', horizon: '#ff8a5a', glow: '#ff9b5a80', ambient: '#b34a6d80', shade: '#5a4a7a24' }],
    [4, { top: '#6a6eb0', horizon: '#ffb070', glow: '#ffa86880', ambient: '#e88a7073', shade: '#ffffff00' }],
    [12, { top: '#7a9cd4', horizon: '#f4d8a8', glow: '#ffd49a73', ambient: '#ffc89066', shade: '#ffffff00' }],
    [30, { top: '#6aa4e4', horizon: '#d4e6ee', glow: '#fff4dc66', ambient: '#ffe6bc66', shade: '#ffffff00' }],
    [90, { top: '#5a9ae2', horizon: '#c0dff4', glow: '#fffbe860', ambient: '#fff2d860', shade: '#ffffff00' }]
  ]
});
const parse = (hex) => { const h = hex.slice(1); return [0, 2, 4, 6].map((i) => i < h.length ? parseInt(h.slice(i, i + 2), 16) : 255); };
const hex2 = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
export const toHex = ([r, g, b, a = 255]) => `#${hex2(r)}${hex2(g)}${hex2(b)}${a >= 255 ? '' : hex2(a)}`;
export const mixRgba = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const GREY = { top: parse('#8a93a0'), horizon: parse('#b4b8bc'), glow: parse('#d8dce060'), ambient: parse('#c8ccd040') };
// overcast 0..1 (clouds, rain, fog) greys the sky toward the same altitude's brightness.
export function skyColors({ altitude, rising }, overcast = 0) {
  const height = Number.isFinite(altitude) ? altitude : 0;
  const keys = SKY_KEYS[rising ? 'morning' : 'evening'], alt = Math.max(-18, Math.min(90, height));
  let i = 1; while (i < keys.length - 1 && keys[i][0] < alt) i++;
  const [a0, k0] = keys[i - 1], [a1, k1] = keys[i], t = clamp01((alt - a0) / (a1 - a0 || 1));
  const light = clamp01((height + 6) / 18), grey = clamp01(overcast) * .7 * (.35 + light * .65);
  const out = {};
  for (const name of ['top', 'horizon', 'glow', 'ambient', 'shade']) {
    let rgba = mixRgba(parse(k0[name]), parse(k1[name]), t);
    if (GREY[name] && grey) { const target = GREY[name].map((v, j) => j < 3 ? v * (.25 + light * .75) : v); rgba = mixRgba(rgba, name === 'glow' || name === 'ambient' ? [...target.slice(0, 3), rgba[3]] : target, grey); }
    out[name] = toHex(rgba);
  }
  return { ...out, light: Math.round(light * 100) / 100, stars: Math.round(clamp01((-height - 3) / 9) * (1 - clamp01(overcast)) * 100) / 100 };
}
// Soft-light tint for the painted land / sea inside a window: 50 % grey changes nothing; it
// darkens toward night blue when the sky is darker than the art was painted (`painted`: 1 a
// daylight view, 0 a night view) and lifts toward pale day when it is brighter; low sun
// borrows the horizon's rose or amber. Returns '#rrggbb'.
export function landTint({ altitude }, colors, painted = 1) {
  const light = Number.isFinite(colors?.light) ? colors.light : clamp01((altitude + 6) / 18), delta = light - painted;
  let rgb = [128, 128, 128];
  if (delta < 0) rgb = mixRgba(rgb, [34, 40, 96], Math.min(1, -delta) * .85);
  else rgb = mixRgba(rgb, [214, 226, 244], Math.min(1, delta) * .75);
  const glow = clamp01(1 - Math.abs(altitude) / 9) * .45;
  if (glow) {
    const horizon = typeof colors?.horizon === 'string' ? parse(colors.horizon).slice(0, 3) : [128, 128, 128];
    rgb = mixRgba(rgb, horizon, glow);
  }
  return toHex(rgb);
}
// The CSS variables RoomScene writes (registered with @property in companion-room.css).
export const skyVariables = (colors) => ({ '--sky-top': colors.top, '--sky-horizon': colors.horizon, '--sky-glow': colors.glow, '--sky-ambient': colors.ambient, '--sky-shade': colors.shade, '--sky-light': String(colors.light) });
