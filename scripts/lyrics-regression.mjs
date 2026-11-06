// Lyrics in the real home: the fullscreen stage, the karaoke readout on the lyric book,
// offsets, choosing another version, keyboard control and every room's skin.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { launchChromium } from './launch-browser.mjs';
import { onboardingSeed } from './app-version.mjs';
import { openLibrary, closeLibrary, openConsole, openRoomSettings, closeSettings, settingsDialog } from './settings-actions.mjs';
import { getRoomScene } from '../src/scene-catalog.mjs';
// 歌词册 from the desk: 唱机 plate → 唱机旁 → its 歌词册 plate.
const openStage = async (page) => { const panel = await openConsole(page); await panel.getByRole('button', { name: '歌词册', exact: true }).click(); };
import { parseLyrics } from '../src/lyrics/lyrics-model.mjs';
import { packLyrics, alignSecondary } from '../src/lyrics/lyric-timing.mjs';
const origin = 'http://127.0.0.1:4297', output = path.resolve('desktop/test-results/lyrics');
await fs.mkdir(output, { recursive: true });
const report = { checks: [], errors: [], requests: [], fixtureAudio: true };
const pass = name => { report.checks.push(name); console.log('PASS ' + name); };
const seconds = 240, wav = Buffer.alloc(44 + 8000 * seconds, 128);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(8000, 28); wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write('data', 36); wav.writeUInt32LE(8000 * seconds, 40);
// Word-timed lines every 3 s: "第N句 歌词" sung in two words.
const yrc = Array.from({ length: 70 }, (_, i) => { const s = i * 3000; return `[${s},2800](${s},1400,0)第${i + 1}句 (${s + 1400},1400,0)小屋歌词`; }).join('\n');
const translation = Array.from({ length: 70 }, (_, i) => { const ms = i * 3000 + 200, m = Math.floor(ms / 60000), sec = (ms % 60000) / 1000; return `[${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}]Line ${i + 1}`; }).join('\n');
const alternate = Array.from({ length: 70 }, (_, i) => { const ms = i * 3000, m = Math.floor(ms / 60000), sec = (ms % 60000) / 1000; return `[${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}]另一版第${i + 1}句`; }).join('\n');
const fixture = { id: 'lyric-album', type: 'album', title: '歌词练习', artist: '回归测试', tracks: ['会唱歌的小屋'], trackDetails: [{ title: '会唱歌的小屋', source: 'local', providerId: 'b000000000000000' }] };
let server, browser, page;
try {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4297', '--strictPort'], { stdio: 'ignore' });
  for (let n = 0; !await fetch(origin).then(r => r.ok, () => false); n++) { if (n > 100 || server.exitCode !== null) throw Error('Preview failed'); await new Promise(r => setTimeout(r, 100)); }
  browser = await launchChromium();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/fixture-audio/song.wav') {
      const match = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range || ''), start = match ? Number(match[1]) : 0, end = match?.[2] ? Math.min(Number(match[2]), wav.length - 1) : wav.length - 1;
      return route.fulfill({ status: match ? 206 : 200, contentType: 'audio/wav', body: wav.subarray(start, end + 1), headers: { 'accept-ranges': 'bytes', ...(match ? { 'content-range': `bytes ${start}-${end}/${wav.length}` } : {}) } });
    }
    return route.continue();
  });
  await context.addInitScript(({ fixture, yrc, translation, alternate, seed }) => {
    localStorage.setItem('flow-cabin-home-intro-v1', 'done');
    localStorage.setItem('flow-cabin-onboarding-v1', seed); // the guide and 新功能 sheet are covered by onboarding checks
    localStorage.setItem('flow-cabin-web-collection-v1', JSON.stringify({ version: 1, items: [fixture] }));
    localStorage.setItem('album-circle-room-player-v1', 'local');
    localStorage.setItem('flow-cabin-welcome-v1', 'true');
    window.lyricRequests = [];
    window.albumMobile = { musicRequest: async (route, body) => {
      if (route === '/resolve') return { audioPath: '/fixture-audio/song.wav', title: '会唱歌的小屋' };
      if (route === '/lyrics') {
        window.lyricRequests.push(body);
        if (body.candidate === 77) return { text: alternate, format: 'lrc', source: 'LRCLIB', lrclibId: 77, candidates: [] };
        return { text: yrc, format: 'yrc', translation, source: 'netease', candidates: [{ id: 77, title: '会唱歌的小屋 (Live)', artist: '回归测试', album: '现场', duration: 240, synced: true, score: .6 }] };
      }
      return {};
    } };
  }, { fixture, yrc, translation, alternate, seed: onboardingSeed() });
  page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', e => report.errors.push(e.message));
  await page.goto(origin); await page.locator('.desk-home').waitFor();
  await openLibrary(page);
  await page.getByRole('button', { name: '播放 歌词练习', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-cabin-audio-host] audio')].some(a => !a.paused && a.currentTime > .1));
  await closeLibrary(page);
  const audioTime = () => page.evaluate(() => [...document.querySelectorAll('[data-cabin-audio-host] audio')].find(a => !a.paused)?.currentTime ?? 0);

  // 2. The fullscreen stage (唱机旁 › 歌词册): AMLL view, now-playing panel, live region follows the song.
  await openStage(page);
  const stage = page.getByRole('dialog', { name: '沉浸歌词' });
  await stage.locator('.cabin-amll').waitFor();
  await page.waitForTimeout(600);
  const live = async () => (await stage.locator('.lyrics-sr-only').innerText()).trim();
  const lineAt = t => `第${Math.floor(t / 3) + 1}句 小屋歌词`;
  // The song keeps playing between reading the clock and the page: accept the line of the last 0.4 s.
  const assertCurrent = async () => { const text = await live(), t = await audioTime(); assert.ok([lineAt(t), lineAt(Math.max(0, t - .4))].includes(text), `${text} at ${t}`); };
  await assertCurrent();
  assert.equal(await stage.locator('.lyrics-stage-meta strong').innerText(), '会唱歌的小屋');
  assert.ok(await stage.locator('.lyrics-stage-particles').count(), 'room particles are drawn');
  assert.match(await stage.locator('.cabin-amll').innerText(), /Line \d+/, 'translations are aligned within half a second');
  await page.screenshot({ path: path.join(output, 'stage-pixel.png') });
  pass('fullscreen-stage-shows-amll-lyrics-translation-and-follows-the-song');

  // 3. Offset: +0.5 s is saved per song and shifts which line is current.
  await stage.getByRole('button', { name: '歌词设置', exact: true }).click();
  const settings = stage.getByRole('region', { name: '歌词设置' });
  await settings.getByRole('button', { name: '歌词推后 0.5 秒' }).click();
  assert.equal(await settings.locator('.lyrics-offset output').innerText(), '+0.5s');
  const saved = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('flow-cabin-lyrics-v1:')).map(k => JSON.parse(localStorage.getItem(k)).offset));
  assert.deepEqual(saved, [500]);
  await settings.getByRole('button', { name: '归零' }).click();
  pass('offset-buttons-save-per-song-and-reset');

  // 4. Translation preference persists for every surface; 换一版 asks for that version.
  await settings.getByLabel('显示翻译').uncheck();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('flow-cabin-lyric-prefs-v1')).translation), false);
  assert.doesNotMatch(await stage.locator('.cabin-amll').innerText(), /Line \d+/);
  await settings.getByLabel('显示翻译').check();
  await settings.getByRole('button', { name: /会唱歌的小屋 \(Live\)/ }).click();
  await page.waitForFunction(() => window.lyricRequests.some(r => r.candidate === 77));
  await stage.locator('.cabin-amll', { hasText: '另一版' }).waitFor();
  await settings.getByRole('button', { name: '回到自动匹配' }).click();
  await stage.locator('.cabin-amll', { hasText: '小屋歌词' }).waitFor();
  await settings.getByRole('button', { name: '收起歌词设置' }).click();
  pass('translation-preference-persists-and-another-version-can-be-chosen-and-undone');

  // 5. Keyboard: Space pauses and resumes, → seeks, Esc leaves the stage.
  await stage.locator('.lyrics-stage').click({ position: { x: 900, y: 450 } }).catch(() => {});
  await page.keyboard.press('Space'); await page.waitForFunction(() => [...document.querySelectorAll('[data-cabin-audio-host] audio')].every(a => a.paused));
  await page.keyboard.press('Space'); await page.waitForFunction(() => [...document.querySelectorAll('[data-cabin-audio-host] audio')].some(a => !a.paused));
  const before = await audioTime(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(300);
  assert.ok(await audioTime() >= before + 4, 'right arrow seeks five seconds');
  await page.waitForTimeout(500); await assertCurrent();
  // Idle chrome fades after three seconds without input.
  await page.waitForTimeout(3300); assert.equal(await stage.locator('.lyrics-stage.is-idle').count(), 1);
  await page.keyboard.press('Escape'); await stage.waitFor({ state: 'hidden' });
  pass('keyboard-controls-play-seek-and-close-the-stage-and-idle-chrome-fades');

  // 6. Every room's skin, desktop and phone.
  for (const id of ['rain-train', 'starlight', 'forest', 'warm']) {
    // The room is chosen in 设置 › 小屋与奶糖 (the desk itself does not change with it).
    await openRoomSettings(page); await settingsDialog(page).getByRole('button', { name: `选择场景 ${getRoomScene(id).label}`, exact: true }).click(); await closeSettings(page);
    await openStage(page);
    await stage.locator('.cabin-amll').waitFor();
    assert.equal(await stage.locator('.lyrics-stage').getAttribute('data-skin'), id);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(output, `stage-${id}.png`) });
    await page.keyboard.press('Escape'); await stage.waitFor({ state: 'hidden' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await openStage(page);
  await stage.locator('.cabin-amll').waitFor(); await page.waitForTimeout(400);
  for (const name of ['收起歌词', '歌词设置', '上一首', '下一首']) { const box = await stage.getByRole('button', { name }).boundingBox(); assert.ok(box && box.x >= 0 && box.x + box.width <= 391, name); }
  await page.screenshot({ path: path.join(output, 'stage-phone.png') });
  pass('each-room-has-its-own-lyric-skin-and-the-stage-fits-a-phone');
  // 7. The desktop lyric bar page, fed like desktop/lyric-window.cjs feeds it, over a wallpaper.
  const doc = parseLyrics(yrc, 'yrc'); doc.lines = alignSecondary(doc.lines, parseLyrics(translation).lines, 'translatedLyric');
  const bar = await context.newPage(); bar.on('pageerror', e => report.errors.push('bar: ' + e.message));
  await bar.setViewportSize({ width: 900, height: 168 });
  await bar.addInitScript(({ packed }) => {
    window.barCalls = [];
    const listeners = { update: [], state: [] };
    window.pushFeed = value => listeners.update.forEach(fn => fn(value)); window.pushState = value => listeners.state.forEach(fn => fn(value));
    window.cabinLyrics = { ready: () => setTimeout(() => window.pushFeed({ docRev: 1, doc: packed, title: '会唱歌的小屋', artist: '回归测试', skin: 'starlight', pet: { id: 'fox', accessory: '' }, prefs: { deskSize: 34, translation: true, deskLayout: 'double', deskSkin: 'cabin', deskPet: true }, anchor: { position: 7400, at: Date.now(), playing: true, rate: 1, duration: 240000 }, energy: .6, bpm: 96, beatAt: Date.now() }), 50),
      onUpdate: fn => { listeners.update.push(fn); return () => {}; }, onState: fn => { listeners.state.push(fn); return () => {}; },
      command: action => window.barCalls.push(['command', action]), hoverLock: on => window.barCalls.push(['hover', on]), setPrefs: patch => window.barCalls.push(['prefs', patch]) };
  }, { packed: packLyrics(doc) });
  await bar.goto(origin + '/lyrics.html');
  await bar.addStyleTag({ content: "body{background:url('/room-scenes/v21/forest/shell.webp') center/cover !important}" });
  const active = bar.locator('.desk-lyrics-row.is-active');
  await active.waitFor();
  assert.match(await active.innerText(), /第3句/); assert.match(await active.innerText(), /Line 3/);
  assert.match(await bar.locator('.desk-lyrics-row.is-waiting').innerText(), /第4句/, 'the next line waits on the other row');
  assert.equal(await bar.locator('.desk-lyrics').getAttribute('data-skin'), 'starlight');
  await bar.waitForTimeout(300); await bar.screenshot({ path: path.join(output, 'desk-bar-starlight.png') });
  await bar.mouse.move(450, 80); await bar.locator('.desk-lyrics-toolbar').hover();
  await bar.getByRole('button', { name: '字号增大' }).click();
  await bar.getByRole('button', { name: /跟随小屋/ }).click();
  await bar.getByRole('button', { name: '锁定歌词（鼠标可穿透）' }).click();
  await bar.screenshot({ path: path.join(output, 'desk-bar-hover.png') });
  assert.deepEqual(await bar.evaluate(() => window.barCalls), [['prefs', { deskSize: 36 }], ['prefs', { deskSkin: 'paper' }], ['command', 'lock']]);
  await bar.evaluate(() => window.pushState({ locked: true }));
  assert.equal(await bar.locator('.desk-lyrics-toolbar').count(), 0, 'a locked bar shows no toolbar');
  await bar.getByRole('button', { name: '解锁桌面歌词' }).hover(); await bar.getByRole('button', { name: '解锁桌面歌词' }).click();
  assert.deepEqual((await bar.evaluate(() => window.barCalls)).slice(3), [['hover', true], ['hover', false], ['command', 'unlock']]);
  await bar.evaluate(() => window.pushFeed({ docRev: 1, title: '会唱歌的小屋', skin: 'starlight', prefs: { deskLayout: 'single', deskSkin: 'neon', deskSize: 40, translation: false, deskPet: false }, anchor: { position: 31000, at: Date.now(), playing: true, rate: 1 }, energy: .9 }));
  await bar.evaluate(() => window.pushState({ locked: false }));
  await bar.locator('.desk-lyrics.layout-single[data-skin="neon"] .desk-lyrics-row.is-active', { hasText: '第11句' }).waitFor();
  assert.doesNotMatch(await bar.locator('.desk-lyrics-row.is-active').innerText(), /Line/);
  await bar.waitForTimeout(300); await bar.screenshot({ path: path.join(output, 'desk-bar-neon-single.png') });
  pass('desktop-lyric-bar-follows-the-feed-with-ktv-rows-toolbar-lock-and-skins');
  assert.deepEqual(report.errors, []); report.passed = true;
} catch (error) { report.failure = error.stack; console.error(error); process.exitCode = 1; await page?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); }
finally { await browser?.close(); server?.kill(); await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); }
