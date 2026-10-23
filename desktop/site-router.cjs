'use strict';
// Serves the cabin app under a fixed virtual origin. Nothing is fetched from
// that origin over the network: pages, the album collection, search and the
// music service are all answered on this computer. The origin stays constant
// so albums, vinyl styles and focus records saved by earlier versions remain.
const fs = require('node:fs');
const path = require('node:path');
const { SITE_ORIGIN } = require('./policy.cjs');
const { extractLink, isQQUrl } = require('./qq-music.cjs');
const { routeCollection } = require('./collection-store.cjs');
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'self'";
const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain' };
const TRUSTED_COVERS = ['y.gtimg.cn', 'coverartarchive.org', 'archive.org'];

function isTrustedCover(image) {
  const host = TRUSTED_COVERS.some((host) => image.hostname === host || image.hostname.endsWith(`.${host}`)) || /^is[1-5]-ssl\.mzstatic\.com$/.test(image.hostname);
  return host && image.protocol === 'https:' && !image.username && !image.password && !image.port;
}

function createSiteRouter({ webRoot, forward, qq, music, collection, catalog, lan, pets, weatherApi, getAppearance = () => ({}) }) {
  const files = new Map();
  function list(directory, prefix = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const relative = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) list(path.join(directory, entry.name), relative);
      else files.set(relative, path.join(directory, entry.name));
    }
  }
  list(webRoot);
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  return async function route(request) {
    const url = new URL(request.url);
    // Other hosts are catalog artwork and similar public resources.
    if (url.origin !== SITE_ORIGIN) return forward(request);
    if (url.pathname.startsWith('/desktop-weather/')) return weatherApi ? weatherApi.route(request, url.pathname.slice('/desktop-weather'.length)) : json({ error: '天气服务暂不可用' }, 503);
    if (url.pathname.startsWith('/desktop-pets/')) return pets ? pets(request) : json({ error: '桌宠动画包暂不可用' }, 503);
    if (url.pathname.startsWith('/desktop-sync/')) return lan ? lan.routeLocal(request, url.pathname.slice('/desktop-sync'.length)) : json({ error: '局域网同步暂不可用' }, 503);
    if (request.method === 'GET' && url.pathname === '/desktop-bootstrap.js') {
      const settings = getAppearance();
      return new Response(`(() => { const settings = ${JSON.stringify(settings)}; window.albumDesktopCapabilities = ${JSON.stringify({ lanSync: Boolean(lan), petPacks: typeof pets === 'function' })}; window.albumDesktopAppearance = settings; document.documentElement.dataset.desktopClient = 'true'; document.documentElement.dataset.desktopReduceMotion = String(settings.reduceMotion === true); })();`, { headers: { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' } });
    }
    if (url.pathname === '/api/items' || url.pathname === '/api/items/import') return collection ? routeCollection(collection, request) : json({ error: '收藏暂不可用。' }, 503);
    if (request.method === 'GET' && url.pathname === '/api/search') {
      const link = url.searchParams.get('link') || extractLink(url.searchParams.get('term'));
      if (url.searchParams.get('provider') === 'qq' || isQQUrl(link)) {
        try { return json(await qq.search(url.searchParams)); }
        catch (error) { return json({ error: error.name === 'TimeoutError' ? 'QQ 音乐响应超时，请稍后重试。' : error.message }, 502); }
      }
      if (link) return json({ error: '目前支持 QQ 专辑链接精确识别；其他平台请用名称搜索。' }, 400);
      if (!catalog) return json({ error: '曲库搜索暂不可用。' }, 503);
      return catalog(url.searchParams);
    }
    if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    if (url.pathname.startsWith('/desktop-music/')) return music ? music(request, url.pathname.slice('/desktop-music'.length) + url.search) : json({ error: '音源服务暂不可用。' }, 503);
    if (request.method === 'GET' && url.pathname === '/desktop-image') {
      let image;
      try { image = new URL(url.searchParams.get('url')); } catch { return new Response('Invalid cover', { status: 400 }); }
      if (!isTrustedCover(image)) return new Response('Unsupported cover host', { status: 400 });
      try {
        // Validate every redirect before making the next request, not just its first URL.
        const signal = AbortSignal.timeout(18000); let response;
        for (let redirects = 0; redirects <= 5; redirects++) {
          response = await forward(new Request(image.href, { credentials: 'omit', redirect: 'manual', signal }));
          if (![301, 302, 303, 307, 308].includes(response.status)) break;
          const location = response.headers.get('location'); await response.body?.cancel();
          if (!location || redirects === 5) return new Response('Cover unavailable', { status: 502 });
          image = new URL(location, image.href);
          if (!isTrustedCover(image)) return new Response('Unsupported cover redirect', { status: 400 });
        }
        const type = response.headers.get('content-type')?.split(';')[0];
        if (!response.ok || !/^image\/(png|jpeg|webp|gif|avif)$/.test(type || '')) return new Response('Cover unavailable', { status: 502 });
        const reader = response.body.getReader(), chunks = []; let bytes = 0;
        while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 8 * 1024 * 1024) { await reader.cancel(); return new Response('Cover too large', { status: 413 }); } chunks.push(value); }
        return new Response(Buffer.concat(chunks), { headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' } });
      } catch { return new Response('Cover unavailable', { status: 502 }); }
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
    const file = files.get(url.pathname === '/' ? '/index.html' : url.pathname);
    if (!file) return new Response('Not found', { status: 404 });
    let content = request.method === 'HEAD' ? null : fs.readFileSync(file);
    if (file.endsWith('index.html') && content) content = Buffer.from(content.toString().replace('</head>', '<script src="/desktop-bootstrap.js"></script></head>'));
    return new Response(content, {
      headers: { 'Content-Type': `${mimeTypes[path.extname(file)] || 'application/octet-stream'}; charset=utf-8`, 'Content-Security-Policy': CSP, 'Cache-Control': 'no-store' }
    });
  };
}

module.exports = { createSiteRouter, CSP };
