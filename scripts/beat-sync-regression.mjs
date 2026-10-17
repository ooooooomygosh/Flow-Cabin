/** Beat sync of the room cat against real audio: generated click tracks (120 / 90 BPM), a steady
 * tone, a seek and a track skip. Measures when the PNG cat's groove frames and the canvas cat's
 * frames change versus the beats as HEARD (the element's currentTime grid + output latency).
 * Gates: mean < 20 ms, p95 < 50 ms on both cats; no dance on a tone; listen → re-lock after seek/skip. */
import assert from 'node:assert/strict';
import { launchChromium } from './launch-browser.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { hasViteLocalOrigin } from './vite-readiness.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.env.BEAT_OUTPUT || path.join(root, 'desktop/test-results/beat-sync');
const port = Number(process.env.BEAT_PORT || 4197), origin = `http://127.0.0.1:${port}`;
const report = { checks: [], pageErrors: [] };
await fs.mkdir(output, { recursive: true });

// 44.1 kHz mono 16-bit WAV. Clicks: a short decaying 60 Hz thump + a tick, on every beat from t = 0.
function wav(seconds, sample) {
  const rate = 44100, n = Math.round(seconds * rate), buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(sample(i / rate) * 32767))), 44 + i * 2);
  return buf;
}
const clicks = (bpm) => (t) => { const p = t % (60 / bpm); return p < .12 ? Math.exp(-p / .03) * (.7 * Math.sin(2 * Math.PI * 60 * p) + .2 * Math.sin(2 * Math.PI * 1500 * p) * (p < .01)) : 0; };
const FILES = { click120: wav(40, clicks(120)), click90: wav(40, clicks(90)), tone: wav(30, (t) => .25 * Math.sin(2 * Math.PI * 220 * t)) };
const BPM = { click120: 120, click90: 90 };

