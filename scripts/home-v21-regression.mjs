import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { launchChromium } from './launch-browser.mjs';
import { onboardingSeed } from './app-version.mjs';
const origin = process.env.HOME_TEST_ORIGIN || 'http://127.0.0.1:4292';
const minutes = Number(process.env.SOAK_MINUTES || 0), duration = Math.max(180, Math.ceil(minutes * 60 + 60));
const output = path.resolve('desktop/test-results/home-v21' + (minutes ? '-soak' : ''));
await fs.mkdir(output, { recursive: true });
const report = { startedAt: new Date().toISOString(), fixtureAudio: true, muted: true, requestedMinutes: minutes, checks: [], errors: [], samples: [] };
const wav = Buffer.alloc(44 + 8000 * duration, 128); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(8000, 28); wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
const fixture = { id: 'soak', type: 'album', title: '雨天练习', artist: '回归测试', tracks: ['长时间播放'], trackDetails: [{ title: '长时间播放', source: 'local', providerId: 'a000000000000000' }] };
let server;
if (!await fetch(origin).then(r => r.ok, () => false)) {
  if (process.env.HOME_TEST_ORIGIN) throw Error('Configured home origin is unavailable');
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4292', '--strictPort'], { stdio: 'ignore' });
  for (let n=0; !await fetch(origin).then(r=>r.ok,()=>false); n++) { if(n>100 || server.exitCode!==null) throw Error('Home preview failed'); await new Promise(r=>setTimeout(r,100)); }
}
const browser = await launchChromium({ args: ['--enable-precise-memory-info'] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(()=>localStorage.setItem('flow-cabin-interface-v1','beta'));
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/fixture-audio/long.wav') {
      const match = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range || ''), start = match ? Number(match[1]) : 0, end = match?.[2] ? Math.min(Number(match[2]), wav.length - 1) : wav.length - 1;
      return route.fulfill({ status: match ? 206 : 200, contentType: 'audio/wav', body: wav.subarray(start, end + 1), headers: { 'accept-ranges': 'bytes', ...(match ? { 'content-range': `bytes ${start}-${end}/${wav.length}` } : {}) } });
    }
    return route.continue();
  });
  await context.addInitScript(({ fixture, seed }) => {
    localStorage.setItem('flow-cabin-web-collection-v1', JSON.stringify({ version: 1, items: [fixture] }));
    localStorage.setItem('album-circle-room-player-v1', 'local');
    localStorage.setItem('flow-cabin-welcome-v1', 'true');
    localStorage.setItem('flow-cabin-onboarding-v1', seed); // this version's 新功能 sheet was already seen
    window.albumMobile = { musicRequest: async (route, body) => {
      if (route === '/resolve') return { audioPath: '/fixture-audio/long.wav', title: '长时间播放' };
      if (route === '/lyrics') return { text: '[00:00]小屋里的测试音乐\n[00:30]持续播放，不因页面切换而中断', format: 'lrc', source: 'fixture' };
      return {};
    } };
  }, { fixture, seed: onboardingSeed() });
  const page = await context.newPage(); page.on('pageerror', e => report.errors.push(e.message));
  await page.goto(origin); await page.locator('.home-world canvas').waitFor();
  const intro = page.getByRole('button', { name: '知道了', exact: true }); if (await intro.isVisible()) await intro.click();
  await page.locator('.home-shortcuts').getByRole('button', { name: '唱片架', exact: true }).click();
  await page.getByRole('button', { name: '播放 雨天练习', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-cabin-audio-host] audio')].some(a => !a.paused && a.currentTime > .1));
  await page.locator('.cabin-dialog-close').last().click();
  await page.evaluate(() => { window.soakAudio = [...document.querySelectorAll('[data-cabin-audio-host] audio')].find(a => !a.paused); });
  const zones = page.getByRole('navigation', { name: '房间区域' });
  for (let i = 0; i < 50; i++) {
    const name = ['听歌角', '工作角', '生活角', '返回全屋'][i % 4];
    await zones.getByRole('button', { name, exact: true }).click();
    if (i % 4 !== 3) await page.locator(`[data-corner="${['music','work','life'][i % 4]}"] .corner-art`).waitFor();
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => document.contains(window.soakAudio) && !window.soakAudio.paused && document.querySelectorAll('[data-cabin-audio-host] audio').length === 2), true);
  }
  report.checks.push('50 corner switches preserve the same playing audio element and exactly two decks');
  await page.screenshot({ path: path.join(output, 'desktop-corner.png') });
  // 3.0: 随手记 left the top bar; the desk's 笔记本 still opens it from the home.
  await page.locator('.home-accessible-furniture summary').click();
  await page.locator('.home-accessible-furniture').getByRole('button', { name: '笔记本', exact: true }).click();
  const note = page.getByRole('textbox').filter({ visible: true });
  // Read the actual note surface, and report its opening separately from storage tests.
  assert.ok(await page.getByRole('dialog').count()); report.checks.push('notes open directly from the home');
  await page.locator('.cabin-dialog-close').last().click();
  const started = Date.now();
  while (Date.now() - started < minutes * 60000) {
    await page.waitForTimeout(Math.min(30000, minutes * 60000 - (Date.now() - started)));
    const sample = await page.evaluate(() => ({ time: Date.now(), playing: !window.soakAudio.paused, position: window.soakAudio.currentTime, ready: window.soakAudio.readyState, audioNodes: document.querySelectorAll('[data-cabin-audio-host] audio').length, canvases: document.querySelectorAll('canvas').length, heap: performance.memory?.usedJSHeapSize }));
    report.samples.push(sample); assert.ok(sample.playing && sample.ready >= 3 && sample.audioNodes === 2);
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`Playing ${Math.round((Date.now() - started) / 60000)} min, ${sample.position.toFixed(1)} s, heap ${sample.heap}`);
  }
  if (minutes) report.checks.push(`${minutes} minutes continuous playback in actual home`);
  assert.deepEqual(report.errors, []); report.passed = true;
} catch (error) { report.failure = error.stack; process.exitCode = 1; console.error(error); }
finally { report.finishedAt = new Date().toISOString(); await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); server?.kill(); }
