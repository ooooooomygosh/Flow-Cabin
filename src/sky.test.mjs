import test from 'node:test';
import assert from 'node:assert/strict';
import { getPosition, getTimes, getMoonIllumination } from './sky-suncalc.mjs';
import { SKY_CITIES, cityForZone, getSkyCity, resolveSkyCity } from './sky-cities.mjs';
import { SKY_KEYS, landTint, skyBucket, skyColors, skyState, skyVariables, syntheticSun } from './sky-model.mjs';
import { CROSSFADE_MS, LIGHTNING_SLOT, REAL_WEATHER_TTL, WEATHER_KINDS, createTimeline, effectiveWeather, layersAt, lightningAt, overcastOf, retarget, settled, weatherLayers, weatherOf } from './sky-weather.mjs';
import { CELL, bodies, paintSky, paintWeather, skyPalette, weatherFps, windowMasks } from './sky-paint.mjs';
import { msToNextMinute, normalizeSkySettings, readSkySettings, writeSkySettings, SKY_SETTINGS_KEY } from './sky-clock.mjs';
import { WEATHERS, timeOfDay } from './room-ambience.mjs';
import { ROOM_SCENES } from './scene-catalog.mjs';

const shanghai = getSkyCity('shanghai'), tromso = getSkyCity('tromso');
const at = (iso) => new Date(iso);

test('vendored SunCalc: Shanghai noon is high, midnight is below the horizon, the moon has a phase', () => {
  const noon = getTimes(at('2026-06-21T04:00:00Z'), shanghai.lat, shanghai.lng).solarNoon;
  const altitude = getPosition(noon, shanghai.lat, shanghai.lng).altitude; // degrees
  assert.ok(altitude > 80 && altitude < 83, altitude); // 90 − (31.23 − 23.44)
  assert.ok(getPosition(at('2026-06-21T16:00:00Z'), shanghai.lat, shanghai.lng).altitude < 0);
  const moon = getMoonIllumination(at('2026-10-16T12:00:00Z'));
  assert.ok(moon.phase >= 0 && moon.phase < 1 && moon.fraction >= 0 && moon.fraction <= 1);
});

test('sky state: real sun in degrees, rising/setting, buckets from light; polar day and night', () => {
  const dawn = skyState(at('2026-10-16T05:52:00+08:00'), shanghai), dusk = skyState(at('2026-10-16T17:31:00+08:00'), shanghai);
  assert.ok(dawn.rising && !dusk.rising); assert.ok(Math.abs(dawn.altitude) < 6 && Math.abs(dusk.altitude) < 6);
  assert.equal(dawn.bucket, 'morning'); assert.equal(dusk.bucket, 'dusk');
  assert.equal(skyState(at('2026-10-16T12:30:00+08:00'), shanghai).bucket, 'day');
  assert.equal(skyState(at('2026-10-16T23:00:00+08:00'), shanghai).bucket, 'night');
  // Tromsø: the midnight sun never sets in June; the polar night never rises in December.
  for (let h = 0; h < 24; h++) {
    assert.notEqual(skyState(at(`2026-06-21T${String(h).padStart(2, '0')}:00:00Z`), tromso).bucket, 'night');
    assert.ok(skyState(at(`2026-12-21T${String(h).padStart(2, '0')}:00:00Z`), tromso).altitude < 0);
  }
});

test('without a place the fixed clock keeps the old timeOfDay buckets', () => {
  for (let h = 0; h < 24; h++) {
    const date = new Date(2026, 9, 16, h, 30), state = skyState(date, null);
    assert.equal(state.bucket, timeOfDay(h), String(h)); assert.equal(state.synthetic, true);
  }
  assert.ok(Math.abs(syntheticSun(new Date(2026, 9, 16, 6, 30)).altitude) < 1e-9);
  assert.ok(syntheticSun(new Date(2026, 9, 16, 12, 30)).altitude === 50);
  assert.equal(skyBucket({ altitude: -7, rising: true }), 'night');
  assert.equal(skyBucket({ altitude: 10, rising: true, noonAltitude: 50 }), 'morning');
  assert.equal(skyBucket({ altitude: 40, rising: true, noonAltitude: 50 }), 'day');
  assert.equal(skyBucket({ altitude: 10, rising: false, noonAltitude: 50 }), 'dusk');
});

