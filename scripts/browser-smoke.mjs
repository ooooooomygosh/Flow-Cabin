// (The retired wallpaper room's window weather checks are gone; 沉入桌面 is the desk since R5.)
import { launchChromium } from './launch-browser.mjs';
import { verifyFullscreenStudy } from './fullscreen-study-checks.mjs';
import { verifyBenchmarkCabin } from './benchmark-cabin-checks.mjs';
import { verifyAppleHandoff } from './apple-handoff-checks.mjs';
import { hasViteLocalOrigin } from './vite-readiness.mjs';
import { openRoomSettings, openMusicSettings, chooseSource, openSettingsSection, closeSettings, settingsDialog, accountsRegion, openAddToShelf, addDialog, openAlbumWall, openLibrary, closeLibrary, libraryDialog, takeBinder, playRecord, openRecordCard, closeRecordCard, openConsole, closeConsole, consoleDialog, deckRecord, openFocus, waitForSavedRoom, backToDesk } from './settings-actions.mjs';
/** Offline renderer integration suite. Run: node scripts/browser-smoke.mjs
 * Requires root+desktop npm ci and Chromium (BROWSER_EXECUTABLE overrides path).
 * Native OS integration, real accounts, and live platform playback are NOT tested.
 * Fixtures never call external services or read a user's profile/collection.
 */
