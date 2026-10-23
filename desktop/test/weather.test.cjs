'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createWeather, weatherFromReport, weatherScript, weatherUrl, validPlace, WEATHER_TTL } = require('../weather.cjs');

const report = (code, extra = {}) => ({ current: { weather_code: code, wind_speed_10m: 25, cloud_cover: 80, ...extra } });

test('WMO codes map onto the cabin weather kinds; junk is null', () => {
  assert.deepEqual(weatherFromReport(report(0)), { kind: 'clear', intensity: 0, wind: .5 });
  assert.equal(weatherFromReport(report(1, { cloud_cover: 10 })).kind, 'clear');
  assert.equal(weatherFromReport(report(2, { cloud_cover: 70 })).kind, 'cloudy');
  assert.equal(weatherFromReport(report(3)).kind, 'cloudy');
  for (const code of [45, 48]) assert.equal(weatherFromReport(report(code)).kind, 'fog');
  for (const code of [51, 55, 61, 63, 65, 66, 67, 80, 81, 82]) assert.equal(weatherFromReport(report(code)).kind, 'rain', code);
  assert.ok(weatherFromReport(report(65)).intensity > weatherFromReport(report(61)).intensity);
  for (const code of [71, 73, 75, 77, 85, 86]) assert.equal(weatherFromReport(report(code)).kind, 'snow', code);
  for (const code of [95, 96, 99]) assert.equal(weatherFromReport(report(code)).kind, 'storm', code);
  assert.equal(weatherFromReport(report(0, { wind_speed_10m: 400 })).wind, 1);
  for (const bad of [null, {}, { current: null }, report('x'), report(42)]) assert.equal(weatherFromReport(bad), null);
});

test('only rounded, valid coordinates reach the request', () => {
  assert.deepEqual(validPlace('31.2304', '121.4737'), { lat: 31.23, lng: 121.47 });
  for (const [lat, lng] of [['', ''], [null, 1], ['91', '0'], ['0', '181'], ['1e400', '0'], ['a', 'b']]) assert.equal(validPlace(lat, lng), null);
  assert.equal(weatherUrl({ lat: 31.23, lng: 121.47 }), 'https://api.open-meteo.com/v1/forecast?latitude=31.23&longitude=121.47&current=weather_code,wind_speed_10m,precipitation,cloud_cover,temperature_2m,apparent_temperature,relative_humidity_2m,is_day&timezone=auto');
});

function rig() {
  let clock = 1e12; const urls = [], published = [], timers = new Set();
  const weather = createWeather({
    fetch: async (url) => { urls.push(url); return { ok: true, json: async () => report(63) }; },
    publish: (value) => published.push(value), now: () => clock,
    setTimer: (fn, ms) => { const t = { fn, ms }; timers.add(t); return t; }, clearTimer: (t) => timers.delete(t)
  });
  return { weather, urls, published, timers, advance: (ms) => { clock += ms; } };
}

test('off by default: nothing is fetched until enabled, and off forgets the report', async () => {
  const { weather, urls, published, timers } = rig();
  assert.equal(weather.publish(), null); assert.equal(urls.length, 0);
  const value = await weather.set({ enabled: true, lat: '31.23', lng: '121.47' });
  assert.equal(value.kind, 'rain'); assert.equal(value.source, 'open-meteo'); assert.equal(urls.length, 1);
  assert.ok([...timers].some((t) => t.ms === WEATHER_TTL), 'refreshes on the 30 minute cache period');
  await weather.set({ enabled: false });
  assert.equal(weather.state(), null); assert.equal(published.at(-1), null);
  assert.ok(![...timers].some((t) => t.ms === WEATHER_TTL), 'no refresh timer while off');
  await weather.set({ enabled: true, lat: 'x', lng: '1' });
  assert.equal(weather.state(), null, 'invalid coordinates turn it off'); assert.equal(urls.length, 1);
});

test('30 minute cache per place: re-enabling or re-asking inside the window does not refetch', async () => {
  const { weather, urls, advance } = rig();
  await weather.set({ enabled: true, lat: 31.23, lng: 121.47 });
  advance(10 * 60e3); await weather.set({ enabled: true, lat: 31.231, lng: 121.468 });
  await weather.set({ enabled: false }); await weather.set({ enabled: true, lat: 31.23, lng: 121.47 });
  assert.equal(urls.length, 1);
  await weather.set({ enabled: true, lat: 39.9, lng: 116.4 }); assert.equal(urls.length, 2, 'another city fetches');
  advance(WEATHER_TTL); await weather.set({ enabled: true, lat: 31.23, lng: 121.47 }); assert.equal(urls.length, 3, 'stale cache fetches');
});

test('a failed fetch keeps quiet, logs, and retries later', async () => {
  const logs = [], timers = [];
  const weather = createWeather({ fetch: async () => ({ ok: false, status: 503 }), publish: () => {}, writeLog: (...args) => logs.push(args), setTimer: (fn, ms) => { timers.push(ms); return {}; }, clearTimer: () => {} });
  assert.equal(await weather.set({ enabled: true, lat: 1, lng: 2 }), null);
  assert.equal(logs[0][0], 'weather-error'); assert.ok(timers.includes(5 * 60e3));
});

test('the page script carries only the whitelisted fields', () => {
  const script = weatherScript({ kind: 'rain', intensity: .5, wind: .2, fetchedAt: 9, extra: '<x>' });
  assert.match(script, /^window\.cabinWeather = \{"kind":"rain","intensity":0\.5,"wind":0\.2,"fetchedAt":9,"source":"open-meteo"\}; window\.dispatchEvent\(new CustomEvent\('cabin:weather'/);
  assert.match(weatherScript(null), /^window\.cabinWeather = null;/);
});

test('measured temperature and humidity survive both adapters; absent values are not zero', () => {
  const value = weatherFromReport(report(0, { temperature_2m: -3, apparent_temperature: -7, relative_humidity_2m: 80, precipitation: 0 }));
  assert.equal(value.temperature, -3); assert.equal(value.feelsLike, -7); assert.equal(value.humidity, 80);
  assert.match(weatherScript(value), /"temperature":-3/);
  assert.equal(weatherFromReport(report(0)).temperature, undefined);
});

test('switching location during an in-flight request immediately fetches the newly selected place', async () => {
  const calls = []; let finish;
  const weather = createWeather({ fetch: url => { calls.push(url); return calls.length === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ ok: true, json: async () => report(0, { temperature_2m: 25, apparent_temperature: 27, relative_humidity_2m: 60 }) }); }, publish: () => {} });
  try {
    const first = weather.set({ enabled: true, lat: 31.23, lng: 121.47 });
    const second = weather.set({ enabled: true, lat: -33.87, lng: 151.21 });
    finish({ ok: true, json: async () => report(63) }); await first; await second;
    assert.equal(calls.length, 2); assert.match(calls[1], /latitude=-33.87/);
    assert.equal(weather.state().lat, -33.87); assert.equal(weather.state().temperature, 25);
    assert.equal(weather.state().humidity, 60);
  } finally { weather.dispose(); }
});
