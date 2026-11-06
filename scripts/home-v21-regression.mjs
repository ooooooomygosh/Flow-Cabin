import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { launchChromium } from './launch-browser.mjs';
import { onboardingSeed } from './app-version.mjs';
import { openLibrary, closeLibrary, openConsole, backToDesk, lookUp, openDrawerThing, openFocus } from './settings-actions.mjs';
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
  await page.goto(origin); await page.locator('.desk-home').waitFor();
  const intro = page.getByRole('button', { name: '知道了', exact: true }); if (await intro.isVisible()) await intro.click();
  const shelfOf = () => page.locator('dialog[open].shelf-dialog');
  await openLibrary(page);
  await page.getByRole('button', { name: '播放 雨天练习', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-cabin-audio-host] audio')].some(a => !a.paused && a.currentTime > .1));
  await closeLibrary(page);
  await page.evaluate(() => { window.soakAudio = [...document.querySelectorAll('[data-cabin-audio-host] audio')].find(a => !a.paused); });
  // The desk (since 3.1) has no now-playing strip: Space plays / pauses from the desk itself, the LED clock shows the
  // music, and 唱机旁 (the 唱机 plate) shows the song, hearts it in one click and has one progress rail.
  await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('Space');
  await page.waitForFunction(() => window.soakAudio.paused);
  await page.keyboard.press('Space'); await page.waitForFunction(() => !window.soakAudio.paused);
  await page.waitForFunction(() => document.querySelector('.desk-clock-key.is-on')?.textContent === '音乐');
  const panel = await openConsole(page);
  assert.match(await panel.locator('.console-track').innerText(), /长时间播放/);
  const heart = panel.getByRole('button', { name: '喜欢这首', exact: true });
  await heart.click(); await panel.getByRole('button', { name: '取消喜欢这首', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('flow-cabin-liked-songs-v1'))[0].title), '长时间播放');
  await panel.getByRole('button', { name: '取消喜欢这首', exact: true }).click(); await heart.waitFor();
  assert.equal(await panel.getByRole('progressbar').count() + await panel.getByRole('slider', { name: '音乐播放进度' }).count(), 1, 'one progress rail');
  report.checks.push('Space plays / pauses on the desk, the clock shows the music, 唱机旁 shows the song, hearts it in one click and has one progress rail');
  // 唱片架 three views: 我喜欢 lists the heart and plays it, 最近播放 lists what really played.
  await heart.click();
  await panel.getByRole('button', { name: '打开唱片架', exact: true }).click();
  const shelf = shelfOf();
  await shelf.getByRole('radio', { name: '唱片', exact: true }).waitFor();
  assert.equal(await shelf.getByRole('button', { name: '筛选', exact: true }).count(), 0, 'a one-record shelf has no filter button');
  await shelf.getByRole('radio', { name: '我喜欢', exact: true }).click();
  await shelf.getByRole('button', { name: '播放《长时间播放》', exact: true }).click();
  assert.equal(await page.evaluate(() => !window.soakAudio.paused), true);
  await shelf.getByRole('radio', { name: '最近播放', exact: true }).click();
  await shelf.getByRole('list', { name: '最近播放的歌', exact: true }).getByRole('button', { name: '播放《长时间播放》', exact: true }).waitFor();
  await shelf.getByRole('radio', { name: '我喜欢', exact: true }).click();
  await shelf.getByRole('button', { name: '取消喜欢《长时间播放》', exact: true }).click();
  await shelf.getByText('还没有喜欢的歌', { exact: false }).waitFor();
  await backToDesk(page);
  report.checks.push('唱片架: 我喜欢 plays and un-hearts a song, 最近播放 lists it, no 筛选 under 12 records');
  // Looking up and back down (the bookcase, the Control Panel, the post box) never touches the playing record.
  for (let i = 0; i < 24; i++) {
    await lookUp(page, ['shelf', 'console', 'post'][i % 3]);
    await backToDesk(page);
    assert.equal(await page.evaluate(() => document.contains(window.soakAudio) && !window.soakAudio.paused && document.querySelectorAll('[data-cabin-audio-host] audio').length === 2), true);
  }
  report.checks.push('24 looks up and back preserve the same playing audio element and exactly two decks');
  await page.screenshot({ path: path.join(output, 'desktop-desk.png') });
  // 随手记 is the notepad in the desk's drawer.
  await openDrawerThing(page, '随手记');
  assert.equal(await page.getByRole('textbox', { name: '随手记内容' }).count(), 1); report.checks.push('notes open directly from the home');
  await backToDesk(page);
  const started = Date.now();
  while (Date.now() - started < minutes * 60000) {
    await page.waitForTimeout(Math.min(30000, minutes * 60000 - (Date.now() - started)));
    const sample = await page.evaluate(() => ({ time: Date.now(), playing: !window.soakAudio.paused, position: window.soakAudio.currentTime, ready: window.soakAudio.readyState, audioNodes: document.querySelectorAll('[data-cabin-audio-host] audio').length, canvases: document.querySelectorAll('canvas').length, heap: performance.memory?.usedJSHeapSize }));
    report.samples.push(sample); assert.ok(sample.playing && sample.ready >= 3 && sample.audioNodes === 2);
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`Playing ${Math.round((Date.now() - started) / 60000)} min, ${sample.position.toFixed(1)} s, heap ${sample.heap}`);
  }
  if (minutes) report.checks.push(`${minutes} minutes continuous playback in actual home`);
  // The LED clock starts a round through the existing focus command, without touching the music.
  await openFocus(page); await page.getByRole('button', { name: '开始专注', exact: true }).click();
  await page.waitForFunction(() => /专注中/.test(document.querySelector('.desk-clock-face')?.getAttribute('aria-label') || ''));
  assert.equal(await page.evaluate(() => !window.soakAudio.paused), true);
  report.checks.push('the clock starts focus while the record keeps playing');
  assert.deepEqual(report.errors, []); report.passed = true;
} catch (error) { report.failure = error.stack; process.exitCode = 1; console.error(error); }
finally { report.finishedAt = new Date().toISOString(); await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); server?.kill(); }
