'use strict';
// 跟随真实天气 (opt-in, off by default): the current weather for the cabin's chosen city from
// Open-Meteo (https://open-meteo.com, data CC BY 4.0), fetched here in the main process so the
// page's CSP stays connect-src 'self'. Only coordinates rounded to 0.01° leave the machine; one
// request per place per 30 minutes at most, and nothing at all while the setting is off. The
// page sees { kind, intensity, wind, fetchedAt, … } as window.cabinWeather and 'cabin:weather'
// (src/sky-clock.mjs); null means "use the equipped 窗景".
const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const TTL = 30 * 60 * 1000, TIMEOUT = 10000, RETRY = 5 * 60 * 1000;
const round = (value) => Math.round(value * 100) / 100;
const clamp01 = (value) => Math.max(0, Math.min(1, value));

function validPlace(lat, lng) {
  const num = (v) => (typeof v === 'number' || (typeof v === 'string' && /^-?\d{1,3}(\.\d+)?$/.test(v))) ? Number(v) : NaN;
  const a = num(lat), b = num(lng);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 ? { lat: round(a), lng: round(b) } : null;
}
const weatherUrl = ({ lat, lng }) => `${ENDPOINT}?latitude=${lat}&longitude=${lng}&current=weather_code,wind_speed_10m,precipitation,cloud_cover,temperature_2m,is_day&timezone=auto`;

// WMO weather interpretation codes → the cabin's weather kinds.
function weatherFromReport(report) {
  const current = report?.current; if (!current || typeof current !== 'object') return null;
  const code = Number(current.weather_code), cover = Number(current.cloud_cover), windKmh = Number(current.wind_speed_10m);
  if (!Number.isFinite(code)) return null;
  const wind = Math.round(clamp01((Number.isFinite(windKmh) ? windKmh : 10) / 50) * 100) / 100;
  const of = (kind, intensity) => ({ kind, intensity: Math.round(clamp01(intensity) * 100) / 100, wind });
  if (code === 0) return of('clear', 0);
  if (code === 1 || code === 2) return Number.isFinite(cover) && cover >= 45 ? of('cloudy', .3 + cover / 250) : of('clear', 0);
  if (code === 3) return of('cloudy', .9);
  if (code === 45 || code === 48) return of('fog', code === 48 ? .9 : .7);
  if (code >= 51 && code <= 57) return of('rain', .3);
  if (code === 61 || code === 66 || code === 80) return of('rain', .4);
  if (code === 63 || code === 81) return of('rain', .65);
  if (code === 65 || code === 67 || code === 82) return of('rain', .9);
  if (code === 71 || code === 77 || code === 85) return of('snow', .4);
  if (code === 73) return of('snow', .65);
  if (code === 75 || code === 86) return of('snow', .9);
  if (code === 95 || code === 96 || code === 99) return of('storm', code === 95 ? .7 : 1);
  return null;
}

function createWeather({ fetch, publish, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, writeLog = () => {} }) {
  let enabled = false, place = null, value = null, timer = null, inflight = null;
  const cache = new Map(); // "lat,lng" → { weather, fetchedAt }
  const key = (p) => `${p.lat},${p.lng}`;
  const state = () => enabled && value ? value : null;
  const emit = () => publish(state());
  const schedule = (ms) => { clearTimer(timer); timer = enabled ? setTimer(refresh, ms) : null; timer?.unref?.(); };
  async function refresh() {
    if (!enabled || !place) return state();
    const wanted = place, hit = cache.get(key(wanted));
    if (hit && now() - hit.fetchedAt < TTL) { value = { ...hit.weather, fetchedAt: hit.fetchedAt, source: 'open-meteo' }; emit(); schedule(hit.fetchedAt + TTL - now()); return state(); }
    if (inflight) return inflight;
    inflight = (async () => {
      const controller = new AbortController(), abort = setTimer(() => controller.abort(), TIMEOUT);
      try {
        const response = await fetch(weatherUrl(wanted), { signal: controller.signal, headers: { accept: 'application/json' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const weather = weatherFromReport(await response.json());
        if (!weather) throw new Error('unrecognised report');
        const fetchedAt = now(); cache.set(key(wanted), { weather, fetchedAt });
        if (enabled && place && key(place) === key(wanted)) { value = { ...weather, fetchedAt, source: 'open-meteo' }; emit(); }
        schedule(TTL);
      } catch (error) {
        writeLog('weather-error', error.message || String(error));
        schedule(RETRY); // keep the last report (the page lets it go stale after 3 h)
      } finally { clearTimer(abort); inflight = null; }
      return state();
    })();
    return inflight;
  }
  return {
    state,
    // set({ enabled, lat, lng }): off forgets the report and stops the timer.
    set({ enabled: on, lat, lng } = {}) {
      const next = on ? validPlace(lat, lng) : null;
      if (!next) { enabled = false; place = null; value = null; schedule(0); emit(); return Promise.resolve(null); }
      if (!enabled || !place || key(place) !== key(next)) value = null;
      enabled = true; place = next;
      return refresh();
    },
    publish() { emit(); return state(); },
    dispose() { enabled = false; clearTimer(timer); timer = null; }
  };
}
const weatherScript = (value) => {
  const safe = value && typeof value === 'object' ? { kind: String(value.kind), intensity: Number(value.intensity) || 0, wind: Number(value.wind) || 0, fetchedAt: Number(value.fetchedAt) || 0, source: 'open-meteo' } : null;
  return `window.cabinWeather = ${JSON.stringify(safe)}; window.dispatchEvent(new CustomEvent('cabin:weather', { detail: window.cabinWeather }));`;
};
module.exports = { createWeather, weatherFromReport, weatherScript, weatherUrl, validPlace, WEATHER_TTL: TTL };