test('cities: shanghai default for China zones, ids are stable, the fixed clock is opt-in', () => {
  assert.equal(SKY_CITIES[0].id, 'shanghai'); assert.equal(new Set(SKY_CITIES.map((c) => c.id)).size, SKY_CITIES.length);
  for (const city of SKY_CITIES) { assert.match(city.id, /^[a-z]{2,20}$/); assert.ok(Math.abs(city.lat) <= 90 && Math.abs(city.lng) <= 180 && city.name); }
  assert.equal(resolveSkyCity('auto', 'Asia/Shanghai').id, 'shanghai');
  assert.equal(cityForZone('PRC').id, 'shanghai');
  assert.equal(resolveSkyCity('beijing', 'Europe/London').id, 'beijing');
  assert.equal(resolveSkyCity('clock', 'Asia/Shanghai'), null);
  assert.equal(resolveSkyCity('auto', 'Mars/Olympus'), null);
  assert.equal(resolveSkyCity('nowhere', ''), null);
});

test('sky colours: morning and evening sets differ, night is dark, overcast greys, values are CSS colours', () => {
  assert.equal(SKY_KEYS.morning.length, SKY_KEYS.evening.length);
  const dawn = skyColors({ altitude: 0, rising: true }), dusk = skyColors({ altitude: 0, rising: false });
  assert.notEqual(dawn.horizon, dusk.horizon);
  const night = skyColors({ altitude: -30, rising: false }), noon = skyColors({ altitude: 60, rising: true });
  assert.equal(night.light, 0); assert.equal(noon.light, 1); assert.ok(night.stars > .9 && noon.stars === 0);
  assert.equal(skyColors({ altitude: -30, rising: false }, 1).stars, 0, 'clouds hide the stars');
  assert.notEqual(skyColors({ altitude: 30, rising: true }, 1).top, skyColors({ altitude: 30, rising: true }).top);
  for (const value of Object.values(skyVariables(noon)).slice(0, 5)) assert.match(value, /^#[0-9a-f]{6}([0-9a-f]{2})?$/);
  // Colours move continuously: a minute of sun (≤ .25°) never jumps a channel by more than 8.
  for (const rising of [true, false]) for (let a = -20; a < 40; a += .25) {
    const x = skyColors({ altitude: a, rising }).top, y = skyColors({ altitude: a + .25, rising }).top;
    for (let k = 1; k < 7; k += 2) assert.ok(Math.abs(parseInt(x.slice(k, k + 2), 16) - parseInt(y.slice(k, k + 2), 16)) <= 8, `${a} ${x} ${y}`);
  }
  assert.equal(landTint({ altitude: 60 }, noon, 1), '#808080', 'a daylight view at noon is untouched');
  assert.notEqual(landTint({ altitude: -30 }, night, 1), '#808080');
});

test('weather: back-compatible ids, layers, 30 s cross-fade from absolute time', () => {
  for (const id of WEATHERS) assert.ok(WEATHER_KINDS.includes(id));
  assert.equal(weatherOf('nonsense').kind, 'snow');
  assert.equal(weatherOf('rain', 5).intensity, 1);
  assert.deepEqual(weatherLayers({ kind: 'clear' }), { clouds: 0, fog: 0, rain: 0, snow: 0, storm: 0, starry: 0, wind: .2 });
  assert.ok(weatherLayers({ kind: 'storm', intensity: 1 }).storm === 1 && overcastOf(weatherLayers({ kind: 'storm' })) === 1);
  const start = createTimeline({ kind: 'clear' }, 1000); assert.ok(settled(start, 1000));
  const next = retarget(start, { kind: 'rain' }, 1000);
  assert.equal(layersAt(next, 1000).rain, 0); assert.equal(layersAt(next, 1000 + CROSSFADE_MS).rain, weatherLayers({ kind: 'rain' }).rain);
  const mid = layersAt(next, 1000 + CROSSFADE_MS / 2).rain; assert.ok(mid > 0 && mid < weatherLayers({ kind: 'rain' }).rain);
  assert.ok(!settled(next, 1000 + CROSSFADE_MS - 1) && settled(next, 1000 + CROSSFADE_MS));
  // A change mid-fade continues from what is on screen.
  const again = retarget(next, { kind: 'snow' }, 1000 + CROSSFADE_MS / 2); assert.equal(layersAt(again, 1000 + CROSSFADE_MS / 2).rain, mid);
  assert.equal(retarget(again, { kind: 'snow' }, 5e9), again, 'same target keeps its timeline');
});

test('lightning: only in storms, at most one strike per slot, every phase visible at 12 fps', () => {
  for (let s = 0; s < 600; s += 1 / 12) assert.equal(lightningAt(s, 0).flash, 0);
  let strikes = 0, after = 0;
  for (let slot = 0; slot < 30; slot++) {
    const seen = new Set();
    for (let f = 0; f < LIGHTNING_SLOT * 12; f++) { const s = slot * LIGHTNING_SLOT + f / 12, { flash } = lightningAt(s, 1); if (flash) seen.add(flash); }
    if (seen.has(2)) strikes++; if (seen.has(1)) after++;
  }
  assert.ok(strikes >= 10 && strikes === after, `${strikes} ${after}`);
});

test('real weather wins only while fresh; manual stays one of the four unlockable 窗景', () => {
  const now = 5e12;
  assert.equal(effectiveWeather('rain', null, now).kind, 'rain');
  assert.equal(effectiveWeather('bogus', null, now).kind, 'snow');
  assert.equal(effectiveWeather('cloudy', null, now).kind, 'snow', 'manual cannot pick a real-only kind');
  assert.deepEqual(effectiveWeather('rain', { kind: 'fog', intensity: .5, wind: .1, fetchedAt: now - 1000 }, now), { kind: 'fog', intensity: .5, wind: .1, source: 'real' });
  assert.equal(effectiveWeather('rain', { kind: 'fog', fetchedAt: now - REAL_WEATHER_TTL }, now).kind, 'rain');
  assert.equal(effectiveWeather('rain', { kind: 'tornado', fetchedAt: now }, now).kind, 'rain');
});

const forest = ROOM_SCENES.find((s) => s.id === 'forest').windows[0];
const frameFor = (kind, seconds, extra = {}) => {
  const layers = weatherLayers({ kind }), colors = skyColors({ altitude: 30, rising: true }, overcastOf(layers));
  return { layers, pal: skyPalette(colors, layers), sky: { altitude: 30, azimuth: 180, rising: true, stars: 0, moon: { phase: .5, altitude: -10 } }, seconds, reduced: false, ...extra };
};

test('window masks: every scene window fits its art, glass excludes mullions', () => {
  for (const scene of ROOM_SCENES) for (const win of scene.windows) {
    const [x, y, w, h] = win.box; assert.ok(x >= 0 && y >= 0 && x + w <= 1448 && y + h <= 1086, scene.id);
    const mask = windowMasks(win); assert.equal(mask.width, Math.ceil(w / CELL)); assert.equal(mask.height, Math.ceil(h / CELL));
    let back = 0, front = 0; for (let i = 0; i < mask.back.length; i++) { back += mask.back[i]; front += mask.front[i]; assert.ok(mask.front[i] <= mask.back[i]); }
    assert.ok(front > 0 && back >= front, scene.id);
    if (win.mullions) assert.ok(front < back);
  }
});

test('painters: deterministic, bounded to the glass, snow keeps 64 flakes and moves', () => {
  const mask = windowMasks(forest), size = mask.width * mask.height * 4;
  for (const kind of WEATHER_KINDS) for (const seconds of [0, .5, 5, 3600]) {
    const a = new Uint8ClampedArray(size), b = new Uint8ClampedArray(size), sky = new Uint8ClampedArray(size);
    paintWeather(a, mask, frameFor(kind, seconds)); paintWeather(b, mask, frameFor(kind, seconds)); assert.deepEqual(a, b, kind);
    paintSky(sky, mask, { ...frameFor(kind, seconds), bodies: bodies({ altitude: 30, azimuth: 180, moon: { altitude: -10 } }, mask, forest.horizon) });
    for (let i = 0; i < mask.front.length; i++) { if (!mask.front[i]) assert.equal(a[i * 4 + 3], 0, `${kind} paints outside the glass`); if (!mask.back[i]) assert.equal(sky[i * 4 + 3], 0); }
  }
  const lit = (data) => { let n = 0; for (let i = 3; i < data.length; i += 4) if (data[i]) n++; return n; };
  const snowAt = (s) => { const d = new Uint8ClampedArray(size); paintWeather(d, mask, frameFor('snow', s)); return d; };
  const clear = new Uint8ClampedArray(size); paintWeather(clear, mask, frameFor('clear', 3)); assert.equal(lit(clear), 0);
  const tall = windowMasks({ box: [0, 0, 400, 400] }), full = new Uint8ClampedArray(tall.width * tall.height * 4);
  paintWeather(full, tall, { ...frameFor('snow', 7), layers: { ...weatherLayers({ kind: 'snow' }), snow: 1 } });
  assert.ok(lit(full) >= 60 && lit(full) <= 64 * 2, 'one 64-flake field');
  assert.notDeepEqual(snowAt(0), snowAt(1));
  assert.deepEqual(snowAt(0), (() => { const d = new Uint8ClampedArray(size); paintWeather(d, mask, { ...frameFor('snow', 99), reduced: true, seconds: 0 }); return d; })(), 'reduced motion is the t=0 frame');
});

test('frame budget: nothing moving means no frames; falling weather 12 fps (8 on low)', () => {
  assert.equal(weatherFps(weatherLayers({ kind: 'clear' })), 0);
  assert.equal(weatherFps(weatherLayers({ kind: 'rain' })), 12); assert.equal(weatherFps(weatherLayers({ kind: 'rain' }), true), 8);
  assert.equal(weatherFps(weatherLayers({ kind: 'storm' })), 12);
  for (const kind of ['cloudy', 'fog', 'starry']) { assert.ok(weatherFps(weatherLayers({ kind })) <= 2); assert.ok(weatherFps(weatherLayers({ kind }), true) <= 1); }
});

test('sky settings: off by default, normalised, stored under one key; minute ticks align', () => {
  assert.deepEqual(normalizeSkySettings(null), { place: 'auto', realWeather: false });
  assert.deepEqual(normalizeSkySettings({ place: '../x', realWeather: 'yes' }), { place: 'auto', realWeather: false });
  assert.deepEqual(normalizeSkySettings({ place: 'tokyo', realWeather: true }), { place: 'tokyo', realWeather: true });
  const store = new Map(), storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.deepEqual(readSkySettings(storage), { place: 'auto', realWeather: false });
  writeSkySettings({ place: 'beijing' }, storage); assert.deepEqual(JSON.parse(store.get(SKY_SETTINGS_KEY)), { place: 'beijing', realWeather: false });
  store.set(SKY_SETTINGS_KEY, '{oops'); assert.deepEqual(readSkySettings(storage), { place: 'auto', realWeather: false });
  assert.equal(msToNextMinute(120000), 60050); assert.equal(msToNextMinute(179999), 51);
});

import { REAL_SWITCH_MS, steadyWeather } from './sky-clock.mjs';
test('real weather holds steady against flaky or racing reports', () => {
  const a = steadyWeather(null, { kind: 'rain' }, 0);
  assert.equal(steadyWeather(a, null, 1000), a);
  assert.equal(steadyWeather(a, { kind: 'clear' }, 60e3).kind, 'rain');
  assert.equal(steadyWeather(a, { kind: 'clear' }, REAL_SWITCH_MS).kind, 'clear');
  assert.equal(steadyWeather(a, { kind: 'rain', intensity: .8 }, 5e3).since, 0);
});

import { windTime } from './sky-weather.mjs';
test('window weather drift stays continuous when the 窗景 or real weather changes (no flip-flopping clouds)', () => {
  // Absolute time, as on screen: seconds ≈ 1.7e9.
  const t0 = 1_760_000_000_000;
  let timeline = createTimeline({ kind: 'snow' }, t0);
  const steps = [];
  // Click a 窗景, then another mid-fade, then real weather (different wind) mid-fade again.
  const changes = { [t0 + 1000]: { kind: 'clear' }, [t0 + 9000]: { kind: 'storm', intensity: 1, wind: 1 }, [t0 + 20000]: { kind: 'rain', intensity: .4, wind: .05 } };
  let last = windTime(timeline, t0);
  for (let now = t0 + 16; now < t0 + 70000; now += 16) {
    const change = Object.entries(changes).find(([at]) => now - 16 < Number(at) && now >= Number(at)); if (change) timeline = retarget(timeline, change[1], now);
    const value = windTime(timeline, now), step = value - last; last = value; steps.push(step);
    // Per 16 ms frame the drift moves by at most wind(≤1) × 0.016 s, never by seconds × Δwind.
    assert.ok(step >= 0 && step <= .0161, `drift step ${step} at +${now - t0} ms`);
  }
  // And the clouds drawn on consecutive frames barely change while the fade runs.
  const mask = windowMasks({ box: [0, 0, 160, 120], panes: [[0, 0, 160, 120]] }), size = mask.width * mask.height * 4;
  const frameAt = (tl, now) => ({ layers: layersAt(tl, now), pal: skyPalette(skyColors(skyState(new Date(now), null), .6), layersAt(tl, now)), sky: { stars: 0 }, seconds: now / 1000, drift: windTime(tl, now), bodies: { sun: { visible: false }, moon: { visible: false } } });
  // (rain, not storm: a lightning flash would change every pixel by design.) Before the fix: ~7.6 %.
  const fade = retarget(createTimeline({ kind: 'clear' }, t0), { kind: 'rain', intensity: .4, wind: .05 }, t0);
  const a = new Uint8ClampedArray(size), b = new Uint8ClampedArray(size);
  paintSky(a, mask, frameAt(fade, t0 + 10000)); paintSky(b, mask, frameAt(fade, t0 + 10016));
  let diff = 0; for (let i = 3; i < size; i += 4) if (a[i] !== b[i]) diff++;
  assert.ok(diff / (size / 4) < .03, `clouds changed on ${(100 * diff / (size / 4)).toFixed(1)}% of pixels in one frame`);
});
