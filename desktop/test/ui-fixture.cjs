'use strict';
const fs = require('node:fs');
const path = require('node:path');
const albums = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/albums.json')));
async function mountFixture(application, site, options = {}) {
  const items = options.items || albums;
  await application.evaluate(({ app, webContents, safeStorage, net }, { items, results, slowCover, music, coverResponse, autoMusic }) => {
    const require = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/main.cjs');
    const path = require('node:path');
    const { createSiteRouter } = require(path.join(app.getAppPath(), 'site-router.cjs'));
    const session = webContents.getAllWebContents().find((c) => c.getURL().startsWith('https://album-circle.vercel.app')).session;
    let musicService;
    if (music) {
      const { createMusicService } = require(path.join(app.getAppPath(), 'music-service.cjs'));
      const wav = Buffer.alloc(44 + 44100 * 2 * 20); wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(44100, 24); wav.writeUInt32LE(88200, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
      globalThis.__qaMusicResolves = []; globalThis.__qaMusicSearches = 0; globalThis.__qaMACommands = [];
      const fake = { handleQQSearch: async () => [], handleSearch: async () => { globalThis.__qaMusicSearches++; return [{ id: '12345', name: items[0].tracks[0], artist: items[0].artist, album: { name: items[0].title } }, { id: '67890', name: items[0].tracks[0] + '（现场版）', artist: items[0].artist, album: { name: '现场演出' } }]; }, handleQQSongUrl: async (_cookie, id) => { globalThis.__qaMusicResolves.push(id); if (id === items[0].trackDetails[2].providerId) return { playable: false, message: '本机测试：此曲需要平台会员权限。' }; return { playable: true, url: 'https://ws.stream.qqmusic.qq.com/qa.wav' }; }, normalizeLoginInfo: () => ({}), handleSongUrl: async (id) => { globalThis.__qaMusicResolves.push(id); return { playable: true, url: 'https://m7.music.126.net/qa.wav', trial: false }; }, audioProxyHeadersFor: (_url, range) => ({ Range: range }) };
      if (autoMusic) {
        const trackFor = (query) => items[0].tracks.find((name) => query.endsWith(name)) || items[0].tracks[0];
        fake.handleSearch = async (query) => { globalThis.__qaMusicSearches++; return [{ id: '99999', name: trackFor(query), artist: items[0].artist, album: { name: items[0].title } }, { id: '12345', name: trackFor(query), artist: items[0].artist, album: { name: items[0].title } }, { id: '67890', name: trackFor(query) + '（现场版）', artist: items[0].artist, album: { name: '现场演出' } }]; };
        const originalURL = fake.handleSongUrl;
        fake.handleSongUrl = async (id) => { if (id === '99999') { globalThis.__qaMusicResolves.push(id); return { playable: false, message: '测试：不可播放的候选' }; } return originalURL(id); };
      }
      let maState = 'idle';
      // Local folder with two silent WAV files, and a fake system player.
      const { createLocalMusic } = require(path.join(app.getAppPath(), 'local-music.cjs'));
      const fsModule = require('node:fs'), folder = path.join(app.getPath('userData'), 'qa-music', 'QA 本地专辑');
      fsModule.mkdirSync(folder, { recursive: true }); for (const name of ['01 晨光.wav', '02 夜雨.wav']) fsModule.writeFileSync(path.join(folder, name), wav);
      const localMusic = createLocalMusic({ directory: app.getPath('userData') });
      globalThis.__qaLocalReady = localMusic.addFolder(path.dirname(folder));
      globalThis.__qaSystemCommands = []; let systemPlaying = true;
      const nowPlaying = { async get() { return { available: true, active: true, app: 'Spotify', title: '晴天', artist: '周杰伦', album: '叶惠美', albumArtist: '周杰伦', playing: systemPlaying, position: 12, duration: 269, artwork: '' }; }, async control(action) { globalThis.__qaSystemCommands.push(action); if (action === 'toggle') systemPlaying = !systemPlaying; return { ok: true }; }, stop() {} };
      musicService = createMusicService({ directory: app.getPath('userData'), safeStorage, localMusic, nowPlaying, login: async () => ({ ok: false }), logout: async () => {}, upstream: fake, fetch: async (_url, options) => {
        if (_url === 'http://127.0.0.1:8095/api') {
          if (options.headers.Authorization !== 'Bearer QA_MA_TOKEN') return Response.json({}, { status: 401 });
          const command = JSON.parse(options.body); globalThis.__qaMACommands.push(command);
          if (command.command === 'players/all') return Response.json([{ player_id: 'qa-speaker', display_name: '测试音箱', available: true }]);
          if (command.command === 'music/search') return Response.json({ tracks: [{ item_id: 'ma-track-1', uri: 'library://track/ma-track-1', name: items[0].tracks[0], artists: [{ name: items[0].artist }], album: { name: items[0].title } }] });
          if (command.command === 'player_queues/play_media' || command.command === 'players/cmd/play') maState = 'playing';
          if (command.command === 'players/cmd/pause') maState = 'paused'; if (command.command === 'players/cmd/stop') maState = 'idle';
          if (command.command === 'players/get') return Response.json({ playback_state: maState, corrected_elapsed_time: 3, current_media: { title: items[0].tracks[0], artist: items[0].artist, duration: 20 } });
          return Response.json(null);
        }
        const from = /^bytes=(\d+)-/.exec(options.headers.Range || ''), start = from ? Number(from[1]) : 0;
        return new Response(wav.subarray(start), { status: start ? 206 : 200, headers: { 'content-type': 'audio/wav', 'content-length': String(wav.length - start), 'accept-ranges': 'bytes', ...(start ? { 'content-range': `bytes ${start}-${wav.length - 1}/${wav.length}` } : {}) } });
      } });
      app.once('before-quit', () => musicService.stop());
    }
    // An in-memory collection stands in for collection.json so tests never touch real data.
    const store = { items: items.map((item, index) => ({ addedAt: new Date(Date.UTC(2026, 8, 30) - index * 86400000).toISOString(), ...item })) };
    globalThis.__qaBlockedWrites = 0; globalThis.__qaCollectionWrites = [];
    const collection = {
      list: () => store.items,
      add(body) { const item = { ...body, id: 'qa-added-' + store.items.length, addedAt: new Date().toISOString() }; store.items = [item, ...store.items]; globalThis.__qaCollectionWrites.push(['add', item.title]); return { item }; },
      update(id, patch) { const index = store.items.findIndex((item) => item.id === id); if (index < 0) throw new Error('这张专辑已经不在唱片架上了。'); store.items[index] = { ...store.items[index], ...patch }; globalThis.__qaCollectionWrites.push(['update', id]); return { item: store.items[index] }; },
      remove(id) { store.items = store.items.filter((item) => item.id !== id); globalThis.__qaCollectionWrites.push(['remove', id]); return { ok: true }; },
      importItems: () => ({ added: 0, total: store.items.length })
    };
    const imageWait = new Promise((resolve) => { globalThis.__qaReleaseImage = resolve; });
    const router = createSiteRouter({ webRoot: path.join(app.getAppPath(), 'web'), qq: { search: async () => ({ candidates: results }) }, collection, catalog: async () => Response.json({ candidates: results }), forward: (request) => session.fetch(request, { bypassCustomProtocolHandlers: true }), ...(musicService ? { music: (request, pathname) => musicService.proxy(request, pathname, (target, init) => net.fetch(target, init)) } : {}) });
    session.protocol.unhandle('https');
    session.protocol.handle('https', async (request) => {
      const url = new URL(request.url);
      if (url.searchParams.has('qa-broken-cover')) return new Response('', { status: 404 });
      if (slowCover && url.searchParams.has('qa-slow-cover')) await imageWait;
      if (coverResponse && url.pathname === '/qa-colour.png') return new Response(Buffer.from(coverResponse.split(',')[1], 'base64'), { headers: { 'Content-Type': 'image/png' } });
      return router(request);
    });
  }, { items, results: options.searchResults || [items[0]], slowCover: options.slowCover === true, music: options.music === true, coverResponse: options.coverResponse, autoMusic: options.autoMusic === true });
  await site.reload(); await site.locator('.app-titlebar').waitFor(); await site.locator('.cabin-room').waitFor();
  return { items };
}
// Exercise the public picker, then verify the rendered scene rather than
// relying on the retired two-way style toggle.
async function chooseRoomScene(site, sceneId) {
  const { getRoomScene } = await import('../../src/scene-catalog.mjs');
  const scene = getRoomScene(sceneId);
  if (scene.id !== sceneId) throw new Error(`Unknown scene in test: ${sceneId}`);
  await site.getByRole('button', { name: '设置', exact: true }).click();
  await site.getByRole('tab', { name: '房间与桌宠', exact: true }).click();
  const picker = site.getByRole('dialog', { name: '设置', exact: true }); // 布置小屋 opens 设置 › 房间与桌宠 (PR #16)
  await picker.getByRole('button', { name: `选择场景 ${scene.label}`, exact: true }).click();
  await picker.getByRole('button', { name: '回到小屋', exact: true }).click();
  await site.locator(`.cabin-scene[data-room-look="${sceneId}"]`).waitFor();
}
async function useWarmCabin(site) { await chooseRoomScene(site, 'warm'); }
module.exports = { mountFixture, albums, chooseRoomScene, useWarmCabin };
