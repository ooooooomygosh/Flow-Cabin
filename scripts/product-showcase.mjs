/** Reproducible product screenshots of the actual renderer, with real catalog
 * albums and attributed artwork. No login, native actions, personal profile or data.
 * Headless only: never creates a visible window on either display.
 * BROWSER_EXECUTABLE may point to an already installed Chromium.
 */
import assert from 'node:assert/strict';
import { launchChromium } from './launch-browser.mjs';
import { showcaseAlbums } from './showcase-albums.mjs';
import { verifyOnboarding } from './onboarding-checks.mjs';
import { openRoomSettings } from './settings-actions.mjs';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.env.SHOWCASE_OUTPUT || path.join(root, 'docs/images/showcase'));
const evidence = path.join(root, 'desktop/test-results/product-presentation');
const port = Number(process.env.SHOWCASE_PORT || 4183), origin = `http://127.0.0.1:${port}`;
await fs.mkdir(output, { recursive: true }); await fs.mkdir(evidence, { recursive: true });
const report = { startedAt: new Date().toISOString(), fixtureData: true, realCatalogAlbums: true, artworkSources: 'scripts/showcase-albums.json', headless: true, realAccountsUsed: false, nativeIntegrationTested: false, checks: [], screenshots: [], errors: [], unexpectedRequests: [] };
const check = name => { report.checks.push(name); console.log('PASS ' + name); };
const albums = await showcaseAlbums();
let items = [], browser, server, page;
const shot = async (name, publicImage = false) => {
  await page.screenshot({ path: path.join(publicImage ? output : evidence, name + (publicImage ? '.jpg' : '.png')), animations: 'disabled', ...(publicImage ? { type: 'jpeg', quality: 88 } : {}) });
  report.screenshots.push({ name, publicImage, viewport: page.viewportSize() });
};
const fits = async (locator) => {
  const box = await locator.boundingBox(), viewport = page.viewportSize();
  assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, 'Control outside viewport');
};
try {
  server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; server.stdout.on('data', b => log += b); server.stderr.on('data', b => log += b);
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin)).ok) break; } catch {} if (server.exitCode !== null || i === 99) throw new Error(log || 'Server timeout'); await new Promise(r => setTimeout(r, 100)); }
  browser = await launchChromium();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'zh-CN', reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    window.albumDesktopAppearance = { client: true, reduceMotion: true };
    window.open = () => { throw new Error('Native actions are disabled in product screenshots'); };
    if (!localStorage.getItem('album-circle-focus-v1:local-owner')) localStorage.setItem('album-circle-focus-v1:local-owner', JSON.stringify({ version: 1, settings: { notify: false, chime: false, autoSound: false }, tasks: [], sessions: [], timer: { phase: 'idle', round: 0 }, rewards: { fish: 0, xp: 0 } }));
  });
  const routeHandler = route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { report.unexpectedRequests.push(url.origin); return route.abort(); }
    if (url.pathname === '/api/items') return route.fulfill({ json: { items } });
    if (url.pathname === '/desktop-music/config') return route.fulfill({ json: { qqLoggedIn: false, neteaseLoggedIn: false } });
    if (url.pathname === '/desktop-music/local/summary') return route.fulfill({ json: { folders: [], albumCount: 0, trackCount: 0 } });
    if (url.pathname === '/desktop-music/local/albums') return route.fulfill({ json: { albums: [] } }); // empty library: 播放测试 plays the chime
    if (/^\/(api|desktop-music)\//.test(url.pathname)) { report.unexpectedRequests.push(url.pathname); return route.abort(); }
    return route.continue();
  };
  await context.route('**/*', routeHandler);
  await verifyOnboarding({ browser, origin, routeHandler, evidence, output, check });
  page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', e => report.errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  await page.goto(origin); await page.getByRole('button', { name: '先专注一会儿' }).waitFor(); await page.evaluate(() => document.fonts.ready);
  for (const viewport of [{ width: 1440, height: 900 }, { width: 960, height: 600 }]) {
    await page.setViewportSize(viewport);
    assert.equal(await page.locator('.room-now-playing').count(), 0); assert.equal(await page.locator('.room-shelf-navigation').count(), 0);
    for (const name of ['添加第一张专辑', '先专注一会儿']) await fits(page.getByRole('button', { name, exact: true }));
    await shot(`welcome-${viewport.width}x${viewport.height}`);
    await page.getByRole('button', { name: '先专注一会儿' }).click(); await page.getByRole('button', { name: '开始专注', exact: true }).waitFor();
    assert.equal(await page.getByRole('tab', { name: '番茄钟' }).getAttribute('aria-selected'), 'true'); assert.equal(await page.locator('.focus-badge').getAttribute('aria-expanded'), 'true');
    await fits(page.getByRole('button', { name: '开始专注', exact: true })); await page.getByRole('button', { name: '收起专注工具' }).click();
    await page.getByRole('button', { name: '添加第一张专辑' }).click(); await page.getByRole('dialog', { name: '添加专辑' }).waitFor(); await page.keyboard.press('Escape');
    check(`welcome-two-paths-and-visible-controls-${viewport.width}x${viewport.height}`);
  }
  items = albums; await page.setViewportSize({ width: 1440, height: 900 }); await page.reload(); await page.locator('.room-record').first().waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.pixel-artwork canvas.is-painted').length >= 12);
  await page.locator('.room-record').nth(5).dblclick(); await page.locator('.room-turntable[data-loaded-id="showcase-5"]').waitFor();
  await page.locator('.turntable-status', { hasText: '无音频' }).waitFor(); // the quick-source row is gone; visual mode says so in the status await page.waitForTimeout(400); await shot('cabin', true);
  assert.equal(await page.locator('.room-shelf-navigation').count(), 0); check('twelve-albums-no-redundant-paging-and-visual-audio-hint');
  await page.locator('.focus-badge').click(); await page.getByRole('button', { name: '开始专注', exact: true }).click(); await page.locator('.focus-badge.is-running').waitFor(); await page.locator('.room-cat-bubble', { hasText: '还剩 25 分钟' }).waitFor(); await shot('focus', true);
  await page.getByRole('button', { name: '暂停', exact: true }).click(); check('focus-start-and-pause-from-visible-tool'); await page.getByRole('button', { name: '收起专注工具' }).click();
  await openRoomSettings(page);
  await page.locator('.scene-choice img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
  for (const name of ['奶糖', '蛋挞', '棉花', '可可', '枫糖']) await fits(page.locator('.pet-choice strong', { hasText: name }));
  await fits(page.getByRole('button', { name: '回到小屋', exact: true })); check('six-scene-thumbnails-and-all-partner-names-visible');
  await shot('personalization', true); await page.getByRole('button', { name: '回到小屋' }).click();
  await page.locator('.room-cat').click(); await page.locator('.room-cat-bubble').waitFor(); check('partner-poke-shows-response');
  await page.keyboard.press('z'); assert(await page.evaluate(() => document.documentElement.classList.contains('room-zen'))); await shot('immersive'); await page.keyboard.press('Escape'); check('immersive-enter-and-exit');
  await page.setViewportSize({ width: 960, height: 600 }); await shot('cabin-960x600');
  const { ROOM_SCENES } = await import('../src/scene-catalog.mjs');
  for (const scene of ROOM_SCENES) {
    await openRoomSettings(page); await page.getByRole('button', { name: `选择场景 ${scene.label}`, exact: true }).click(); await page.getByRole('button', { name: '回到小屋' }).click(); await shot(`scene-${scene.id}-960x600`);
    for (const name of ['设置', '添加专辑']) await fits(page.getByRole('button', { name, exact: true }));
  }
  check('all-six-scenes-compact-controls-fit');
  if (process.env.SHOWCASE_TOUR === '1') {
    const tour = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'zh-CN', reducedMotion: 'no-preference', recordVideo: { dir: evidence, size: { width: 1280, height: 800 } } });
    await tour.route('**/*', routeHandler);
    await tour.addInitScript(() => {
      window.open = () => { throw new Error('No native actions in the product tour'); };
      localStorage.setItem('album-circle-focus-v1:local-owner', JSON.stringify({ version: 1, settings: { notify: false, chime: false, autoSound: false }, tasks: [], sessions: [], timer: { phase: 'idle', round: 0 }, rewards: { fish: 0, xp: 0 } }));
    });
    const demo = await tour.newPage();
    demo.on('pageerror', error => report.errors.push(error.message));
    await demo.goto(origin); await demo.waitForFunction(() => document.querySelectorAll('.pixel-artwork canvas.is-painted').length >= 12);
    await demo.locator('.room-record').nth(5).dblclick(); await demo.waitForTimeout(2000);
    await demo.getByRole('button', { name: '设置', exact: true }).click(); await demo.waitForTimeout(1300);
    await demo.getByRole('tab', { name: '关于', exact: true }).click(); await demo.waitForTimeout(900);
    await demo.getByRole('button', { name: '重新引导', exact: true }).click(); await demo.waitForTimeout(1800);
    await demo.getByRole('button', { name: '开始设置', exact: true }).click(); await demo.waitForTimeout(2200);
    await demo.getByRole('button', { name: '下一步', exact: true }).click(); await demo.waitForTimeout(1800);
    await demo.getByRole('button', { name: '下一步', exact: true }).click(); await demo.waitForTimeout(2200);
    await demo.getByRole('button', { name: '跳过引导', exact: true }).click(); await demo.waitForTimeout(900);
    await demo.locator('.focus-badge').click(); await demo.waitForTimeout(1500);
    await demo.getByRole('button', { name: '开始专注', exact: true }).click(); await demo.waitForTimeout(1700);
    await demo.getByRole('button', { name: '收起专注工具', exact: true }).click();
    await openRoomSettings(demo); await demo.waitForTimeout(1300);
    await demo.getByRole('button', { name: '选择场景 林间书屋', exact: true }).click();
    await demo.getByRole('button', { name: '选择桌宠 枫糖', exact: true }).click(); await demo.waitForTimeout(1200);
    await demo.getByRole('button', { name: '回到小屋', exact: true }).click(); await demo.waitForTimeout(1700);
    await demo.keyboard.press('z'); await demo.waitForTimeout(2000);
    const video = demo.video(); await tour.close();
    await promisify(execFile)('ffmpeg', ['-y', '-i', await video.path(), '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '25', '-movflags', '+faststart', path.join(output, 'cabin-tour.mp4')], { timeout: 60000 });
    report.video = 'cabin-tour.mp4';
    check('real-renderer-tour-recorded-with-motion-and-no-audio');
  }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.unexpectedRequests, []); report.passed = true;
} catch (e) { report.passed = false; report.error = e.stack; process.exitCode = 1; console.error(e); if (page) await shot('failure').catch(() => {}); }
finally { report.finishedAt = new Date().toISOString(); await fs.writeFile(path.join(evidence, 'report.json'), JSON.stringify(report, null, 2)); await browser?.close(); server?.kill(); console.log('Report: ' + path.join(evidence, 'report.json')); }
