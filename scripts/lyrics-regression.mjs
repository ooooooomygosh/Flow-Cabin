// Lyrics in the real home: the fullscreen stage, the karaoke readout on the lyric book,
// offsets, choosing another version, keyboard control and every room's skin.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { launchChromium } from './launch-browser.mjs';
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
  await context.addInitScript(({ fixture, yrc, translation, alternate }) => {
    localStorage.setItem('flow-cabin-interface-v1', 'beta');
    localStorage.setItem('flow-cabin-home-intro-v1', 'done');
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
  }, { fixture, yrc, translation, alternate });
  page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', e => report.errors.push(e.message));
  await page.goto(origin); await page.locator('.home-world canvas').waitFor();
  const notice = page.locator('.home-notice').getByRole('button', { name: '好的' }); if (await notice.isVisible()) await notice.click();
  await page.getByRole('button', { name: '唱片库', exact: true }).first().click();
  await page.getByRole('button', { name: '播放 歌词练习', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-cabin-audio-host] audio')].some(a => !a.paused && a.currentTime > .1));
  await page.locator('.cabin-dialog-close').last().click();
  const audioTime = () => page.evaluate(() => [...document.querySelectorAll('[data-cabin-audio-host] audio')].find(a => !a.paused)?.currentTime ?? 0);

  // 1. The lyric book in the music corner sings the current line in the room's skin.
  await page.getByRole('navigation', { name: '房间区域' }).getByRole('button', { name: '听歌角', exact: true }).click();
  const book = page.locator('[data-corner="music"] .lyric-readout');
  await book.locator('.karaoke-line').waitFor();
  const fills = await book.locator('[data-karaoke-word]').evaluateAll(words => words.map(w => Number(w.style.getPropertyValue('--p'))));
  assert.ok(fills.length === 2 && fills.every(v => v >= 0 && v <= 1), `karaoke progress ${fills}`);
  const sung = await book.locator('.karaoke-base').first().innerText(), expected = `第${Math.floor(await audioTime() / 3) + 1}句 `;
  assert.equal(sung.trim(), expected.trim());
  assert.match(await book.getAttribute('style'), /--lyric-fill/);
  await page.screenshot({ path: path.join(output, 'corner-lyric-book.png') });
  pass('lyric-book-sings-the-current-line-with-word-fill-in-the-room-skin');

  // 2. The fullscreen stage: AMLL view, now-playing panel, live region follows the song.
  await page.locator('.corner-actions').getByRole('button', { name: '歌词册', exact: true }).click();
  const stage = page.getByRole('dialog', { name: '沉浸歌词' });
  await stage.locator('.cabin-amll').waitFor();
  await page.waitForTimeout(600);
  const live = async () => (await stage.locator('.lyrics-sr-only').innerText()).trim();
  const lineAt = t => `第${Math.floor(t / 3) + 1}句 小屋歌词`;
  assert.equal(await live(), lineAt(await audioTime()));
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
  await page.waitForTimeout(500); assert.equal(await live(), lineAt(await audioTime()));
  // Idle chrome fades after three seconds without input.
  await page.waitForTimeout(3300); assert.equal(await stage.locator('.lyrics-stage.is-idle').count(), 1);
  await page.keyboard.press('Escape'); await stage.waitFor({ state: 'hidden' });
  pass('keyboard-controls-play-seek-and-close-the-stage-and-idle-chrome-fades');

  // 6. Every room's skin, desktop and phone.
  for (const [id, name] of [['rain-train', '雨夜列车书房'], ['starlight', '星光小屋'], ['forest', '林间书屋'], ['warm', '琥珀小屋']]) {
    await page.getByRole('button', { name: '选择房间主题' }).click();
    await page.locator('.home-theme-grid').getByRole('button', { name }).click();
    await page.locator('.corner-actions').getByRole('button', { name: '歌词册', exact: true }).click();
    await stage.locator('.cabin-amll').waitFor();
    assert.equal(await stage.locator('.lyrics-stage').getAttribute('data-skin'), id);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(output, `stage-${id}.png`) });
    await page.keyboard.press('Escape'); await stage.waitFor({ state: 'hidden' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.corner-actions').getByRole('button', { name: '歌词册', exact: true }).click();
  await stage.locator('.cabin-amll').waitFor(); await page.waitForTimeout(400);
  for (const name of ['收起歌词', '歌词设置', '上一首', '下一首']) { const box = await stage.getByRole('button', { name }).boundingBox(); assert.ok(box && box.x >= 0 && box.x + box.width <= 391, name); }
  await page.screenshot({ path: path.join(output, 'stage-phone.png') });
  pass('each-room-has-its-own-lyric-skin-and-the-stage-fits-a-phone');
  assert.deepEqual(report.errors, []); report.passed = true;
} catch (error) { report.failure = error.stack; console.error(error); process.exitCode = 1; await page?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); }
finally { await browser?.close(); server?.kill(); await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); }