let browser, server;
const run = async (name, test) => {
  if (process.env.BEAT_FILTER && !process.env.BEAT_FILTER.split(',').some((f) => name.includes(f))) return;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN', reducedMotion: 'no-preference' });
  let items = [];
  await context.route('**/api/**', (route) => { const r = route.request(), u = new URL(r.url()), b = r.postDataJSON?.() || {};
    if (u.pathname === '/api/items') { if (r.method() === 'GET') return route.fulfill({ json: { items } }); if (r.method() === 'POST') { const it = { ...b, id: 'added-' + items.length, addedAt: new Date().toISOString() }; items.unshift(it); return route.fulfill({ json: { item: it } }); }
      if (r.method() === 'PATCH') { const it = items.find((i) => i.id === u.searchParams.get('id')); Object.assign(it || {}, b); return route.fulfill({ json: { item: it } }); } }
    return route.fulfill({ status: 404, json: { error: 'none' } }); });
  await context.route('**/desktop-music/**', (r) => r.fulfill({ json: { available: false } }));
  await context.addInitScript(() => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.clear();
    localStorage.setItem('flow-cabin-onboarding-v1', JSON.stringify({ version: 1, status: 'done', step: 'done' }));
    localStorage.setItem('flow-cabin-cat-mood-v1', JSON.stringify({ v: 1, mood: 90, tier: 'happy', updatedAt: Date.now(), feeds: [], totalFeeds: 0, unlockedActions: [] })); });
  const page = await context.newPage(); page.on('pageerror', (e) => report.pageErrors.push(`${name}: ${e.message}`));
  try { await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 30000 }); await page.locator('button.room-cat').waitFor({ timeout: 30000 }); await test(page); report.checks.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { report.checks.push({ name, passed: false, error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); await page.screenshot({ path: path.join(output, `${name}-failure.png`) }).catch(() => {}); }
  finally { await context.close(); }
};
async function play(page, names) {
  await page.getByRole('button', { name: '添加到唱片架', exact: true }).click(); await page.getByRole('tab', { name: '本地音乐', exact: true }).click();
  await page.getByLabel('选择音乐文件', { exact: true }).setInputFiles(names.map((n, i) => ({ name: `0${i + 1} - Beat Test - ${n}.wav`, mimeType: 'audio/wav', buffer: FILES[n] })));
  await page.locator('.file-import .add-results li').first().getByRole('button', { name: '放上唱片架' }).click(); await page.waitForTimeout(1000);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.locator('.room-record').first().dblclick();
  await page.waitForFunction(() => { const a = document.querySelector('audio[data-deck="active"]'); return a && !a.paused && a.currentTime > .3; }, null, { timeout: 20000 });
}
const music = (page) => page.evaluate(() => { const r = document.querySelector('button.room-cat'); return { music: r.dataset.music || '', motion: r.dataset.beatMotion || '', art: r.dataset.art }; });
// Samples both cats each frame and returns frame-change offsets from the nearest heard half beat.
async function measure(page, bpm, ms = 8000) {
  const { rows, latency } = await page.evaluate(async (ms) => {
    const audio = document.querySelector('audio[data-deck="active"]'), graph = (await import('/src/player/audio-graph.mjs')).analyserFor(audio);
    const latency = graph?.latency?.() || 0, rows = [], t0 = performance.now();
    await new Promise((done) => { const step = () => { const n = performance.now(), r = document.querySelector('button.room-cat'), art = r?.querySelector('.cat-art'), cv = r?.querySelector('canvas.pixel-cat');
      let pixels = ''; try { pixels = cv ? cv.toDataURL().slice(-80) : ''; } catch {}
      rows.push([n, Date.now() - n, audio.currentTime, art ? getComputedStyle(art).backgroundPosition : '', pixels]); if (n - t0 < ms) requestAnimationFrame(step); else done(); }; requestAnimationFrame(step); });
    return { rows, latency };
  }, ms);
  // currentTime is coarse: fit media = a + b·perf over the window, then heard beat k sits at perf (k·B − a)/b + latency.
  const n = rows.length; let sx = 0, sy = 0, sxx = 0, sxy = 0; for (const [x, , y] of rows) { sx += x; sy += y * 1000; sxx += x * x; sxy += x * y * 1000; }
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n, half = 30000 / bpm;
  const offset = (perf) => { const media = a + b * (perf - latency); let o = ((media % half) + half) % half; if (o > half / 2) o -= half; return o / b; };
  const result = { latency: Math.round(latency) };
  for (const [key, col] of [['png', 3], ['canvas', 4]]) {
    const changes = []; for (let i = 1; i < n; i++) if (rows[i][col] !== rows[i - 1][col]) changes.push((rows[i][0] + rows[i - 1][0]) / 2);
    const abs = changes.map((t) => Math.abs(offset(t))).sort((x, y) => x - y), intervals = changes.slice(1).map((t, i) => t - changes[i]);
    const signed = changes.map((t) => offset(t)); result[key] = { vsCurrentTime: +(signed.reduce((s, v) => s + v, 0) / (signed.length || 1) + latency).toFixed(1), bias: +(signed.reduce((s, v) => s + v, 0) / (signed.length || 1)).toFixed(1), changes: changes.length, mean: +(abs.reduce((s, v) => s + v, 0) / (abs.length || 1)).toFixed(1), p95: +(abs[Math.floor(abs.length * .95)] || 0).toFixed(1), max: +(abs.at(-1) || 0).toFixed(1), interval: +(intervals.reduce((s, v) => s + v, 0) / (intervals.length || 1)).toFixed(1) };
  }
  return result;
}
const gate = (name, m, bpm) => {
  for (const key of ['png', 'canvas']) {
    const v = m[key]; assert.ok(v.changes >= 8, `${name} ${key}: frames change (${v.changes})`);
    assert.ok(Math.abs(v.interval - 30000 / bpm) < 30000 / bpm * .08, `${name} ${key}: one frame per half beat (${v.interval} ms)`);
    assert.ok(v.mean < 20, `${name} ${key}: mean ${v.mean} ms`); assert.ok(Math.abs(v.bias) < 20, `${name} ${key}: frames sit ${v.bias} ms off the heard click (click media time + output latency ${m.latency} ms)`); assert.ok(v.p95 < 50, `${name} ${key}: p95 ${v.p95} ms`);
  }
};
// After a (re-)lock, wait until the clock's anchor stops moving (phase steady to < 3 ms for 1.5 s), so the
// gate measures the settled lock, not the slew-in right after it. Limits are unchanged.
const settled = (page, ms = 8000) => page.waitForFunction(() => {
  const w = window.__beatSettle ||= { last: null, steady: 0, at: 0 }, now = performance.now(); if (now - w.at < 250) return false; w.at = now;
  return import('/src/player/beat-clock.mjs').then(({ currentBeat }) => { const b = currentBeat(), L = 60000 / b.bpm;
    if (!b.detected || !b.beatAt) { w.steady = 0; w.last = null; return false; }
    let d = w.last == null ? Infinity : (((b.beatAt - w.last) % L) + L) % L; if (d > L / 2) d = L - d; w.last = b.beatAt;
    w.steady = d < 3 ? w.steady + 1 : 0; if (w.steady >= 6) { delete window.__beatSettle; return true; } return false; });
}, null, { timeout: ms, polling: 100 });
const lockedWithin = (page, ms) => page.waitForFunction(() => document.querySelector('button.room-cat')?.dataset.music === 'beat', null, { timeout: ms });

