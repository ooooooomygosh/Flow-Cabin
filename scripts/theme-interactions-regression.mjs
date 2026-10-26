import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './launch-browser.mjs';
import { hasViteLocalOrigin } from './vite-readiness.mjs';
import { onboardingSeed } from './app-version.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.env.THEME_OUTPUT || path.join(root, 'desktop/test-results/theme-interactions');
const port = Number(process.env.THEME_PORT || 4197), origin = `http://127.0.0.1:${port}`;
const items = [{ id: 'theme-1', type: 'album', title: '窗边唱片', artist: '离线演示', year: '2026', cover: '', tracks: ['晨光'] }];
const scenes = [
  ['warm', '琥珀小屋', '泡一杯琥珀茶'],
  ['forest', '林间书屋', '照料窗边植物'],
  ['seaside', '海边慢屋', '开合海风窗'],
  ['starlight', '星夜阁楼', '使用望远镜']
];
const report = { startedAt: new Date().toISOString(), fixtureData: true, checks: [], screenshots: [], pageErrors: [], consoleErrors: [], failedRequests: [], unexpectedRequests: [], boundaries: [], passed: false };
let browser, server, context;
const shot = async (page, name) => { const file = path.join(output, `${name}.png`); await page.screenshot({ path: file, animations: 'disabled' }); report.screenshots.push(path.relative(output, file)); return file; };
const dialog = page => page.getByRole('dialog', { name: '设置', exact: true });
async function choose(page, id, label) {
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const settings = dialog(page);
  await settings.getByRole('tab', { name: '小屋与奶糖', exact: true }).click();
  await settings.getByRole('button', { name: `选择场景 ${label}`, exact: true }).click();
  await settings.getByRole('button', { name: '关闭设置', exact: true }).click();
  await settings.waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('dialog', { name: '设置', exact: true }).count(), 0, 'settings must unmount before room interaction');
  await page.locator(`.cabin-scene[data-room-look="${id}"]`).waitFor();
}
async function layoutAudit(page, name) {
  await page.setViewportSize({ width: 960, height: 600 });
  // The room canvas steps between layouts over 240 ms after the settings
  // dialog closes; measure after the hit target and scene have settled.
  await page.waitForTimeout(350);
  const readState = () => page.evaluate(() => {
    const object = document.querySelector('.theme-object'), rect = object?.getBoundingClientRect();
    const turntable = document.querySelector('.room-turntable')?.getBoundingClientRect();
    const cat = document.querySelector('.room-cat')?.getBoundingClientRect();
    const center = rect && { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const inside = (box, point) => Boolean(box && point && point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom);
    const intersects = !!(rect && turntable && rect.left < turntable.right && rect.right > turntable.left && rect.top < turntable.bottom && rect.bottom > turntable.top);
    const hit = center ? document.elementFromPoint(center.x, center.y)?.closest('.theme-object') === object : false;
    return {
      documentWidth: document.documentElement.scrollWidth, innerWidth,
      object: rect && { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
      turntable: turntable && { left: turntable.left, right: turntable.right, top: turntable.top, bottom: turntable.bottom },
      cat: cat && { left: cat.left, right: cat.right, top: cat.top, bottom: cat.bottom },
      center,
      centerInsideTurntable: inside(turntable, center),
      centerInsideCat: inside(cat, center),
      intersectsTurntable: intersects,
      hit,
      visible: Boolean(object && rect.width > 44 && rect.height > 44 && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight)
    };
  });
  let state = await readState();
  // Scene re-fit and cat placement can overlap the first measurement by one
  // frame. Re-read once; a persistent obstruction still fails below.
  if (!state.hit) { await page.waitForTimeout(180); state = await readState(); }
  assert.ok(state.documentWidth <= 960, `${name}: horizontal overflow ${JSON.stringify(state)}`);
  assert.ok(state.visible, `${name}: theme object outside 960x600 ${JSON.stringify(state)}`);
  assert.equal(state.centerInsideTurntable, false, `${name}: theme object center is covered by the turntable ${JSON.stringify(state)}`);
  assert.equal(state.centerInsideCat, false, `${name}: theme object center is covered by the cat ${JSON.stringify(state)}`);
  assert.equal(state.hit, true, `${name}: theme object center does not receive the pointer ${JSON.stringify(state)}`);
  report.checks.push({ name: `${name}-960x600-object-visible`, ...state });
}
try {
  await fs.mkdir(output, { recursive: true });
  server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, env: { ...process.env, FLOW_CABIN_VITE_CACHE_DIR: path.join(output, 'vite-cache') }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; server.stdout.on('data', chunk => { log += chunk; }); server.stderr.on('data', chunk => { log += chunk; });
  for (let i = 0; ; i++) {
    if (server.exitCode !== null || i > 150) throw new Error(log);
    if (hasViteLocalOrigin(log, origin) && await fetch(origin).then(response => response.ok, () => false)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const served = await (await fetch(`${origin}/src/scene/theme-interactions.mjs`)).text();
  assert.match(served, /starlight: Object\.freeze\(\{ label: '使用望远镜', box: \[270, 530, 100, 100\] \}\)/, 'fresh server must serve the checked-in theme model');
  report.servedThemeModel = 'the-new-starlight-geometry';
  browser = await launchChromium();
  context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
  page.on('requestfailed', request => report.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  await context.addInitScript((seed) => { window.__onboardingSeed = seed; }, onboardingSeed());
  await context.addInitScript(() => {
    localStorage.setItem('flow-cabin-onboarding-v1', window.__onboardingSeed);
  });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { report.unexpectedRequests.push(url.href); return route.abort(); }
    if (url.pathname === '/api/items') return route.fulfill({ json: { items } });
    if (url.pathname === '/api/items/import') return route.fulfill({ json: { added: 0, total: 1 } });
    if (url.pathname === '/desktop-music/lyrics') return route.fulfill({ json: { text: '', source: 'fixture', reason: 'No fixture lyrics' } });
    if (url.pathname === '/desktop-music/config') return route.fulfill({ json: { qqLoggedIn: false, neteaseLoggedIn: false } });
    if (url.pathname === '/desktop-music/now-playing' || url.pathname === '/desktop-music/apple/permission') return route.fulfill({ json: { available: false } });
    if (url.pathname === '/desktop-music/local/summary') return route.fulfill({ json: { folders: [], albumCount: 0, trackCount: 0 } });
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/desktop-music/')) { report.unexpectedRequests.push(url.href); return route.fulfill({ status: 500, json: { error: 'Unimplemented fixture' } }); }
    return route.continue();
  });
  await page.goto(origin);
  const onboarding = page.getByRole('dialog', { name: '新手引导', exact: true });
  await onboarding.waitFor({ timeout: 12000 }).catch(() => {});
  if (await onboarding.isVisible()) { await onboarding.getByRole('button', { name: '跳过引导', exact: true }).click(); await onboarding.waitFor({ state: 'hidden' }); }
  await page.locator('.cabin-room').waitFor();
  for (const [id, label, object] of scenes) {
    await choose(page, id, label);
    const trigger = page.getByRole('button', { name: object, exact: true });
    await trigger.waitFor();
    assert.equal(await page.locator('.theme-object').count(), 1);
    assert.equal(await page.locator('.theme-tool').count(), 0);
    await layoutAudit(page, id);
    await trigger.click();
    const toolName = { warm: '琥珀茶歇', forest: '窗边照料', seaside: '海风窗', starlight: '望远镜里的星图' }[id];
    const tool = id === 'starlight' ? page.getByRole('dialog', { name: toolName }) : page.getByRole('region', { name: toolName });
    await tool.waitFor();
    if (id === 'starlight') await page.waitForFunction(() => document.activeElement?.hasAttribute('data-first-action'));
    await shot(page, `${id}-open-960x600`);
    if (id === 'forest') {
      await page.getByRole('button', { name: '浇一点水', exact: true }).click();
      await page.getByRole('button', { name: '浇一点水', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: '已经浇好', exact: true }).isDisabled(), true);
      await page.getByRole('button', { name: '转半圈花盆', exact: true }).click();
      assert.match(await tool.innerText(), /转过半圈/);
      const meter = await tool.getByRole('meter').getAttribute('value');
      assert.equal(meter, '2');
      await shot(page, 'forest-watered-turned-960x600');
    }
    if (id === 'seaside') {
      await page.getByRole('button', { name: '推开窗，开启风声', exact: true }).click();
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('album-circle-sound-v1') || '{}').tracks?.wind === .25);
      assert.equal(await page.getByRole('button', { name: '合上窗，停下风声', exact: true }).getAttribute('aria-pressed'), 'true');
      await page.getByLabel('海风窗开度').fill('45');
      await page.getByLabel('海风窗开度').dispatchEvent('change');
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('album-circle-sound-v1') || '{}').tracks?.wind === .45);
      await shot(page, 'seaside-wind-open-960x600');
      await page.getByRole('button', { name: '合上窗，停下风声', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: '推开窗，开启风声', exact: true }).getAttribute('aria-pressed'), 'false');
    }
    if (id === 'warm') {
      await page.getByRole('button', { name: '倒热水', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: '正在泡茶…', exact: true }).isDisabled(), true);
      await page.getByRole('button', { name: '喝一小口', exact: true }).waitFor({ timeout: 6500 });
      await page.getByRole('button', { name: '喝一小口', exact: true }).click();
      assert.match(await tool.innerText(), /还剩 2 小口/);
      await shot(page, 'warm-tea-ready-960x600');
    }
    if (id === 'starlight') {
      const first = await tool.evaluate(node => {
        const canvas = node.querySelector('canvas'), rect = canvas.getBoundingClientRect(), button = node.querySelector('[data-first-action]');
        return { canvas: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, focused: document.activeElement === button };
      });
      assert.equal(first.focused, true, 'the first actionable control receives focus');
      await page.getByRole('button', { name: '连接下一颗星', exact: true }).click();
      await page.mouse.click(first.canvas.left + first.canvas.width * 104 / 240, first.canvas.top + first.canvas.height * 95 / 144);
      await page.getByRole('button', { name: '连接下一颗星', exact: true }).click();
      assert.match(await tool.innerText(), /3 \/ 7/);
      await shot(page, 'starlight-three-stars-960x600');
      while (await page.getByRole('button', { name: '连接下一颗星', exact: true }).isEnabled()) await page.getByRole('button', { name: '连接下一颗星', exact: true }).click();
      await page.getByRole('status').filter({ hasText: '小帆船连好了' }).waitFor();
      await page.mouse.click(first.canvas.left + first.canvas.width * 58 / 240, first.canvas.top + first.canvas.height * 95 / 144);
      await page.getByRole('status').filter({ hasText: '小帆船连好了' }).waitFor();
    }
    await page.keyboard.press('Escape');
    await tool.waitFor({ state: 'hidden' });
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    await page.waitForFunction(label => document.activeElement?.getAttribute('aria-label') === label, object);
    assert.equal(await trigger.evaluate(node => document.activeElement === node), true, 'focus returns to the room object');
  }
  // Reduced motion: no animation is declared by the new object/tool UI.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await choose(page, 'forest', '林间书屋');
  await page.getByRole('button', { name: '照料窗边植物', exact: true }).click();
  const motion = await page.evaluate(() => ({
    preference: matchMedia('(prefers-reduced-motion: reduce)').matches,
    animations: document.getAnimations().filter(animation => animation.playState === 'running').length,
    ownedAnimations: [...document.querySelectorAll('.theme-interactions *, .theme-tool *')].filter(node => getComputedStyle(node).animationName !== 'none').length,
    status: document.querySelector('.theme-interactions')?.dataset.motion
  }));
  assert.equal(motion.preference, true);
  assert.equal(motion.ownedAnimations, 0);
  assert.equal(motion.status, 'still');
  report.checks.push({ name: 'reduce-motion-static', ...motion });
  await page.keyboard.press('Escape');
  // Ensure short height still leaves the modal inside the viewport.
  await page.setViewportSize({ width: 960, height: 600 });
  await choose(page, 'starlight', '星夜阁楼');
  await page.getByRole('button', { name: '使用望远镜', exact: true }).click();
  const modal = page.getByRole('dialog', { name: '望远镜里的星图' });
  await modal.waitFor();
  const modalRect = await modal.evaluate(node => { const r = node.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: innerWidth, height: innerHeight }; });
  assert.ok(modalRect.top >= 0 && modalRect.bottom <= 600 && modalRect.left >= 0 && modalRect.right <= 960, JSON.stringify(modalRect));
  assert.equal(await modal.getByRole('button', { name: '连接下一颗星', exact: true }).count(), 1);
  await shot(page, 'starlight-dialog-960x600');
  await modal.getByRole('button', { name: '放下望远镜 · Esc', exact: true }).click();
  await modal.waitFor({ state: 'hidden' });
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.consoleErrors, []);
  assert.deepEqual(report.failedRequests, []);
  assert.deepEqual(report.unexpectedRequests, []);
  report.passed = true;
} catch (error) {
  report.error = error.stack;
  process.exitCode = 1;
} finally {
  report.boundaries.push(
    'Browser fixture only: the wind setting uses the product sound mix and localStorage, but generated audio is not listened to.',
    'Visit-local watering, turns, tea and star progress intentionally reset after leaving the room scene; no new backup key was added.',
    'Notarized native desktop, OS-wide shortcuts and all-day motion are outside this test.'
  );
  report.finishedAt = new Date().toISOString();
  report.pageErrors = [...new Set(report.pageErrors)];
  await context?.close(); await browser?.close(); if (server) server.kill('SIGTERM');
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`THEME ${report.passed ? 'PASS' : 'FAIL'} ${report.checks.length} checks · ${output}`);
}
