import test from 'node:test';
import assert from 'node:assert/strict';
import { getPosition, getTimes, getMoonIllumination } from './sky-suncalc.mjs';
import { SKY_CITIES, cityForZone, getSkyCity, resolveSkyCity } from './sky-cities.mjs';
import { SKY_KEYS, landTint, skyBucket, skyColors, skyState, skyVariables, syntheticSun } from './sky-model.mjs';
import { msToNextMinute, normalizeSkySettings, readSkySettings, writeSkySettings, SKY_SETTINGS_KEY } from './sky-clock.mjs';
import { timeOfDay } from './room-ambience.mjs';

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

// 回归：算不出太阳高度时曾经产出 #NaNNaNNaN，整面窗会变成坏颜色。
test('an unusable sun altitude never produces a broken colour', () => {
  for (const altitude of [NaN, undefined, null, 'high', Infinity, -Infinity]) {
    const colors = skyColors({ altitude, rising: true });
    for (const [name, value] of Object.entries(colors)) {
      if (name === 'light' || name === 'stars') { assert.ok(Number.isFinite(value), `${name} must be a number`); continue; }
      assert.match(value, /^#[0-9a-f]{6}([0-9a-f]{2})?$/, `${name} = ${value}`);
      assert.doesNotMatch(value, /NaN/, `${name} = ${value}`);
    }
    assert.match(landTint({ altitude }, colors), /^#[0-9a-f]{6}$/);
  }
  assert.equal(skyBucket({ altitude: NaN }), 'night', 'an unknown sun reads as night, not as a broken sky');
  assert.equal(skyBucket({ altitude: undefined, rising: true }), 'night');
  const state = skyState(new Date('invalid'), null);
  for (const value of [state.altitude, state.azimuth, state.noonAltitude, state.moon.altitude, state.moon.phase]) assert.ok(Number.isFinite(value), String(value));
  assert.ok(['morning', 'day', 'dusk', 'night'].includes(state.bucket));
});

test('sky settings: off by default, normalised, stored under one key; minute ticks align', () => {
  assert.deepEqual(normalizeSkySettings(null), { place: 'clock', realWeather: false, locationSource: 'manual' });
  assert.deepEqual(normalizeSkySettings({ place: '../x', realWeather: 'yes' }), { place: 'clock', realWeather: false, locationSource: 'manual' });
  assert.deepEqual(normalizeSkySettings({ place: 'tokyo', realWeather: true, locationSource: 'manual' }), { place: 'tokyo', realWeather: true, locationSource: 'manual' });
  const store = new Map(), storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.deepEqual(readSkySettings(storage), { place: 'clock', realWeather: false, locationSource: 'manual' });
  writeSkySettings({ place: 'beijing' }, storage); assert.deepEqual(JSON.parse(store.get(SKY_SETTINGS_KEY)), { place: 'beijing', realWeather: false, locationSource: 'manual' });
  store.set(SKY_SETTINGS_KEY, '{oops'); assert.deepEqual(readSkySettings(storage), { place: 'clock', realWeather: false, locationSource: 'manual' });
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

test('custom place keeps v1 settings compatible, validates IANA timezone, and binds solar sky to rounded coordinates', async () => {
  const { normalizeCustomPlace, resolveSkyCity, placeDescription } = await import('./sky-cities.mjs');
  const { normalizeSkySettings } = await import('./sky-clock.mjs');
  const customPlace = { name: '我的城市', lat: '-33.8688', lng: '151.2093', zone: 'Australia/Sydney', country: '澳大利亚', admin1: '新南威尔士州' };
  const settings = normalizeSkySettings({ place: 'custom', realWeather: true, customPlace });
  const city = resolveSkyCity(settings.place, 'Asia/Shanghai', settings.customPlace);
  assert.equal(city.name, '我的城市'); assert.equal(city.lat, -33.87); assert.equal(city.zone, 'Australia/Sydney');
  assert.match(placeDescription(city), /新南威尔士州/);
  for (const patch of [{ lat: '' }, { lat: 91 }, { lng: 181 }, { zone: 'Invalid/Zone' }, { name: '' }]) assert.equal(normalizeCustomPlace({ ...customPlace, ...patch }), null);
  assert.deepEqual(normalizeSkySettings({ place: 'shanghai', realWeather: false, locationSource: 'manual' }), { place: 'shanghai', realWeather: false, locationSource: 'manual' });
});
