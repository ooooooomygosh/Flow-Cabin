'use strict';
// New turntable sources: a scanned local folder plays exact files, and the
// system player mirrors onto the deck with transport controls.
const { _electron } = require('playwright'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { mountFixture, albums, openMusicSettings, closeSettings, chooseSource } = require('./ui-fixture.cjs');
const desktop = path.resolve(__dirname, '..'), output = path.join(desktop, 'test-results'); fs.mkdirSync(output, { recursive: true });
const profile = path.join(output, `sources-ui-profile-${Date.now()}`);
const env = { ...process.env, ALBUM_DESKTOP_TEST_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.ALBUM_QA_EXE || require(path.join(desktop, 'node_modules/electron'));
const report = { executablePath, startedAt: new Date().toISOString(), fixtureData: true, checks: [], pageErrors: [] };
const check = (name, detail = {}) => { report.checks.push({ name, passed: true, ...detail }); console.log('PASS ' + name); };
const trackId = (file) => crypto.createHash('sha1').update('track:' + file).digest('hex').slice(0, 16);
let app, site, host;
(async () => {
  app = await _electron.launch({ executablePath, args: process.env.ALBUM_QA_EXE ? [] : [desktop], env }); app.context().setDefaultTimeout(18000); await app.firstWindow();
  for (let i = 0; i < 100; i++) { site = app.context().pages().find((p) => p.url().startsWith('https://album-circle.vercel.app')); host = app.context().pages().find((p) => p.url() === 'album-desktop://shell/index.html'); if (site && host) break; await new Promise((r) => setTimeout(r, 100)); }
  site.on('pageerror', (error) => report.pageErrors.push(error.message));
  const folder = path.join(profile, 'qa-music', 'QA 本地专辑');
  const local = { ...albums[0], id: 'local-fixture', title: 'QA 本地专辑', artist: '本机', tracks: ['01 晨光', '02 夜雨'], trackDetails: [{ title: '01 晨光', source: 'local', providerId: trackId(path.join(folder, '01 晨光.wav')) }, { title: '02 夜雨', source: 'local', providerId: trackId(path.join(folder, '02 夜雨.wav')) }], externalIds: { localAlbum: 'x' } };
  await mountFixture(app, site, { music: true, showroom: 'room', items: [local, ...albums.slice(1)] });
  await app.evaluate(() => globalThis.__qaLocalReady);

  const settings = await openMusicSettings(site);
  await settings.locator('.music-local-status', { hasText: '1 张专辑 · 2 首歌曲' }).waitFor();
  assert.equal(await settings.locator('.music-local-folders li').count(), 1); check('local-folder-scan-is-listed-in-settings');
  await closeSettings(site);

  await site.locator('.room-record').first().dblclick(); await chooseSource(site, 'local');
  await site.waitForFunction(() => document.querySelector('audio').currentTime > .2 && !document.querySelector('audio').paused);
  assert.match(await site.locator('audio[data-deck="active"]').getAttribute('src'), /\/desktop-music\/local\/audio\/[a-f\d]{16}$/);
  assert.ok((await site.locator('.turntable-status').innerText()).includes('本地文件')); check('local-album-plays-the-exact-indexed-file');
  await site.getByRole('button', { name: '下一首展示曲目' }).click(); await site.waitForFunction((id) => document.querySelector('audio').getAttribute('src')?.endsWith(id), local.trackDetails[1].providerId); check('local-next-track-switches-file');

  await chooseSource(site, 'system');
  await site.locator('.turntable-track', { hasText: '晴天' }).waitFor(); await site.locator('.room-turntable[data-spinning="true"]').waitFor();
  assert.equal(await site.locator('audio[data-deck="active"]').getAttribute('src'), null); assert.ok((await site.locator('.turntable-status').innerText()).includes('Spotify · 正在播放'));
  check('system-player-mirrors-onto-the-deck-without-local-audio');
  await site.getByRole('button', { name: '暂停系统播放器' }).click(); await site.locator('.room-turntable[data-spinning="false"]').waitFor();
  await site.getByRole('button', { name: '系统播放器下一首' }).click();
  await site.waitForFunction(async () => true); assert.deepEqual(await app.evaluate(() => globalThis.__qaSystemCommands), ['toggle', 'next']); check('system-transport-controls-reach-the-player');
  await site.screenshot({ path: path.join(output, 'sources-system.png') });
  await site.getByRole('button', { name: /收藏这张/ }).click();
  await site.waitForFunction(() => document.querySelector('input[name="cabin-album-search"]')?.value === '周杰伦 叶惠美'); await site.locator('.add-results li').first().waitFor(); check('collect-searches-the-catalog-for-this-album');
  assert.equal(report.pageErrors.length, 0, JSON.stringify(report.pageErrors)); assert.equal(await app.evaluate(() => globalThis.__qaBlockedWrites), 0);
  report.passed = true;
})().catch((error) => { report.error = error.stack || error.message; report.passed = false; process.exitCode = 1; }).finally(async () => {
  if (!report.passed && site && !site.isClosed()) await site.screenshot({ path: path.join(output, 'sources-failure.png') }).catch(() => {});
  report.finishedAt = new Date().toISOString(); fs.writeFileSync(path.join(output, 'sources-ui-report.json'), JSON.stringify(report, null, 2));
  if (!report.passed) console.error(report.error); await app?.close().catch(() => {});
});