import assert from 'node:assert/strict';
import { companionCsp } from '../desktop/policy.cjs';
import { verifyQQRegression } from './qq-regression-checks.mjs';
import { verifyOnboarding } from './onboarding-checks.mjs';
import { verifyCabinLayout, verifyCabinToolActions, verifyFocusLayout } from './cabin-layout-checks.mjs';
import { verifyPlaylistPagination } from './playlist-pagination-checks.mjs';
import { neteasePlaylists, playlistDetail } from './playlist-fixture.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
  server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, env: { ...process.env, FLOW_CABIN_VITE_CACHE_DIR: path.join(output, 'vite-cache') }, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = ''; server.stdout.on('data', b => serverLog += b); server.stderr.on('data', b => serverLog += b);
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(serverLog);
    // A response from an older process on this port is not readiness evidence.
    if (hasViteLocalOrigin(serverLog, origin)) {
      try { if ((await fetch(origin)).ok) break; } catch {}
    }
    if (i === 99) throw new Error('Vite startup timed out: ' + serverLog);
    await new Promise(r => setTimeout(r, 100));
  }
  browser = await launchChromium();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'zh-CN', reducedMotion: 'reduce' });
  await context.addInitScript(() => { if (location.origin !== 'null' && !localStorage.getItem('album-circle-focus-display-v1')) localStorage.setItem('album-circle-focus-display-v1', JSON.stringify({ autoEnter: true })); window.__desktopCommands = []; window.__cabinPlayback = []; window.addEventListener('cabin:playback', e => window.__cabinPlayback.push({ ...e.detail, at: performance.now() })); window.open = url => { window.__desktopCommands.push(String(url)); return null; }; window.albumDesktopAppearance = { client: true, reduceMotion: true }; const init = () => { document.documentElement.dataset.desktopClient = 'true'; document.documentElement.dataset.desktopReduceMotion = 'true'; }; if (document.documentElement) init(); else new MutationObserver((_, o) => { if (document.documentElement) { init(); o.disconnect(); } }).observe(document, { childList: true }); });
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
    if (p === '/desktop-music/lyrics') return json({ text:'', source:'fixture', reason:'No fixture lyrics' });
    if (p.startsWith('/desktop-weather/')) return json({ report:null });
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
  if (process.env.FLOW_CABIN_BROWSER_PHASE !== 'main') {
  // 窗外天气 was drawn on the pixel room the wallpaper used to show; 沉入桌面 is the desk now (checked below).
  await verifyOnboarding({ browser, origin, routeHandler: welcomeRoute, evidence: output, output, check });
  await verifyQQRegression({ browser, origin, check });
  await verifyAppleHandoff({ browser, origin, output, check });
  try { report.benchmarkCabin = await verifyBenchmarkCabin(browser, origin, { output, check }); }
  catch (error) { report.benchmarkCabin = error.report; throw error; }
  await verifyFullscreenStudy({ browser, origin, output, check });
  await verifyPlaylistPagination({ browser, origin, check });
  } else report.skipped.push('Isolated suites already run separately; this local run covers the main journey only.');
  context.on('page', watched => { watched.on('pageerror', error => report.pageErrors.push(error.stack || error.message)); watched.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); }); watched.on('requestfailed', request => { if (request.failure()?.errorText !== 'net::ERR_ABORTED') report.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }); }); });
  page = await context.newPage(); page.setDefaultTimeout(12000); await page.clock.install({ time: new Date('2026-10-08T10:00:00Z') });
  /* context captures errors across the main, wallpaper and pet renderers. */
  await page.goto(origin); await page.locator('.desk-home').waitFor();
  { const shelf = await takeBinder(page, '唱片'); await shelf.locator('.listen-grid li').first().waitFor(); assert.equal(await shelf.locator('.listen-grid li').count(), items.length, 'the whole offline collection stands on the shelf'); await closeLibrary(page); }
  check('renderer-mounts-with-offline-collection');
  await verifyCabinLayout({ page, check }); await verifyCabinToolActions({ page, check });
  for (const [width, height] of [[1440, 900], [960, 600]]) { await page.setViewportSize({ width, height }); await screenshot(`cabin-${width}x${height}`); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `no horizontal page overflow at ${width}x${height}`); }
  await page.setViewportSize({ width: 1440, height: 900 });
  const { ROOM_SCENES } = await import('../src/scene-catalog.mjs');
  const { PETS } = await import('../src/pet/pet-catalog.mjs');
  assert.equal(ROOM_SCENES.length, 8); assert.equal(PETS.length, 5);
  // 设置 › 小屋与奶糖 picks the companion; the room scene is chosen in the first-run guide only (R5: the desk has no room picture).
  await openRoomSettings(page);
  assert.equal(await settingsDialog(page).getByRole('button', { name: /^选择场景/ }).count(), 0, '设置 has no room-scene picker');
  for (const pet of PETS) { await page.getByRole('button', { name: `选择桌宠 ${pet.name || pet.label}`, exact: true }).click(); await waitForSavedRoom(page, { petId: pet.id }); }
  await screenshot('room-personalization');
  // One fixed dialog size: switching sections never resizes 设置.
  for (const [width, height] of [[1440, 900], [960, 600]]) {
    await page.setViewportSize({ width, height }); const sizes = new Set();
    for (const section of ['音源', '房间与桌宠', '键鼠陪伴', '专注工具', '显示与桌面', '数据与备份', 'AI（Beta）', '关于']) { await openSettingsSection(page, section); const box = await settingsDialog(page).boundingBox(); sizes.add(`${Math.round(box.width)}x${Math.round(box.height)}`); }
    assert.equal(sizes.size, 1, `设置 keeps one size across sections at ${width}x${height}: ${[...sizes]}`);
  }
  await openRoomSettings(page); check('settings-dialog-has-one-fixed-size');
  await screenshot('room-personalization-960x600'); await closeSettings(page);
  await page.reload(); await page.locator('.desk-home').waitFor(); await waitForSavedRoom(page, { petId: PETS.at(-1).id }); await openRoomSettings(page); assert.equal(await page.getByRole('button', { name: `选择桌宠 ${PETS.at(-1).name || PETS.at(-1).label}`, exact: true }).getAttribute('aria-pressed'), 'true'); await closeSettings(page); check('room-and-pet-choices-survive-reload');
  await page.setViewportSize({ width: 1440, height: 900 });
  await openAddToShelf(page, '手动填写'); await page.getByLabel('专辑名', { exact: true }).fill('QA 新唱片'); await page.getByLabel('歌手', { exact: true }).fill('QA Artist'); await page.getByLabel('曲目', { exact: true }).fill('第一首\n第二首'); await page.getByRole('button', { name: '放上唱片架' }).click(); await page.getByText('《QA 新唱片》已放上唱片架。', { exact: true }).waitFor(); await closeDialog(); assert(items.some(i => i.title === 'QA 新唱片')); assert.match(items.find(i => i.title === 'QA 新唱片').cover, /^data:image\/png;base64,/, 'manual album without cover gets a pixel cover'); check('collection-create-manual');
  await closeLibrary(page);
  { const card = await openRecordCard(page, '晨光本地唱片'); await card.getByLabel('我的笔记').fill('持久化测试笔记'); await card.getByLabel('我的笔记').blur(); await card.getByText('已保存在这台电脑', { exact: true }).waitFor(); assert(items.some(i => i.notes === '持久化测试笔记')); await closeRecordCard(page); }
  { const card = await openRecordCard(page, 'QA 新唱片'); await card.getByRole('button', { name: '移除', exact: true }).click(); await card.getByRole('button', { name: '确认移除' }).click(); await page.getByRole('dialog', { name: /^唱片卡片/ }).waitFor({ state: 'hidden' }); assert(!items.some(i => i.title === 'QA 新唱片')); await closeLibrary(page); }
  check('collection-update-notes-and-delete');
  { const add = await openAddToShelf(page); await add.getByRole('searchbox').fill('测试'); await add.getByRole('button', { name: '搜索', exact: true }).click(); } await page.locator('.add-results li').first().waitFor(); await screenshot('catalog-results'); await closeDialog(); await closeLibrary(page); check('catalog-search-fixture');
  await playRecord(page, '晨光本地唱片'); await chooseSource(page, 'local'); await page.waitForFunction(() => { const a = document.querySelector('audio[data-deck="active"]'); return a && !a.paused && a.currentTime > .2 && a.duration > 10; }); check('actual-generated-wav-decodes-and-plays');
  // The rest of the playback checks drive 唱机: DEsk's Control Panel on the desk is the console (the old pocket player's controls, same names).
  await openConsole(page);
  for (const [width, height] of [[1440, 900], [1280, 720], [960, 600]]) { await page.setViewportSize({ width, height }); await page.waitForTimeout(150); await screenshot(`console-${width}x${height}`); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `no horizontal page overflow at ${width}x${height}`); }
  await page.setViewportSize({ width: 1440, height: 900 });
  // The next track is matched and buffered on the idle deck while this one plays; 下一首 switches decks.
  const buffered = () => page.waitForFunction(() => { const a = document.querySelector('audio[data-deck="standby"]'); return a && a.src.endsWith('fedcba9876543210') && a.readyState >= 3; });
  await buffered(); await page.evaluate(() => { window.__standbyDeck = document.querySelector('audio[data-deck="standby"]'); });
  await page.getByRole('button', { name: '下一首展示曲目' }).click(); await page.waitForFunction(() => { const a = document.querySelector('audio[data-deck="active"]'); return a === window.__standbyDeck && a.src.endsWith('fedcba9876543210') && !a.paused; }); check('local-next-track-resolves-exact-id'); check('next-track-preloaded-on-idle-deck-and-switched');
  assert.equal(await page.getByLabel('音乐播放进度', { exact: true }).isEnabled(), true);
  assert.equal(Number(await page.getByLabel('音乐播放进度', { exact: true }).getAttribute('max')), 15, 'buffered duration transfers to the visible progress control');
  // 歌曲过渡 3 s: near the end the buffered next song starts and both decks overlap, then the old one is emptied.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cabin:player-command', { detail: { action: 'previous' } }))); await page.waitForFunction(() => document.querySelector('audio[data-deck="active"]').src.endsWith('abcdef0123456789') && !document.querySelector('audio[data-deck="active"]').paused);
  await buffered(); await page.evaluate(() => { localStorage.setItem('flow-cabin-crossfade-v1', '3'); window.dispatchEvent(new CustomEvent('flow-cabin-crossfade', { detail: 3 })); window.__overlap = false; const a = document.querySelector('audio[data-deck="active"]'); a.currentTime = a.duration - 4; });
  await page.waitForFunction(() => { const on = document.querySelector('audio[data-deck="active"]'), off = document.querySelector('audio[data-deck="standby"]'); if (on.src.endsWith('fedcba9876543210') && !on.paused && off.src.endsWith('abcdef0123456789') && !off.paused) window.__overlap = true; return window.__overlap; }, null, { polling: 50 });
  await page.waitForFunction(() => document.querySelector('audio[data-deck="standby"]').getAttribute('src') === null && !document.querySelector('audio[data-deck="active"]').paused, null, { timeout: 8000 }); check('crossfade-overlaps-then-releases-old-deck');
  await page.evaluate(() => { localStorage.setItem('flow-cabin-crossfade-v1', '0'); window.dispatchEvent(new CustomEvent('flow-cabin-crossfade', { detail: 0 })); });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cabin:player-command', { detail: { action: 'previous' } }))); await page.evaluate(() => window.dispatchEvent(new CustomEvent('cabin:player-command', { detail: { action: 'previous' } })));
  await page.waitForFunction(() => document.querySelector('audio[data-deck="active"]').src.endsWith('abcdef0123456789')); await page.getByRole('button', { name: '下一首展示曲目' }).click(); await page.waitForFunction(() => document.querySelector('audio[data-deck="active"]').src.endsWith('fedcba9876543210'));
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cabin:player-command', { detail: { action: 'pause' } }))); await page.waitForFunction(() => document.querySelector('audio[data-deck="active"]').paused);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cabin:player-command', { detail: { action: 'play' } }))); await page.waitForFunction(() => !document.querySelector('audio[data-deck="active"]').paused);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cabin:player-command', { detail: { action: 'previous' } }))); await page.waitForFunction(() => document.querySelector('audio[data-deck="active"]').src.endsWith('abcdef0123456789'));
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cabin:player-command', { detail: { action: 'next' } }))); await page.waitForFunction(() => document.querySelector('audio[data-deck="active"]').src.endsWith('fedcba9876543210') && !document.querySelector('audio[data-deck="active"]').paused); check('player-command-event-drives-the-deck');
  // Player: cabin:playback signal (analyser energy), keyboard shortcuts, 待播 queue.
  await page.waitForFunction(() => window.__cabinPlayback?.some(d => d.playing && !d.estimated && d.energy > .02 && d.track?.index === 1));
  const signal = await page.evaluate(() => window.__cabinPlayback);
  assert(signal.some(d => d.reason === 'track' && d.track?.index === 1)); assert(signal.every(d => d.energy >= 0 && d.energy <= 1 && typeof d.playing === 'boolean'));
  const ticks = signal.filter(d => d.reason === 'energy').map(d => d.at); if (ticks.length > 3) { const gaps = ticks.slice(1).map((t, i) => t - ticks[i]); assert(Math.min(...gaps) >= 50, 'energy ticks are throttled to ~15fps'); }
  check('cabin-playback-event-carries-real-analyser-energy');
  // After dragging the progress bar (focus stays on the slider), Space still plays / pauses and ← / → seek 5 s, not 0.1 s.
  const progressBox = await page.getByLabel('音乐播放进度', { exact: true }).boundingBox();
  await page.mouse.move(progressBox.x + progressBox.width * .1, progressBox.y + progressBox.height / 2); await page.mouse.down(); await page.mouse.move(progressBox.x + progressBox.width * .2, progressBox.y + progressBox.height / 2, { steps: 4 }); await page.mouse.up();
  assert.equal(await page.getByLabel('音乐播放进度', { exact: true }).evaluate(element => element === document.activeElement), true, 'the slider keeps focus after a drag');
  await page.keyboard.press('Space'); await page.waitForFunction(() => document.querySelector('audio[data-deck="active"]').paused);
  const beforeArrow = await page.locator('audio[data-deck="active"]').evaluate(a => a.currentTime);
  await page.keyboard.press('ArrowRight'); const afterArrow = await page.locator('audio[data-deck="active"]').evaluate(a => a.currentTime);
  assert(afterArrow - beforeArrow > 4.5 && afterArrow - beforeArrow < 5.5, `ArrowRight on the progress bar seeks 5 s (moved ${afterArrow - beforeArrow})`);
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Space'); await page.waitForFunction(() => !document.querySelector('audio[data-deck="active"]').paused && window.__cabinPlayback.at(-1).playing === true);
  check('space-and-arrows-still-work-after-dragging-the-progress-slider');
  await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('Space'); await page.waitForFunction(() => document.querySelector('audio[data-deck="active"]').paused && window.__cabinPlayback.at(-1).playing === false);
  await page.keyboard.press('m'); assert.equal(await page.locator('audio[data-deck="active"]').evaluate(a => a.muted), true); await page.keyboard.press('m'); assert.equal(await page.locator('audio[data-deck="active"]').evaluate(a => a.muted), false);
  await page.keyboard.press('Space'); await page.waitForFunction(() => !document.querySelector('audio[data-deck="active"]').paused);
  // 上一首 restarts a song that has played for over 3 s; the slider checks above may have run past that, so start near the beginning.
  // The deck's position store throttles writes (250 ms), so wait until the progress bar has the new spot
  // before pressing: 上一首 reads that store, and a stale > 3 s position restarts the song instead.
  await page.locator('audio[data-deck="active"]').evaluate(a => { a.currentTime = .5; });
  await page.waitForFunction(() => Number(document.querySelector('input[aria-label="音乐播放进度"]')?.value) < 3);
  await page.keyboard.press('Shift+ArrowLeft'); await page.waitForFunction(() => document.querySelector('.console-track').textContent.startsWith('01'));
  check('keyboard-space-mute-and-previous');
  // 重启后恢复: the song and its spot come back after a reload, paused, and play resumes there. No stream URL is stored.
  await page.waitForFunction(() => { const a = document.querySelector('audio[data-deck="active"]'); return a.src.endsWith('abcdef0123456789') && !a.paused && a.currentTime > .2 && a.duration > 10; });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cabin:player-command', { detail: { action: 'pause' } }))); await page.waitForFunction(() => document.querySelector('audio[data-deck="active"]').paused);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cabin:player-command', { detail: { action: 'seek', value: 6 } })));
  await page.waitForFunction(() => { const saved = JSON.parse(localStorage.getItem('flow-cabin-deck-resume-v1') || 'null'); return saved && saved.index === 0 && Math.abs(saved.position - 6) < .2 && saved.playing === false; });
  const resume = await page.evaluate(() => localStorage.getItem('flow-cabin-deck-resume-v1'));
  assert.doesNotMatch(resume, /audio|https?:|desktop-music/, 'only the song identity is stored');
  const resumedId = JSON.parse(resume).id;
  await page.reload(); await page.waitForFunction(id => window.__cabinDeckItem?.id === id, resumedId);
  await openConsole(page);
  await page.locator('.console-status', { hasText: '已回到上次听到的地方' }).waitFor();
  assert.equal(await page.locator('audio[data-deck="active"]').evaluate(a => a.paused && !a.getAttribute('src')), true, 'restored paused, nothing streams before play');
  assert(Math.abs(Number(await page.getByLabel('音乐播放进度', { exact: true }).inputValue()) - 6) < .2, 'the progress bar shows the remembered spot');
  assert.match(await page.locator('.console-track').innerText(), /^01/);
  await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('Space');
  await page.waitForFunction(() => { const a = document.querySelector('audio[data-deck="active"]'); return a && !a.paused && a.currentTime >= 5.8; });
  check('reload-restores-the-song-and-spot-paused-then-resumes-there');
  await closeConsole(page);
  // 待播: queue a record from its binder on the 唱片架, then manage the queue on the console's paper roll (the blue push button unrolls it).
  { const shelf = await takeBinder(page, '唱片'); await shelf.getByRole('button', { name: '加入待播 测试唱片 2', exact: true }).click(); await shelf.getByRole('button', { name: '移出待播 测试唱片 2', exact: true }).waitFor(); await closeLibrary(page); }
  const roll = page.getByRole('complementary', { name: '待播纸带' });
  const unroll = async () => { await openConsole(page); if (!await roll.isVisible()) await consoleDialog(page).getByRole('button', { name: /^待播/ }).click(); await roll.waitFor(); };
  await unroll();
  await roll.locator('.player-queue li', { hasText: '测试唱片 2' }).waitFor(); await screenshot('player-queue');
  await page.setViewportSize({ width: 960, height: 600 });
  { const queueBounds = await roll.locator('.player-queue').boundingBox(), removeBounds = await roll.getByRole('button', { name: '从待播移除 测试唱片 2', exact: true }).boundingBox();
    assert(removeBounds.x >= queueBounds.x && removeBounds.x + removeBounds.width <= queueBounds.x + queueBounds.width + 1, 'compact remove button stays inside the queue'); }
  await screenshot('player-queue-960x600');
  await page.setViewportSize({ width: 1440, height: 900 }); check('compact-queue-stays-inside-the-paper-roll');
  check('queue-adds-selected-album');
  await closeConsole(page);
  { const shelf = await takeBinder(page, '唱片'); await shelf.getByRole('button', { name: '加入待播 测试唱片 3', exact: true }).click(); await shelf.getByRole('button', { name: '移出待播 测试唱片 3', exact: true }).waitFor(); await closeLibrary(page); }
  await unroll();
  await roll.getByRole('button', { name: '下一张播 测试唱片 3', exact: true }).click();
  assert.match(await roll.locator('.player-queue-albums li').first().innerText(), /测试唱片 3/);
  await page.getByRole('switch', { name: '播放模式：顺序播放', exact: true }).click(); await page.getByRole('switch', { name: '播放模式：整张循环', exact: true }).click();
  await roll.getByText('单曲循环中 · 切换为顺序播放后继续待播', { exact: true }).waitFor();
  assert.equal(await roll.locator('.player-queue-tracks').count(), 0);
  await screenshot('queue-priority-and-repeat'); await page.getByRole('switch', { name: '播放模式：单曲循环', exact: true }).click();
  await roll.getByRole('button', { name: '从待播移除 测试唱片 3', exact: true }).click();
  check('queue-priority-and-repeat-state-match-playback');
  await closeConsole(page);
  // Album import from picked files (session playback) + pixel covers.
  localAlbumCalls = 0; // the onboarding 播放测试 also reads /local/albums (first local track)
  await openAddToShelf(page, '本地音乐');
  await page.getByRole('tab', { name: '手动填写' }).click(); await page.getByRole('tab', { name: '本地音乐' }).click(); // {} first, then a partial album
  await page.locator('.add-results[aria-label="本地专辑"] li', { hasText: '残缺资料' }).getByText('未知歌手 · 0 首').waitFor(); check('local-music-empty-or-partial-response-renders');
  await page.getByLabel('选择音乐文件', { exact: true }).setInputFiles([{ name: '01 - Fixture Band - 晨雾.wav', mimeType: 'audio/wav', buffer: wav }, { name: '02 - Fixture Band - 夜灯.wav', mimeType: 'audio/wav', buffer: wav }]);
  const fileAlbum = page.locator('.file-import .add-results li').first(); await fileAlbum.locator('img.add-cover').waitFor(); await fileAlbum.getByText('Fixture Band · 2 首').waitFor(); await screenshot('file-import');
  await fileAlbum.getByRole('button', { name: '放上唱片架' }).click(); await page.getByText('《未命名专辑》已放上唱片架。', { exact: true }).waitFor(); await closeDialog(); await closeLibrary(page);
  const picked = items.find(i => i.externalIds?.fileAlbum); assert(picked, 'picked-file album saved'); assert.match(picked.cover, /^data:image\/png;base64,/); assert.deepEqual(picked.tracks, ['晨雾', '夜灯']); assert(picked.trackDetails[0].lengthMillis > 10000);
  await page.reload(); await page.locator('.desk-home').waitFor();
  check('files-import-with-tags-from-names-durations-and-pixel-cover');
  // After a reload the object URLs are gone: the deck explains instead of failing silently.
  await playRecord(page, '未命名专辑'); await (await openConsole(page)).getByRole('alert').filter({ hasText: '重新打开小屋后需要再选一次文件' }).waitFor(); await closeConsole(page); check('session-files-explain-reload-honestly');
  await openAddToShelf(page, '本地音乐');
  await page.getByLabel('选择音乐文件', { exact: true }).setInputFiles([{ name: '01 - Fixture Band - 晨雾.wav', mimeType: 'audio/wav', buffer: wav }, { name: '02 - Fixture Band - 夜灯.wav', mimeType: 'audio/wav', buffer: wav }]);
  await page.getByRole('button', { name: '重新连上文件' }).click(); await page.locator('.add-notice').waitFor(); await closeDialog(); await closeLibrary(page);
  await (await openConsole(page)).getByRole('button', { name: '重试', exact: true }).click(); await page.waitForFunction(() => { const a = document.querySelector('audio[data-deck="active"]'); return a.src.startsWith('blob:') && !a.paused && a.currentTime > .2; });
  await closeConsole(page);
  check('relinked-session-files-play-from-blob');
  { const card = await openRecordCard(page, '测试唱片 4'); await card.getByRole('button', { name: '像素封面' }).click();
    await page.getByRole('img', { name: /像素封面预览/ }).waitFor(); await page.getByText('已把原封面转成小屋配色的像素画。', { exact: true }).waitFor(); await screenshot('record-pixel-cover'); await page.getByRole('button', { name: '用这张' }).click(); await page.getByRole('button', { name: '恢复原封面' }).waitFor();
    const pixelled = items.find(i => i.originalCover); assert.match(pixelled.cover, /^data:image\/png;base64,/); assert.equal(pixelled.originalCover, cover);
    await page.getByRole('button', { name: '恢复原封面' }).click(); await page.getByText('已恢复原封面。', { exact: true }).waitFor(); assert.equal(pixelled.cover, cover); await closeRecordCard(page); await closeLibrary(page); }
  check('record-card-pixel-cover-preview-apply-and-restore');
  items = items.filter(i => !i.externalIds?.fileAlbum); await page.reload(); await page.locator('.desk-home').waitFor(); // later checks count the 18 fixture albums
  await chooseSource(page, 'system'); await (await openConsole(page)).locator('.console-track', { hasText: '系统测试歌曲' }).waitFor(); assert.deepEqual(await page.locator('audio').evaluateAll(decks => decks.map(a => a.getAttribute('src'))), [null, null]); await page.getByRole('button', { name: '暂停系统播放器' }).click(); await page.getByRole('button', { name: '继续系统播放器' }).waitFor();
  // The next command is a fetch; wait for the mocked response before asserting the relayed command.
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/desktop-music/now-playing/control') && response.request().postDataJSON()?.action === 'next'),
    page.getByRole('button', { name: '系统播放器下一首' }).click(),
  ]);
  assert.deepEqual(systemCommands, ['toggle', 'next']); check('system-source-and-transport-mocked'); await closeConsole(page); await chooseSource(page, 'visual');
  await openMusicSettings(page); await page.locator('.music-local-status', { hasText: '1 张专辑 · 2 首歌曲' }).waitFor(); await screenshot('music-settings'); const sourceBefore = await page.evaluate(() => localStorage.getItem('album-circle-room-player-v1'));
  // 账户与文件夹 manages logins and folders only; the deck's source has one picker, one page up.
  assert.equal(await accountsRegion(page).getByRole('button', { name: /在唱机上用|唱机改用/ }).count(), 0, 'no second source picker in 账户与文件夹'); assert.equal(await settingsDialog(page).getByRole('combobox', { name: '唱机音源' }).count(), 0, 'no 唱机音源 select');
  await accountsRegion(page).getByRole('button', { name: '音乐', exact: true }).click(); const qqSource = settingsDialog(page).getByRole('radiogroup', { name: '唱机音源', exact: true }).getByRole('radio', { name: 'QQ 音乐', exact: true });
  await qqSource.click(); assert.equal(await qqSource.getAttribute('aria-checked'), 'true'); await qqSource.getByText('唱机在用').waitFor(); assert.equal(await settingsDialog(page).getByRole('radio', { checked: true }).count(), 1, 'exactly one source is in use');
  await closeDialog(); assert.equal(await page.evaluate(() => localStorage.getItem('album-circle-room-player-v1')), 'qq'); await chooseSource(page, sourceBefore); check('music-settings-offline-account-and-local-status'); check('music-settings-use-source-on-deck');
  // Seamless playback: stored source fails → automatic rematch plays the best candidate (no picker), with the chosen quality shown honestly.
  await openSettingsSection(page, '音源'); await page.getByLabel('音质', { exact: true }).selectOption('lossless'); await page.waitForFunction(() => document.querySelector('select[aria-label="音质"]')?.value === 'lossless'); await closeDialog(); assert.equal(quality, 'lossless');
  rematch = 'vip'; rematchResolves.length = 0; await playRecord(page, '测试唱片 2'); await chooseSource(page, 'qq');
  await page.waitForFunction(() => { const a = document.querySelector('audio[data-deck="active"]'); return a && !a.paused && a.src.endsWith('fixture-stream'); });
  await openConsole(page); assert.equal(await page.locator('.console-matches').count(), 0, 'no manual picker when a match plays');
  assert.deepEqual(rematchResolves.slice(0, 2), ['fixture-vip', 'fixture-stream']); assert(!rematchResolves.includes('fixture-live'), 'a live version is never auto-played');
  await page.locator('.console-status', { hasText: '320k MP3' }).waitFor(); check('qq-rematch-plays-best-candidate-automatically-and-shows-actual-quality');
  rematch = 'all-fail'; await page.getByRole('button', { name: '下一首展示曲目' }).click(); await page.getByRole('button', { name: '在 QQ 音乐中打开' }).click(); await page.locator('.console-local-app', { hasText: '小屋不显示进度' }).waitFor(); assert.equal(localOpens[0].provider, 'qq'); assert.equal(await page.evaluate(() => document.querySelector('audio[data-deck="active"]').paused), true, 'the hand-off never pretends the cabin is playing'); check('local-app-fallback-labelled-after-failure');
  rematch = ''; await closeConsole(page); await chooseSource(page, sourceBefore);
  await openFocus(page); await page.getByRole('tab', { name: '待办', exact: true }).click(); await page.getByLabel('新的待办').fill('浏览器测试待办'); await page.getByRole('button', { name: '添加待办' }).click(); await page.getByRole('checkbox', { name: '完成：浏览器测试待办' }).check(); assert.equal(await page.locator('.focus-task-list li.is-done').count(), 1); check('focus-tasks-create-and-complete');
  // 3.1: 随手记 is its own tab of the 专注 close-up again (这一段 / 待办 / 随手记 / 声音).
  await page.getByRole('tab', { name: '随手记', exact: true }).click(); await page.getByLabel('随手记内容').fill('QA 随手记备份内容'); check('quick-notes-save-local-text');
  await page.getByRole('tab', { name: '这一段', exact: true }).click();
  await page.getByRole('button', { name: '计时设置' }).click(); await page.getByLabel('专注（分）').fill('2'); await page.getByLabel('专注（分）').blur(); await page.getByRole('button', { name: '开始专注', exact: true }).click();
  // 开始专注 with 沉浸 on puts the sheet back and the clock fills the window; otherwise the sheet stays and is closed.
  { await page.waitForTimeout(300); if (await page.locator('.focus-display').count()) { await page.keyboard.press('Escape'); await page.locator('.focus-display').waitFor({ state: 'detached' }); } else { await page.keyboard.press('Escape'); await page.getByRole('dialog', { name: '专注', exact: true }).waitFor({ state: 'hidden' }); } }
  await page.locator('.focus-badge').focus(); await page.keyboard.press('z'); await page.locator('.focus-display').waitFor(); await page.keyboard.press('Escape'); await page.locator('.focus-display').waitFor({ state: 'detached' }); await page.clock.fastForward(121000); await openFocus(page); await page.locator('.focus-phase', { hasText: '短休息' }).waitFor(); await page.keyboard.press('Escape'); await page.getByRole('dialog', { name: '专注', exact: true }).waitFor({ state: 'hidden' });
  // 3.0: 统计 moved from the focus panel into 唱片日记 › 统计.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cabin:open-journal', { detail: {} }))); const statsJournal = page.getByRole('dialog', { name: '唱片日记' }); await statsJournal.waitFor(); await statsJournal.getByRole('tab', { name: '统计' }).click(); assert.match(await statsJournal.locator('.fs-today-num').first().innerText(), /2 分钟/); await screenshot('focus-statistics'); check('focus-timer-completes-and-records-session'); await page.keyboard.press('Escape'); await statsJournal.waitFor({ state: 'hidden' });
  // 学习: a deck, pasted cards, a keyboard review (Space flips, 1–4 rate), a countdown.
  // 3.0: 学习 is the 词书学习 lab (设置 › 实验室); switch it on for this journey.
  await page.evaluate(() => { const labs = JSON.parse(localStorage.getItem('flow-cabin-labs-v1') || '{}'); localStorage.setItem('flow-cabin-labs-v1', JSON.stringify({ ...labs, study: true })); window.dispatchEvent(new CustomEvent('cabin:labs-changed')); });
  await openFocus(page); await page.getByRole('tab', { name: '学习', exact: true }).click();
  await page.getByLabel('新卡组名称').fill('QA 单词'); await page.getByRole('button', { name: '新建', exact: true }).click();
  const studyDeck = page.locator('.study-decks li', { hasText: 'QA 单词' });
  await studyDeck.getByText('0 张 · 空词书 · 添加或导入词条后开始', { exact: true }).waitFor();
  assert.doesNotMatch(await studyDeck.innerText(), /已完成/);
  await studyDeck.getByRole('button', { name: '添加词条', exact: true }).click(); await page.getByLabel('新卡片').fill('ephemeral - 短暂的\n光合作用：植物利用光能'); await page.getByRole('button', { name: '添加 2 张' }).click(); await page.getByText('添加了 2 张卡片。').waitFor();
  await page.getByRole('button', { name: '卡组', exact: true }).click();
  await studyDeck.getByText('2 张 · 未开始', { exact: true }).waitFor();
  await studyDeck.getByRole('button', { name: '编辑', exact: true }).click();
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
  assert.equal(await page.evaluate(() => document.querySelector('audio[data-deck="active"]')?.paused ?? true), true, 'Space in a review does not start music');
  await page.keyboard.press(' '); await page.keyboard.press('3'); await page.locator('.study-done').waitFor(); await page.getByRole('button', { name: '回到词书架', exact: true }).click();
  await page.getByLabel('倒计时名称').fill('期末'); await page.getByLabel('倒计时日期').fill('2026-12-20'); await page.getByRole('button', { name: '添加倒计时' }).click(); await page.locator('.study-countdowns li', { hasText: '期末' }).getByText('73 天').waitFor();
  check('study-flashcards-fsrs-keyboard-review-and-countdown'); await page.getByRole('dialog', { name: '专注', exact: true }).getByRole('button', { name: '收起专注工具', exact: true }).click();
  await openSettingsSection(page, '数据'); await page.getByRole('button', { name: '收藏与备份', exact: true }).click(); const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: '导出备份', exact: true }).click(); const download = await downloadPromise; await download.saveAs(path.join(output, 'fixture-backup.json')); const backup = JSON.parse(await fs.readFile(path.join(output, 'fixture-backup.json'))); assert.equal(backup.kind, 'FlowCabinBackup'); assert.equal(backup.items.length, 18); assert.equal(backup.focus.tasks.length, 1); assert.equal(backup.focus.notes, 'QA 随手记备份内容'); assert.equal(backup.study.cards.length, 2); assert.equal(backup.study.countdowns[0].title, '期末'); check('backup-exports-collection-and-focus');
  await page.getByLabel('导入备份文件').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{invalid') }); await page.getByText('文件内容无法读取。', { exact: true }).waitFor(); check('backup-rejects-malformed-input');
  const imported = { kind: 'FlowCabinBackup', items: [{ ...items[0], id: 'backup-imported', title: '备份导入唱片' }] };
  await page.getByLabel('导入备份文件').setInputFiles({ name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) }); await page.getByText('导入完成：新增 1 张唱片，唱片架现在共有 19 张。', { exact: true }).waitFor(); assert(items.some(i => i.id === 'backup-imported')); check('backup-import-merges-new-album'); await closeDialog();
  assert.equal(await (await openLibrary(page)).getByRole('button', { name: '专辑墙', exact: true }).count(), 1, 'the album wall hangs on the shelf'); await closeLibrary(page); await openAlbumWall(page); await page.locator('.wall-library-album').first().click(); await page.waitForFunction(() => { const c = document.querySelector('.wall-canvas-wrap canvas'); return c?.width > 300 && !document.querySelector('.wall-preview-bar').textContent.includes('正在更新'); }); await screenshot('album-wall');
  const pngPromise = page.waitForEvent('download'); await page.getByRole('button', { name: '下载 PNG', exact: true }).click(); const png = await pngPromise; await png.saveAs(path.join(output, 'fixture-album-wall.png')); const pngBytes = await fs.readFile(path.join(output, 'fixture-album-wall.png')); assert.equal(pngBytes.subarray(1, 4).toString(), 'PNG'); assert(pngBytes.length > 1000); check('album-wall-paints-and-downloads-real-png'); await closeDialog();
  await backToDesk(page); await page.keyboard.press('h'); assert(await page.evaluate(() => document.documentElement.classList.contains('room-zen'))); await screenshot('zen-mode'); await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => document.documentElement.classList.contains('room-zen')), false, 'Esc leaves 收起工具'); check('zen-mode-keyboard');
  // 我的歌单: account playlists, link import, file import; a playlist plays like an album.
  neteaseLoggedIn = true;
  await openAddToShelf(page, '我的歌单');
  await page.getByRole('tab', { name: /网易云音乐/ }).click();
  await page.locator('.playlist-card', { hasText: '深夜写作' }).click(); await page.locator('.playlist-hero h3', { hasText: '深夜写作' }).waitFor();
  assert.equal(await page.locator('.playlist-track').count(), 12); await page.locator('.playlist-facts').getByText('尚未收藏', { exact: true }).waitFor(); await screenshot('playlist-detail');
  await page.setViewportSize({ width: 960, height: 600 }); await screenshot('playlist-detail-960x600'); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByLabel('在歌单中查找').fill('laufey'); assert.equal(await page.locator('.playlist-track').count(), 1); await page.getByLabel('在歌单中查找').fill('');
  await page.getByRole('button', { name: '放上唱片架' }).click(); await page.locator('.playlist-notice', { hasText: '已放上唱片架' }).waitFor();
  const savedPlaylist = items.find(i => i.type === 'playlist'); assert(savedPlaylist, 'playlist saved as a shelf record'); assert.equal(savedPlaylist.trackDetails[0].artist, 'Laufey'); assert.equal(savedPlaylist.trackDetails[0].source, 'netease'); assert.equal(savedPlaylist.externalIds.playlist, 'netease:9002');
  await page.getByRole('button', { name: '全部歌单' }).click(); await page.getByRole('tab', { name: /链接与文件/ }).click();
  await page.getByLabel('歌单分享链接').fill('https://y.qq.com/n/ryqq/playlist/9003'); await page.getByRole('button', { name: '读取歌单' }).click(); await page.locator('.playlist-badge', { hasText: 'QQ 音乐' }).waitFor();
  await page.getByRole('button', { name: '全部歌单' }).click();
  await page.locator('.playlist-import input[type=file]').setInputFiles({ name: 'night.m3u8', mimeType: 'audio/x-mpegurl', buffer: Buffer.from('#EXTM3U\n#EXTINF:200,Fixture Artist - 晨光\n/x.mp3\n') });
  await page.locator('.playlist-hero h3', { hasText: 'night' }).waitFor(); assert.equal(await page.locator('.playlist-track').count(), 1);
  await page.getByRole('button', { name: '放上唱机' }).click(); await page.locator('.add-album-dialog').waitFor({ state: 'hidden' });
  await closeLibrary(page); await page.waitForFunction(() => window.__cabinDeckItem?.id?.length > 0); assert.match(await (await openConsole(page)).locator('.console-artist').innerText(), /Fixture Artist · 歌单/); await closeConsole(page);
  check('playlists-account-link-and-file-import-play-on-deck');
  // 唱机特写: the close-up opens with T, draws the deck, and Esc returns.
  await page.keyboard.press('t'); await page.locator('.listening-corner .pixel-turntable').waitFor(); await page.waitForTimeout(300); await screenshot('listening-corner');
  await page.getByRole('radio', { name: '台灯', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.querySelector('.listening-corner').contains(document.activeElement)), true, 'Shift+Tab cannot escape the modal corner');
  await page.keyboard.press('Tab');
  assert.equal(await page.getByRole('radio', { name: '台灯', exact: true }).evaluate(element => element === document.activeElement), true, 'Tab wraps from the last corner control back to its first');
  check('listening-corner-keyboard-focus-stays-inside');
  assert(await page.locator('.pixel-turntable').evaluate(c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let lit = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) lit++; return lit > c.width * c.height * .5; }), 'deck is painted');
  assert.equal(await page.locator('.corner-tracks li').count(), 1);
  const cornerLoaded = (await deckRecord(page))?.id;
  await page.getByLabel('查找唱片箱', { exact: true }).fill('测试唱片 3'); assert.equal(await page.locator('.corner-crate li').count(), 1);
  await page.evaluate(() => { window.__queueSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key === 'album-circle-player-queue-v1') throw new Error('fixture quota'); return window.__queueSetItem.call(this, key, value); }; });
  await page.getByRole('button', { name: '加入待播 测试唱片 3', exact: true }).click();
  await page.locator('.corner-crate [role=alert]').filter({ hasText: '无法保存待播' }).waitFor();
  assert.equal(await page.getByRole('button', { name: '加入待播 测试唱片 3', exact: true }).isDisabled(), false);
  assert.doesNotMatch(await page.locator('.corner-crate-status').innerText(), /已加入待播/);
  await page.evaluate(() => { Storage.prototype.setItem = window.__queueSetItem; delete window.__queueSetItem; });
  await page.getByRole('button', { name: '加入待播 测试唱片 3', exact: true }).evaluate(button => { button.click(); button.click(); }); await page.locator('.corner-crate-status', { hasText: '《测试唱片 3》已加入待播' }).waitFor();
  assert.equal((await deckRecord(page))?.id, cornerLoaded, 'enqueue keeps the current record playing');
  assert.equal(await page.getByRole('button', { name: '加入待播 测试唱片 3', exact: true }).isDisabled(), true);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('album-circle-player-queue-v1')).ids.filter(id => id === 'fixture-2').length), 1);
  await page.getByLabel('查找唱片箱', { exact: true }).fill(''); await screenshot('listening-corner-queue');
  await page.setViewportSize({ width: 960, height: 600 }); await screenshot('listening-corner-queue-960x600');
  for (const selector of ['.corner-bar-actions', '.corner-side', '.corner-crate-tools']) { const bounds = await page.locator(selector).boundingBox(); assert(bounds.x >= 0 && bounds.x + bounds.width <= 961 && bounds.y >= 0 && bounds.y + bounds.height <= 601, `${selector} must remain inside the compact viewport`); }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); await page.setViewportSize({ width: 1440, height: 900 });
  check('listening-corner-search-and-enqueue-without-interrupting');
  await page.keyboard.press('Escape'); await page.locator('.listening-corner').waitFor({ state: 'detached' });
  check('listening-corner-opens-paints-and-closes');
  // 沉入桌面: one entry point (设置 › 桌面); the page asks the shell and follows cabin:desktop-mode.
  assert.equal(await page.getByRole('button', { name: '设为桌面动态背景' }).count(), 0, 'the old wallpaper entry point is gone');
  assert(await page.evaluate(() => typeof window.cabinDesktop?.enterDesktopMode === 'function' && window.cabinDesktop.getDesktopModeStatus().supported === true), 'public desktop API is installed');
  await openSettingsSection(page, '桌面');
  const sinkToggle = settingsDialog(page).getByRole('checkbox', { name: '沉入桌面', exact: true });
  await sinkToggle.click();
  assert(await page.evaluate(() => window.__desktopCommands.at(-1) === 'album-desktop://action/desktop-sink-enter'), 'the desktop client asks the shell');
  assert(await page.evaluate(() => window.__desktopCommands.some((value) => value.startsWith('album-desktop://action/tray-pet?id='))), 'the tray follows the room pet');
  await page.evaluate(() => { window.cabinDesktopStatus = { active: true, busy: false, supported: true, via: 'wallpaper', reason: '' }; window.dispatchEvent(new CustomEvent('cabin:desktop-mode', { detail: window.cabinDesktopStatus })); });
  await page.waitForFunction(() => document.querySelector('input[aria-label="沉入桌面"]')?.checked === true);
  await sinkToggle.click();
  assert(await page.evaluate(() => window.__desktopCommands.at(-1) === 'album-desktop://action/desktop-sink-exit'));
  await page.evaluate(() => { window.cabinDesktopStatus = { active: false, busy: false, supported: true, via: '', reason: '' }; window.dispatchEvent(new CustomEvent('cabin:desktop-mode', { detail: window.cabinDesktopStatus })); });
  await page.waitForFunction(() => document.querySelector('input[aria-label="沉入桌面"]')?.checked === false);
  await closeSettings(page);
  check('desktop-sink-single-entry-and-api');
  // Fallback layer (no behind-icons desktop): the cabin stays interactive with widgets.
  await page.evaluate(() => { window.cabinDesktopStatus = { active: true, busy: false, supported: true, via: 'window', reason: '桌面背景层暂时无法挂载' }; window.dispatchEvent(new CustomEvent('cabin:desktop-mode', { detail: window.cabinDesktopStatus })); document.documentElement.dataset.desktopMode = 'true'; window.dispatchEvent(new CustomEvent('album-desktop-mode', { detail: { active: true } })); }); // the shell's fallback answer
  await page.locator('.desktop-widgets').waitFor();
  assert(await page.evaluate(() => document.documentElement.classList.contains('room-desktop')));
  for (const name of ['时钟', '正在播放', '专注', '待办']) await page.getByRole('region', { name, exact: true }).waitFor();
  await page.getByLabel('桌面待办', { exact: true }).fill('桌面上的待办'); await page.keyboard.press('Enter'); await page.locator('.desktop-widgets').getByText('桌面上的待办', { exact: true }).waitFor();
  await page.getByRole('button', { name: /移动小组件：待办/ }).focus(); await page.keyboard.press('ArrowLeft');
  assert(await page.evaluate(() => JSON.parse(localStorage.getItem('album-circle-desktop-widgets-v1')).todo.x < .77), 'widget position is remembered');
  await screenshot('desktop-mode');
  await page.getByRole('button', { name: '浮出桌面', exact: true }).click(); assert(await page.evaluate(() => window.__desktopCommands.at(-1) === 'album-desktop://action/desktop-sink-exit'));
  await page.evaluate(() => { window.cabinDesktopStatus = { active: false, busy: false, supported: true, via: '', reason: '' }; window.dispatchEvent(new CustomEvent('cabin:desktop-mode', { detail: window.cabinDesktopStatus })); document.documentElement.dataset.desktopMode = 'false'; window.dispatchEvent(new CustomEvent('album-desktop-mode', { detail: { active: false } })); });
  await page.locator('.desktop-widgets').waitFor({ state: 'detached' }); await page.locator('.desk-home').waitFor();
  check('desktop-mode-widgets-todo-and-layout');
  await (await openConsole(page)).getByRole('button', { name: '取下唱片' }).click(); await closeConsole(page);
  items = items.filter(i => i.type !== 'playlist'); neteaseLoggedIn = false; await page.reload(); await page.locator('.desk-home').waitFor();
  const companion = await page.evaluate(() => window.albumCompanionSnapshot());
  assert.equal(companion.petId, PETS.at(-1).id); assert(companion.room.items.length > 0); check('companion-snapshot-carries-selected-pet-and-room');
  await context.addInitScript(({ companion }) => {
    window.__nativeFixtureCalls = [];
    window.albumWallpaper = { getSnapshot: async () => ({ ...companion.room, focus: companion.focus }), onSnapshot: fn => { window.__pushWallpaper = fn; return () => {}; } };
    window.__miniCalls = [];
    window.albumMini = { getSnapshot: async () => ({ ...companion, track: '雪夜 · 预览', musicPlaying: true }), onSnapshot: () => () => {}, command: v => window.__miniCalls.push(v), player: a => window.__miniCalls.push('player:' + a), exit: () => window.__miniCalls.push('exit') };
    window.albumPet = { getSnapshot: async () => ({ companion, size: 192 }), onSnapshot: fn => { window.__pushPet = fn; return () => {}; }, setHit: v => window.__nativeFixtureCalls.push(['hit', v]), moveBy: (x, y) => window.__nativeFixtureCalls.push(['move', x, y]), dragEnd: () => {}, menu: () => window.__nativeFixtureCalls.push(['menu']), open: () => window.__nativeFixtureCalls.push(['open']), command: v => window.__nativeFixtureCalls.push(['command', v]) };
  }, { companion });
  const mainPage = page;
  page = await context.newPage(); await page.goto(origin + '/wallpaper.html'); await page.locator('.wallpaper-desk.is-lit').waitFor();
  // 沉入桌面 is the desk itself (src/WallpaperRoom.jsx): the walnut, the pieces at its back edge, the LED clock, and a slip
  // that says what is on the turntable. Nothing on it can be pressed.
  const wallpaperErrors = []; const wallpaperError = error => wallpaperErrors.push(error.stack || error.message);
  page.on('pageerror', wallpaperError);
  assert.equal(await page.locator('.wallpaper-desk .desk-piece').count(), 3, 'the Control Panel corner, the clock and the post box');
  assert.equal(await page.locator('.wallpaper-desk .desk-clock-glass').count(), 1, 'the LED clock');
  assert.equal(await page.locator('.wallpaper-desk button').count(), 0, 'nothing to press on the wallpaper');
  await page.evaluate(({ room }) => window.__pushWallpaper({ ...room, record: { id: 'w', title: '雪夜', artist: '预览' }, spinning: true }), { room: companion.room });
  await page.locator('.wallpaper-slip', { hasText: '雪夜' }).waitFor(); await screenshot('wallpaper-desk');
  assert.deepEqual(wallpaperErrors, [], 'the wallpaper desk draws without errors');
  page.off('pageerror', wallpaperError); check('wallpaper-is-the-desk'); await page.close();
  page = await context.newPage(); await page.setViewportSize({ width: 380, height: 92 }); await page.goto(origin + '/mini.html');
  await page.locator('.mini-bar').waitFor(); await page.getByText('雪夜 · 预览').waitFor();
  assert.equal(await page.locator('.mini-actions').evaluate(e => getComputedStyle(e).opacity), '0', 'controls hidden until hover');
  await page.hover('.mini-bar'); await page.getByRole('button', { name: '上一首' }).click(); await page.getByRole('button', { name: '暂停', exact: true }).click(); await page.getByRole('button', { name: '下一首' }).click(); await page.getByRole('button', { name: '浮出桌面' }).click();
  await page.locator('.mini-bar').dblclick({ position: { x: 4, y: 4 } });
  assert.deepEqual(await page.evaluate(() => window.__miniCalls), ['player:previous', 'player:toggle', 'player:next', 'exit', 'exit']); await screenshot('mini-player');
  check('mini-player-hover-controls-and-double-click-exit'); await page.close();
  page = await context.newPage(); await page.setViewportSize({ width: 420, height: 420 }); await page.goto(origin + '/pet.html'); await page.locator('.pet-cat .pixel-cat').waitFor();
  for (const pet of PETS) {
    await page.evaluate(({ companion, petId }) => window.__pushPet({ companion: { ...companion, petId }, size: 192 }), { companion, petId: pet.id });
    await page.locator(`.pet-cat .pixel-cat[data-pet-id="${pet.id}"]`).waitFor(); await screenshot(`desktop-pet-${pet.id}`);
  }
  await page.locator('.pet-cat').press('Enter'); await page.locator('.pet-bubble').waitFor(); check('pet-renderer-all-species-and-keyboard-poke-mocked-bridge');
  // v1.18 desktop-pet actions: feed (menu / dropped 小鱼干 → cat-feed; a new fedAt plays the eat frames),
  // a refused feed says why, double-click hops, right-click opens the shell menu.
  await page.evaluate(({ companion }) => window.__pushPet({ companion: { ...companion, petId: 'cat' }, size: 192 }), { companion }); await page.waitForTimeout(300);
  const calls = () => page.evaluate(() => window.__nativeFixtureCalls.filter((c) => c[0] === 'command' || c[0] === 'menu').map((c) => c.join(':')));
  await page.evaluate(() => { const stage = document.querySelector('.pet-stage'), cat = document.querySelector('.pet-cat').getBoundingClientRect(); const dt = new DataTransfer(); dt.setData('application/x-cabin-fish', '1');
    const at = { clientX: cat.left + cat.width / 2, clientY: cat.top + cat.height * .6, bubbles: true, cancelable: true, dataTransfer: dt };
    stage.dispatchEvent(new DragEvent('dragover', at)); stage.dispatchEvent(new DragEvent('drop', at)); });
  assert.ok((await calls()).includes('command:cat-feed'), 'a 小鱼干 dropped on the desktop pet asks the cabin to feed it');
  await page.evaluate(({ companion }) => window.__pushPet({ companion: { ...companion, petId: 'cat', care: { fedAt: Date.now(), ok: true, note: '', tier: 'happy' } }, size: 192 }), { companion });
  await page.locator('.pet-stage[data-action="eat"]').waitFor(); await screenshot('desktop-pet-eating');
  await page.locator('.pet-stage:not([data-action])').waitFor({ timeout: 4000 });
  await page.evaluate(({ companion }) => window.__pushPet({ companion: { ...companion, petId: 'cat', care: { fedAt: Date.now() + 1, ok: false, note: '小猫今天已经吃饱啦，明天再喂吧～', tier: 'happy' } }, size: 192 }), { companion });
  await page.locator('.pet-bubble', { hasText: '吃饱啦' }).waitFor();
  const opaque = await page.evaluate(() => { const canvas=document.querySelector('.pet-cat .pixel-cat'),r=canvas.getBoundingClientRect(),pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);for(let y=.6;y<.8;y+=.02)for(let x=.4;x<.6;x+=.02)if(pixels.data[(Math.floor(y*pixels.height)*pixels.width+Math.floor(x*pixels.width))*4+3]>245)return{x:r.left+x*r.width,y:r.top+y*r.height};return null; });
  assert.ok(opaque,'click the displayed pet, using its actual drawn alpha');
  await page.mouse.click(opaque.x, opaque.y); await page.waitForTimeout(80); await page.mouse.click(opaque.x, opaque.y);
  await page.locator('.pet-stage[data-action="hop"]').waitFor(); await screenshot('desktop-pet-hop');
  await page.mouse.click(opaque.x, opaque.y, { button: 'right' }); assert.ok((await calls()).includes('menu'), 'right-click opens the pet menu');
  check('desktop-pet-feed-drop-eat-refusal-double-click-hop');
  // 打字跟随: a key-activity time from the shell hook, or the cabin's own keydown time, shows TYPING_POSE, then it settles.
  await page.waitForTimeout(700);
  await page.evaluate(({ companion }) => window.__pushPet({ companion: { ...companion, petId: 'cat' }, size: 192, typingAt: Date.now() }), { companion });
  await page.locator('.pet-stage[data-typing="true"]').waitFor(); await screenshot('desktop-pet-typing');
  await page.locator('.pet-stage:not([data-typing])').waitFor({ timeout: 3000 });
  await page.evaluate(({ companion }) => window.__pushPet({ companion: { ...companion, petId: 'cat', typingAt: Date.now() }, size: 192 }), { companion });
  await page.locator('.pet-stage[data-typing="true"]').waitFor();
  check('desktop-pet-typing-follow-hook-and-in-cabin-fallback'); await page.close(); page = mainPage;
  // bini v1.18: (1) a double-click right after the desk pet loads must hop: the pointer resting on the cat is
  // hit-tested from the shell's cursor point (no mousemove needed); (2) under the shell's real CSP the
  // pet-life hearts (data: SVG) render with no CSP violation. Only the shell's img-src is applied here:
  // vite dev needs inline scripts that the full shell CSP (built pages only) would block.
  {
    const shellCsp = companionCsp('pet');
    const fresh = await context.newPage(); await fresh.emulateMedia({ reducedMotion: 'no-preference' }); await fresh.setViewportSize({ width: 420, height: 420 });
    // A <meta> CSP added before the stylesheets load (a routed response would trip Chromium's local-network check on vite's socket).
    const imgSrc = shellCsp.split(';').map((d) => d.trim()).find((d) => d.startsWith('img-src'));
    await fresh.addInitScript((policy) => { const add = () => { const meta = document.createElement('meta'); meta.httpEquiv = 'Content-Security-Policy'; meta.content = policy; document.head.prepend(meta); };
      if (document.head) add(); else new MutationObserver((_, o) => { if (document.head) { add(); o.disconnect(); } }).observe(document, { childList: true, subtree: true }); }, imgSrc);
    await fresh.addInitScript(() => { window.__cspViolations = []; document.addEventListener('securitypolicyviolation', (e) => window.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`));
      const at = () => { const r = document.querySelector('.pet-cat')?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height * .75 } : null; };
      const base = window.albumPet; window.albumPet = { ...base, cursor: () => new Promise((resolve) => { const wait = () => at() ? resolve(at()) : requestAnimationFrame(wait); wait(); }) }; });
    await fresh.goto(origin + '/pet.html'); await fresh.locator('.pet-cat .pixel-cat').waitFor();
    await fresh.waitForFunction(() => window.__nativeFixtureCalls.some((c) => c[0] === 'hit' && c[1] === true), null, { timeout: 3000 });
    const point = await fresh.evaluate(() => { const r = document.querySelector('.pet-cat').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * .75, now: performance.now() }; });
    await fresh.mouse.click(point.x, point.y); await fresh.waitForTimeout(60); await fresh.mouse.click(point.x, point.y);
    await fresh.locator('.pet-stage[data-action="hop"]').waitFor({ timeout: 2000 });
    await fresh.waitForTimeout(800); await fresh.mouse.click(point.x, point.y);
    // Hearts are short-lived: read the style in-page while one is attached (CI raced a detached node → ''),
    // then load that exact data: image under the page's CSP — it must decode, not be blocked.
    const heartImage = await (await fresh.waitForFunction(() => { const e = document.querySelector('.pet-fx .fx-heart'); const bg = e && e.isConnected ? getComputedStyle(e).backgroundImage : ''; return bg && bg !== 'none' ? bg : null; }, null, { timeout: 2000, polling: 'raf' })).jsonValue();
    assert.match(heartImage, /^url\("data:image\/svg\+xml/);
    assert.equal(await fresh.evaluate((bg) => new Promise((resolve) => { const img = new Image(); img.onload = () => resolve('loaded'); img.onerror = () => resolve('blocked'); img.src = bg.slice(5, -2).replace(/\\"/g, '"'); }), heartImage), 'loaded', 'the heart data: image is allowed by img-src');
    page = fresh; await screenshot('desktop-pet-hearts-under-shell-csp'); page = mainPage;
    assert.deepEqual(await fresh.evaluate(() => window.__cspViolations), [], 'no CSP violation for the pet-life effects');
    await fresh.close(); check('desktop-pet-first-double-click-hops-and-hearts-render-under-shell-csp');
  }
  report.limitations = ['Browser fixtures test renderer behavior, not native Electron IPC or OS integrations.', 'WAV decoding/playback progress is real, but physical speaker output and streaming providers are not tested.', 'Screenshots are review artifacts; no approved pixel baseline has been established.', 'macOS/Windows installers, wallpaper attachment, media permissions, and pet window click-through require native acceptance tests.'];
  for (const [index, call] of report.apiCalls.entries()) if (call.method === 'DELETE' && call.path === '/api/items') assert(!report.apiCalls.slice(index + 1).some(later => later.method === 'PATCH' && later.path === call.path && later.id === call.id), 'Deleted album received a late notes autosave');
  check('deleted-albums-do-not-receive-late-autosaves');
  // 设置 › 关于: version + update row (browser preview has no updater, says so).
  await openSettingsSection(page, '实验室');
  const about = page.locator('.update-panel'); await about.getByText(/心流小屋 v\d+\.\d+\.\d+/).waitFor(); const send = (detail) => page.evaluate((value) => { window.cabinUpdateState = value; window.dispatchEvent(new CustomEvent('cabin:update-state', { detail: value })); }, detail);
  if (await about.getByText('网页版总是最新的').count()) assert.equal(await about.getByRole('button', { name: '检查更新' }).count(), 0, 'no fake update button on the web');
  else {
    await send({ status: 'available', mode: 'notify', latestVersion: '9.9.0', reason: '这个 macOS 版本没有 Apple 开发者签名，系统不允许自动安装更新。', downloadUrl: 'https://github.com/ooooooomygosh/Flow-Cabin/releases/download/v9.9.0/FlowCabin-9.9.0-mac-arm64.dmg', notes: '新功能' });
    await about.getByText(/发现新版本 v9\.9\.0.*签名/).waitFor(); await about.getByRole('button', { name: '下载安装包' }).waitFor(); assert.equal(await about.getByRole('button', { name: '重启安装' }).count(), 0);
    await send({ status: 'downloading', mode: 'install', percent: 50, autoDownload: true }); await about.getByText('下载中 50%').waitFor(); assert.equal(await about.getByRole('progressbar').getAttribute('aria-valuenow'), '50'); await about.getByLabel(/自动下载/).waitFor();
    await send({ status: 'downloaded', mode: 'install', latestVersion: '9.9.0', autoDownload: true }); await about.getByRole('button', { name: '重启安装' }).waitFor();
  }
  await screenshot('settings-about-update'); await page.keyboard.press('Escape'); check('settings-about-shows-version-and-update-status');
  // Refreshing an existing same-title track must carry its new artist / ID.
  neteaseLoggedIn = true; playlistRevision = false;
  await openAddToShelf(page, '我的歌单');
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
    assert(await page.locator('.add-album-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), 'playlist import fits the dialog');
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
  await failurePage.goto(origin); await playRecord(failurePage, '失败跳过回归'); await openConsole(failurePage);
  await failurePage.getByRole('switch', { name: '播放模式：单曲循环', exact: true }).waitFor();
  await failurePage.waitForFunction(() => { const audio = document.querySelector('audio[data-deck="active"]'); return audio && !audio.paused && audio.src.endsWith('bbbbbbbbbbbbbbbb'); });
  assert.equal(failures, 1, 'the failed recording was not retried by repeat-one');
  await failurePage.close(); check('unplayable-track-advances-under-repeat-one');
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.unexpectedRequests, []); assert.deepEqual(report.consoleErrors, []); assert.deepEqual(report.failedRequests, []);
  report.passed = true;
} catch (error) { report.passed = false; report.error = error.stack || String(error); console.error(report.error); process.exitCode = 1; if (page && !page.isClosed()) { await screenshot('failure').catch(() => {}); await fs.writeFile(path.join(output, 'failure.html'), await page.content()).catch(() => {}); } }
finally { report.finishedAt = new Date().toISOString(); await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser?.close(); server?.kill(); console.log('Report: ' + path.join(output, 'report.json')); }
