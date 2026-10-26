/** Offline art integration checks; no real accounts, personal data or native claims. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { launchChromium } from './launch-browser.mjs';
import { hasViteLocalOrigin } from './vite-readiness.mjs';
import { onboardingSeed } from './app-version.mjs';
import { ART_THEMES, PET_ART_IDS } from '../src/room2/room-art.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.env.ROOM_STUDIO_OUTPUT || path.join(root, 'desktop/test-results/room-studio'));
const port = Number(process.env.ROOM_STUDIO_PORT || 4198), origin = `http://127.0.0.1:${port}`;
const report = { startedAt: new Date().toISOString(), fixtureData: true, nativeTested: false, checks: [], pageErrors: [], blockedRequests: [] };
let server, browser, serverLog = '';
const pass = name => { report.checks.push(name); console.log('PASS ' + name); };
try {
  await fs.mkdir(output, { recursive: true });
  server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, env: { ...process.env, FLOW_CABIN_VITE_CACHE_DIR: path.join(output, 'vite-cache') }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', b => serverLog += b); server.stderr.on('data', b => serverLog += b);
  for (let i = 0; ; i++) {
    if (server.exitCode !== null || i > 100) throw Error('Vite failed: ' + serverLog);
    if (hasViteLocalOrigin(serverLog, origin) && await fetch(origin).then(r => r.ok, () => false)) break;
    await new Promise(r => setTimeout(r, 100));
  }
  browser = await launchChromium();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN', reducedMotion: 'reduce' });
  await context.addInitScript(seed => {
    localStorage.setItem('flow-cabin-onboarding-v1', seed);
    window.albumDesktopAppearance = { client: true, reduceMotion: true };
    window.open = () => null;
  }, onboardingSeed());
  await context.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.origin !== origin) { report.blockedRequests.push(u.origin); return route.abort(); }
    const json = value => route.fulfill({ json: value });
    if (u.pathname === '/desktop-sync/status') return json({ enabled: false, peers: [], addresses: [] });
    if (u.pathname === '/desktop-pets/packs') return json({ packs: [] });
    if (u.pathname === '/api/items') return json({ items: [] });
    if (u.pathname === '/desktop-music/config') return json({ qqLoggedIn: false, neteaseLoggedIn: false });
    if (u.pathname.startsWith('/desktop-music/')) return json({ available: false, folders: [], albumCount: 0, trackCount: 0 });
    return route.continue();
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', e => report.pageErrors.push(e.message));
  // The 2.0 modular room (room2) is a dev-only studio since 2.1: the classic toolbar shows its entry with ?room-studio.
  const enterRoom = async () => { await page.getByRole('button', { name: '生活小屋 · 制作中', exact: true }).click(); };
  const open = async () => { await page.goto(`${origin}/?room-studio`); await enterRoom(); };
  const ready = async theme => {
    await page.locator(`.room2-canvas[data-art-theme="${theme}"][data-art-ready=true]`).waitFor();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.locator('.room2-canvas canvas').count(), 1);
  };
  const controls = () => page.getByRole('dialog', { name: '小屋布置', exact: true });
  const openControls = async () => { if (!await controls().isVisible()) await page.getByRole('button', { name: '小屋布置与视角', exact: true }).click(); };
  const closeControls = async () => { if (await controls().isVisible()) await controls().getByRole('button', { name: '关闭小屋布置', exact: true }).click(); };
  const selectTheme = async theme => { await openControls(); await page.getByLabel('房间主题').selectOption(theme); await closeControls(); };
  const selectZone = async name => { await openControls(); await controls().getByRole('button', { name, exact: true }).click(); };
  await open(); await selectTheme('warm'); await ready('warm');
  await page.locator('.room2-canvas[data-pet-art=cat]').waitFor();
  assert.equal(await page.locator('.room2-object').count(), 14);
  for (const theme of ART_THEMES) {
    await selectTheme(theme); await ready(theme);
    await page.screenshot({ path: path.join(output, theme + '-1440.png') });
    pass(theme + ': matching shell, 14 independent furniture textures and pet');
  }
  await selectTheme('warm'); await ready('warm');
  assert.equal(await page.locator('.room2-header, .room2-experience > .room2-tools').count(), 0);
  await openControls(); await page.getByRole('button', { name: '布置家具', exact: true }).click();
  const clock = page.locator('.room2-object[aria-label="专注钟"]');
  const before = await clock.getAttribute('style');
  await clock.focus(); await clock.press('ArrowDown');
  assert.notEqual(await clock.getAttribute('style'), before);
  await openControls(); await page.getByRole('button', { name: '撤销', exact: true }).click(); assert.equal(await clock.getAttribute('style'), before);
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await closeControls(); await page.reload(); await enterRoom(); await selectTheme('warm'); await ready('warm');
  assert.match(await page.locator('.room2-object[aria-label="专注钟"]').getAttribute('style'), /top: 88px/);
  pass('keyboard placement, undo/redo and saved layout survive reload');
  await openControls(); await controls().getByRole('button', { name: '布置家具', exact: true }).click(); await openControls();
  const inventory = page.getByRole('region', { name: '家具库存', exact: true });
  await inventory.getByRole('button', { name: '添加黑胶唱片', exact: true }).click();
  assert.equal(await page.locator('.room2-object').count(), 15);
  await page.screenshot({ path: path.join(output, 'inventory-atlas-add.png') });
  assert.equal(await inventory.locator('svg image').count(), 22);
  assert.equal(await inventory.getByRole('button', { name: '添加黑胶唱片', exact: true }).isDisabled(), true);
  await controls().getByRole('button', { name: '收起所选家具', exact: true }).click(); assert.equal(await page.locator('.room2-object').count(), 14);
  await controls().getByRole('button', { name: '撤销', exact: true }).click(); assert.equal(await page.locator('.room2-object').count(), 15);
  await controls().getByRole('button', { name: '重做', exact: true }).click(); assert.equal(await page.locator('.room2-object').count(), 14);
  await controls().getByRole('button', { name: '完成布置', exact: true }).click();
  pass('real atlas furniture inventory: add, remove, undo and redo preserve legal layout and initial scene');
  for (const petId of PET_ART_IDS) {
    await page.evaluate(petId => {
      const key = 'album-circle-library-v1-local-owner';
      const data = JSON.parse(localStorage.getItem(key) || '{"rooms":{}}');
      data.rooms ||= {}; data.rooms['local-room'] = { ...data.rooms['local-room'], petId };
      localStorage.setItem(key, JSON.stringify(data)); window.dispatchEvent(new StorageEvent('storage', { key }));
    }, petId);
    await page.locator('.room2-canvas[data-pet-art="' + petId + '"][data-art-ready=true]').waitFor();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: path.join(output, 'pet-' + petId + '.png') });
  }
  const frozen = await page.locator('.room2-canvas canvas').evaluate(canvas => canvas.toDataURL());
  await page.waitForTimeout(160);
  assert.equal(await page.locator('.room2-canvas canvas').evaluate(canvas => canvas.toDataURL()), frozen);
  pass('all five selected pets load their own artwork; reduced motion holds the frame');
  await page.route('**/desktop-pets/packs/fixture-pack/atlas.png', route => route.fulfill({ path: path.join(root, 'public/pet-art/v2/cat/atlas.png'), contentType: 'image/png' }));
  await page.evaluate(() => { localStorage.setItem('cabin.petPack.v1', JSON.stringify({ id: 'fixture-pack', media: { type: 'spritesheet', width: 1254, height: 1254, frameWidth: 627, frameHeight: 627 }, animations: { idle: { frames: [0], fps: 1 } } })); window.dispatchEvent(new Event('cabin:pet-pack')); });
  const imported = page.locator('.room2-imported-pet canvas'); await imported.waitFor();
  await page.waitForFunction(() => { const c = document.querySelector('.room2-imported-pet canvas'); return c && c.getContext('2d').getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v > 0); });
  await page.evaluate(() => { localStorage.removeItem('cabin.petPack.v1'); window.dispatchEvent(new Event('cabin:pet-pack')); });
  await imported.waitFor({ state: 'detached' });
  pass('imported JSON pet pack renders actual atlas pixels in the room overlay and returns to built-in artwork');
  await page.setViewportSize({ width: 960, height: 600 }); await ready('warm');
  await page.screenshot({ path: path.join(output, 'warm-960.png') });
  for (const viewport of [{ width: 412, height: 915 }, { width: 915, height: 412 }]) {
    await page.setViewportSize(viewport);
    await selectZone('生活角'); await ready('warm');
    assert.equal(await page.evaluate(() => document.querySelector('.room2-dialog').scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, `warm-${viewport.width}.png`), fullPage: true });
    await page.getByRole('button', { name: '回到宠物', exact: true }).click();
    await page.waitForTimeout(50);
    assert.equal(await page.getByRole('button', { name: '生活角', exact: true }).getAttribute('aria-pressed'), 'true');
    const petVisible = await page.evaluate(() => {
      const viewport = document.querySelector('.room2-viewport').getBoundingClientRect();
      const bed = document.querySelector('.room2-object[aria-label="宠物窝"]').getBoundingClientRect();
      const petX = bed.x + bed.width / 2, petY = bed.y + bed.height * .7;
      return petX >= viewport.left && petX <= viewport.right && petY >= viewport.top && petY <= viewport.bottom;
    });
    assert.equal(petVisible, true, 'return to pet must reveal its bed within the room viewport');
    await page.screenshot({ path: path.join(output, `pet-return-${viewport.width}.png`), fullPage: true });
  }
  pass('960x600 and phone portrait/landscape keep controls within viewport; return to pet reveals its bed');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/room-scenes/modular/forest/asset-manifest.json', route => route.fulfill({ status: 503, body: 'fixture unavailable' }));
  await selectTheme('forest');
  await page.locator('.room2-fallback').filter({ hasText: '小屋画面暂时无法加载' }).waitFor();
  await openControls(); await page.locator('.room2-list summary').click();
  assert.equal(await page.locator('.room2-list').getByRole('button', { name: '专注钟', exact: true }).count(), 1);
  await page.unroute('**/room-scenes/modular/forest/asset-manifest.json');
  await selectTheme('seaside'); await ready('seaside');
  pass('missing art keeps accessible furniture list and next theme recovers');
  for (const theme of ['night-study', 'starlight', 'rain-train', 'greenhouse', 'warm']) {
    await selectTheme(theme); await ready(theme);
  }
  await page.keyboard.press('Escape'); await enterRoom(); await selectTheme('warm'); await ready('warm');
  pass('repeated texture swaps and dialog remount leave one WebGL canvas');
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.blockedRequests, []);
  pass('no uncaught JavaScript errors or external network calls');
  report.passed = true;
} catch (error) { report.passed = false; report.error = error.stack; throw error; }
finally {
  report.completedAt = new Date().toISOString();
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser?.close(); server?.kill();
}
