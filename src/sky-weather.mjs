// Flowing window weather: a weather is { kind, intensity 0..1, wind 0..1 }; it becomes a set of
// layer strengths (clouds, fog, rain, snow, storm, starry) that cross-fade from absolute time,
// so a change (or a real-weather update) eases in over ~30 s instead of cutting.
import { WEATHERS } from './room-ambience.mjs';

// The four unlockable 窗景 (WEATHERS) plus kinds only real weather produces.
export const WEATHER_KINDS = Object.freeze([...WEATHERS, 'cloudy', 'fog', 'storm']);
export const normalizeWeatherKind = (value) => WEATHER_KINDS.includes(value) ? value : 'snow';
const DEFAULTS = { snow: [.7, .25], clear: [0, .2], rain: [.65, .35], starry: [1, .1], cloudy: [.7, .3], fog: [.8, .1], storm: [1, .8] };
const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
export function weatherOf(kind, intensity, wind) {
  const id = normalizeWeatherKind(kind), [i, w] = DEFAULTS[id];
  return { kind: id, intensity: clamp01(intensity ?? i), wind: clamp01(wind ?? w) };
}
export const LAYERS = Object.freeze(['clouds', 'fog', 'rain', 'snow', 'storm', 'starry', 'wind']);
export function weatherLayers(weather) {
  const { kind, intensity: i, wind } = weatherOf(weather?.kind, weather?.intensity, weather?.wind);
  const out = { clouds: 0, fog: 0, rain: 0, snow: 0, storm: 0, starry: 0, wind };
  if (kind === 'cloudy') out.clouds = .45 + .55 * i;
  if (kind === 'fog') { out.fog = .5 + .5 * i; out.clouds = .3; }
  if (kind === 'rain') { out.rain = .35 + .65 * i; out.clouds = .55 + .35 * i; }
  if (kind === 'snow') { out.snow = .35 + .65 * i; out.clouds = .35 + .3 * i; }
  if (kind === 'storm') { out.rain = .8 + .2 * i; out.clouds = 1; out.storm = .6 + .4 * i; }
  if (kind === 'starry') out.starry = 1;
  return out;
}
// How much the weather greys the sky and the room's daylight.
export const overcastOf = (layers) => clamp01(Math.max(layers.clouds * .85, layers.fog * .8, layers.rain * .7, layers.snow * .5, layers.storm));

export const CROSSFADE_MS = 30000;
const ease = (t) => t * t * (3 - 2 * t);
export function layersAt(timeline, now, duration = CROSSFADE_MS) {
  const t = ease(clamp01((now - timeline.at) / duration)), out = {};
  for (const name of LAYERS) out[name] = timeline.from[name] + (timeline.to[name] - timeline.from[name]) * t;
  return out;
}
export const settled = (timeline, now, duration = CROSSFADE_MS) => now - timeline.at >= duration;
export const createTimeline = (weather, now = 0) => { const layers = weatherLayers(weather); return { from: layers, to: layers, at: now - CROSSFADE_MS }; };
// A new target starts from whatever is on screen now, so rapid changes never jump.
export function retarget(timeline, weather, now, duration = CROSSFADE_MS) {
  const to = weatherLayers(weather);
  if (LAYERS.every((name) => Math.abs(timeline.to[name] - to[name]) < 1e-6)) return timeline;
  return { from: layersAt(timeline, now, duration), to, at: now };
}

const fract = (v) => v - Math.floor(v);
export const hash = (n) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);
// Lightning from absolute time: at most one strike per 20 s slot, a bright frame, a dark gap
// and a dimmer after-flash (≈0.3 s). 2 = strike, 1 = after-flash, 0 = none.
export const LIGHTNING_SLOT = 20;
export function lightningAt(seconds, storm) {
  if (!(storm > .05)) return { flash: 0, seed: 0 };
  const slot = Math.floor(seconds / LIGHTNING_SLOT), at = slot * LIGHTNING_SLOT + 2 + hash(slot) * 15, dt = seconds - at;
  if (hash(slot + .5) > storm * .9 || dt < 0 || dt >= .3) return { flash: 0, seed: slot };
  return { flash: dt < .09 ? 2 : dt < .2 ? 0 : 1, seed: slot };
}

// Real weather (desktop opt-in) wins while it is fresh; otherwise the equipped 窗景.
export const REAL_WEATHER_TTL = 3 * 3600e3;
export function effectiveWeather(manual, real, now = Date.now()) {
  if (real && real.kind && WEATHER_KINDS.includes(real.kind) && now - (real.fetchedAt || 0) < REAL_WEATHER_TTL) return { ...weatherOf(real.kind, real.intensity, real.wind), source: 'real' };
  return { ...weatherOf(WEATHERS.includes(manual) ? manual : 'snow'), source: 'manual' };
}
