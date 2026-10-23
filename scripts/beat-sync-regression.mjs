/** Beat sync of the room cat against real audio: generated click tracks (120 / 90 BPM), a steady
 * tone, a seek and a track skip. Reads the room PixelCat's actual RGBA frames against the shared
 * desktop/preview sprite renderer, then measures changes versus the beats as HEARD
 * (the element's currentTime grid + output latency).
 * Gates: mean < 20 ms, p95 < 50 ms; no dance on a tone; listen → re-lock after seek/skip. */
import assert from 'node:assert/strict';
import { launchChromium } from './launch-browser.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { hasViteLocalOrigin } from './vite-readiness.mjs';
import { createBeatTracker } from '../src/player/beat-tracker.mjs';
import { onboardingSeed } from './app-version.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.env.BEAT_OUTPUT || path.join(root, 'desktop/test-results/beat-sync');
const port = Number(process.env.BEAT_PORT || 4197), origin = `http://127.0.0.1:${port}`;
const report = { runtime: { node: process.version, browserExecutable: process.env.BROWSER_EXECUTABLE || 'default' }, checks: [], pageErrors: [] };
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

function verifySparseTracker(bpm, initialSeed) {
  const tracker = createBeatTracker(), length = 60000 / bpm;
  let seed = initialSeed, time = 0, lockedAt = null;
  const random = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  // Deterministic delayed analyser reads: the old estimator loses an already
  // accurate tempo at 8118.9 ms (120/seed 1) and 13228.5 ms (90/seed 9).
  while (time < 20000) {
    time += 17 + (random() < .08 ? random() * 80 : random() * 4);
    const phase = (time + 250) % length;
    tracker.push(time, phase < 160 ? .8 * Math.exp(-phase / 55) : 0);
    const state = tracker.state();
    if (state.confident && lockedAt === null) lockedAt = time;
    if (lockedAt !== null) assert.equal(state.confident, true, `${bpm}/seed ${initialSeed}: lost lock at ${time}`);
    if (time > 6000) assert.ok(Math.abs(state.bpm - bpm) < 1, `${bpm}: sparse-read tempo ${state.bpm}`);
  }
  assert.ok(lockedAt !== null && lockedAt < 4500, `${bpm}: acquired at ${lockedAt}`);
  const end = time;
  for (; time < end + 4000; time += 17) {
    tracker.push(time, 0);
    if (time >= end + 2000) assert.equal(tracker.state().confident, false, 'Silence must still lose lock within two seconds');
  }
  tracker.reset();
  assert.equal(tracker.state().bpm, 0);
  assert.equal(tracker.state().confident, false);
  const name = `tracker-sparse-reads-${bpm}-seed-${initialSeed}`;
  report.checks.push({ name, passed: true, lockedAt, durationMs: end });
  console.log(`PASS ${name}`);
}

