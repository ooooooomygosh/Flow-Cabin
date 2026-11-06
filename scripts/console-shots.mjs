// The record player's console (DEsk's Control Panel, src/desk/views/ConsoleView.jsx), photographed idle
// and playing at a desktop and a phone size, with every control driven once. Fixture audio only, no
// accounts, no external traffic. Run after `npx vite build`:
//   node scripts/console-shots.mjs            (starts `vite preview` on 4823, or CONSOLE_ORIGIN)
// Screenshots and report.json go to desktop/test-results/console (or CONSOLE_OUTPUT).
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { launchChromium } from './launch-browser.mjs';
import { onboardingSeed } from './app-version.mjs';
import { openConsole, closeConsole, consoleDialog } from './settings-actions.mjs';

const origin = process.env.CONSOLE_ORIGIN || 'http://127.0.0.1:4823';
const output = path.resolve(process.env.CONSOLE_OUTPUT || 'desktop/test-results/console');
await fs.mkdir(output, { recursive: true });
const report = { checks: [], errors: [], requests: [] };
const wav = Buffer.alloc(44 + 8000 * 240); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(8000, 28); wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
for (let i = 44; i < wav.length; i++) wav[i] = 128 + Math.round(Math.sin(i / 9) * 40 * (0.5 + 0.5 * Math.sin(i / 4000))); // a tone that swells, so the meters move
const record = { id: 'evening', type: 'album', title: '留给自己的晚风', artist: '小屋乐队', tracks: ['序 · 天黑以前', '留给自己的晚风', '路灯一盏一盏'], trackDetails: ['a', 'b', 'c'].map((k, i) => ({ title: ['序 · 天黑以前', '留给自己的晚风', '路灯一盏一盏'][i], source: 'local', providerId: `${k}000000000000000` })) };
let server;
if (!await fetch(origin).then((r) => r.ok, () => false)) {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', new URL(origin).port, '--strictPort'], { stdio: 'ignore' });
  for (let n = 0; !await fetch(origin).then((r) => r.ok, () => false); n++) { if (n > 150 || server.exitCode !== null) throw Error('preview failed'); await new Promise((r) => setTimeout(r, 100)); }
}
const check = (name) => { report.checks.push(name); console.log(`PASS ${name}`); };
const browser = await launchChromium();
try {
  for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: label === 'phone' ? 2 : 1 });
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { report.requests.push(url.href); return route.abort(); }
      if (url.pathname === '/fixture-audio/song.wav') {
        const m = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range || ''), start = m ? Number(m[1]) : 0, end = m?.[2] ? Math.min(Number(m[2]), wav.length - 1) : wav.length - 1;
        return route.fulfill({ status: m ? 206 : 200, contentType: 'audio/wav', body: wav.subarray(start, end + 1), headers: { 'accept-ranges': 'bytes', ...(m ? { 'content-range': `bytes ${start}-${end}/${wav.length}` } : {}) } });
      }
      return route.continue();
    });
    await context.addInitScript(({ record, seed }) => {
      localStorage.setItem('flow-cabin-web-collection-v1', JSON.stringify({ version: 1, items: [record] }));
      localStorage.setItem('album-circle-room-player-v1', 'local');
      localStorage.setItem('flow-cabin-welcome-v1', 'true');
      localStorage.setItem('flow-cabin-onboarding-v1', seed);
      window.albumMobile = { musicRequest: async (route, body) => {
        if (route === '/resolve') return { audioPath: '/fixture-audio/song.wav', title: body?.title || '留给自己的晚风' };
        if (route === '/lyrics') return { text: '[00:00]晚风吹过窗台\n[00:04]台灯还亮着\n[00:09]把这首留给自己', format: 'lrc', source: 'fixture' };
        return {};
      } };
    }, { record, seed: onboardingSeed() });
    const page = await context.newPage(); page.setDefaultTimeout(9000);
    page.on('pageerror', (e) => report.errors.push(`${label}: ${e.message}`));
    await page.goto(origin); await page.locator('.desk-home.is-lit').waitFor();
    const intro = page.getByRole('button', { name: '知道了', exact: true }); if (await intro.isVisible().catch(() => false)) await intro.click();

    // Idle: nothing on the deck. The tube says so, and 播放 leads to the shelf.
    const dialog = await openConsole(page);
    await page.waitForTimeout(1700);
    assert.equal(await dialog.locator('.console-crt-head').textContent(), '架子还空着');
    await page.screenshot({ path: path.join(output, `console-idle-${label}.png`) });
    check(`${label}: idle console says 架子还空着`);
    await dialog.getByRole('button', { name: /^播放 · 架子还空着/ }).click();
    const shelf = page.getByRole('dialog', { name: /^唱片(库|架)$/ }); await shelf.waitFor();
    check(`${label}: 播放 with nothing on the deck opens the shelf`);
    const spine = shelf.getByRole('button', { name: /^唱片活页夹/ });
    if (await spine.count() && await spine.first().getAttribute('aria-expanded') !== 'true') await spine.first().click();
    await shelf.getByRole('button', { name: `播放 ${record.title}`, exact: true }).first().click();
    for (let i = 0; i < 3 && await shelf.isVisible(); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
    await page.waitForFunction(() => [...document.querySelectorAll('[data-cabin-audio-host] audio')].some((a) => !a.paused && a.currentTime > .3));
    await consoleDialog(page).waitFor();
    await page.waitForTimeout(2200);
    await page.screenshot({ path: path.join(output, `console-playing-${label}.png`) });
    assert.match(await page.locator('.console-crt-foot').textContent(), /^01\/03 .* 播放中$/);
    check(`${label}: playing, the tube shows the song and the time`);

    if (label === 'desktop') {
      // the knob: arrow keys turn it (role=slider), the pointer follows
      const knob = page.getByRole('slider', { name: '音乐音量', exact: true });
      const before = Number(await knob.getAttribute('aria-valuenow'));
      await knob.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
      assert.equal(Number(await knob.getAttribute('aria-valuenow')), before - 10);
      check('volume knob turns with the arrow keys');
      // the levers
      const shuffle = page.getByRole('switch', { name: '随机播放本张' });
      await shuffle.click(); assert.equal(await shuffle.getAttribute('aria-checked'), 'true');
      await page.getByRole('switch', { name: '播放模式：顺序播放' }).click();
      await page.getByRole('switch', { name: '播放模式：整张循环' }).waitFor();
      check('levers throw 随机 and 循环');
      // the faders
      const lamp = page.getByRole('slider', { name: '台灯亮度' });
      await lamp.focus(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight');
      assert.equal(await lamp.getAttribute('aria-valuenow'), '5');
      await page.keyboard.press('End');
      check('the 台灯 fader dims and lights the desk');
      // the push buttons
      await page.getByRole('button', { name: '下一首展示曲目' }).click();
      await page.waitForFunction(() => /^0[23] /.test(document.querySelector('.console-track')?.textContent || '')); // 随机 is on: either of the others
      await page.getByRole('button', { name: '暂停音乐播放' }).click();
      await page.getByRole('button', { name: '播放音乐' }).waitFor();
      check('push buttons: 下一首, 播放 / 暂停');
      await page.getByRole('button', { name: /^待播/ }).first().click();
      await page.getByRole('complementary', { name: '待播纸带' }).locator('.player-queue').waitFor();
      await page.screenshot({ path: path.join(output, 'console-queue-desktop.png') });
      await page.keyboard.press('Escape'); await page.getByRole('complementary', { name: '待播纸带' }).waitFor({ state: 'detached' });
      check('the blue button unrolls the 待播 paper');
      // the key: the source card
      await page.getByRole('button', { name: /^音源：/ }).click();
      await page.getByRole('radiogroup', { name: '唱机音源' }).waitFor();
      await page.screenshot({ path: path.join(output, 'console-source-desktop.png') });
      await page.getByRole('radiogroup', { name: '唱机音源' }).getByRole('radio').filter({ hasText: '仅展示' }).click();
      await page.waitForFunction(() => document.querySelector('.console-view')?.dataset.provider === 'visual');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(output, 'console-visual-desktop.png') });
      check('the key chooses the source (仅展示)');
      await page.getByRole('button', { name: /^播放 · |^继续唱片旋转|^暂停唱片旋转/ }).first().waitFor();
    }
    // the front plate looks back down at the desk
    await page.getByRole('button', { name: '唱机 ↑ · 回到书桌' }).click();
    await consoleDialog(page).waitFor({ state: 'detached' });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(output, `desk-after-${label}.png`) });
    check(`${label}: 唱机 ↑ looks back down at the desk`);
    await openConsole(page); await closeConsole(page);
    await context.close();
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.requests, []);
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close(); server?.kill();
}
