'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWeatherApi } = require('../weather-api.cjs');
const result = { name: '悉尼', latitude: -33.8688, longitude: 151.2093, timezone: 'Australia/Sydney', country: '澳大利亚', admin1: '新南威尔士州', admin2: '悉尼市' };
test('city search is fixed-host, bounded, rounded and preserves real administrative divisions and timezone', async () => {
  const calls = [];
  const api = createWeatherApi({ fetch: async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify({ results: [result, { ...result, timezone: 'invalid/zone' }] })); } });
  const places = await api.search('悉尼');
  assert.deepEqual(places, [{ lat: -33.87, lng: 151.21, name: '悉尼', zone: 'Australia/Sydney', country: '澳大利亚', admin1: '新南威尔士州', admin2: '悉尼市' }]);
  assert.equal(new URL(calls[0].url).hostname, 'geocoding-api.open-meteo.com'); assert.equal(calls[0].options.redirect, 'error');
  await api.search('悉尼'); assert.equal(calls.length, 1);
  await assert.rejects(api.search('https://attacker.test/?q=key'), /查询太快/);
});
test('weather routes expose measurements and no credentials, reject cross-origin writes and invalid searches', async () => {
  const api = createWeatherApi({ fetch: async () => new Response('{}'), weather: { state: () => ({ temperature: 20, feelsLike: 18, humidity: 71 }), set: async value => value.enabled ? { temperature: 21 } : null } });
  assert.deepEqual(await (await api.route(new Request('https://cabin.test/desktop-weather/status'), '/status')).json(), { report: { temperature: 20, feelsLike: 18, humidity: 71 } });
  const request = new Request('https://cabin.test/desktop-weather/set', { method: 'POST', headers: { origin: 'https://other.test' }, body: '{}' });
  assert.equal((await api.route(request, '/set')).status, 403);
  for (const name of ['', 'a', 'x'.repeat(81)]) await assert.rejects(api.search(name));
});