let browser, server;
const run = async (name, test) => {
  if (process.env.BEAT_FILTER && !process.env.BEAT_FILTER.split(',').some((f) => name.includes(f))) return;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN', reducedMotion: 'no-preference' });
  // Capture the exact production tracker inputs for deterministic replay. The
  // wrapper delegates every call unchanged; it neither resamples nor retries.
  await context.route(/\/src\/player\/beat-tracker\.mjs(?:\?|$)/, async route => {
    const response = await route.fetch(), source = await response.text();
    assert.ok(source.includes('function createBeatTracker('), 'Tracker factory must be available for trace capture');
    const directExport = source.includes('export function createBeatTracker(');
    const body = source.replace('function createBeatTracker(', 'function createTracedDelegate(') + `
${directExport ? 'export ' : ''}function createBeatTracker(...args) {
  const tracker = createTracedDelegate(...args);
  const trace = { events: [] };
  (window.__trackerTraces ||= []).push(trace);
  return {
    ...tracker,
    push(time, bass) {
      tracker.push(time, bass);
      trace.events.push({ time, bass, state: tracker.state() });
    },
    reset() {
      tracker.reset();
      trace.events.push({ reset: true, time: performance.now() });
    }
  };
}
`;
    await route.fulfill({ response, body });
  });
  let items = [];
  await context.route('**/api/**', (route) => { const r = route.request(), u = new URL(r.url()), b = r.postDataJSON?.() || {};
    if (u.pathname === '/api/items') { if (r.method() === 'GET') return route.fulfill({ json: { items } }); if (r.method() === 'POST') { const it = { ...b, id: 'added-' + items.length, addedAt: new Date().toISOString() }; items.unshift(it); return route.fulfill({ json: { item: it } }); }
      if (r.method() === 'PATCH') { const it = items.find((i) => i.id === u.searchParams.get('id')); Object.assign(it || {}, b); return route.fulfill({ json: { item: it } }); } }
    return route.fulfill({ status: 404, json: { error: 'none' } }); });
  await context.route('**/desktop-music/**', (r) => r.fulfill({ json: { available: false } }));
  await context.addInitScript((seed) => { window.__onboardingSeed = seed; }, onboardingSeed());
  await context.addInitScript(() => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.clear();
    localStorage.setItem('flow-cabin-onboarding-v1', window.__onboardingSeed);
    localStorage.setItem('flow-cabin-cat-mood-v1', JSON.stringify({ v: 1, mood: 90, tier: 'happy', updatedAt: Date.now(), feeds: [], totalFeeds: 0, unlockedActions: [] })); });
  const page = await context.newPage(); page.on('pageerror', (e) => report.pageErrors.push(`${name}: ${e.message}`));
  try { await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 30000 }); await page.locator('button.room-cat').waitFor({ timeout: 30000 });
    await page.evaluate(async () => {
      const { currentBeat } = await import('/src/player/beat-clock.mjs');
      const history = [];
      window.__beatSnapshot = () => {
        const audio = document.querySelector('audio[data-deck="active"]');
        return { at: performance.now(), canvas: { ...document.querySelector('button.room-cat canvas')?.dataset }, room: { ...document.querySelector('button.room-cat')?.dataset },
          beat: { ...currentBeat() }, visibility: document.visibilityState,
          audio: audio && { paused: audio.paused, currentTime: audio.currentTime, playbackRate: audio.playbackRate, readyState: audio.readyState, seeking: audio.seeking, ended: audio.ended, error: audio.error?.message || null } };
      };
      window.__beatHistory = history;
      window.addEventListener('cabin:playback', (event) => { history.push({ ...window.__beatSnapshot(), signal: event.detail }); if (history.length > 120) history.shift(); });
    });
    await test(page); report.checks.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { const diagnostics = await page.evaluate(() => ({ failure: window.__beatFrameFailure, current: window.__beatSnapshot?.(), history: window.__beatHistory })).catch(() => null);
    report.checks.push({ name, passed: false, error: error.stack, diagnostics }); console.error(`FAIL ${name}: ${error.message}`, JSON.stringify(diagnostics?.failure || diagnostics?.current)); await page.screenshot({ path: path.join(output, `${name}-failure.png`) }).catch(() => {}); }
  finally {
    const traces = await page.evaluate(() => window.__trackerTraces || []).catch(() => []);
    await fs.writeFile(path.join(output, `${name}-tracker-trace.json`), JSON.stringify(traces));
    await context.close();
  }
};
async function play(page, names) {
  await page.getByRole('button', { name: '添加到唱片架', exact: true }).click(); await page.getByRole('tab', { name: '本地音乐', exact: true }).click();
  await page.getByLabel('选择音乐文件', { exact: true }).setInputFiles(names.map((n, i) => ({ name: `0${i + 1} - Beat Test - ${n}.wav`, mimeType: 'audio/wav', buffer: FILES[n] })));
  await page.locator('.file-import .add-results li').first().getByRole('button', { name: '放上唱片架' }).click(); await page.waitForTimeout(1000);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.locator('.room-record').first().dblclick();
  await page.waitForFunction(() => { const a = document.querySelector('audio[data-deck="active"]'); return a && !a.paused && a.currentTime > .3; }, null, { timeout: 20000 });
}
const music = (page) => page.evaluate(() => document.querySelector('button.room-cat')?.dataset.music || '');
// Decode every visible canvas sample by full RGBA equality, not a pose attribute or a PNG suffix.
// The reference renderer is also used by the real desktop pet and focus accessory previews.
async function sampleFrames(page, ms, poses, startupTimeoutMs = 0) {
  await page.locator('button.room-cat canvas.pixel-cat').waitFor({ state: 'visible' });
  return page.evaluate(async ({ ms, poses, startupTimeoutMs }) => {
    const { cachedPetFrame, drawPetFrame, SIZE, POSES, CAT_ONLY_FRAMES } = await import('/src/pet/pet-sprites.mjs');
    const { currentBeat } = await import('/src/player/beat-clock.mjs');
    const canvas = document.querySelector('button.room-cat canvas.pixel-cat'), context = canvas.getContext('2d');
    if (!context || canvas.width !== SIZE || canvas.height !== SIZE) throw new Error('Room PixelCat must have a readable native-size canvas');
    const reference = document.createElement('canvas'); reference.width = reference.height = SIZE;
    const referenceContext = reference.getContext('2d'), frames = [];
    // These attributes select the reference's cosmetics only; the pose and frame come from pixels.
    const { petId = 'cat', skin = 'orange', accessory = '' } = canvas.dataset;
    if (petId !== 'cat') throw new Error(`Expected the fixture's cat, got ${petId}`);
    for (const pose of new Set([...Object.keys(POSES), ...Object.keys(CAT_ONLY_FRAMES)])) {
      const count = CAT_ONLY_FRAMES[pose] || POSES[pose];
      if (!count) throw new Error(`Unknown reference pose: ${pose}`);
      for (let index = 0; index < count; index++) {
        drawPetFrame(referenceContext, cachedPetFrame(petId, pose, index, accessory), petId, 1, skin);
        frames.push({ id: `${pose}:${index}`, pose, pixels: referenceContext.getImageData(0, 0, SIZE, SIZE).data });
      }
    }
    const audio = document.querySelector('audio[data-deck="active"]'), graph = (await import('/src/player/audio-graph.mjs')).analyserFor(audio);
    if (!audio || !graph) throw new Error('The WAV must be routed through the real audio analyser');
    const latency = graph.latency(), rows = [], started = performance.now();
    const startup = { timeoutMs: startupTimeoutMs, waitMs: 0, unmatchedSamples: 0 };
    let t0 = startupTimeoutMs ? null : started;
    await new Promise((done, reject) => {
      let frameRequest, startupTimer;
      const fail = (error) => { clearTimeout(startupTimer); cancelAnimationFrame(frameRequest); reject(error); };
      const timeoutError = () => new Error(`Room canvas did not paint a valid ${poses.join('/')} frame within ${startupTimeoutMs} ms (${startup.unmatchedSamples} unmatched startup samples)`);
      // Bound startup even when animation frames stop. Never restart this wait inside the sample window.
      if (startupTimeoutMs) startupTimer = setTimeout(() => fail(timeoutError()), startupTimeoutMs);
      const step = () => {
        try {
          const n = performance.now();
          if (t0 === null && n - started >= startupTimeoutMs) throw timeoutError();
          if (!canvas.isConnected) throw new Error('Room canvas disappeared during sampling');
          const pixels = context.getImageData(0, 0, SIZE, SIZE).data;
          const matches = frames.filter((candidate) => candidate.pixels.every((value, i) => value === pixels[i]));
          const frame = matches.find((candidate) => poses.includes(candidate.pose));
          const snapshot = () => ({ ...window.__beatSnapshot(), matches: matches.map((candidate) => candidate.id), expected: poses, samples: rows.length, elapsedMs: t0 === null ? null : Math.round(n - t0) });
          if (!frame && t0 === null) { window.__beatFrameFailure = snapshot(); startup.unmatchedSamples++; frameRequest = requestAnimationFrame(step); return; }
          if (!frame) { window.__beatFrameFailure = snapshot(); throw new Error(`Room canvas matched ${matches.map((candidate) => candidate.id).join('/') || 'no known pose'}, expected ${poses.join('/')} after ${rows.length} samples (${Math.round(n - t0)} ms into measurement)`); }
          window.__beatFrameFailure = null;
          if (t0 === null) { clearTimeout(startupTimer); t0 = n; startup.waitMs = +(n - started).toFixed(1); }
          rows.push([n, audio.currentTime, frame.id, currentBeat().bpm]);
          if (n - t0 < ms) frameRequest = requestAnimationFrame(step); else done();
        } catch (error) { fail(error); }
      };
      frameRequest = requestAnimationFrame(step);
    });
    return { rows, latency, startup, frames: [...new Set(rows.map((row) => row[2]))] };
  }, { ms, poses, startupTimeoutMs });
}
// Sample the real room canvas, then find its frame-change offsets from the nearest heard half beat.
async function measure(page, bpm, ms = 8000) {
  const { rows, latency, frames, startup } = await sampleFrames(page, ms, ['groove'], 1000);
  // currentTime is coarse: fit media = a + b·perf over the window, then heard beat k sits at perf (k·B − a)/b + latency.
  const n = rows.length; let sx = 0, sy = 0, sxx = 0, sxy = 0; for (const [x, y] of rows) { sx += x; sy += y * 1000; sxx += x * x; sxy += x * y * 1000; }
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n, half = 30000 / bpm;
  assert.ok(Number.isFinite(b) && Math.abs(b - 1) < .05, `audio advances at normal speed during measurement (${b})`);
  const offset = (perf) => { const media = a + b * (perf - latency); let o = ((media % half) + half) % half; if (o > half / 2) o -= half; return o / b; };
  const changes = []; for (let i = 1; i < n; i++) if (rows[i][2] !== rows[i - 1][2]) changes.push((rows[i][0] + rows[i - 1][0]) / 2);
  const abs = changes.map((t) => Math.abs(offset(t))).sort((x, y) => x - y), intervals = changes.slice(1).map((t, i) => t - changes[i]);
  const signed = changes.map((t) => offset(t));
  const tempos = rows.map((row) => row[3]).sort((a, b) => a - b);
  return { latency: Math.round(latency), samples: n, frames, startup, tempo: { median: tempos[Math.floor(tempos.length / 2)], min: tempos[0], max: tempos.at(-1) }, canvas: { vsCurrentTime: +(signed.reduce((s, v) => s + v, 0) / (signed.length || 1) + latency).toFixed(1), bias: +(signed.reduce((s, v) => s + v, 0) / (signed.length || 1)).toFixed(1), changes: changes.length, mean: +(abs.reduce((s, v) => s + v, 0) / (abs.length || 1)).toFixed(1), p95: +(abs[Math.floor(abs.length * .95)] || 0).toFixed(1), max: +(abs.at(-1) || 0).toFixed(1), interval: +(intervals.reduce((s, v) => s + v, 0) / (intervals.length || 1)).toFixed(1) } };
}
const gate = (name, m, bpm) => {
  const v = m.canvas; assert.ok(v.changes >= 8, `${name} canvas: frames change (${v.changes})`);
  assert.equal(m.frames.length, 4, `${name} canvas: all four groove frames are painted`);
  assert.ok(Math.abs(v.interval - 30000 / bpm) < 30000 / bpm * .08, `${name} canvas: one frame per half beat (${v.interval} ms)`);
  assert.ok(v.mean < 20, `${name} canvas: mean ${v.mean} ms`); assert.ok(Math.abs(v.bias) < 20, `${name} canvas: frames sit ${v.bias} ms off the heard click (click media time + output latency ${m.latency} ms)`); assert.ok(v.p95 < 50, `${name} canvas: p95 ${v.p95} ms`);
};
// After a (re-)lock, wait until the clock's anchor stops moving (phase steady to < 3 ms for 1.5 s), so the
// gate measures the settled lock, not the slew-in right after it. Limits are unchanged.
// After changing tempo, a steady anchor alone can precede the tracker finishing
// its tempo fit. Require the same final tempo bound throughout the settle window.
const settled = (page, ms = 8000, expectedBpm = null) => page.waitForFunction((expectedBpm) => {
  const w = window.__beatSettle ||= { last: null, steady: 0, at: 0 }, now = performance.now(); if (now - w.at < 250) return false; w.at = now;
  return import('/src/player/beat-clock.mjs').then(({ currentBeat }) => { const b = currentBeat(), L = 60000 / b.bpm;
    if (!b.detected || !b.beatAt || (expectedBpm != null && Math.abs(b.bpm - expectedBpm) >= 1)) { w.steady = 0; w.last = null; return false; }
    let d = w.last == null ? Infinity : (((b.beatAt - w.last) % L) + L) % L; if (d > L / 2) d = L - d; w.last = b.beatAt;
    w.steady = d < 3 ? w.steady + 1 : 0; if (w.steady >= 6) { delete window.__beatSettle; return true; } return false; });
}, expectedBpm, { timeout: ms, polling: 100 });
const lockedWithin = (page, ms) => page.waitForFunction(() => document.querySelector('button.room-cat')?.dataset.music === 'beat', null, { timeout: ms });