try {
  server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, env: { ...process.env, FLOW_CABIN_VITE_CACHE_DIR: path.join(output, 'vite-cache') }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; server.stdout.on('data', (b) => log += b); server.stderr.on('data', (b) => log += b);
  for (let i = 0; ; i++) { if (server.exitCode !== null || i > 150) throw new Error(log); if (hasViteLocalOrigin(log, origin) && await fetch(origin).then((r) => r.ok, () => false)) break; await new Promise((r) => setTimeout(r, 100)); }
  browser = await launchChromium({ args: ['--autoplay-policy=no-user-gesture-required'] }).catch(() => launchChromium());
  for (const file of ['click120', 'click90']) await run(`cat-frames-on-heard-beats-${file}`, async (page) => {
    await play(page, [file]); await lockedWithin(page, 9000); await page.waitForTimeout(2500);
    const m = await measure(page, BPM[file]); report[file] = m; console.log(file, JSON.stringify(m)); gate(file, m, BPM[file]);
    await page.locator('audio[data-deck="active"]').evaluate((a) => a.pause()); await page.waitForTimeout(2500);
    assert.deepEqual(await music(page), { music: '', motion: '', art: (await music(page)).art }, 'paused: no music pose');
  });
  await run('steady-tone-is-not-a-beat', async (page) => {
    await play(page, ['tone']); await page.waitForTimeout(8000);
    const s = await music(page); report.tone = s; assert.equal(s.music, 'free'); assert.equal(s.motion, ''); assert.equal(s.art, 'cat-listen');
    assert.equal(await page.evaluate(async () => (await import('/src/player/beat-clock.mjs')).currentBeat().known), false);
  });
  await run('seek-resets-and-relocks', async (page) => {
    await play(page, ['click120']); await lockedWithin(page, 9000);
    // 3.25 s = 6.5 beats: the beats now fall half a beat away from where they were.
    const t0 = Date.now(); await page.locator('audio[data-deck="active"]').evaluate((a) => { a.currentTime += 3.25; });
    await page.waitForFunction(() => document.querySelector('button.room-cat').dataset.music === 'free', null, { timeout: 2000 });
    await lockedWithin(page, 7000); report.seekRelockMs = Date.now() - t0; await page.waitForTimeout(1500); await settled(page);
    const m = await measure(page, 120, 6000); report.seek = m; console.log('seek', report.seekRelockMs, JSON.stringify(m)); gate('after seek', m, 120);
  });
  await run('track-skip-resets-and-relocks', async (page) => {
    await play(page, ['click120', 'click90']); await lockedWithin(page, 9000);
    const t0 = Date.now(); await page.evaluate(() => window.dispatchEvent(new CustomEvent('cabin:player-command', { detail: { action: 'next' } })));
    await page.waitForFunction(() => document.querySelector('button.room-cat').dataset.music !== 'beat', null, { timeout: 3000 });
    await lockedWithin(page, 9000); report.skipRelockMs = Date.now() - t0; await page.waitForTimeout(1500); await settled(page);
    const bpm = await page.evaluate(async () => (await import('/src/player/beat-clock.mjs')).currentBeat().bpm); assert.ok(Math.abs(bpm - 90) < 1, `new track tempo ${bpm}`);
    const m = await measure(page, 90, 6000); report.skip = m; console.log('skip', report.skipRelockMs, JSON.stringify(m)); gate('after skip', m, 90);
  });
  assert.deepEqual(report.pageErrors, []); if (report.checks.some((x) => !x.passed)) process.exitCode = 1;
} finally { await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser?.close(); server?.kill(); }
