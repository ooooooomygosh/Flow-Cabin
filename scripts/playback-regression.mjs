/** Real media-element / React regression tests, with generated silent WAVs.
 * No accounts or external traffic. Chromium output is additionally muted.
 */
import assert from 'node:assert/strict';
import { launchChromium } from './launch-browser.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { hasViteLocalOrigin } from './vite-readiness.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.env.PLAYBACK_OUTPUT || path.join(root, 'desktop/test-results/playback');
const port = Number(process.env.PLAYBACK_PORT || 4185), origin = `http://127.0.0.1:${port}`;
await fs.mkdir(output, { recursive: true });
const wav = Buffer.alloc(44 + 8000 * 2 * 60);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
const report = { fixtureData: true, muted: true, checks: [], pageErrors: [], unexpectedRequests: [] };
const fulfillAudio = route => {
  const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range || '');
  const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
  if (range && (!Number.isSafeInteger(start) || start >= wav.length || end < start)) return route.fulfill({ status: 416, body: '', headers: { 'content-range': `bytes */${wav.length}` } });
  return route.fulfill({ status: range ? 206 : 200, contentType: 'audio/wav', body: wav.subarray(start, end + 1), headers: { 'accept-ranges': 'bytes', ...(range ? { 'content-range': `bytes ${start}-${end}/${wav.length}` } : {}) } });
};
let server, browser;
const active = (page, id = '') => page.waitForFunction(id => window.fixture?.playback.playing && (!id || window.fixture.playback.actualTrack === `${id[0]}-${Number(id[1])}`) && !window.fixture.playback.audio.current.paused && !window.fixture.playback.audio.current.seeking && window.fixture.playback.audio.current.readyState >= 3 && window.fixture.playback.audio.current.getAttribute('src')?.endsWith(id), id);
const buffered = (page, id) => page.waitForFunction(id => { const deck = document.querySelector('audio[data-deck="standby"]'); return deck?.getAttribute('src')?.endsWith(id) && deck.readyState >= 3; }, id, { timeout: 7000 });
const crossfade = async page => { await buffered(page, 'a100000000000000'); await page.evaluate(() => { window.dispatchEvent(new CustomEvent('flow-cabin-crossfade', { detail: 10 })); const audio = fixture.playback.audio.current; audio.currentTime = 51; audio.dispatchEvent(new Event('timeupdate')); }); await page.waitForFunction(() => fixture.playback.playing && document.querySelectorAll('audio').length === [...document.querySelectorAll('audio')].filter(a => !a.paused).length); };
try {
  server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, env: { ...process.env, FLOW_CABIN_VITE_CACHE_DIR: path.join(output, 'vite-cache') }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; server.stdout.on('data', b => log += b); server.stderr.on('data', b => log += b);
  for (let i = 0; ; i++) { if (server.exitCode !== null || i > 100) throw new Error(log); if (hasViteLocalOrigin(log, origin) && await fetch(origin).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
  browser = await launchChromium();
  const run = async (name, test, setup = async () => {}) => {
    const context = await browser.newContext();
    await context.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin !== origin) { report.unexpectedRequests.push(url.href); return route.abort(); } if (url.pathname === '/desktop-music/resolve') return route.fulfill({ json: { audioPath: `/fixture-audio/${route.request().postDataJSON().id}` } }); if (url.pathname.startsWith('/fixture-audio/')) return fulfillAudio(route); return route.continue(); });
    const page = await context.newPage(); page.setDefaultTimeout(7000); page.on('pageerror', error => report.pageErrors.push(error.message));
    try { await setup(page); await page.goto(`${origin}/scripts/fixtures/playback.html`); await active(page); await test(page); report.checks.push({ name, passed: true }); console.log(`PASS ${name}`); }
    catch (error) { report.checks.push({ name, passed: false, error: error.message }); console.error(`FAIL ${name}: ${error.message}`); await page.screenshot({ path: path.join(output, `${name}.png`), timeout: 10000 }).catch(screenshotError => { (report.screenshotErrors ||= []).push({ name, error: screenshotError.message }); }); }
    finally { await context.close(); }
  };
  await run('buffered-duration-and-progress', async page => { await buffered(page, 'a100000000000000'); await page.evaluate(() => fixture.player.next()); await active(page, 'a100000000000000'); assert.equal(await page.locator('[aria-label="Playback progress"]').isEnabled(), true); assert.equal(await page.evaluate(() => fixture.playback.duration), 60); });
  await run('buffered-cross-track-seek', async page => { await buffered(page, 'a100000000000000'); await page.evaluate(() => { fixture.playback.startAt(23); fixture.setTrackIndex(1); }); await active(page, 'a100000000000000'); assert.ok(await page.evaluate(() => fixture.playback.audio.current.currentTime >= 22.95), 'already loaded metadata must seek immediately'); });
  await run('seek-listener-does-not-leak-onto-reused-deck', async page => { await buffered(page, 'a100000000000000'); await page.evaluate(() => { fixture.playback.startAt(23); fixture.setTrackIndex(1); }); await active(page, 'a100000000000000'); await page.evaluate(() => fixture.setTrackIndex(2)); await active(page, 'a200000000000000'); assert.ok(await page.evaluate(() => fixture.playback.audio.current.currentTime < 3), 'old metadata listener must not seek the new song'); });
  await run('natural-ended-handoff-preserves-progress', async page => { await buffered(page, 'a100000000000000'); await page.evaluate(() => { window.previousStandby = document.querySelector('audio[data-deck="standby"]'); fixture.playback.audio.current.currentTime = 59.7; }); await active(page, 'a100000000000000'); assert.equal(await page.evaluate(() => fixture.playback.audio.current === window.previousStandby && fixture.playback.duration === 60), true); });
  await run('single-track-repeat-all-restarts-after-ending', async page => { await page.evaluate(() => { fixture.load('b'); fixture.player.cycleRepeat(); }); await active(page, 'b000000000000000'); await page.evaluate(() => { fixture.playback.audio.current.currentTime = 59.7; }); await page.waitForFunction(() => fixture.playback.playing && !fixture.playback.audio.current.paused && fixture.playback.audio.current.currentTime < 2); assert.equal(await page.evaluate(() => fixture.playback.duration), 60); });
  await run('pause-and-mute-overlapping-decks', async page => { await crossfade(page); await page.evaluate(() => fixture.playback.setMuted(true)); await page.waitForFunction(() => [...document.querySelectorAll('audio')].every(a => a.muted)); await page.evaluate(() => fixture.playback.toggle()); await page.waitForFunction(() => [...document.querySelectorAll('audio')].every(a => a.paused)); assert.equal(await page.evaluate(() => document.querySelector('audio[data-deck="standby"]').getAttribute('src')), null); });
  {
    let pending, observed;
    const arrived = new Promise(resolve => { observed = resolve; });
    await run('queue-change-cancels-in-flight-prefetch', async page => {
      let timer;
      try { await Promise.race([arrived, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('No pending buffer request arrived')), 7000); })]); } finally { clearTimeout(timer); }
      await page.evaluate(() => { Math.random = () => .99; fixture.player.toggleShuffle(); });
      await buffered(page, 'a200000000000000');
      await fulfillAudio(pending).catch(() => {});
      assert.equal(await page.evaluate(() => document.querySelector('audio[data-deck="standby"]').getAttribute('src').endsWith('a200000000000000')), true, 'late old buffer cannot replace the new queue target');
    }, page => page.route('**/fixture-audio/a100000000000000', route => { pending = route; observed(); }));
  }
  for (const source of ['eject', 'visual', 'system', 'next']) await run(`interrupt-crossfade-${source}`, async page => { await crossfade(page); await page.evaluate(source => { if (source === 'eject') fixture.eject(); else if (source === 'next') fixture.player.next(); else fixture.setProvider(source); }, source); if (source === 'next') await active(page, 'a200000000000000'); else await page.waitForTimeout(150); assert.equal(await page.evaluate(() => [...document.querySelectorAll('audio')].filter(a => !a.paused && a.getAttribute('src')).length), source === 'next' ? 1 : 0, 'interrupted outgoing deck must be silenced immediately'); });
  await run('queue-enqueue-reorder-remove', async page => { await page.evaluate(() => fixture.setTrackIndex(2)); await active(page, 'a200000000000000'); await page.evaluate(() => fixture.player.enqueue('b')); await buffered(page, 'b000000000000000'); await page.evaluate(() => fixture.player.playNext('c')); await buffered(page, 'c000000000000000'); await page.evaluate(() => fixture.player.remove('c')); await buffered(page, 'b000000000000000'); await page.evaluate(() => fixture.player.remove('b')); await page.waitForFunction(() => !document.querySelector('audio[data-deck="standby"]').getAttribute('src')); });
  await run('repeat-mode-invalidates-buffer', async page => { await buffered(page, 'a100000000000000'); await page.evaluate(() => { fixture.player.cycleRepeat(); fixture.player.cycleRepeat(); }); await page.waitForFunction(() => !document.querySelector('audio[data-deck="standby"]').getAttribute('src')); await page.evaluate(() => fixture.player.cycleRepeat()); await buffered(page, 'a100000000000000'); });
  await run('shuffle-invalidates-buffer', async page => { await buffered(page, 'a100000000000000'); await page.evaluate(() => { Math.random = () => .99; fixture.player.toggleShuffle(); }); await buffered(page, 'a200000000000000'); });
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.unexpectedRequests, []);
  if (report.checks.some(check => !check.passed)) process.exitCode = 1;
} finally { await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser?.close(); server?.kill(); }
