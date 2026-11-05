import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { launchChromium } from './launch-browser.mjs';
import { onboardingSeed } from './app-version.mjs';
import { openAlbumWall, libraryDialog, openSettingsSection, settingsDialog, closeSettings } from './settings-actions.mjs';
// 3.1: the life cabin is the only home. A device that saved the old "classic" choice opens the cabin, forgets the
// choice, shows no switch anywhere, and keeps its collection, wall draft and notes. One audio engine, phone-reachable entries.
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
    // What 2.1–3.0 wrote when someone chose the original shelf home (and dismissed the 2.2 home notice).
    localStorage.setItem('flow-cabin-interface-v1', 'classic');
    localStorage.setItem('flow-cabin-home-notice-v22', 'done');
    localStorage.setItem('flow-cabin-web-collection-v1', JSON.stringify({ version: 1, items: [{ id: 'kept-album', type: 'album', title: '仍在这里', artist: '原版唱片', tracks: ['晚风'], source: 'manual' }] }));
    localStorage.setItem('album-circle-focus-v1:local-owner', JSON.stringify({ notes: '切换后也要保留的草稿', settings: { notify: false, chime: false } }));
  }, onboardingSeed());
  page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', e => report.errors.push(e.message));
  await page.goto(origin); await page.locator('.cabin-home').waitFor();
  assert.equal(await page.locator('.cabin-room, .app-titlebar, [data-interface]').count(), 0, 'no trace of the original shelf home');
  assert.equal(await page.locator('audio').count(), 2, 'one shared playback engine in the cabin');
  assert.equal(await page.evaluate(() => localStorage.getItem('flow-cabin-interface-v1')), null, 'the stored classic choice is forgotten');
  assert.equal(await page.evaluate(() => localStorage.getItem('flow-cabin-home-notice-v22')), null);
  assert.equal(await page.locator('.home-notice').count(), 0, 'no "首页换成了生活小屋" card, no 改用原版');
  pass('a-stored-classic-choice-is-ignored-and-cleared-and-the-cabin-opens-with-one-audio-engine');
  // Nothing in 设置 offers the old home any more.
  await openSettingsSection(page, '小屋与奶糖');
  assert.equal(await settingsDialog(page).getByText(/经典首页|改用原版/).count(), 0);
  assert.equal(await settingsDialog(page).getByRole('button', { name: '改用原版唱片架', exact: true }).count(), 0);
  await closeSettings(page);
  assert.equal(await page.getByRole('button', { name: /切回原版|回到生活小屋|选择首页/ }).count(), 0);
  pass('no-switch-back-to-the-original-home-anywhere');
  // 专辑墙 lives inside 唱片架; its draft and PNG export are the ones the original shelf used.
  assert.equal(await page.locator('.home-shortcuts').getByRole('button', { name: '专辑墙', exact: true }).count(), 0);
  await openAlbumWall(page);
  await page.getByRole('button', { name: '添加 原版唱片 的 仍在这里', exact: true }).click();
  await page.locator('.wall-group').filter({ has: page.getByText('文字', { exact: true }) }).locator('summary').click();
  await page.getByLabel('专辑墙标题', { exact: true }).fill('我的专辑墙');
  const wall = await page.evaluate(() => localStorage.getItem('album-circle-wall-v1'));
  assert.ok(wall && wall.includes('我的专辑墙'), 'the wall draft is saved');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '下载 PNG', exact: true }).click();
  await (await download).saveAs(path.join(output, 'kept-wall.png')); await page.keyboard.press('Escape');
  if (await libraryDialog(page).count()) { await page.keyboard.press('Escape'); await libraryDialog(page).waitFor({ state: 'hidden' }); }
  pass('album-wall-opens-from-the-record-shelf-with-draft-and-png-export');
  // The notebook on the desk still opens 随手记 with the draft; phone-width entries stay reachable.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.home-accessible-furniture summary').click();
  await page.locator('.home-accessible-furniture').getByRole('button', { name: '笔记本', exact: true }).click();
  assert.equal(await page.getByRole('textbox', { name: '随手记内容' }).inputValue(), '切换后也要保留的草稿'); await page.keyboard.press('Escape');
  await page.locator('.home-accessible-furniture summary').click();
  await page.screenshot({ path: path.join(output, 'cabin-phone.png') });
  for (const name of ['唱片架', '专注', '日记']) {
    const button = page.locator('.home-shortcuts').getByRole('button', { name: new RegExp('^' + name) });
    const box = await button.boundingBox(); assert.ok(box && box.x >= 0 && box.x + box.width <= 391 && box.height >= 48, name);
  }
  const room = await page.locator('.home-room-name').boundingBox(); // The desk's room plate is 40 px tall on phones (the three nav plates are 48): kept honest at 40 here, see the report to the product owner.
  assert.ok(room && room.x >= 0 && room.x + room.width <= 391 && room.height >= 40, '房间名下拉');
  pass('notes-intact-and-reachable-phone-entries');
  assert.deepEqual(report.errors, []); report.passed = true;
} catch (error) { report.failure = error.stack; console.error(error); process.exitCode = 1; await page?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); }
finally { await browser?.close(); server?.kill(); await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); }
