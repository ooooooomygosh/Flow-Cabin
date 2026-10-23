'use strict';
const { createPetPackStore, createPetPackRoute } = require('../../desktop/pet-pack.cjs');
// The same music service and platform adapters shipped by Windows Portable.
const http = require('node:http'), crypto = require('node:crypto');
const { createWeather } = require('../../desktop/weather.cjs');
const { createWeatherApi } = require('../../desktop/weather-api.cjs');
const { createLanService } = require('../../desktop/lan-service.cjs');
const path = require('node:path');
const { createMusicService } = require('../../desktop/music-service.cjs');
const { createQQMusic, extractLink, isQQUrl } = require('../../desktop/qq-music.cjs');
const { searchCatalog } = require('../../desktop/catalog-search.mjs');

async function startCabinBackend({ directory, token, safeStorage, upstream, fetch = globalThis.fetch }) {
  let nextLogin = null;
  const lan = createLanService({ directory: path.join(directory, 'lan-sync') });
  const music = createMusicService({ directory, safeStorage, ...(upstream ? { upstream } : {}), fetch,
    login: async provider => { const entry = nextLogin; nextLogin = null; return entry?.provider === provider ? { ok: true, cookie: entry.cookie } : { ok: false, cancelled: true }; }, logout: async () => {} });
  const petStore=createPetPackStore({directory:path.join(directory,'pet-packs')}), petRoute=createPetPackRoute({store:petStore});
  const qq = createQQMusic(fetch);
  const weather = createWeather({ directory, safeStorage, fetch, publish: () => {} });
  const weatherApi = createWeatherApi({ fetch, weather });
  const json = (res, value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  const server = http.createServer(async (req, res) => {
    const supplied = Buffer.from(String(req.headers['x-cabin-native-token'] || '')), expected = Buffer.from(token);
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return json(res, { error: 'Unauthorized' }, 401);
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const chunks = []; let bytes = 0; const limit = url.pathname.startsWith('/pets/') ? 23 * 1024 * 1024 : url.pathname.startsWith('/sync/') ? 8 * 1024 * 1024 : 32768;
      for await (const chunk of req) { bytes += chunk.length; if (bytes > limit) return json(res, { error: 'Too large' }, 413); chunks.push(chunk); }
      const body = Buffer.concat(chunks).toString('utf8');
      if (url.pathname.startsWith('/pets/')) {
        if(url.pathname==='/pets/remove' && req.method==='POST'){await petStore.remove(JSON.parse(body).id);return json(res,{ok:true});}
        const request=new Request('http://127.0.0.1/desktop-pets'+url.pathname.slice('/pets'.length),{method:req.method,...(req.method==='POST'?{body,headers:{'Content-Type':'application/json'}}:{})});
        const response=await petRoute(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
      }
      if (url.pathname.startsWith('/sync/')) {
        const request = new Request('http://127.0.0.1' + req.url, { method: req.method, ...(req.method === 'POST' ? { body } : {}) });
        const response = await lan.routeLocal(request, url.pathname.slice('/sync'.length));
        res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text()); return;
      }
      if (url.pathname.startsWith('/weather/')) {
        const request = new Request('http://127.0.0.1' + req.url, { method: req.method, ...(req.method === 'POST' ? { body } : {}) });
        const response = await weatherApi.route(request, url.pathname.slice('/weather'.length));
        res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text()); return;
      }
      if (req.method === 'POST' && url.pathname === '/native/session') {
        const data = JSON.parse(body); if (!['qq', 'netease'].includes(data.provider) || typeof data.cookie !== 'string' || data.cookie.length > 16384) return json(res, { error: 'Invalid session' }, 400);
        if (!data.cookie) { await music.logout(data.provider); return json(res, { ok: true }); }
        nextLogin = data; return json(res, await music.login(data.provider));
      }
      if (req.method === 'GET' && url.pathname === '/catalog') {
        const link = url.searchParams.get('link') || extractLink(url.searchParams.get('term'));
        if (url.searchParams.get('provider') === 'qq' || isQQUrl(link)) return json(res, await qq.search(url.searchParams));
        const response = await searchCatalog(url.searchParams); return json(res, await response.json(), response.status);
      }
      if (!url.pathname.startsWith('/music/')) return json(res, { error: 'Not found' }, 404);
      const headers = new Headers(); if (req.headers.range) headers.set('range', req.headers.range);
      const request = new Request('http://127.0.0.1' + req.url, { method: req.method, headers, ...(req.method === 'POST' ? { body } : {}) });
      const response = await music.proxy(request, url.pathname.slice(6) + url.search, fetch);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) { res.once('close', () => response.body.cancel().catch(() => {})); for await (const chunk of response.body) { if (res.destroyed) break; if (!res.write(chunk)) await new Promise(resolve => { const done = () => { res.off('drain', done); res.off('close', done); resolve(); }; res.once('drain', done); res.once('close', done); if (res.destroyed) done(); }); } }
      res.end();
    } catch { if (!res.headersSent) json(res, { error: '音乐服务请求失败，请检查网络、登录与播放权限后重试。' }, 502); else res.destroy(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { port: server.address().port, music, lan, stop: () => { lan.stop(); weather.dispose(); music.stop(); server.closeAllConnections(); server.close(); } };
}
module.exports = { startCabinBackend };
if (globalThis.cabinOptions) {
  const fs = require('node:fs');
  // NCM reads its anonymous token on import; keep its cache private to this app.
  process.env.TMPDIR = globalThis.cabinOptions.cache;
  fs.mkdirSync(process.env.TMPDIR, { recursive: true });
  const anonymous = require('node:path').join(process.env.TMPDIR, 'anonymous_token'); if (!fs.existsSync(anonymous)) fs.writeFileSync(anonymous, '');
  startCabinBackend({ ...globalThis.cabinOptions, safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: text => Buffer.from(globalThis.cabinEncrypt(text), 'base64'),
    decryptString: data => globalThis.cabinDecrypt(data.toString('base64'))
  } }).then(service => { globalThis.cabinStop = service.stop; globalThis.cabinReady(service.port); }, error => globalThis.cabinFailed(String(error?.stack || error)));
}
