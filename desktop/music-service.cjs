'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), http = require('node:http');
const { safeAudioURL, serverURL, candidate } = require('./music-policy.cjs');
const { createPlaylistLibrary } = require('./playlists.cjs');
// Requested tier; the platform answers with the best tier the account may
// play (VIP → FLAC, guest → 128k) and the deck shows that actual tier.
const QUALITIES = ['standard', 'exhigh', 'lossless'];
const SEARCH_CACHE_MS = 60000, SEARCH_FAILURE_MS = 20000;
const QUALITY_OPTIONS = [{ id: 'standard', label: '标准 · 128k' }, { id: 'exhigh', label: '高品质 · 320k' }, { id: 'lossless', label: '无损 · FLAC' }];
function createMusicService({ directory, safeStorage, login, logout, upstream = require('./music-upstream.cjs'), fetch = globalThis.fetch, nowPlaying = null, localMusic = null, appleMusic = null, localApps = null }) {
  const token = crypto.randomBytes(32).toString('hex'), streams = new Map(), cache = new Map(), pending = new Map(), activeStreams = new Set(), accountVersions = { qq: 0, netease: 0 };
  let revision = 0;
  const prefsPath = path.join(directory, 'music.json'); let preferences = { maURL: '', maToken: '', playerId: '', qq: '', netease: '', quality: 'exhigh' }, server, port, opening;
  try { preferences = { ...preferences, ...JSON.parse(fs.readFileSync(prefsPath, 'utf8')) }; } catch {}
  const decode = (value) => { try { return value ? safeStorage.decryptString(Buffer.from(value, 'base64')) : ''; } catch { return ''; } };
  function invalidate() { revision++; cache.clear(); streams.clear(); for (const controller of activeStreams) controller.abort(); activeStreams.clear(); }
  function save(next) { fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(prefsPath + '.tmp', JSON.stringify(next), { mode: 0o600 }); fs.renameSync(prefsPath + '.tmp', prefsPath); preferences = next; invalidate(); }
  const encrypt = (value) => {
    if (!value) return '';
    if (!safeStorage.isEncryptionAvailable() || safeStorage.getSelectedStorageBackend?.() === 'basic_text') throw new Error('本机安全凭据存储不可用，无法保存平台登录。');
    return safeStorage.encryptString(value).toString('base64');
  };
  const playlists = createPlaylistLibrary({ upstream, cookies: (provider) => decode(preferences[provider]), fetch });
  // Account playlists are read on demand; a changed login discards the answer.
  async function guarded(task) { const currentRevision = revision; const result = await task(); if (currentRevision !== revision) throw new Error('平台登录已更改，请重新打开歌单。'); return result; }
  const quality = () => QUALITIES.includes(preferences.quality) ? preferences.quality : 'exhigh';
  const config = () => ({ quality: quality(), qualities: QUALITY_OPTIONS, appleMusicAvailable: Boolean(appleMusic?.available), localApps: localApps?.status() || {}, qqLoggedIn: Boolean(decode(preferences.qq)), neteaseLoggedIn: Boolean(decode(preferences.netease)), maURL: preferences.maURL, maTokenSet: Boolean(decode(preferences.maToken)), playerId: preferences.playerId });
  async function ma(command, args = {}) {
    if (!preferences.maURL || !decode(preferences.maToken)) throw new Error('请在音源设置中配置 Music Assistant 服务器与访问令牌。');
    const response = await fetch(serverURL(preferences.maURL) + '/api', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'Authorization': 'Bearer ' + decode(preferences.maToken), 'Content-Type': 'application/json' }, body: JSON.stringify({ command, args }) });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Music Assistant 令牌无效或权限不足。' : 'Music Assistant 请求失败，请检查服务器与播放器。');
    const result = await response.json(); if (result?.error_code || result?.error) throw new Error('Music Assistant 无法执行此操作。'); return result?.result ?? result;
  }
  async function search(provider, query, scope = '') {
    if (provider === 'appleMusic' && scope === 'catalog') { if (!appleMusic?.available) throw new Error('系统 Apple Music 仅支持 macOS。'); return (await appleMusic.catalog(query)).map((value) => candidate(value, 'appleMusic')).filter((v) => v.id && v.title); }
    const currentRevision = revision;
    const key = provider + ':' + query, old = cache.get(key);
    if (old && Date.now() - old.time < (old.error ? SEARCH_FAILURE_MS : SEARCH_CACHE_MS)) { if (old.error) throw new Error(old.error); return old.items; }
    // One upstream request per query at a time: a prefetch and the deck asking
    // for the same track share it instead of doubling the load on the platform.
    if (pending.has(key)) return pending.get(key);
    const task = searchUpstream(provider, query, currentRevision).finally(() => pending.delete(key));
    pending.set(key, task);
    return task;
  }
  async function searchUpstream(provider, query, currentRevision) {
    const key = provider + ':' + query;
    let values;
    try {
      if (provider === 'qq') values = upstream.searchQQSongs ? await upstream.searchQQSongs(query, 8) : await upstream.handleQQSearch(decode(preferences.qq), query, 8);
      else if (provider === 'netease') values = await upstream.handleSearch(query, 8, decode(preferences.netease));
      else if (provider === 'ma') values = (await ma('music/search', { search_query: query, media_types: ['track'], limit: 8 })).tracks || [];
      else if (provider === 'appleMusic') { if (!appleMusic?.available) throw new Error('系统 Apple Music 仅支持 macOS。'); return (await appleMusic.search(query)).map((value) => candidate(value, 'appleMusic')); }
      else if (provider === 'local') { if (!localMusic) throw new Error('本地音乐不可用。'); return localMusic.search(query).map((value) => candidate(value, 'local')); }
      else throw new Error('不支持此音乐来源。');
    } catch (error) {
      // A platform refusing searches (QQ 2001, timeouts) is remembered briefly,
      // so skipping through an album does not keep hitting it every second.
      if (currentRevision === revision && (provider === 'qq' || provider === 'netease')) remember(key, { time: Date.now(), error: error.message });
      throw error;
    }
    if (currentRevision !== revision) throw new Error('音源设置已更改，请重新搜索。');
    const items = values.map((value) => candidate(value, provider)).filter((v) => v.id && v.title);
    remember(key, { time: Date.now(), items }); return items;
  }
  function remember(key, entry) { cache.delete(key); cache.set(key, entry); if (cache.size > 64) cache.delete(cache.keys().next().value); }
  async function resolve(body, requestActive = () => true) {
    const currentRevision = revision;
    const ensureCurrent = () => { if (currentRevision !== revision || !requestActive()) throw new Error('播放请求或音源设置已更改，请重新播放。'); };
    const { provider } = body; const id = String(body.id || '');
    if (provider === 'ma') {
      if (!preferences.playerId) throw new Error('请先在音源设置中选择 Music Assistant 播放器。');
      if (!/^\w[\w.-]*:\/\/track\/.{1,800}$/.test(String(body.uri || ''))) throw new Error('请搜索并选择 Music Assistant 的原始曲目。');
      await ma('player_queues/play_media', { queue_id: preferences.playerId, media: body.uri, option: 'replace' }); return { remote: true, provider, playerId: preferences.playerId };
    }
    if (provider === 'appleMusic') { if (!appleMusic?.available) throw new Error('系统 Apple Music 仅支持 macOS。'); return appleMusic.play(id); }
    if (provider === 'local') {
      if (!localMusic?.track(id)) throw new Error('找不到这首本地歌曲，请在音源设置中重新扫描文件夹。');
      return { provider, audioPath: '/desktop-music/local/audio/' + id, trial: false, quality: '本地文件' };
    }
    if (!id || id.length > 64 || (provider === 'qq' ? !/^[a-z\d]+$/i.test(id) : !/^\d+$/.test(id))) throw new Error('曲目 ID 无效，请重新搜索选择。');
    let result;
    if (provider === 'qq') {
      const cookie = decode(preferences.qq);
      let mediaMid = /^[a-z\d]{14}$/i.test(String(body.mediaMid || '')) ? String(body.mediaMid) : '';
      if (!mediaMid && upstream.getQQMediaMid) {
        try {
          const found = await upstream.getQQMediaMid(cookie, id);
          if (/^[a-z\d]{14}$/i.test(found || '')) mediaMid = found;
        } catch { /* Keep the existing song-mid filename fallback when detail lookup is unavailable. */ }
        ensureCurrent();
      }
      result = await upstream.handleQQSongUrl(cookie, id, mediaMid, quality(), body.fee);
    }
    else if (provider === 'netease') {
      const cookie = decode(preferences.netease);
      const info = upstream.getNeteaseLoginInfo ? await upstream.getNeteaseLoginInfo(cookie) : { loggedIn: false };
      if (currentRevision !== revision) throw new Error('音源设置已更改，请重新播放。');
      result = await upstream.handleSongUrl(id, info, quality(), cookie);
    }
    else throw new Error('不支持此音乐来源。');
    ensureCurrent();
    if (!result?.url || result.playable === false) throw new Error(result.message || '此歌曲暂时不可播放，请检查登录、会员权限或地区限制。');
    // QQ can list a CDN outside our boundary first, followed by a supported
    // mirror for the same track. Keep the boundary and select a validated URL.
    const source = safeAudioURL(result.url) ? result : provider === 'qq' && Array.isArray(result.candidates) && result.candidates.find((value) => value?.playable !== false && safeAudioURL(value?.url));
    if (!source) throw new Error('音频地址不属于已支持的音乐平台。');
    const streamId = crypto.randomBytes(24).toString('hex'); streams.set(streamId, { url: source.url, provider, time: Date.now() }); if (streams.size > 40) streams.delete(streams.keys().next().value);
    return { provider, audioPath: '/desktop-music/audio/' + streamId, trial: Boolean(source.trial ?? result.trial), quality: source.quality || result.quality || '标准音质', requestedQuality: quality() };
  }
  // Local files: byte ranges are served only for tracks in the scanned index.
  function localFile(req, res, file, type) {
    let size; try { size = fs.statSync(file).size; } catch { return json(res, { error: '文件已移动或删除，请重新扫描。' }, 404); }
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    let start = 0, end = size - 1;
    if (req.headers.range) {
      if (!range || (!range[1] && !range[2])) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
      if (range[1]) { start = Number(range[1]); if (range[2]) end = Math.min(size - 1, Number(range[2])); } else start = Math.max(0, size - Number(range[2]));
      if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
    }
    res.writeHead(req.headers.range ? 206 : 200, { 'Content-Type': type, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', ...(req.headers.range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) });
    if (req.method === 'HEAD' || size === 0) return res.end();
    const stream = fs.createReadStream(file, { start, end }); stream.on('error', () => res.destroy()); res.once('close', () => stream.destroy()); stream.pipe(res);
  }
  const json = (res, value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  async function body(req) { let text = ''; for await (const chunk of req) { text += chunk; if (text.length > 32768) throw new Error('请求内容过大。'); } return text ? JSON.parse(text) : {}; }
  async function stream(req, res, id) {
    const value = streams.get(id); if (!value || Date.now() - value.time > 2 * 60 * 60 * 1000) return json(res, { error: '播放链接已过期，请重新播放。' }, 410);
    const range = req.headers.range || ''; if (range && !/^bytes=\d*-\d*$/.test(range)) return json(res, { error: 'Invalid range' }, 416);
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
    activeStreams.add(controller);
    res.once('close', () => controller.abort());
    try {
      const response = await fetch(value.url, { signal: controller.signal, redirect: 'manual', headers: upstream.audioProxyHeadersFor(value.url, range) }); clearTimeout(timer);
      if (![200, 206].includes(response.status) || !response.body) return json(res, { error: '平台音频暂时不可用。' }, 502);
      const headers = { 'Content-Type': response.headers.get('content-type') || 'audio/mpeg', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
      for (const name of ['content-length', 'content-range']) if (response.headers.get(name)) headers[name] = response.headers.get(name);
      res.writeHead(response.status, headers);
      for await (const chunk of response.body) {
        if (res.destroyed || controller.signal.aborted) break;
        if (!res.write(chunk)) await new Promise((resolve) => {
          const done = () => { res.off('drain', done); res.off('close', done); controller.signal.removeEventListener('abort', done); resolve(); };
          res.once('drain', done); res.once('close', done); controller.signal.addEventListener('abort', done, { once: true });
          if (res.destroyed || controller.signal.aborted) done();
        });
      }
      if (!res.destroyed) { if (controller.signal.aborted) res.destroy(); else res.end(); }
    } finally { clearTimeout(timer); controller.abort(); activeStreams.delete(controller); }
  }
  async function route(req, res) {
    const supplied = Buffer.from(String(req.headers['x-album-music-token'] || '')); const expected = Buffer.from(token);
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return json(res, { error: 'Unauthorized' }, 401);
    const origin = req.headers.origin; if (origin && origin !== 'https://album-circle.vercel.app') return json(res, { error: 'Forbidden origin' }, 403);
    const url = new URL(req.url, 'http://127.0.0.1');
    try {
      if (req.method === 'GET' && url.pathname === '/config') return json(res, config());
      if (req.method === 'POST' && url.pathname === '/config') { const value = await body(req); const maURL = value.maURL ? serverURL(String(value.maURL)) : ''; const playerId = String(value.playerId || '').slice(0, 160); const maToken = value.clearToken ? '' : value.maToken ? encrypt(String(value.maToken).slice(0, 8192)) : maURL === preferences.maURL ? preferences.maToken : ''; save({ ...preferences, maURL, maToken, playerId }); return json(res, config()); }
      if (req.method === 'POST' && url.pathname === '/quality') { const value = String((await body(req)).quality || ''); if (!QUALITIES.includes(value)) throw new Error('不支持此音质。'); save({ ...preferences, quality: value }); return json(res, config()); }
      if (req.method === 'GET' && url.pathname === '/apple/permission') return json(res, appleMusic ? await appleMusic.permission() : { available: false, granted: false });
      if (req.method === 'GET' && url.pathname === '/apple/playlists') { if (!appleMusic?.available) throw new Error('系统 Apple Music 仅支持 macOS。'); return json(res, await appleMusic.playlists()); }
      if (req.method === 'GET' && url.pathname === '/apple/playlist') { if (!appleMusic?.available) throw new Error('系统 Apple Music 仅支持 macOS。'); return json(res, await appleMusic.tracks(String(url.searchParams.get('id') || ''))); }
      if (req.method === 'GET' && url.pathname === '/apple/state') { if (!appleMusic?.available) throw new Error('系统 Apple Music 仅支持 macOS。'); return json(res, await appleMusic.state()); }
      if (req.method === 'POST' && url.pathname === '/apple/control') { if (!appleMusic?.available) throw new Error('系统 Apple Music 仅支持 macOS。'); const input = await body(req); return json(res, await appleMusic.control(String(input.action || ''), input.expectedTrack)); }
      if (req.method === 'POST' && url.pathname === '/open-local') { if (!localApps) throw new Error('本机音乐 App 打开功能不可用。'); return json(res, await localApps.open(await body(req))); }
      if (req.method === 'GET' && url.pathname === '/search') return json(res, { candidates: await search(url.searchParams.get('provider'), String(url.searchParams.get('query') || '').slice(0, 300), String(url.searchParams.get('scope') || '')) });
      if (req.method === 'GET' && url.pathname === '/playlists') return json(res, await guarded(() => playlists.list(String(url.searchParams.get('provider') || ''))));
      if (req.method === 'GET' && url.pathname === '/playlist') {
        const offset = Number(url.searchParams.get('offset') || 0);
        if ((offset || url.searchParams.has('revision')) && url.searchParams.get('revision') !== String(revision)) throw new Error('平台登录或设置已更改，请重新打开歌单。');
        return json(res, await guarded(async () => ({ ...(await playlists.tracks(String(url.searchParams.get('provider') || ''), String(url.searchParams.get('id') || ''), { offset })), revision })));
      }
      if (req.method === 'POST' && url.pathname === '/playlist/link') return json(res, await guarded(async () => ({ ...(await playlists.link(String((await body(req)).url || ''))), revision })));
      if (req.method === 'POST' && url.pathname === '/resolve') return json(res, await resolve(await body(req), () => !res.destroyed && !req.aborted));
      if (req.method === 'GET' && url.pathname.startsWith('/audio/')) return await stream(req, res, url.pathname.slice(7));
      if (req.method === 'GET' && url.pathname === '/now-playing') return json(res, nowPlaying ? await nowPlaying.get() : { available: false, active: false });
      if (req.method === 'POST' && url.pathname === '/now-playing/control') { if (!nowPlaying) throw new Error('系统正在播放不可用。'); return json(res, await nowPlaying.control(String((await body(req)).action || ''))); }
      if (localMusic && req.method === 'GET' && url.pathname === '/local/summary') return json(res, localMusic.summary());
      if (localMusic && req.method === 'GET' && url.pathname === '/local/albums') return json(res, { albums: localMusic.albums(), ...localMusic.summary() });
      if (localMusic && req.method === 'POST' && url.pathname === '/local/rescan') return json(res, await localMusic.rescan());
      if (localMusic && req.method === 'POST' && url.pathname === '/local/remove-folder') return json(res, await localMusic.removeFolder(String((await body(req)).path || '')));
      if (localMusic && ['GET', 'HEAD'].includes(req.method) && url.pathname.startsWith('/local/audio/')) { const track = localMusic.track(url.pathname.slice(13)); return track ? localFile(req, res, track.file, track.type) : json(res, { error: '找不到这首本地歌曲。' }, 404); }
      if (localMusic && req.method === 'GET' && url.pathname.startsWith('/local/cover/')) { const file = localMusic.coverPath(url.pathname.slice(13)); return file && fs.existsSync(file) ? localFile(req, res, file, 'image/jpeg') : json(res, { error: 'Not found' }, 404); }
      if (req.method === 'GET' && url.pathname === '/ma/players') { const players = await ma('players/all'); return json(res, { players: (Array.isArray(players) ? players : Object.values(players)).filter((p) => p.available !== false).map((p) => ({ id: p.player_id, name: p.display_name || p.name || p.player_id })) }); }
      if (req.method === 'GET' && url.pathname === '/ma/state') { const player = await ma('players/get', { player_id: preferences.playerId }); return json(res, { state: player.playback_state || player.state, title: player.current_media?.title || '', artist: player.current_media?.artist || '', elapsed: player.corrected_elapsed_time || player.current_media?.elapsed_time || player.elapsed_time || 0, duration: player.current_media?.duration || 0 }); }
      if (req.method === 'POST' && url.pathname === '/ma/control') { const value = await body(req), commands = { pause: 'players/cmd/pause', play: 'players/cmd/play', stop: 'players/cmd/stop' }; if (!commands[value.action]) throw new Error('不支持此播放操作。'); await ma(commands[value.action], { player_id: preferences.playerId }); return json(res, { ok: true }); }
      return json(res, { error: 'Not found' }, 404);
    } catch (error) { if (!res.headersSent) json(res, { error: error.message || '音源请求失败。' }, 502); else if (!res.destroyed) res.destroy(); }
  }
  async function start() { if (port) return port; if (opening) return opening; opening = new Promise((resolve, reject) => { server = http.createServer(route); server.on('error', reject); server.listen(0, '127.0.0.1', () => { port = server.address().port; resolve(port); }); }); return opening; }
  async function proxy(request, pathname, netFetch) {
    const currentPort = await start(), headers = { 'x-album-music-token': token }; if (request.headers.get('range')) headers.Range = request.headers.get('range');
    if (!['GET', 'POST', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
    if (request.method === 'POST') headers['Content-Type'] = 'application/json';
    return netFetch('http://127.0.0.1:' + currentPort + pathname, { method: request.method, headers, ...(request.method === 'POST' ? { body: await request.text() } : {}), signal: request.signal });
  }
  return { start, proxy, config,
    async login(provider) {
      if (!['qq', 'netease'].includes(provider)) throw new Error('不支持此平台。');
      const version = ++accountVersions[provider], result = await login(provider);
      if (version !== accountVersions[provider]) return { ok: false, cancelled: true, error: '' };
      if (result.ok && result.cookie) save({ ...preferences, [provider]: encrypt(result.cookie) });
      return { ok: Boolean(result.ok && result.cookie), cancelled: Boolean(result.cancelled), error: result.error || result.message || '' };
    },
    async logout(provider) {
      if (!['qq', 'netease'].includes(provider)) throw new Error('不支持此平台。');
      accountVersions[provider]++;
      // Invalidate local credentials and in-flight playback even if browser cleanup fails.
      save({ ...preferences, [provider]: '' });
      await logout(provider);
    },
    stop() { accountVersions.qq++; accountVersions.netease++; invalidate(); nowPlaying?.stop(); server?.closeAllConnections(); server?.close(); server = null; port = null; opening = null; }
  };
}
module.exports = { createMusicService, QUALITIES, QUALITY_OPTIONS };
