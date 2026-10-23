import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { launchChromium } from './launch-browser.mjs';
import { onboardingSeed } from './app-version.mjs';
const origin = 'http://127.0.0.1:4296', output = path.resolve('desktop/test-results/interface-mode');
const report = { checks: [], errors: [], fixture: true };
const pass = name => { report.checks.push(name); console.log('PASS ' + name); };
let server, browser, page;
await fs.mkdir(output, { recursive: true });
try {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4296', '--strictPort'], { stdio: 'ignore' });
  for (let i = 0; !await fetch(origin).then(r => r.ok, () => false); i++) { if (i > 100 || server.exitCode !== null) throw Error('Preview failed'); await new Promise(r => setTimeout(r, 100)); }
  browser = await launchChromium();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', acceptDownloads: true });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await context.addInitScript(seed => {
    if (sessionStorage.getItem('interface-fixture')) return;
    sessionStorage.setItem('interface-fixture', '1');
    localStorage.setItem('flow-cabin-onboarding-v1', seed);
    localStorage.setItem('flow-cabin-home-intro-v1', 'done');
    localStorage.setItem('flow-cabin-web-collection-v1', JSON.stringify({ version: 1, items: [{ id: 'kept-album', type: 'album', title: '仍在这里', artist: '原版唱片', tracks: ['晚风'], source: 'manual' }] }));
    localStorage.setItem('album-circle-focus-v1:local-owner', JSON.stringify({ notes: '切换后也要保留的草稿', settings: { notify: false, chime: false } }));
  }, onboardingSeed());
  page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', e => report.errors.push(e.message));
  const requests = []; page.on('request', req => requests.push(new URL(req.url()).pathname));
  await page.goto(origin); await page.locator('.cabin-room').waitFor();
  assert.equal(await page.locator('.cabin-home').count(), 0);
  assert.equal(await page.locator('audio').count(), 2, 'one shared playback engine in classic');
  assert.equal(requests.some(p => p.startsWith('/room-scenes/v21/')), false, 'classic does not load Beta room artwork');
  pass('existing-installation-opens-original-shelf-without-beta-scene-or-duplicate-audio');
  await page.getByRole('button', { name: '专辑墙', exact: true }).first().click();
  await page.getByRole('button', { name: '添加 原版唱片 的 仍在这里', exact: true }).click();
  await page.locator('.wall-group').filter({ has: page.getByText('文字', { exact: true }) }).locator('summary').click();
  await page.getByLabel('专辑墙标题', { exact: true }).fill('我的原版专辑墙');
  const wall = await page.evaluate(() => localStorage.getItem('album-circle-wall-v1'));
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '体验 Beta 小屋', exact: true }).click();
  await page.getByRole('button', { name: '关闭小屋 Beta 体验', exact: true }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('flow-cabin-interface-v1')), null);
  pass('album-wall-is-one-click-away-and-cancelling-beta-leaves-original-unchanged');
  await page.getByRole('button', { name: '体验 Beta 小屋', exact: true }).click();
  await page.getByRole('button', { name: '切换为 Beta 并重启', exact: true }).click();
  await page.locator('.cabin-home').waitFor();
  assert.equal(await page.locator('.cabin-room').count(), 0);
  assert.equal(await page.locator('audio').count(), 2);
  await page.getByRole('button', { name: '专辑墙', exact: true }).first().click();
  assert.equal(await page.evaluate(() => localStorage.getItem('album-circle-wall-v1')), wall);
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '下载 PNG', exact: true }).click();
  await (await download).saveAs(path.join(output, 'kept-wall.png')); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '随手记', exact: true }).first().click();
  assert.equal(await page.getByRole('textbox', { name: '随手记内容' }).inputValue(), '切换后也要保留的草稿'); await page.keyboard.press('Escape');
  pass('explicit-opt-in-reloads-into-beta-with-shared-wall-export-notes-and-one-audio-engine');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, 'beta-phone.png') });
  for (const name of ['专辑墙', '唱片库', '专注', '随手记', '布置']) {
    const button = page.locator('.home-shortcuts').getByRole('button', { name, exact: true });
    const box = await button.boundingBox(); assert.ok(box && box.x >= 0 && box.x + box.width <= 391 && box.height >= 48, name);
  }
  await page.getByRole('button', { name: '设置', exact: true }).click(); await page.getByRole('button', { name: '切回原版首页', exact: true }).click();
  await page.getByRole('button', { name: '切回原版并重启', exact: true }).click(); await page.locator('.cabin-room').waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('album-circle-wall-v1')), wall);
  await page.screenshot({ path: path.join(output, 'classic-phone.png') });
  for (const name of ['专辑墙', '体验 Beta 小屋', '添加到唱片架', '设置']) {
    const box = await page.getByRole('button', { name, exact: true }).first().boundingBox(); assert.ok(box && box.x >= 0 && box.x + box.width <= 391, name);
  }
  pass('mobile-entries-remain-reachable-and-switch-back-restores-original-with-data-intact');
  await page.evaluate(() => document.documentElement.dataset.platform = 'android');
  await page.addStyleTag({ path: 'src/mobile/mobile.css' });
  await page.screenshot({ path: path.join(output, 'classic-android-css.png') });
  for (const name of ['专辑墙', '体验 Beta 小屋', '添加到唱片架', '设置']) {
    const box = await page.getByRole('button', { name, exact: true }).first().boundingBox(); assert.ok(box && box.x >= 0 && box.x + box.width <= 391 && box.height >= 48, name + ' Android');
  }
  pass('classic-android-header-has-visible-touch-targets-with-real-native-styles');
  assert.deepEqual(report.errors, []); report.passed = true;
} catch (error) { report.failure = error.stack; console.error(error); process.exitCode = 1; await page?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); }
finally { await browser?.close(); server?.kill(); await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); }
