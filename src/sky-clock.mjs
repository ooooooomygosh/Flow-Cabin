// One shared minute clock for the window sky: settings (place, opt-in real weather), the
// sun/moon state, and the desktop shell's weather reports. It wakes once a minute (aligned to
// the minute) and only while something listens; nothing in here draws.
import { resolveSkyCity, normalizeCustomPlace, getSkyCity } from './sky-cities.mjs';
import { skyState } from './sky-model.mjs';
import { weatherRequest } from './weather-client.mjs';

export const SKY_SETTINGS_KEY = 'flow-cabin-sky-v1';
export const SKY_SETTINGS_EVENT = 'cabin:sky-settings';
export const WEATHER_EVENT = 'cabin:weather';
const DEFAULTS = Object.freeze({ place: 'clock', realWeather: false, locationSource: 'manual' });
export function normalizeSkySettings(value) {
  const place = ['auto','clock','custom'].includes(value?.place) || getSkyCity(value?.place) ? value.place : 'clock';
  const customPlace = normalizeCustomPlace(value?.customPlace);
  return { place, realWeather: value?.realWeather === true && Boolean(place === 'custom' ? customPlace : getSkyCity(place)), locationSource: value?.locationSource === 'system' ? 'system' : 'manual', ...(customPlace ? { customPlace } : {}) };
}
export function readSkySettings(storage = globalThis.localStorage) {
  try { return normalizeSkySettings(JSON.parse(storage?.getItem(SKY_SETTINGS_KEY) || 'null') || DEFAULTS); } catch { return { ...DEFAULTS }; }
}
export function writeSkySettings(patch, storage = globalThis.localStorage) {
  const next = normalizeSkySettings({ ...readSkySettings(storage), ...patch });
  try { storage?.setItem(SKY_SETTINGS_KEY, JSON.stringify(next)); } catch { /* private mode: still applies for this page */ }
  current = next;
  globalThis.dispatchEvent?.(new CustomEvent(SKY_SETTINGS_EVENT, { detail: next }));
  return next;
}
// Desktop and Android use their local bridge; web uses the same rounded location with Open-Meteo.
export const desktopShell = (win = globalThis) => Boolean(win.albumMobile?.weatherRequest || win.albumDesktopAppearance?.client || win.document?.documentElement?.dataset.desktopClient === 'true');
export const realWeatherReport = (win = globalThis) => win.cabinWeather && typeof win.cabinWeather === 'object' ? win.cabinWeather : null;

// Next minute boundary (+50 ms so Date has ticked over).
export const msToNextMinute = (now) => 60000 - (now % 60000) + 50;

let current = null, timer = null, snapshot = null, steadyReal = null;
// Real weather is held steady: a missing report keeps the last good one, and the kind may only
// change once every REAL_SWITCH_MS, so flaky or racing reports cannot make the window flicker.
export const REAL_SWITCH_MS = 10 * 60e3;
export function steadyWeather(previous, report, now = Date.now()) {
  if (!report || !report.kind) return previous;
  if (!previous || previous.kind === report.kind || now - (previous.since || 0) >= REAL_SWITCH_MS) return { ...report, since: previous && previous.kind === report.kind ? previous.since : now };
  return previous;
}
const listeners = new Set();
function compute() {
  const settings = current || (current = readSkySettings()), city = resolveSkyCity(settings.place, undefined, settings.customPlace);
  const report = realWeatherReport();
  const matchesPlace = city && (!Number.isFinite(report?.lat) || (Math.abs(report.lat - city.lat) < .011 && Math.abs(report.lng - city.lng) < .011));
  steadyReal = settings.realWeather && matchesPlace ? steadyWeather(steadyReal, report) : null;
  const real = steadyReal;
  snapshot = { settings, city, state: skyState(new Date(), city), real, at: Date.now() };
  return snapshot;
}
function notify() { const value = compute(); for (const cb of [...listeners]) cb(value); }
function schedule() {
  clearTimeout(timer); timer = null;
  if (!listeners.size) return;
  timer = setTimeout(() => { if (!globalThis.document?.hidden) { notify(); if (current?.realWeather) askShell(); } schedule(); }, msToNextMinute(Date.now()));
}
function askShell(force = false) {
  const { settings, city } = snapshot || compute();
  weatherRequest('/set', { enabled: Boolean(settings.realWeather && city), ...(city ? { lat: city.lat, lng: city.lng } : {}), force }).then(result => { globalThis.cabinWeather = result.report; globalThis.dispatchEvent?.(new CustomEvent(WEATHER_EVENT)); }).catch(() => {});
}
export function refreshWeather() { askShell(true); }
const onSettings = () => { current = readSkySettings(); steadyReal = null; notify(); askShell(); };
const onStorage = (event) => { if (event.key === SKY_SETTINGS_KEY) onSettings(); };
const onVisible = () => { if (!globalThis.document?.hidden) { notify(); schedule(); } };
// cb(snapshot) now and every minute / settings change / weather report while subscribed.
export function subscribeSky(cb) {
  const win = globalThis;
  if (!listeners.size) {
    win.addEventListener?.(SKY_SETTINGS_EVENT, onSettings); win.addEventListener?.('storage', onStorage);
    win.addEventListener?.(WEATHER_EVENT, notify); win.document?.addEventListener?.('visibilitychange', onVisible);
    current = readSkySettings(); compute(); if (current.realWeather) askShell();
  }
  listeners.add(cb); cb(snapshot || compute()); schedule();
  return () => {
    listeners.delete(cb);
    if (listeners.size) return;
    clearTimeout(timer); timer = null;
    win.removeEventListener?.(SKY_SETTINGS_EVENT, onSettings); win.removeEventListener?.('storage', onStorage);
    win.removeEventListener?.(WEATHER_EVENT, notify); win.document?.removeEventListener?.('visibilitychange', onVisible);
  };
}
export const skySnapshot = () => snapshot || compute();
