'use strict';
const { validPlace } = require('./weather.cjs');
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
function normalizeLocation(value) {
  const coords = validPlace(value?.latitude, value?.longitude);
  if (!coords || typeof value.name !== 'string' || !value.name.trim() || typeof value.timezone !== 'string') return null;
  try { new Intl.DateTimeFormat('en', { timeZone: value.timezone }).format(0); } catch { return null; }
  const result = { ...coords, name: value.name.slice(0, 80), zone: value.timezone };
  for (const key of ['admin1', 'admin2', 'country']) if (typeof value[key] === 'string') result[key] = value[key].slice(0, 80);
  return result;
}
function createWeatherApi({ fetch, weather, location, now = Date.now }) {
  const cache = new Map(); let lastSearch = -Infinity;
  async function search(name) {
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) throw new Error('请输入 2 至 80 字的城市或地区名称');
    name = name.trim(); const hit = cache.get(name);
    if (hit && now() - hit.at < 30 * 60000) return hit.results;
    if (now() - lastSearch < 1000) throw new Error('查询太快，请稍等一秒'); lastSearch = now();
    const url = new URL(GEOCODE); url.searchParams.set('name', name); url.searchParams.set('count', '10'); url.searchParams.set('language', 'zh'); url.searchParams.set('format', 'json');
    const response = await fetch(url.href, { redirect: 'error', signal: AbortSignal.timeout(10000), headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error('地点查询暂不可用，请稍后重试或手动输入坐标');
    // Read a bounded body when a native Response stream is available.
    let value;
    if (response.body) { const chunks = []; let bytes = 0; for await (const chunk of response.body) { bytes += chunk.length; if (bytes > 256 * 1024) { await response.body.cancel().catch(() => {}); throw new Error('地点响应过大'); } chunks.push(chunk); } value = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    else value = await response.json();
    const results = (Array.isArray(value?.results) ? value.results : []).slice(0, 10).map(normalizeLocation).filter(Boolean);
    if (cache.size >= 100) cache.delete(cache.keys().next().value); cache.set(name, { at: now(), results }); return results;
  }
  async function route(request, subpath) {
    const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    try {
      const url = new URL(request.url), origin = request.headers.get('origin');
      if (origin && origin !== url.origin) return json({ error: 'Forbidden' }, 403);
      if (request.method === 'POST' && subpath === '/location' && location) return json(await location.request());
      if (request.method === 'GET' && subpath === '/search') return json({ results: await search(url.searchParams.get('name')) });
      if (request.method === 'GET' && subpath === '/provider') return json(weather.profile());
      if (request.method === 'POST' && subpath === '/provider') { const body = await request.text(); if (body.length > 2048) throw Error('配置过长'); return json(await weather.configure(JSON.parse(body))); }
      if (request.method === 'GET' && subpath === '/status') return json({ report: weather?.state() || null });
      if (request.method === 'POST' && subpath === '/set' && weather) { const body = await request.text(); if (body.length > 1024) throw new Error('地点设置过长'); return json({ report: await weather.set(JSON.parse(body)) }); }
      return json({ error: 'Not found' }, 404);
    } catch (e) { return json({ error: e.message }, 400); }
  }
  return { search, route };
}
module.exports = { createWeatherApi, normalizeLocation };
