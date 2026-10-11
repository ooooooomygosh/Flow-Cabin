/** Offline renderer integration suite. Run: node scripts/browser-smoke.mjs
 * Requires root+desktop npm ci and Chromium (BROWSER_EXECUTABLE overrides path).
 * Native OS integration, real accounts, and live platform playback are NOT tested.
 * Fixtures never call external services or read a user's profile/collection.
 */
import assert from 'node:assert/strict';
import { verifyOnboarding } from './onboarding-checks.mjs';
import { verifyCabinLayout, verifyCabinToolActions, verifyFocusLayout } from './cabin-layout-checks.mjs';
import { neteasePlaylists, playlistDetail } from './playlist-fixture.mjs';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'desktop/package.json'));
const { chromium } = require('playwright');
const output = path.resolve(process.env.BROWSER_OUTPUT || path.join(root, 'desktop/test-results/browser'));
await fs.mkdir(output, { recursive: true });
const port = Number(process.env.BROWSER_PORT || 4179), origin = `http://127.0.0.1:${port}`;
const report = { startedAt: new Date().toISOString(), fixtureData: true, nativeIntegrationTested: false, realAccountsUsed: false, checks: [], screenshots: [], pageErrors: [], consoleErrors: [], failedRequests: [], unexpectedRequests: [], apiCalls: [], skipped: [] };
let browser, page, server;
const check = (name, details = {}) => { report.checks.push({ name, passed: true, ...details }); console.log('PASS ' + name); };
const cover = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#355d6a"/><circle cx="64" cy="64" r="38" fill="#df9b68"/><circle cx="64" cy="64" r="13" fill="#23323b"/></svg>')}`;
let items = Array.from({ length: 18 }, (_, i) => ({ id: `fixture-${i}`, type: 'album', title: i === 0 ? '晨光本地唱片' : `测试唱片 ${i + 1}`, artist: 'Fixture Artist', year: '2026', cover: i === 2 ? '' : cover, source: 'manual', tracks: ['晨光', '夜雨'], trackDetails: ['abcdef0123456789', 'fedcba9876543210'].map((id, index) => ({ title: index ? '夜雨' : '晨光', source: 'local', providerId: id })), addedAt: new Date(Date.UTC(2026, 9, 8) - i * 86400000).toISOString() }));
const wav = Buffer.alloc(44 + 22050 * 2 * 15); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(22050, 24); wav.writeUInt32LE(44100, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
for (let i = 0; i < (wav.length - 44) / 2; i++) wav.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 220 / 22050) * 1200), 44 + i * 2);
let quality = 'exhigh', rematch = '', localOpens = [], rematchResolves = [];
let playlistRevision = false;
let systemPlaying = true, localAlbumCalls = 0, neteaseLoggedIn = false; const systemCommands = [];
const screenshot = async (name) => { await page.screenshot({ path: path.join(output, name + '.png'), animations: 'disabled' }); report.screenshots.push(name + '.png'); };
const closeDialog = () => page.keyboard.press('Escape');
try {
  server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = ''; server.stdout.on('data', b => serverLog += b); server.stderr.on('data', b => serverLog += b);
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin)).ok) break; } catch {} if (server.exitCode !== null) throw new Error(serverLog); if (i === 99) throw new Error('Vite startup timed out: ' + serverLog); await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || (process.env.CI ? chromium.executablePath() : await fs.access('/usr/bin/chromium').then(() => true, () => false) ? '/usr/bin/chromium' : chromium.executablePath()), headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'zh-CN', reducedMotion: 'reduce' });
  await context.addInitScript(() => { window.__desktopCommands = []; window.__cabinPlayback = []; window.addEventListener('cabin:playback', e => window.__cabinPlayback.push({ ...e.detail, at: performance.now() })); window.open = url => { window.__desktopCommands.push(String(url)); return null; }; window.albumDesktopAppearance = { client: true, reduceMotion: true }; const init = () => { document.documentElement.dataset.desktopClient = 'true'; document.documentElement.dataset.desktopReduceMotion = 'true'; }; if (document.documentElement) init(); else new MutationObserver((_, o) => { if (document.documentElement) { init(); o.disconnect(); } }).observe(document, { childList: true }); });
  const routeHandler = async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { report.unexpectedRequests.push(request.url()); return route.abort('blockedbyclient'); }
    const p = url.pathname, body = request.postDataJSON?.() || {};
    const json = value => route.fulfill({ json: value });
    if (p.startsWith('/api/') || p.startsWith('/desktop-music/')) report.apiCalls.push({ method: request.method(), path: p, id: url.searchParams.get('id') });
    if (p === '/api/items/import') { let added = 0; for (const item of body.items || []) if (!items.some(i => i.id === item.id)) { items.push(item); added++; } return json({ added, total: items.length }); }
    if (p === '/api/items') {
      if (request.method() === 'GET') return json({ items });
      if (request.method() === 'POST') { const duplicate = body.externalIds?.playlist && items.find(i => i.externalIds?.playlist === body.externalIds.playlist); if (duplicate) return json({ item: duplicate, duplicate: true }); const item = { ...body, id: `added-${items.length}`, addedAt: new Date().toISOString() }; items.unshift(item); return json({ item }); }
      const id = url.searchParams.get('id');
      if (request.method() === 'PATCH') { const item = items.find(i => i.id === id); if (!item) return route.fulfill({ status: 404, json: { error: 'Fixture album no longer exists' } }); Object.assign(item, body); return json({ item }); }
      if (request.method() === 'DELETE') { items = items.filter(i => i.id !== id); return json({ ok: true }); }
    }
    if (p === '/api/search') return json({ candidates: [{ ...items[0], id: 'search-result', title: '搜索找到的专辑' }] });
    if (p === '/desktop-music/apple/permission') return json({ available: true, granted: false, needsPermission: true, error: 'Fixture: automation permission not granted' });
    if (p === '/desktop-music/config') return json({ qqLoggedIn: false, neteaseLoggedIn, maURL: '', playerId: '', quality, qualities: [{ id: 'standard', label: '标准 · 128k' }, { id: 'exhigh', label: '高品质 · 320k' }, { id: 'lossless', label: '无损 · FLAC' }] });
    if (p === '/desktop-music/quality') { quality = body.quality; return json({ qqLoggedIn: false, neteaseLoggedIn, maURL: '', playerId: '', quality }); }
    if (p === '/desktop-music/open-local') { localOpens.push(body); return json({ opened: true, app: 'QQ 音乐', via: 'web', installed: false, playingInCabin: false }); }
    if (rematch && p === '/desktop-music/resolve') { rematchResolves.push(body.id); if (rematch === 'all-fail' || body.id === 'fixture-vip') return json({ error: 'QQ 音乐没有给当前版本返回播放地址' }); return json({ audioPath: '/desktop-music/local/audio/' + body.id, trial: false, quality: '320k MP3' }); }
    if (rematch && p === '/desktop-music/search') return json({ candidates: [{ id: 'fixture-vip', title: '晨光', artist: 'Fixture Artist', provider: url.searchParams.get('provider'), album: '晨光本地唱片' }, { id: 'fixture-stream', title: '晨光', artist: 'Fixture Artist', provider: url.searchParams.get('provider'), album: 'Fixture' }, { id: 'fixture-live', title: '晨光 (Live)', artist: 'Fixture Artist', provider: url.searchParams.get('provider') }] });
    if (p === '/desktop-music/playlists') return json({ loggedIn: true, provider: 'netease', user: 'Fixture', playlists: neteasePlaylists.map(({ cover, ...entry }) => entry) });
    const bare = (detail) => ({ ...detail, playlist: { ...detail.playlist, cover: '' }, tracks: detail.tracks.map(({ cover, ...track }) => track) });
    if (p === '/desktop-music/playlist') { const detail = bare(playlistDetail(url.searchParams.get('id'))); if (playlistRevision) detail.tracks[0] = { ...detail.tracks[0], artist: 'Updated Artist', providerId: '999001' }; return json(detail); }
    if (p === '/desktop-music/playlist/link') return json({ ...bare(playlistDetail('9003', 'qq')), provider: 'qq' });
    if (p === '/desktop-music/local/summary') return json({ folders: [{ name: 'Fixture Music', path: '/fixture/music' }], albumCount: 1, trackCount: 2 });
    if (p === '/desktop-music/local/albums') return json(localAlbumCalls++ % 2 ? { albums: [{ id: '0123456789abcdef', title: '残缺资料' }, null] } : {}); // malformed on purpose: {} then an album without tracks
    if (p === '/desktop-music/resolve') return json({ audioPath: '/desktop-music/local/audio/' + body.id, trial: false });
    if (p.startsWith('/desktop-music/local/audio/')) return route.fulfill({ contentType: 'audio/wav', body: wav, headers: { 'accept-ranges': 'bytes' } });
    if (p === '/desktop-music/search' && (url.searchParams.get('query') || '').includes('晴天')) return json({ candidates: [{ id: 'abcdef0123456789', title: '晴天', artist: '周杰伦', album: '叶惠美', provider: url.searchParams.get('provider') }] }); // sources.mjs testPlayback track
    if (p === '/desktop-music/search') return json({ candidates: [{ id: 'fixture-stream', title: '晨光', artist: 'Fixture Artist', provider: url.searchParams.get('provider'), album: 'Fixture' }] });
    if (p === '/desktop-music/now-playing') return json({ available: true, active: true, playing: systemPlaying, title: '系统测试歌曲', artist: 'Fixture Artist', album: '系统测试专辑', app: 'Spotify', position: 1, duration: 180 });
    if (p === '/desktop-music/now-playing/control') { systemCommands.push(body.action); if (body.action === 'toggle') systemPlaying = !systemPlaying; return json({ ok: true }); }
    if (p.startsWith('/api/') || p.startsWith('/desktop-music/')) { report.unexpectedRequests.push(p); return route.fulfill({ status: 500, json: { error: 'Unimplemented fixture ' + p } }); }
    return route.continue();
  };
  await context.route('**/*', routeHandler);
  const welcomeRoute = route => new URL(route.request().url()).pathname === '/api/items' ? route.fulfill({ json: { items: [] } }) : routeHandler(route);
  await verifyOnboarding({ browser, origin, routeHandler: welcomeRoute, evidence: output, output, check });
  context.on('page', watched => { watched.on('pageerror', error => report.pageErrors.push(error.message)); watched.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); }); watched.on('requestfailed', request => { if (request.failure()?.errorText !== 'net::ERR_ABORTED') report.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }); }); });
  page = await context.newPage(); page.setDefaultTimeout(12000); await page.clock.install({ time: new Date('2026-10-08T10:00:00Z') });
  /* context captures errors across the main, wallpaper and pet renderers. */
  await page.goto(origin); await page.locator('.room-record').first().waitFor(); check('renderer-mounts-with-offline-collection');
  await verifyCabinLayout({ page, check }); await verifyCabinToolActions({ page, check });
  for (const [width, height] of [[1440, 900], [960, 600]]) { await page.setViewportSize({ width, height }); await screenshot(`cabin-${width}x${height}`); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'page must not overflow horizontally'); check(`viewport-${width}x${height}`); }
  await page.setViewportSize({ width: 1440, height: 900 });
  const { ROOM_SCENES } = await import('../src/scene-catalog.mjs');
  const { PETS } = await import('../src/pet/pet-catalog.mjs');
  assert.equal(ROOM_SCENES.length, 6); assert.equal(PETS.length, 5);
  await page.getByRole('button', { name: '布置小屋', exact: true }).click();
  for (const scene of ROOM_SCENES) {
    await page.getByRole('button', { name: `选择场景 ${scene.label}`, exact: true }).click();
    assert.equal(await page.locator('.cabin-scene').getAttribute('data-room-look'), scene.id);
    assert.equal(await page.getByRole('button', { name: `选择场景 ${scene.label}`, exact: true }).getAttribute('aria-pressed'), 'true');
  }
  for (const pet of PETS) { await page.getByRole('button', { name: `选择桌宠 ${pet.name || pet.label}`, exact: true }).click(); assert.equal(await page.locator('.room-cat .pixel-cat').getAttribute('data-pet-id'), pet.id); }
  await screenshot('room-personalization');
  await page.setViewportSize({ width: 960, height: 600 }); await screenshot('room-personalization-960x600'); await page.getByRole('button', { name: '回到小屋', exact: true }).click();
  for (const scene of ROOM_SCENES) { await page.getByRole('button', { name: '布置小屋', exact: true }).click(); await page.getByRole('button', { name: `选择场景 ${scene.label}`, exact: true }).click(); await closeDialog(); await screenshot(`scene-${scene.id}-960x600`); }
  await page.reload(); await page.locator('.room-record').first().waitFor(); assert.equal(await page.locator('.cabin-scene').getAttribute('data-room-look'), ROOM_SCENES.at(-1).id); assert.equal(await page.locator('.room-cat .pixel-cat').getAttribute('data-pet-id'), PETS.at(-1).id); check('all-scenes-and-pets-select-and-persist');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: '添加专辑', exact: true }).click(); await page.getByRole('tab', { name: '手动填写' }).click(); await page.getByLabel('专辑名', { exact: true }).fill('QA 新唱片'); await page.getByLabel('歌手', { exact: true }).fill('QA Artist'); await page.getByLabel('曲目', { exact: true }).fill('第一首\n第二首'); await page.getByRole('button', { name: '放上唱片架' }).click(); await page.getByText('《QA 新唱片》已放上唱片架。', { exact: true }).waitFor(); await closeDialog(); assert(items.some(i => i.title === 'QA 新唱片')); assert.match(items.find(i => i.title === 'QA 新唱片').cover, /^data:image\/png;base64,/, 'manual album without cover gets a pixel cover'); check('collection-create-manual');
  await page.locator('.room-record').first().click(); await page.getByRole('button', { name: '唱片卡片', exact: true }).click(); await page.getByLabel('我的笔记').fill('持久化测试笔记'); await page.getByLabel('我的笔记').blur(); await page.getByText('已保存在这台电脑', { exact: true }).waitFor(); assert(items.some(i => i.notes === '持久化测试笔记')); await page.getByRole('button', { name: '移除', exact: true }).click(); await page.getByRole('button', { name: '确认移除' }).click(); await page.getByRole('dialog').waitFor({ state: 'hidden' }); assert(!items.some(i => i.title === 'QA 新唱片')); check('collection-update-notes-and-delete');
  await page.getByRole('button', { name: '添加专辑', exact: true }).click(); await page.getByRole('searchbox').fill('测试'); await page.getByRole('button', { name: '搜索', exact: true }).click(); await page.locator('.add-results li').first().waitFor(); await screenshot('catalog-results'); await closeDialog(); check('catalog-search-fixture');
  await page.locator('.room-record').first().dblclick(); await page.getByLabel('唱机音源', { exact: true }).selectOption('local'); await page.waitForFunction(() => { const a = document.querySelector('audio'); return a && !a.paused && a.currentTime > .2 && a.duration > 10; }); check('actual-generated-wav-decodes-and-plays'); await page.getByRole('button', { name: '下一首展示曲目' }).click(); await page.waitForFunction(() => document.querySelector('audio').src.endsWith('fedcba9876543210')); check('local-next-track-resolves-exact-id');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cabin:player-command', { detail: { action: 'pause' } }))); await page.waitForFunction(() => document.querySelector('audio').paused);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cabin:player-command', { detail: { action: 'play' } }))); await page.waitForFunction(() => !document.querySelector('audio').paused);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cabin:player-command', { detail: { action: 'previous' } }))); await page.waitForFunction(() => document.querySelector('audio').src.endsWith('abcdef0123456789'));
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cabin:player-command', { detail: { action: 'next' } }))); await page.waitForFunction(() => document.querySelector('audio').src.endsWith('fedcba9876543210') && !document.querySelector('audio').paused); check('player-command-event-drives-the-deck');
  // Player: cabin:playback signal (analyser energy), keyboard shortcuts, 待播 queue.
  await page.waitForFunction(() => window.__cabinPlayback?.some(d => d.playing && !d.estimated && d.energy > .02 && d.track?.index === 1));
  const signal = await page.evaluate(() => window.__cabinPlayback);
  assert(signal.some(d => d.reason === 'track' && d.track.index === 1)); assert(signal.every(d => d.energy >= 0 && d.energy <= 1 && typeof d.playing === 'boolean'));
  const ticks = signal.filter(d => d.reason === 'energy').map(d => d.at); if (ticks.length > 3) { const gaps = ticks.slice(1).map((t, i) => t - ticks[i]); assert(Math.min(...gaps) >= 50, 'energy ticks are throttled to ~15fps'); }
  check('cabin-playback-event-carries-real-analyser-energy');
  await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('Space'); await page.waitForFunction(() => document.querySelector('audio').paused && window.__cabinPlayback.at(-1).playing === false);
  await page.keyboard.press('m'); assert.equal(await page.locator('audio').evaluate(a => a.muted), true); await page.keyboard.press('m'); assert.equal(await page.locator('audio').evaluate(a => a.muted), false);
  await page.keyboard.press('Space'); await page.waitForFunction(() => !document.querySelector('audio').paused);
  await page.keyboard.press('Shift+ArrowLeft'); await page.waitForFunction(() => document.querySelector('.turntable-track').textContent.startsWith('01'));
  check('keyboard-space-mute-and-previous');
  await page.locator('.room-record').nth(1).click(); await page.getByRole('button', { name: '加入待播' }).click(); await page.getByRole('button', { name: '已在待播' }).waitFor();
  await page.getByRole('button', { name: '待播唱片 1 张' }).click(); await page.locator('.player-queue li', { hasText: '测试唱片 2' }).waitFor(); await screenshot('player-queue'); await page.getByRole('button', { name: '待播唱片 1 张' }).click();
  check('queue-adds-selected-album');
  // Album import from picked files (session playback) + pixel covers.
  await page.getByRole('button', { name: '添加专辑', exact: true }).click(); await page.getByRole('tab', { name: '本地音乐' }).click();
  await page.getByRole('tab', { name: '手动填写' }).click(); await page.getByRole('tab', { name: '本地音乐' }).click(); // {} first, then a partial album
  await page.locator('.add-results[aria-label="本地专辑"] li', { hasText: '残缺资料' }).getByText('未知歌手 · 0 首').waitFor(); check('local-music-empty-or-partial-response-renders');
  await page.getByLabel('选择音乐文件', { exact: true }).setInputFiles([{ name: '01 - Fixture Band - 晨雾.wav', mimeType: 'audio/wav', buffer: wav }, { name: '02 - Fixture Band - 夜灯.wav', mimeType: 'audio/wav', buffer: wav }]);
  const fileAlbum = page.locator('.file-import .add-results li').first(); await fileAlbum.locator('img.add-cover').waitFor(); await fileAlbum.getByText('Fixture Band · 2 首').waitFor(); await screenshot('file-import');
  await fileAlbum.getByRole('button', { name: '放上唱片架' }).click(); await page.getByText('《未命名专辑》已放上唱片架。', { exact: true }).waitFor(); await closeDialog();
  const picked = items.find(i => i.externalIds?.fileAlbum); assert(picked, 'picked-file album saved'); assert.match(picked.cover, /^data:image\/png;base64,/); assert.deepEqual(picked.tracks, ['晨雾', '夜灯']); assert(picked.trackDetails[0].lengthMillis > 10000);
  await page.reload(); await page.locator('.room-record').first().waitFor();
  check('files-import-with-tags-from-names-durations-and-pixel-cover');
  // After a reload the object URLs are gone: the deck explains instead of failing silently.
  await page.locator('.room-record').first().dblclick(); await page.locator('.player-error', { hasText: '重新打开小屋后需要再选一次文件' }).waitFor(); check('session-files-explain-reload-honestly');
  await page.getByRole('button', { name: '添加专辑', exact: true }).click(); await page.getByRole('tab', { name: '本地音乐' }).click();
  await page.getByLabel('选择音乐文件', { exact: true }).setInputFiles([{ name: '01 - Fixture Band - 晨雾.wav', mimeType: 'audio/wav', buffer: wav }, { name: '02 - Fixture Band - 夜灯.wav', mimeType: 'audio/wav', buffer: wav }]);
  await page.getByRole('button', { name: '重新连上文件' }).click(); await page.locator('.add-notice').waitFor(); await closeDialog();
  await page.getByRole('button', { name: '重试' }).click(); await page.waitForFunction(() => { const a = document.querySelector('audio'); return a.src.startsWith('blob:') && !a.paused && a.currentTime > .2; });
  check('relinked-session-files-play-from-blob');
  await page.getByRole('button', { name: '选择 Fixture Artist 的 测试唱片 4', exact: true }).click(); await page.getByRole('button', { name: '唱片卡片', exact: true }).click(); await page.getByRole('button', { name: '像素封面' }).click();
  await page.getByRole('img', { name: /像素封面预览/ }).waitFor(); await page.getByText('已把原封面转成小屋配色的像素画。', { exact: true }).waitFor(); await screenshot('record-pixel-cover'); await page.getByRole('button', { name: '用这张' }).click(); await page.getByRole('button', { name: '恢复原封面' }).waitFor();
  const pixelled = items.find(i => i.originalCover); assert.match(pixelled.cover, /^data:image\/png;base64,/); assert.equal(pixelled.originalCover, cover);
  await page.getByRole('button', { name: '恢复原封面' }).click(); await page.getByText('已恢复原封面。', { exact: true }).waitFor(); assert.equal(pixelled.cover, cover); await closeDialog();
  check('record-card-pixel-cover-preview-apply-and-restore');
  items = items.filter(i => !i.externalIds?.fileAlbum); await page.reload(); await page.locator('.room-record').first().waitFor(); // later checks count the 18 fixture albums
  await page.getByLabel('唱机音源', { exact: true }).selectOption('system'); await page.locator('.turntable-track', { hasText: '系统测试歌曲' }).waitFor(); assert.equal(await page.locator('audio').getAttribute('src'), null); await page.getByRole('button', { name: '暂停系统播放器' }).click(); await page.getByRole('button', { name: '继续系统播放器' }).waitFor(); await page.getByRole('button', { name: '系统播放器下一首' }).click(); assert.deepEqual(systemCommands, ['toggle', 'next']); check('system-source-and-transport-mocked'); await page.getByLabel('唱机音源', { exact: true }).selectOption('visual');
  await page.getByRole('button', { name: '音源设置', exact: true }).click(); await page.locator('.music-local-status', { hasText: '1 张专辑 · 2 首歌曲' }).waitFor(); await screenshot('music-settings'); const sourceBefore = await page.getByLabel('唱机音源', { exact: true }).inputValue(); await page.locator('.music-account', { hasText: 'QQ 音乐' }).getByRole('button', { name: '在唱机上用' }).click(); await page.getByLabel('唱机正在使用 QQ 音乐').waitFor(); await closeDialog(); assert.equal(await page.getByLabel('唱机音源', { exact: true }).inputValue(), 'qq'); await page.getByLabel('唱机音源', { exact: true }).selectOption(sourceBefore); check('music-settings-offline-account-and-local-status'); check('music-settings-use-source-on-deck');
  // Seamless playback: stored source fails → automatic rematch plays the best candidate (no picker), with the chosen quality shown honestly.
  await page.getByRole('button', { name: '音源设置', exact: true }).click(); await page.getByLabel('音质', { exact: true }).selectOption('lossless'); await page.waitForFunction(() => document.querySelector('select[aria-label="音质"]')?.value === 'lossless'); await closeDialog(); assert.equal(quality, 'lossless');
  rematch = 'vip'; rematchResolves.length = 0; await page.locator('.room-record').nth(1).dblclick(); await page.getByLabel('唱机音源', { exact: true }).selectOption('qq');
  await page.waitForFunction(() => { const a = document.querySelector('audio'); return a && !a.paused && a.src.endsWith('fixture-stream'); }); assert.equal(await page.locator('.turntable-matches').count(), 0, 'no manual picker when a match plays');
  assert.deepEqual(rematchResolves.slice(0, 2), ['fixture-vip', 'fixture-stream']); assert(!rematchResolves.includes('fixture-live'), 'a live version is never auto-played');
  await page.locator('.turntable-status', { hasText: '320k MP3' }).waitFor(); check('qq-rematch-plays-best-candidate-automatically-and-shows-actual-quality');
  rematch = 'all-fail'; await page.getByRole('button', { name: '下一首展示曲目' }).click(); await page.getByRole('button', { name: '在 QQ 音乐中打开' }).click(); await page.locator('.turntable-local-app-notice', { hasText: '小屋不显示进度' }).waitFor(); assert.equal(localOpens[0].provider, 'qq'); assert.equal(await page.evaluate(() => document.querySelector('audio').paused), true, 'the hand-off never pretends the cabin is playing'); check('local-app-fallback-labelled-after-failure');
  rematch = ''; await page.getByLabel('唱机音源', { exact: true }).selectOption(sourceBefore);
  await page.locator('.focus-badge').click(); await page.getByRole('tab', { name: '待办', exact: true }).click(); await page.getByLabel('新的待办').fill('浏览器测试待办'); await page.getByRole('button', { name: '添加待办' }).click(); await page.getByRole('checkbox', { name: '完成：浏览器测试待办' }).check(); assert.equal(await page.locator('.focus-task-list li.is-done').count(), 1); check('focus-tasks-create-and-complete');
  await page.getByRole('tab', { name: '随手记', exact: true }).click(); await page.getByLabel('随手记内容').fill('QA 随手记备份内容'); check('quick-notes-save-local-text');
  await page.getByRole('tab', { name: '番茄钟' }).click(); await page.getByRole('button', { name: '计时设置' }).click(); await page.getByLabel('专注（分）').fill('2'); await page.getByLabel('专注（分）').blur(); await page.getByRole('button', { name: '开始专注' }).click(); await page.clock.fastForward(121000); await page.locator('.focus-phase', { hasText: '短休息' }).waitFor(); await page.getByRole('tab', { name: '统计' }).click(); assert.match(await page.locator('.focus-stat-tiles').innerText(), /2 分钟/); await screenshot('focus-statistics'); check('focus-timer-completes-and-records-session'); await page.locator('.focus-dock-close').click();
  // 学习: a deck, pasted cards, a keyboard review (Space flips, 1–4 rate), a countdown.
  await page.locator('.focus-badge').click(); await page.getByRole('tab', { name: '学习', exact: true }).click();
  await page.getByLabel('新卡组名称').fill('QA 单词'); await page.getByRole('button', { name: '新建', exact: true }).click();
  await page.getByRole('button', { name: '编辑', exact: true }).click(); await page.getByLabel('新卡片').fill('ephemeral - 短暂的\n光合作用：植物利用光能'); await page.getByRole('button', { name: '添加 2 张' }).click(); await page.getByText('添加了 2 张卡片。').waitFor();
  await page.getByLabel('查找这组全部卡片').fill('ephemeral'); assert.equal(await page.locator('.study-card-list li').count(), 1);
  await page.getByRole('button', { name: '编辑卡片 ephemeral', exact: true }).click();
  await page.getByLabel('编辑卡片背面').fill('短暂的；转瞬即逝');
  await screenshot('study-card-editor');
  await page.setViewportSize({ width: 960, height: 600 }); await page.getByLabel('编辑卡片背面').scrollIntoViewIfNeeded(); await screenshot('study-card-editor-960x600');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => { window.__studySetItem = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key.startsWith('album-circle-study-v1:')) throw new Error('fixture quota'); return window.__studySetItem.call(this, key, value); }; });
  await page.getByRole('button', { name: '保存卡片', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '无法保存学习记录' }).waitFor();
  assert.equal(await page.getByLabel('编辑卡片背面').inputValue(), '短暂的；转瞬即逝');
  await page.getByRole('button', { name: '删除卡片 ephemeral', exact: true }).click();
  assert.equal(await page.getByLabel('编辑卡片背面').inputValue(), '短暂的；转瞬即逝');
  await page.getByRole('button', { name: '删除卡组', exact: true }).click(); await page.getByRole('button', { name: '确认删除', exact: true }).click();
  assert.equal(await page.getByLabel('编辑卡片背面').inputValue(), '短暂的；转瞬即逝');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.evaluate(() => { Storage.prototype.setItem = window.__studySetItem; delete window.__studySetItem; });
  await page.getByRole('button', { name: '保存卡片', exact: true }).click();
  await page.getByText('卡片已保存，复习进度保持不变。').waitFor(); await page.getByLabel('查找这组全部卡片').fill('');
  check('study-card-search-and-edit-save');
  await page.getByRole('button', { name: '卡组', exact: true }).click(); await page.locator('.study-deck-open', { hasText: 'QA 单词' }).click();
  await page.locator('.study-card-front', { hasText: 'ephemeral' }).waitFor(); await page.keyboard.press(' '); await page.locator('.study-card-back', { hasText: '短暂的' }).waitFor();
  assert.equal(await page.locator('.study-ratings button').count(), 4); await page.keyboard.press('4'); await page.locator('.study-card-front', { hasText: '光合作用' }).waitFor();
  assert.equal(await page.evaluate(() => document.querySelector('audio')?.paused ?? true), true, 'Space in a review does not start music');
  await page.keyboard.press(' '); await page.keyboard.press('3'); await page.locator('.study-done').waitFor(); await page.getByRole('button', { name: '回到卡组' }).click();
  await page.getByLabel('倒计时名称').fill('期末'); await page.getByLabel('倒计时日期').fill('2026-12-20'); await page.getByRole('button', { name: '添加倒计时' }).click(); await page.locator('.study-countdowns li', { hasText: '期末' }).getByText('73 天').waitFor();
  check('study-flashcards-fsrs-keyboard-review-and-countdown'); await page.locator('.focus-dock-close').click();
  await page.getByRole('button', { name: '设置', exact: true }).click(); await page.getByRole('tab', { name: '数据与备份', exact: true }).click(); await page.getByRole('button', { name: '收藏与备份', exact: true }).click(); const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: '导出备份', exact: true }).click(); const download = await downloadPromise; await download.saveAs(path.join(output, 'fixture-backup.json')); const backup = JSON.parse(await fs.readFile(path.join(output, 'fixture-backup.json'))); assert.equal(backup.kind, 'FlowCabinBackup'); assert.equal(backup.items.length, 18); assert.equal(backup.focus.tasks.length, 1); assert.equal(backup.focus.notes, 'QA 随手记备份内容'); assert.equal(backup.study.cards.length, 2); assert.equal(backup.study.countdowns[0].title, '期末'); check('backup-exports-collection-and-focus');
  await page.getByLabel('导入备份文件').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{invalid') }); await page.getByText('文件内容无法读取。', { exact: true }).waitFor(); check('backup-rejects-malformed-input');
  const imported = { kind: 'FlowCabinBackup', items: [{ ...items[0], id: 'backup-imported', title: '备份导入唱片' }] };
  await page.getByLabel('导入备份文件').setInputFiles({ name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) }); await page.getByText('导入完成：新增 1 张唱片，唱片架现在共有 19 张。', { exact: true }).waitFor(); assert(items.some(i => i.id === 'backup-imported')); check('backup-import-merges-new-album'); await closeDialog();
  await page.getByRole('button', { name: '专辑墙', exact: true }).click(); await page.locator('.wall-library-album').first().click(); await page.waitForFunction(() => { const c = document.querySelector('.wall-canvas-wrap canvas'); return c?.width > 300 && !document.querySelector('.wall-preview-bar').textContent.includes('正在更新'); }); await screenshot('album-wall');
  const pngPromise = page.waitForEvent('download'); await page.getByRole('button', { name: '下载 PNG', exact: true }).click(); const png = await pngPromise; await png.saveAs(path.join(output, 'fixture-album-wall.png')); const pngBytes = await fs.readFile(path.join(output, 'fixture-album-wall.png')); assert.equal(pngBytes.subarray(1, 4).toString(), 'PNG'); assert(pngBytes.length > 1000); check('album-wall-paints-and-downloads-real-png'); await closeDialog();
  await page.keyboard.press('z'); assert(await page.evaluate(() => document.documentElement.classList.contains('room-zen'))); await screenshot('zen-mode'); await page.keyboard.press('Escape'); check('zen-mode-keyboard');
  // 我的歌单: account playlists, link import, file import; a playlist plays like an album.
  neteaseLoggedIn = true;
  await page.getByRole('button', { name: '我的歌单', exact: true }).click();
  await page.getByRole('tab', { name: /网易云音乐/ }).click();
  await page.locator('.playlist-card', { hasText: '深夜写作' }).click(); await page.locator('.playlist-hero h3', { hasText: '深夜写作' }).waitFor();
  assert.equal(await page.locator('.playlist-track').count(), 12); await screenshot('playlist-detail');
  await page.getByLabel('在歌单中查找').fill('laufey'); assert.equal(await page.locator('.playlist-track').count(), 1); await page.getByLabel('在歌单中查找').fill('');
  await page.getByRole('button', { name: '放上唱片架' }).click(); await page.locator('.playlist-notice', { hasText: '已放上唱片架' }).waitFor();
  const savedPlaylist = items.find(i => i.type === 'playlist'); assert(savedPlaylist, 'playlist saved as a shelf record'); assert.equal(savedPlaylist.trackDetails[0].artist, 'Laufey'); assert.equal(savedPlaylist.trackDetails[0].source, 'netease'); assert.equal(savedPlaylist.externalIds.playlist, 'netease:9002');
  await page.getByRole('button', { name: '全部歌单' }).click(); await page.getByRole('tab', { name: /链接与文件/ }).click();
  await page.getByLabel('歌单分享链接').fill('https://y.qq.com/n/ryqq/playlist/9003'); await page.getByRole('button', { name: '读取歌单' }).click(); await page.locator('.playlist-badge', { hasText: 'QQ 音乐' }).waitFor();
  await page.getByRole('button', { name: '全部歌单' }).click();
  await page.locator('.playlist-import input[type=file]').setInputFiles({ name: 'night.m3u8', mimeType: 'audio/x-mpegurl', buffer: Buffer.from('#EXTM3U\n#EXTINF:200,Fixture Artist - 晨光\n/x.mp3\n') });
  await page.locator('.playlist-hero h3', { hasText: 'night' }).waitFor(); assert.equal(await page.locator('.playlist-track').count(), 1);
  await page.getByRole('button', { name: '放上唱机' }).click(); await page.locator('.playlist-dialog').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('.room-turntable')?.dataset.loadedId?.length > 0); assert.match(await page.locator('.turntable-artist').innerText(), /Fixture Artist · 歌单/);
  check('playlists-account-link-and-file-import-play-on-deck');
  // 唱机特写: the close-up opens with T, draws the deck, and Esc returns.
  await page.keyboard.press('t'); await page.locator('.listening-corner .pixel-turntable').waitFor(); await page.waitForTimeout(300); await screenshot('listening-corner');
  assert(await page.locator('.pixel-turntable').evaluate(c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let lit = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) lit++; return lit > c.width * c.height * .5; }), 'deck is painted');
  assert.equal(await page.locator('.corner-tracks li').count(), 1);
  await page.keyboard.press('Escape'); await page.locator('.listening-corner').waitFor({ state: 'detached' });
  check('listening-corner-opens-paints-and-closes');
  // 沉入桌面: one entry point; the page asks the shell and follows cabin:desktop-mode.
  assert.equal(await page.getByRole('button', { name: '设为桌面动态背景' }).count(), 0, 'the old wallpaper entry point is gone');
  assert(await page.evaluate(() => typeof window.cabinDesktop?.enterDesktopMode === 'function' && window.cabinDesktop.getDesktopModeStatus().supported === true), 'public desktop API is installed');
  await page.getByRole('button', { name: '沉入桌面', exact: true }).click();
  assert(await page.evaluate(() => window.__desktopCommands.at(-1) === 'album-desktop://action/desktop-sink-enter'), 'the desktop client asks the shell');
  assert(await page.evaluate(() => window.__desktopCommands.some((value) => value.startsWith('album-desktop://action/tray-pet?id='))), 'the tray follows the room pet');
  await page.evaluate(() => { window.cabinDesktopStatus = { active: true, busy: false, supported: true, via: 'wallpaper', reason: '' }; window.dispatchEvent(new CustomEvent('cabin:desktop-mode', { detail: window.cabinDesktopStatus })); });
  await page.getByRole('button', { name: '浮出桌面', exact: true }).click();
  assert(await page.evaluate(() => window.__desktopCommands.at(-1) === 'album-desktop://action/desktop-sink-exit'));
  await page.evaluate(() => { window.cabinDesktopStatus = { active: false, busy: false, supported: true, via: '', reason: '' }; window.dispatchEvent(new CustomEvent('cabin:desktop-mode', { detail: window.cabinDesktopStatus })); });
  await page.getByRole('button', { name: '沉入桌面', exact: true }).waitFor();
  check('desktop-sink-single-entry-and-api');
  // Fallback layer (no behind-icons desktop): the cabin stays interactive with widgets.
  await page.evaluate(() => { window.cabinDesktopStatus = { active: true, busy: false, supported: true, via: 'window', reason: '桌面背景层暂时无法挂载' }; window.dispatchEvent(new CustomEvent('cabin:desktop-mode', { detail: window.cabinDesktopStatus })); document.documentElement.dataset.desktopMode = 'true'; window.dispatchEvent(new CustomEvent('album-desktop-mode', { detail: { active: true } })); }); // the shell's fallback answer
  await page.locator('.desktop-widgets').waitFor();
  assert(await page.evaluate(() => document.documentElement.classList.contains('room-desktop')));
  assert.equal(await page.locator('.app-titlebar').isVisible(), false);
  for (const name of ['时钟', '正在播放', '专注', '待办']) await page.getByRole('region', { name, exact: true }).waitFor();
  await page.getByLabel('桌面待办', { exact: true }).fill('桌面上的待办'); await page.keyboard.press('Enter'); await page.getByText('桌面上的待办', { exact: true }).waitFor();
  await page.getByRole('button', { name: /移动小组件：待办/ }).focus(); await page.keyboard.press('ArrowLeft');
  assert(await page.evaluate(() => JSON.parse(localStorage.getItem('album-circle-desktop-widgets-v1')).todo.x < .77), 'widget position is remembered');
  await screenshot('desktop-mode');
  await page.getByRole('button', { name: '回到窗口' }).click(); assert(await page.evaluate(() => window.__desktopCommands.at(-1) === 'album-desktop://action/desktop-sink-exit'));
  await page.evaluate(() => { window.cabinDesktopStatus = { active: false, busy: false, supported: true, via: '', reason: '' }; window.dispatchEvent(new CustomEvent('cabin:desktop-mode', { detail: window.cabinDesktopStatus })); document.documentElement.dataset.desktopMode = 'false'; window.dispatchEvent(new CustomEvent('album-desktop-mode', { detail: { active: false } })); });
  await page.locator('.desktop-widgets').waitFor({ state: 'detached' }); await page.locator('.app-titlebar').waitFor();
  check('desktop-mode-widgets-todo-and-layout');
  await page.locator('.turntable-controls').getByRole('button', { name: '取下唱片' }).click();
  items = items.filter(i => i.type !== 'playlist'); neteaseLoggedIn = false; await page.reload(); await page.locator('.room-record').first().waitFor();
  const companion = await page.evaluate(() => window.albumCompanionSnapshot());
  assert.equal(companion.petId, PETS.at(-1).id); assert(companion.room.items.length > 0); check('companion-snapshot-carries-selected-pet-and-room');
  await context.addInitScript(({ companion }) => {
    window.__nativeFixtureCalls = [];
    window.albumWallpaper = { getSnapshot: async () => ({ ...companion.room, focus: companion.focus }), onSnapshot: fn => { window.__pushWallpaper = fn; return () => {}; } };
    window.__miniCalls = [];
    window.albumMini = { getSnapshot: async () => ({ ...companion, track: '雪夜 · 预览', musicPlaying: true }), onSnapshot: () => () => {}, command: v => window.__miniCalls.push(v), player: a => window.__miniCalls.push('player:' + a), exit: () => window.__miniCalls.push('exit') };
    window.albumPet = { getSnapshot: async () => ({ companion, size: 192 }), onSnapshot: fn => { window.__pushPet = fn; return () => {}; }, setHit: v => window.__nativeFixtureCalls.push(['hit', v]), moveBy: (x, y) => window.__nativeFixtureCalls.push(['move', x, y]), dragEnd: () => {}, menu: () => {}, open: () => window.__nativeFixtureCalls.push(['open']) };
  }, { companion });
  const mainPage = page;
  page = await context.newPage(); await page.goto(origin + '/wallpaper.html'); await page.locator('.wallpaper-room').waitFor();
  for (const scene of ROOM_SCENES) {
    await page.evaluate(({ room, look }) => window.__pushWallpaper({ ...room, look }), { room: companion.room, look: scene.id });
    await page.locator(`.cabin-scene[data-room-look="${scene.id}"]`).waitFor(); assert.equal(await page.locator('.room-record').count(), Math.min(companion.room.items.length, scene.geometry.columns.length * scene.geometry.rows.length)); await screenshot(`wallpaper-${scene.id}`);
  }
  check('wallpaper-renderer-all-scenes-mocked-snapshot');
  // The room cat is hidden in the wallpaper while the interactive pet is out (沉入桌面 never shows two pets).
  await page.evaluate(({ room }) => window.__pushWallpaper({ ...room, petOut: true }), { room: companion.room }); await page.waitForTimeout(100);
  assert.equal(await page.locator('.wallpaper-room .room-cat:visible, .wallpaper-room .pixel-cat:visible').count(), 0, 'room cat hidden while the pet is out');
  check('wallpaper-hides-room-cat-while-pet-is-out'); await page.close();
  page = await context.newPage(); await page.setViewportSize({ width: 300, height: 64 }); await page.goto(origin + '/mini.html');
  await page.locator('.mini-bar').waitFor(); await page.getByText('雪夜 · 预览').waitFor();
  assert.equal(await page.locator('.mini-actions').evaluate(e => getComputedStyle(e).opacity), '0', 'controls hidden until hover');
  await page.hover('.mini-bar'); await page.getByRole('button', { name: '上一首' }).click(); await page.getByRole('button', { name: '暂停' }).click(); await page.getByRole('button', { name: '下一首' }).click(); await page.getByRole('button', { name: '浮出桌面' }).click();
  await page.locator('.mini-bar').dblclick({ position: { x: 4, y: 4 } });
  assert.deepEqual(await page.evaluate(() => window.__miniCalls), ['player:previous', 'play-toggle', 'player:next', 'exit', 'exit']); await screenshot('mini-player');
  check('mini-player-hover-controls-and-double-click-exit'); await page.close();
  page = await context.newPage(); await page.setViewportSize({ width: 420, height: 420 }); await page.goto(origin + '/pet.html'); await page.locator('.pet-cat .pixel-cat').waitFor();
  for (const pet of PETS) {
    await page.evaluate(({ companion, petId }) => window.__pushPet({ companion: { ...companion, petId }, size: 192 }), { companion, petId: pet.id });
    await page.locator(`.pet-cat .pixel-cat[data-pet-id="${pet.id}"]`).waitFor(); await screenshot(`desktop-pet-${pet.id}`);
  }
  await page.locator('.pet-cat').press('Enter'); await page.locator('.pet-bubble').waitFor(); check('pet-renderer-all-species-and-keyboard-poke-mocked-bridge'); await page.close(); page = mainPage;
  page = await context.newPage(); page.setDefaultTimeout(12000); await page.setViewportSize({ width: 1280, height: 800 }); await page.goto(origin); await page.locator('.room-record').nth(5).waitFor();
  const stage = () => page.evaluate(() => { const box = s => { const r = document.querySelector(s)?.getBoundingClientRect(); return r && [r.x, r.y, r.width, r.height].map(Math.round).join(','); }; const scrolled = [...document.querySelectorAll('*')].filter(el => el.scrollTop || el.scrollLeft).map(el => el.className); return { scrollY, scrolled, canvas: box('.cabin-scene-canvas'), rack: box('.room-rack') }; });
  await page.waitForTimeout(400); const stageBefore = await stage();
  await page.locator('.room-record').nth(5).dblclick(); await page.waitForTimeout(600);
  await page.locator('.room-record').nth(5).evaluate(el => { el.focus(); el.scrollIntoView({ block: 'start', inline: 'start' }); }); await page.waitForTimeout(100);
  const stageAfter = await stage(); assert.deepEqual(stageAfter.scrolled, [], 'room must not keep a scroll offset'); assert.equal(stageAfter.scrollY, 0); assert.equal(stageAfter.canvas, stageBefore.canvas, 'room canvas must not move or zoom'); assert.equal(stageAfter.rack, stageBefore.rack, 'shelf must not move');
  await screenshot('cabin-1280x800-after-dblclick'); check('room-stage-does-not-scroll-or-zoom-after-dblclick-1280x800');
  // Every scene at common laptop/desktop sizes: deck + record cells on screen and never under toolbar/panels,
  // also with the focus panel open; the cat's bubble never covers a record cell or a panel.
  // The cat always stands on something: the floor baseline or the (visible) console top.
  const catHelpers = () => {
    window.__catMoves = [];
    new MutationObserver(() => { const m = document.querySelector('.room-cat')?.dataset.moving; if (m) window.__catMoves.push(m); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-moving'] });
    window.__catSupport = () => {
      const cat = document.querySelector('.room-cat'), scene = cat?.closest('.room-scene'); if (!cat || !scene) return [];
      const c = cat.getBoundingClientRect(), s = scene.getBoundingClientRect(), floor = parseFloat(getComputedStyle(cat).getPropertyValue('--cat-floor'));
      const deck = document.querySelector('.room-turntable'), d = deck && deck.getClientRects().length && getComputedStyle(deck).visibility !== 'hidden' ? deck.getBoundingClientRect() : null;
      const onFloor = Math.abs(c.bottom - (s.bottom - floor)) <= 2, onConsole = d && Math.abs(c.bottom - d.top) <= 2 && Math.min(c.right, d.right) - Math.max(c.left, d.left) >= c.width / 2;
      return onFloor || onConsole ? [] : [`cat floating (feet ${Math.round(c.bottom)}, floor ${Math.round(s.bottom - floor)}, console ${d ? Math.round(d.top) : 'hidden'})`];
    };
  };
  await page.evaluate(catHelpers);
  const catSettled = () => page.waitForFunction(() => { const c = document.querySelector('.room-cat'); return !c || !c.getAnimations().length; });
  const layoutIssues = async (state) => { await catSettled(); return page.evaluate((state) => {
    const rects = s => [...document.querySelectorAll(s)].filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden').map(e => ({ name: String(e.className).split(' ')[0], r: e.getBoundingClientRect() }));
    const panels = rects('.app-titlebar, .cabin-toolbar > *, .room-turntable, .room-now-playing, .room-shelf-navigation, .focus-dock'), cells = [...rects('.room-record-slot'), ...rects('.scene-deck')], bubbles = [...rects('.room-cat-bubble'), ...rects('.room-cat').map(c => { const k = c.r.width * .14; return { name: 'room-cat', r: { left: c.r.left + k, right: c.r.right - k, top: c.r.top + k, bottom: c.r.bottom } }; })];
    const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1, out = [];
    if (!document.querySelector('.room-now-playing')) out.push('footer missing');
    out.push(...window.__catSupport().map(x => `${state}: ${x}`));
    for (const t of [...cells, ...bubbles]) {
      if (t.r.left < -1 || t.r.top < -1 || t.r.right > innerWidth + 1 || t.r.bottom > innerHeight + 1) out.push(`${state}: ${t.name} off screen`);
      for (const o of [...panels, ...(t.name.startsWith('room-cat') ? cells : [])]) if (hit(t.r, o.r)) out.push(`${state}: ${t.name} under ${o.name}`);
    }
    return out;
  }, state); };
  await page.locator('.focus-badge').click(); await page.getByRole('tab', { name: '番茄钟' }).click();
  const startFocus = page.getByRole('button', { name: '开始专注', exact: true }); if (await startFocus.count()) await startFocus.click();
  await page.getByRole('button', { name: '收起专注工具', exact: true }).click(); await page.locator('.room-cat-bubble').waitFor();
  for (const scene of ROOM_SCENES) {
    await page.setViewportSize({ width: 1440, height: 900 }); await page.getByRole('button', { name: '布置小屋', exact: true }).click(); await page.getByRole('button', { name: `选择场景 ${scene.label}`, exact: true }).click(); await page.getByRole('button', { name: '回到小屋', exact: true }).click();
    for (const [width, height] of [[1280, 720], [1280, 800], [1366, 768], [1440, 900], [1920, 1080]]) {
      await page.setViewportSize({ width, height }); await page.waitForTimeout(700);
      const issues = await layoutIssues('bubble');
      await page.locator('.focus-badge').click(); await page.locator('.focus-dock').waitFor(); await page.waitForTimeout(700); issues.push(...await layoutIssues('focus panel'));
      await verifyCabinLayout({ page }); await verifyFocusLayout({ page });
      await page.getByRole('button', { name: '收起专注工具', exact: true }).click(); await page.waitForTimeout(150);
      assert.deepEqual(issues, [], `${scene.id} ${width}x${height}: deck, record cells and cat bubble must be clear`);
    }
  }
  check('every-scene-deck-cells-and-cat-bubble-clear-of-toolbar-panels-and-focus-panel-at-5-viewports');
  // Immersive: console fully hidden, steps back in when the pointer comes near it.
  await page.setViewportSize({ width: 1280, height: 800 }); await page.mouse.move(1200, 120); await page.keyboard.press('z'); await page.waitForTimeout(400);
  const deckBox = await page.locator('.room-turntable').boundingBox(), deckStyle = () => page.locator('.room-turntable').evaluate(e => [getComputedStyle(e).opacity, getComputedStyle(e).visibility, getComputedStyle(e).pointerEvents].join(' '));
  assert.equal(await deckStyle(), '0 hidden none', 'immersive console must be fully hidden');
  await page.waitForTimeout(700); assert.deepEqual(await layoutIssues('immersive'), []); assert.equal(await page.locator('.room-cat[data-perch]').count(), 0, 'cat leaves the hidden console');
  await page.mouse.move(deckBox.x + deckBox.width / 2, deckBox.y + 10); await page.waitForTimeout(400); assert.equal(await deckStyle(), '1 visible auto', 'console returns when the pointer is near');
  const catSpot = () => page.locator('.room-cat').evaluate(c => `${c.dataset.spotX}/${c.dataset.perch || 'floor'}`), spotBeforeHover = await catSpot(); await page.mouse.move(1200, 120); await page.waitForTimeout(300); assert.equal(await catSpot(), spotBeforeHover, 'a brief hover must not move the cat'); await page.mouse.move(deckBox.x + deckBox.width / 2, deckBox.y + 10); await page.waitForTimeout(1200); assert.deepEqual(await layoutIssues('immersive hover'), []);
  await page.mouse.move(1200, 120); await page.waitForTimeout(400); assert.equal(await deckStyle(), '0 hidden none'); await page.waitForTimeout(700); assert.deepEqual(await layoutIssues('immersive again'), []); await page.keyboard.press('Escape'); await page.waitForTimeout(700); assert.deepEqual(await layoutIssues('after immersive'), []);
  assert((await page.evaluate(() => window.__catMoves)).every(m => m === 'fade'), 'reduced motion moves the cat with a fade swap only');
  check('cat-always-on-a-surface-and-hops-off-hidden-console'); check('immersive-console-hidden-and-revealed-near-pointer');
  { const motionPage = await context.newPage(); await motionPage.emulateMedia({ reducedMotion: 'no-preference' }); await motionPage.setViewportSize({ width: 1280, height: 800 }); await motionPage.goto(origin); await motionPage.locator('.room-record').first().waitFor(); await motionPage.evaluate(() => { document.documentElement.dataset.desktopReduceMotion = 'false'; });
    const mainRef = page; page = motionPage; await page.bringToFront(); await page.evaluate(catHelpers); await page.waitForTimeout(800);
    // Sample the rendered cat every animation frame while a transition happens.
    await page.evaluate(() => { window.__sampleCat = (ms) => new Promise((resolve) => { const out = [], start = performance.now(); const tick = (now) => {
      const cat = document.querySelector('.room-cat'), r = cat.getBoundingClientRect(), scale = getComputedStyle(cat).scale, parts = scale === 'none' ? [1, 1] : scale.split(' ').map(Number);
      out.push({ t: now - start, left: r.left, bottom: r.bottom, sy: parts[1] ?? parts[0], moving: cat.dataset.moving || '', unsupported: window.__catSupport().length > 0 });
      if (now - start < ms) requestAnimationFrame(tick); else resolve(out); }; requestAnimationFrame(tick); }); });
    const hopDuring = async (label, action) => {
      const sampling = page.evaluate(() => window.__sampleCat(1500)); await page.waitForTimeout(50); await action(); const frames = await sampling;
      const jump = frames.filter(f => f.moving === 'jump'); assert(jump.length, `${label}: cat must hop`);
      const positions = new Set(jump.map(f => `${Math.round(f.left)},${Math.round(f.bottom)}`)); assert(positions.size >= 6, `${label}: hop shows ${positions.size} positions, want >= 6`);
      const startY = jump[0].bottom, endY = frames.at(-1).bottom, apex = Math.min(...jump.map(f => f.bottom)); assert(apex < Math.min(startY, endY) - 4, `${label}: arc apex (${Math.round(apex)}) above start ${Math.round(startY)} and end ${Math.round(endY)}`);
      const tail = jump.slice(Math.floor(jump.length * .55)); assert(tail.some(f => f.sy < 1), `${label}: squash (scaleY < 1) near landing`);
      let idleUnsupported = 0, hover = 0, worstHover = 0;
      frames.forEach((f, i) => { const dt = i ? f.t - frames[i - 1].t : 0, prev = frames[i - 1];
        if (f.unsupported && !f.moving) idleUnsupported += dt;
        hover = f.unsupported && prev && Math.round(prev.bottom) === Math.round(f.bottom) && Math.round(prev.left) === Math.round(f.left) && f.sy >= 1 && prev.sy >= 1 && prev.unsupported ? hover + dt : 0; worstHover = Math.max(worstHover, hover); });
      assert(idleUnsupported <= 50, `${label}: ${Math.round(idleUnsupported)}ms unsupported outside the hop`); assert(worstHover <= 50, `${label}: hovered ${Math.round(worstHover)}ms in place without support`);
      return { positions: positions.size, idleUnsupported: Math.round(idleUnsupported), worstHover: Math.round(worstHover), frames: frames.length };
    };
    await page.locator('.focus-badge').click(); const startFocusM = page.getByRole('button', { name: '开始专注', exact: true }); if (await startFocusM.count()) await startFocusM.click(); await page.waitForTimeout(1500);
    assert.equal(await page.locator('.room-cat[data-perch="console"]').count(), 1, 'with the focus panel open at 1280x800 the cat perches on the console');
    const expand = await hopDuring('console expands', () => page.locator('.room-record').nth(2).dblclick());
    await page.getByRole('button', { name: '收起专注工具', exact: true }).click(); await page.waitForTimeout(1200); await page.mouse.move(1200, 120);
    assert.equal(await page.locator('.room-cat[data-perch="console"]').count(), 1, 'cat still perched before immersive');
    const immersive = await hopDuring('immersive hides the console', () => page.keyboard.press('z'));
    // Hover held on the revealed console: a brief pass leaves the cat alone, a held hover (> 1.2s) brings it back up; hiding again sends it down.
    const zenDeck = await page.locator('.room-turntable').boundingBox(), perchCount = () => page.locator('.room-cat[data-perch="console"]').count();
    await page.mouse.move(zenDeck.x + zenDeck.width / 2, zenDeck.y + 10); await page.waitForTimeout(500); await page.mouse.move(1200, 120); await page.waitForTimeout(900);
    assert.equal(await perchCount(), 0, 'a brief pass over the console does not bring the cat back');
    await page.evaluate(() => { window.__catMoves.length = 0; });
    await page.mouse.move(zenDeck.x + zenDeck.width / 2, zenDeck.y + 10); await page.waitForTimeout(1000);
    assert.equal(await perchCount(), 0, 'cat waits while the hover is short');
    await page.waitForTimeout(1200); await catSettled();
    assert.equal(await perchCount(), 1, 'a hover held on the console brings the cat back onto it');
    assert((await page.evaluate(() => window.__catMoves)).includes('jump'), 'cat hops back up');
    assert.deepEqual(await layoutIssues('immersive hover held'), []);
    await page.mouse.move(1200, 120); await page.waitForTimeout(900); await catSettled();
    assert.equal(await perchCount(), 0, 'cat hops down again when the console hides'); assert.deepEqual(await layoutIssues('immersive hidden again'), []);
    // Walk: a 120px stroll sampled at 60fps passes through many stepped positions.
    const walk = await page.evaluate(async () => {
      const { animateCatMove } = await import('/src/pet/useCatPlacement.js');
      const el = document.createElement('div'); el.style.cssText = 'position:fixed;left:300px;top:300px;width:64px;height:64px'; document.body.append(el);
      const after = el.getBoundingClientRect(), before = { left: after.left - 120, bottom: after.bottom };
      const out = [], anim = animateCatMove(el, before, after, 'walk'); const start = performance.now();
      await new Promise((resolve) => { const tick = (now) => { const r = el.getBoundingClientRect(); out.push(`${Math.round(r.left)},${Math.round(r.top)}`); if (anim.playState !== 'finished' && now - start < 2000) requestAnimationFrame(tick); else resolve(); }; requestAnimationFrame(tick); });
      el.remove(); return { positions: new Set(out).size, bobs: new Set(out.map(p => p.split(',')[1])).size, frames: out.length };
    });
    assert(walk.positions >= 10, `120px walk shows ${walk.positions} positions at 60fps, want >= 10`); assert(walk.bobs >= 2, 'walk bobs');
    await page.keyboard.press('Escape'); await page.waitForTimeout(1200);
    const moves = await page.evaluate(() => window.__catMoves);
    assert(moves.length > 0 && moves.every(m => m === 'jump' || m === 'walk'), `cat relocations animate (got ${moves.join(',') || 'none'})`);
    assert.deepEqual(await layoutIssues('motion'), []); await page.close(); page = mainRef; check('cat-relocation-hops-or-walks-when-motion-allowed', { expand, immersive, walk }); }
  await page.close(); page = mainPage; 
  report.limitations = ['Browser fixtures test renderer behavior, not native Electron IPC or OS integrations.', 'WAV decoding/playback progress is real, but physical speaker output and streaming providers are not tested.', 'Screenshots are review artifacts; no approved pixel baseline has been established.', 'macOS/Windows installers, wallpaper attachment, media permissions, and pet window click-through require native acceptance tests.'];
  for (const [index, call] of report.apiCalls.entries()) if (call.method === 'DELETE' && call.path === '/api/items') assert(!report.apiCalls.slice(index + 1).some(later => later.method === 'PATCH' && later.path === call.path && later.id === call.id), 'Deleted album received a late notes autosave');
  check('deleted-albums-do-not-receive-late-autosaves');
  // 设置 › 关于: version + update row (browser preview has no updater, says so).
  await page.getByRole('button', { name: '设置', exact: true }).click(); await page.getByRole('tab', { name: '关于' }).click();
  const about = page.locator('.update-panel'); await about.getByText(/心流小屋 v\d+\.\d+\.\d+/).waitFor(); const send = (detail) => page.evaluate((value) => { window.cabinUpdateState = value; window.dispatchEvent(new CustomEvent('cabin:update-state', { detail: value })); }, detail);
  if (await about.getByText('网页版总是最新的').count()) assert.equal(await about.getByRole('button', { name: '检查更新' }).count(), 0, 'no fake update button on the web');
  else {
    await send({ status: 'available', mode: 'notify', latestVersion: '9.9.0', reason: '这个 macOS 版本没有 Apple 开发者签名，系统不允许自动安装更新。', downloadUrl: 'https://github.com/ooooooomygosh/album-web/releases/download/v9.9.0/FlowCabin-9.9.0-mac-arm64.dmg', notes: '新功能' });
    await about.getByText(/发现新版本 v9\.9\.0.*签名/).waitFor(); await about.getByRole('button', { name: '下载安装包' }).waitFor(); assert.equal(await about.getByRole('button', { name: '重启安装' }).count(), 0);
    await send({ status: 'downloading', mode: 'install', percent: 50, autoDownload: true }); await about.getByText('下载中 50%').waitFor(); assert.equal(await about.getByRole('progressbar').getAttribute('aria-valuenow'), '50'); await about.getByLabel(/自动下载/).waitFor();
    await send({ status: 'downloaded', mode: 'install', latestVersion: '9.9.0', autoDownload: true }); await about.getByRole('button', { name: '重启安装' }).waitFor();
  }
  await screenshot('settings-about-update'); await page.keyboard.press('Escape'); check('settings-about-shows-version-and-update-status');
  // Refreshing an existing same-title track must carry its new artist / ID.
  neteaseLoggedIn = true; playlistRevision = false;
  await page.getByRole('button', { name: '我的歌单', exact: true }).click();
  await page.getByRole('tab', { name: /网易云音乐/ }).click();
  await page.locator('.playlist-card', { hasText: '深夜写作' }).click();
  await page.getByRole('button', { name: '放上唱片架', exact: true }).click();
  await page.locator('.playlist-notice', { hasText: '已放上唱片架' }).waitFor();
  playlistRevision = true;
  await page.getByRole('button', { name: '全部歌单' }).click();
  await page.locator('.playlist-card', { hasText: '深夜写作' }).click();
  await page.getByRole('button', { name: '已在唱片架 · 同步' }).click();
  await page.locator('.playlist-notice', { hasText: '已同步' }).waitFor();
  assert.equal(items.find(i => i.externalIds?.playlist === 'netease:9002').trackDetails[0].providerId, '999001');
  assert.equal(items.filter(i => i.externalIds?.playlist === 'netease:9002').length, 1);
  check('playlist-sync-refreshes-same-title-source-id-without-duplicate');
  const listCalls = report.apiCalls.filter(c => c.path === '/desktop-music/playlists').length;
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('album-music-account', { detail: { provider: 'netease' } })));
  await page.locator('.playlist-card', { hasText: '深夜写作' }).waitFor();
  assert(report.apiCalls.filter(c => c.path === '/desktop-music/playlists').length > listCalls, 'same logged-in state still refreshes account playlists');
  check('playlist-account-change-clears-detail-and-refreshes-list');
  await page.getByRole('tab', { name: /Apple Music/ }).click();
  await page.getByText('当前支持歌单资料导入；尚未接入官方 MusicKit 登录与订阅播放。').waitFor();
  check('apple-library-import-does-not-pretend-to-be-musickit');
  await page.getByRole('tab', { name: /链接与文件/ }).click();
  const xml = '<plist><dict><key>Tracks</key><dict><key>1</key><dict><key>Name</key><string>First</string><key>Artist</key><string>A</string></dict><key>2</key><dict><key>Name</key><string>Second</string><key>Artist</key><string>B</string></dict></dict><key>Playlists</key><array><dict><key>Name</key><string>早晨</string><key>Playlist ID</key><integer>1</integer><key>Playlist Items</key><array><dict><key>Track ID</key><integer>1</integer></dict></array></dict><dict><key>Name</key><string>夜晚</string><key>Playlist ID</key><integer>2</integer><key>Playlist Items</key><array><dict><key>Track ID</key><integer>2</integer></dict></array></dict></array></dict></plist>';
  await page.locator('.playlist-import input[type=file]').setInputFiles({ name: 'library.xml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
  await page.getByRole('region', { name: '文件中的歌单' }).waitFor();
  for (const [width, height] of [[1440, 900], [960, 600]]) {
    await page.setViewportSize({ width, height }); await screenshot(`playlist-file-choice-${width}x${height}`);
    assert(await page.locator('.playlist-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), 'playlist import fits the dialog');
  }
  await page.getByRole('button', { name: '夜晚 1 首' }).click();
  await page.locator('.playlist-hero h3', { hasText: '夜晚' }).waitFor();
  assert.match(await page.locator('.playlist-track').innerText(), /Second/);
  check('multi-playlist-xml-allows-selecting-second-list'); await closeDialog();
  // A failed recording must advance even when natural endings repeat one.
  const failurePage = await context.newPage();
  await failurePage.addInitScript(() => {
    localStorage.setItem('album-circle-room-player-v1', 'local');
    localStorage.setItem('album-circle-player-queue-v1', JSON.stringify({ ids: [], repeat: 'one', shuffle: false }));
  });
  const failedAlbum = { id: 'skip-fixture', title: '失败跳过回归', artist: 'Fixture Artist', type: 'album', tracks: ['失败曲', '恢复曲'], trackDetails: [{ title: '失败曲', source: 'local', providerId: 'aaaaaaaaaaaaaaaa' }, { title: '恢复曲', source: 'local', providerId: 'bbbbbbbbbbbbbbbb' }] };
  let failures = 0;
  await failurePage.route('**/api/items', route => route.fulfill({ json: { items: [failedAlbum] } }));
  await failurePage.route('**/desktop-music/search?*', route => route.fulfill({ json: { candidates: [] } }));
  await failurePage.route('**/desktop-music/resolve', route => {
    const { id } = route.request().postDataJSON();
    if (id === 'aaaaaaaaaaaaaaaa') { failures++; return route.fulfill({ json: { error: '夹具：这首歌曲不可播放' } }); }
    return route.fulfill({ json: { audioPath: '/desktop-music/local/audio/' + id } });
  });
  await failurePage.goto(origin); await failurePage.locator('.room-record').first().dblclick();
  await failurePage.getByRole('button', { name: '播放模式：单曲循环', exact: true }).waitFor();
  await failurePage.waitForFunction(() => { const audio = document.querySelector('audio'); return audio && !audio.paused && audio.src.endsWith('bbbbbbbbbbbbbbbb'); });
  assert.equal(failures, 1, 'the failed recording was not retried by repeat-one');
  await failurePage.close(); check('unplayable-track-advances-under-repeat-one');
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.unexpectedRequests, []); assert.deepEqual(report.consoleErrors, []); assert.deepEqual(report.failedRequests, []);
  report.passed = true;
} catch (error) { report.passed = false; report.error = error.stack || String(error); console.error(report.error); process.exitCode = 1; if (page && !page.isClosed()) { await screenshot('failure').catch(() => {}); await fs.writeFile(path.join(output, 'failure.html'), await page.content()).catch(() => {}); } }
finally { report.finishedAt = new Date().toISOString(); await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser?.close(); server?.kill(); console.log('Report: ' + path.join(output, 'report.json')); }
