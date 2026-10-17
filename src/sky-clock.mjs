// One shared minute clock for the window sky: settings (place, opt-in real weather), the
// sun/moon state, and the desktop shell's weather reports. It wakes once a minute (aligned to
// the minute) and only while something listens; nothing in here draws.
import { resolveSkyCity } from './sky-cities.mjs';
import { skyState } from './sky-model.mjs';
import { desktopCommand } from './desktop/desktop-command.mjs';

export const SKY_SETTINGS_KEY = 'flow-cabin-sky-v1';
export const SKY_SETTINGS_EVENT = 'cabin:sky-settings';
export const WEATHER_EVENT = 'cabin:weather';
const DEFAULTS = Object.freeze({ place: 'auto', realWeather: false });
export function normalizeSkySettings(value) {
  const place = typeof value?.place === 'string' && /^[a-z]{2,20}$/.test(value.place) ? value.place : 'auto';
  return { place, realWeather: value?.realWeather === true };
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
// Real weather comes only from the desktop shell (desktop/weather.cjs, Open-Meteo in the main
// process); the web build never asks for it.
export const desktopShell = (win = globalThis) => Boolean(win.albumDesktopAppearance?.client || win.document?.documentElement?.dataset.desktopClient === 'true');
export const realWeatherReport = (win = globalThis) => win.cabinWeather && typeof win.cabinWeather === 'object' ? win.cabinWeather : null;

// Next minute boundary (+50 ms so Date has ticked over).
export const msToNextMinute = (now) => 60000 - (now % 60000) + 50;

let current = null, timer = null, snapshot = null;
const listeners = new Set();
function compute() {
  const settings = current || (current = readSkySettings()), city = resolveSkyCity(settings.place);
  const real = settings.realWeather && desktopShell() ? realWeatherReport() : null;
  snapshot = { settings, city, state: skyState(new Date(), city), real, at: Date.now() };
  return snapshot;
}
function notify() { const value = compute(); for (const cb of [...listeners]) cb(value); }
function schedule() {
  clearTimeout(timer); timer = null;
  if (!listeners.size) return;
  timer = setTimeout(() => { if (!globalThis.document?.hidden) notify(); schedule(); }, msToNextMinute(Date.now()));
}
function askShell() {
  if (!desktopShell()) return;
  const { settings, city } = snapshot || compute();
  if (settings.realWeather && city) desktopCommand('weather', { enabled: true, lat: city.lat.toFixed(2), lng: city.lng.toFixed(2) });
  else desktopCommand('weather', { enabled: false });
}
const onSettings = () => { current = readSkySettings(); notify(); askShell(); };
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