try {
  verifySparseTracker(120, 1);
  verifySparseTracker(90, 9);
  server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, env: { ...process.env, FLOW_CABIN_VITE_CACHE_DIR: path.join(output, 'vite-cache') }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; server.stdout.on('data', (b) => log += b); server.stderr.on('data', (b) => log += b);
  for (let i = 0; ; i++) { if (server.exitCode !== null || i > 150) throw new Error(log); if (hasViteLocalOrigin(log, origin) && await fetch(origin).then((r) => r.ok, () => false)) break; await new Promise((r) => setTimeout(r, 100)); }
  browser = await launchChromium({ args: ['--autoplay-policy=no-user-gesture-required'] }).catch(() => launchChromium());
  report.runtime.browserVersion = browser.version();
  for (const file of ['click120', 'click90']) await run(`cat-frames-on-heard-beats-${file}`, async (page) => {
    await play(page, [file]); await lockedWithin(page, 9000); await page.waitForTimeout(2500);
    const m = await measure(page, BPM[file]); report[file] = m; console.log(file, JSON.stringify(m)); gate(file, m, BPM[file]);
    await page.locator('audio[data-deck="active"]').evaluate((a) => a.pause()); await page.waitForTimeout(2500);
    assert.equal(await music(page), '', 'paused: no music pose');
    const paused = await sampleFrames(page, 1200, ['idle', 'sleep', 'walk']);
    report[`${file}Paused`] = { samples: paused.rows.length, frames: paused.frames };
  });
  await run('steady-tone-is-not-a-beat', async (page) => {
    await play(page, ['tone']); await page.waitForTimeout(8000);
    const s = await music(page); assert.equal(s, 'free');
    const listening = await sampleFrames(page, 13000, ['listen', 'idle']);
    report.tone = { music: s, samples: listening.rows.length, frames: listening.frames };
    assert.ok(listening.frames.some(frame => frame.startsWith('idle:')), 'steady tone must return to open-eyed idle');
    let closedAt = null, longestClosed = 0;
    for (const [time, , frame] of listening.rows) {
      if (frame.startsWith('listen:')) { closedAt ??= time; longestClosed = Math.max(longestClosed, time - closedAt); }
      else closedAt = null;
    }
    assert.ok(longestClosed <= 2000, `closed-eye listening exceeded two seconds: ${longestClosed}`);
    assert.ok(listening.frames.length >= 2, 'steady tone: breathing animates without fabricated groove frames');
    assert.equal(await page.evaluate(async () => (await import('/src/player/beat-clock.mjs')).currentBeat().known), false);
  });
  await run('seek-resets-and-relocks', async (page) => {
    await play(page, ['click120']); await lockedWithin(page, 9000);
    // 3.25 s = 6.5 beats: the beats now fall half a beat away from where they were.
    const t0 = Date.now(); await page.locator('audio[data-deck="active"]').evaluate((a) => { a.currentTime += 3.25; });
    await page.waitForFunction(() => document.querySelector('button.room-cat').dataset.music === 'free', null, { timeout: 2000 });
    const listening = await sampleFrames(page, 100, ['listen', 'idle']); report.seekListeningFrames = listening.frames;
    await lockedWithin(page, 7000); report.seekRelockMs = Date.now() - t0; await page.waitForTimeout(1500); await settled(page);
    const m = await measure(page, 120, 6000); report.seek = m; console.log('seek', report.seekRelockMs, JSON.stringify(m)); gate('after seek', m, 120);
  });
  await run('track-skip-resets-and-relocks', async (page) => {
    await play(page, ['click120', 'click90']); await lockedWithin(page, 9000);
    const t0 = Date.now(); await page.evaluate(() => window.dispatchEvent(new CustomEvent('cabin:player-command', { detail: { action: 'next' } })));
    await page.waitForFunction(() => document.querySelector('button.room-cat').dataset.music !== 'beat', null, { timeout: 3000 });
    await page.waitForFunction(() => document.querySelector('button.room-cat').dataset.music === 'free', null, { timeout: 2000 });
    const listening = await sampleFrames(page, 100, ['listen', 'idle']); report.skipListeningFrames = listening.frames;
    await lockedWithin(page, 9000); report.skipRelockMs = Date.now() - t0; await page.waitForTimeout(1500); await settled(page, 8000, 90);
    const m = await measure(page, 90, 6000); report.skip = m; console.log('skip', report.skipRelockMs, JSON.stringify(m)); gate('after skip', m, 90);
    // A single estimate can briefly use the coarse autocorrelation grid between
    // onset fits. Validate tempo across the same six seconds as the actual pixels.
    assert.ok(Math.abs(m.tempo.median - 90) < 1, `new track median tempo ${m.tempo.median}`);
    assert.ok(m.tempo.min > 87 && m.tempo.max < 93, `new track tempo stays near its own beat: ${JSON.stringify(m.tempo)}`);
  });
  assert.deepEqual(report.pageErrors, []); if (report.checks.some((x) => !x.passed)) process.exitCode = 1;
} finally { await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser?.close(); server?.kill(); }
