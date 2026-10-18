import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaybackLog, createRemotePlaybackPoller, readPlaybackSessions, PLAYBACK_LOG_KEY, PLAYBACK_LOG_LIMIT, MAX_PLAYBACK_GAP_MS, REMOTE_POLL_MS, REMOTE_BACKGROUND_POLL_MS } from './playback-log.mjs';

const track = { id: 'album-a', index: 0, title: 'Song A', artist: 'Artist', album: 'Album A' };
function harness() {
  let mono = 0, wall = 100000, sequence = 0;
  const values = new Map(), target = new EventTarget();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const log = createPlaybackLog({ storage, now: () => mono, wallNow: () => wall, makeId: () => String(++sequence) });
  const media = { currentTime: 0, playbackRate: 1, paused: false, ended: false, seeking: false, readyState: 4 };
  const off = log.listen(target);
  return {
    log, storage, values, media, target, off,
    advance(ms, progress = ms / 1000 * media.playbackRate) { mono += ms; wall += ms; media.currentTime += progress; },
    wallJump(ms) { wall += ms; },
    event: (type, metadata = track, element = media) => log.mediaEvent(type, { media: element, track: metadata }),
    read: () => readPlaybackSessions(storage)
  };
}
const total = (h) => h.read().reduce((sum, session) => sum + session.durationMs, 0);

test('only confirmed playing starts a segment; play, focus and position alone do not', () => {
  const h = harness();
  h.event('play'); h.advance(1000); h.event('timeupdate'); h.event('pause');
  h.target.dispatchEvent(new Event('focus')); h.advance(60000); h.target.dispatchEvent(new Event('pagehide'));
  assert.deepEqual(h.read(), []);
  h.media.paused = true; h.event('playing'); h.advance(1000); h.event('pause');
  assert.deepEqual(h.read(), []);
});

test('actual lifecycle: playing, progress, pause, resume and ended create separate segments', () => {
  const h = harness();
  h.event('playing'); h.advance(1000); h.event('timeupdate'); h.advance(500); h.media.paused = true; h.event('pause');
  h.advance(30000, 0); h.event('pause'); h.media.paused = false; h.event('playing');
  h.advance(2000); h.event('timeupdate'); h.advance(250); h.media.ended = true; h.event('pause'); h.event('ended'); h.event('ended');
  assert.deepEqual(h.read().map((s) => [s.durationMs, s.reason]), [[1500, 'pause'], [2250, 'ended']]);
  assert.deepEqual(h.read()[0].track, { index: 0, title: 'Song A', artist: 'Artist' });
  assert.deepEqual(h.read()[0].album, { id: 'album-a', title: 'Album A', artist: 'Artist' });
});

test('duplicate playing/timeupdate/closing events do not inflate or reset a session', () => {
  const h = harness();
  h.event('playing'); h.event('playing');
  for (let i = 0; i < 10; i++) { h.advance(100); h.event('timeupdate'); h.event('playing'); h.event('timeupdate'); }
  h.event('pause'); h.event('pause'); h.target.dispatchEvent(new Event('pagehide'));
  assert.equal(h.read().length, 1); assert.ok(Math.abs(total(h) - 1000) <= 1);
});

test('track change closes the old song and requires a new playing confirmation', () => {
  const h = harness(), next = { ...track, index: 1, title: 'Song B' };
  h.event('playing'); h.advance(1000); h.event('timeupdate'); h.log.flush('track');
  h.advance(1000); h.event('timeupdate', next); h.event('play', next); h.log.flush('track');
  assert.equal(h.read().length, 1);
  h.media.currentTime = 0; h.event('playing', next); h.advance(1500); h.event('ended', next);
  assert.deepEqual(h.read().map((s) => [s.track.title, s.durationMs, s.reason]), [['Song A', 1000, 'track'], ['Song B', 1500, 'ended']]);
});

test('waiting stops counting; progress cannot resume it without playing', () => {
  const h = harness();
  h.event('playing'); h.advance(1000); h.event('waiting'); h.advance(4000, 0); h.event('timeupdate');
  h.event('playing'); h.advance(1000); h.event('error');
  assert.equal(total(h), 2000); assert.deepEqual(h.read().map((s) => s.reason), ['waiting', 'error']);
});

test('seek forwards/backwards and repeated seeking cannot turn skipped progress into time', () => {
  const h = harness();
  h.event('playing'); h.advance(1000); h.event('timeupdate');
  h.media.seeking = true; h.media.currentTime = 200; h.event('seeking'); h.event('seeking');
  h.advance(3000, 0); h.media.seeking = false; h.event('seeked');
  h.advance(1000); h.event('timeupdate'); h.media.currentTime = 2; h.advance(100, 0); h.event('timeupdate');
  h.advance(1000); h.event('pause');
  assert.equal(total(h), 3000);
});

test('unannounced forward seeks, stalled progress and rate changes are conservative', () => {
  const h = harness();
  h.event('playing'); h.advance(1000); h.event('timeupdate');
  h.advance(100, 50); h.event('timeupdate'); h.advance(1000, 0); h.event('timeupdate');
  h.media.playbackRate = 2; h.event('ratechange');
  h.advance(1000); h.event('timeupdate'); h.event('pause');
  assert.equal(total(h), 2000, '2x playback still counts wall listening time');
});

test('sleep gaps and frozen monotonic clocks never become listening time', () => {
  for (const wallOnly of [false, true]) {
    const h = harness();
    h.event('playing'); h.advance(1000); h.event('timeupdate');
    if (wallOnly) h.wallJump(3600000); else h.advance(3600000);
    h.event('timeupdate'); h.advance(1000); h.event('pause');
    assert.equal(total(h), 2000); assert.equal(h.read()[0].reason, 'gap');
  }
  assert.equal(MAX_PLAYBACK_GAP_MS, 5000);
});

test('pagehide flush is idempotent and bfcache restore starts a fresh confirmed segment', () => {
  const h = harness();
  h.event('playing'); h.advance(750); h.target.dispatchEvent(new Event('pagehide'));
  h.target.dispatchEvent(new Event('pagehide')); assert.equal(total(h), 750);
  h.advance(60000, 0); h.target.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
  h.advance(500); h.event('timeupdate'); h.off(); h.off();
  assert.deepEqual(h.read().map((s) => [s.durationMs, s.reason]), [[750, 'pagehide'], [500, 'unmount']]);
});

test('standby media events cannot alter the owned live session', () => {
  const h = harness(), standby = { ...h.media, currentTime: 100 };
  h.event('playing'); h.advance(1000); h.event('timeupdate');
  h.event('pause', track, standby); h.event('ended', track, standby); h.event('timeupdate', track, standby);
  h.advance(1000); h.event('pause'); assert.equal(total(h), 2000);
});

test('remote polls require fresh playing and advancing position; pagehide never extrapolates', () => {
  const h = harness(), poll = (playing, position) => h.log.remoteSample({ playing, position, track });
  poll(false, 0); h.advance(1500); poll(true, 10); h.advance(1500); poll(true, 11.5);
  h.advance(1500, 0); poll(true, 11.5); h.advance(3600000); poll(true, 500);
  h.advance(1500); poll(true, 501.5); h.advance(1000); h.target.dispatchEvent(new Event('pagehide'));
  assert.equal(total(h), 1000, 'each continuous remote span withholds one second of uncertainty');
  poll(true, 600); h.advance(1000); poll(false, 601); assert.equal(total(h), 1000, 'a paused sample cannot recover deferred time');
});

test('remote integer-second clocks retain 29 of 30 seconds, regardless of rounding or phase', () => {
  for (const round of [Math.floor, Math.round, Math.ceil]) for (const offset of [0, .2, .7]) {
    const h = harness();
    for (let i = 0; i <= 20; i++) {
      if (i) h.advance(1500);
      const sample = { playing: true, track, position: round(offset + i * 1.5) };
      h.log.remoteSample(sample); h.log.remoteSample(sample);
    }
    h.log.flush('pause');
    assert.equal(total(h), 29000);
  }
});

test('remote sampling jitter and foreground/background cadence do not accumulate rounding losses', () => {
  const h = harness(); let elapsed = 0;
  h.log.remoteSample({ playing: true, track, position: 0 });
  for (const ms of [1300, 1700, 1480, 1520, 3020, 2980, 3050, 2950, 1700, 1300, 3000, 3000, 3000]) {
    h.advance(ms); elapsed += ms;
    h.log.remoteSample({ playing: true, track, position: Math.floor(elapsed / 1000) });
  }
  h.log.flush('pause');
  assert.equal(elapsed, 30000); assert.equal(total(h), 29000);
});

test('remote pause, unchanged progress, and partial playback never carry deferred time into the next run', () => {
  const h = harness(), poll = (playing, position) => h.log.remoteSample({ playing, position, track });
  poll(true, 0); h.advance(1500); poll(true, 1); h.advance(1500); poll(true, 3);
  h.advance(1500, 0); poll(false, 3); assert.equal(total(h), 2000);
  h.advance(60000, 0); poll(true, 3); h.advance(1500); poll(true, 4);
  h.advance(1500); poll(true, 6);
  h.advance(3000, 0); poll(true, 6); // stale "playing": no actual progress
  h.advance(3000, .5); poll(true, 6.5); // mostly paused between observations
  h.advance(3000); poll(true, 9.5); h.log.flush('pause');
  assert.equal(total(h), 6000, '2 s + 2 s + 2 s; no paused interval or withheld remainder is recovered');
});

test('remote seeks in either direction discard the discontinuity without later compensation', () => {
  for (const destination of [0, 100]) {
    const h = harness(), poll = (position) => h.log.remoteSample({ playing: true, track, position });
    poll(10); h.advance(3000); poll(13); h.advance(3000); poll(destination);
    h.advance(1500); poll(destination + 1); h.advance(1500); poll(destination + 3);
    h.log.flush('pause');
    assert.equal(total(h), 4000);
  }
});

test('remote sleep, wall-clock jumps, track changes and errors start a new verification span', () => {
  for (const boundary of ['sleep', 'wall', 'track', 'error']) {
    const h = harness(); let metadata = track;
    const poll = (position) => h.log.remoteSample({ playing: true, track: metadata, position });
    poll(0); h.advance(3000); poll(3);
    if (boundary === 'sleep') h.advance(3600000);
    if (boundary === 'wall') h.wallJump(3600000);
    if (boundary === 'track') metadata = { ...track, index: 1 };
    if (boundary === 'error') h.log.flush('error');
    poll(100); h.advance(3000); poll(103); h.log.flush('pause');
    assert.equal(total(h), 4000, boundary);
  }
});

function pollTimers() {
  let sequence = 0;
  const pending = new Map();
  return {
    setTimer(fn, ms) { const id = ++sequence; pending.set(id, { fn, ms }); return id; },
    clearTimer(id) { pending.delete(id); },
    get delays() { return [...pending.values()].map((entry) => entry.ms); },
    async next() {
      assert.equal(pending.size, 1);
      const [id, entry] = pending.entries().next().value; pending.delete(id);
      await entry.fn();
    }
  };
}

test('remote polling verifies playing in background, sleeps when paused, and wakes on commands/foreground', async () => {
  const timers = pollTimers(); let active = false, playing = true, calls = 0;
  const observer = createRemotePlaybackPoller({ ...timers, isActive: () => active, poll: async () => { calls++; return playing; } });
  observer.setBackground(true); assert.deepEqual(timers.delays, []);
  active = true; await observer.wake(); assert.equal(calls, 1);
  assert.deepEqual(timers.delays, [REMOTE_BACKGROUND_POLL_MS]);
  await timers.next(); assert.equal(calls, 2);
  playing = false; await timers.next(); assert.deepEqual(timers.delays, []);
  observer.setBackground(true); assert.deepEqual(timers.delays, []);
  playing = true; await observer.wake(); assert.deepEqual(timers.delays, [REMOTE_BACKGROUND_POLL_MS]);
  observer.setBackground(false); await Promise.resolve();
  assert.equal(calls, 5); assert.deepEqual(timers.delays, [REMOTE_POLL_MS]);
  active = false; await timers.next(); assert.equal(calls, 5); assert.deepEqual(timers.delays, []);
  observer.dispose();
});

test('remote polling never overlaps and ignores completion after disposal', async () => {
  const timers = pollTimers(); let finish, calls = 0;
  const observer = createRemotePlaybackPoller({ ...timers, isActive: () => true, poll: () => { calls++; return new Promise((resolve) => finish = resolve); } });
  observer.setBackground(false); const request = observer.wake();
  observer.setBackground(true); observer.wake(); observer.setBackground(false);
  assert.equal(calls, 1); assert.deepEqual(timers.delays, []);
  finish(true); await request;
  assert.equal(calls, 2, 'queued wakeups collapse into one refresh');
  observer.dispose(); finish(true); await Promise.resolve();
  assert.deepEqual(timers.delays, []); await observer.wake(); assert.equal(calls, 2);
});

test('remote background errors stop polling; visible paused players still detect external resume', async () => {
  const timers = pollTimers(); let fail = false;
  const observer = createRemotePlaybackPoller({ ...timers, isActive: () => true, poll: async () => { if (fail) throw new Error('offline'); return false; } });
  observer.setBackground(false); await timers.next();
  assert.deepEqual(timers.delays, [REMOTE_POLL_MS]);
  observer.setBackground(true); assert.deepEqual(timers.delays, []);
  fail = true; await observer.wake(); assert.deepEqual(timers.delays, []);
  observer.setBackground(false); await Promise.resolve();
  assert.deepEqual(timers.delays, [REMOTE_POLL_MS]);
  observer.dispose(); assert.deepEqual(timers.delays, []);
});

test('checkpoint upserts the same ID; write failure retains records for retry', () => {
  const h = harness(), set = h.storage.setItem;
  h.event('playing');
  for (let i = 0; i < 15; i++) { h.advance(1000); h.event('timeupdate'); }
  assert.equal(h.read()[0].reason, 'checkpoint');
  h.storage.setItem = () => { throw new Error('quota'); };
  h.advance(1000); h.event('pause');
  assert.equal(total(h), 15000);
  h.storage.setItem = set; h.log.flush('pagehide');
  assert.equal(h.read().length, 1); assert.equal(total(h), 16000); assert.equal(h.read()[0].reason, 'pause');
});

test('metadata is allowlisted, URLs/tokens are dropped, and read results are detached', () => {
  const h = harness();
  const unsafe = { ...track, id: 'https://host/song?token=secret', title: 'token=secret', cover: 'https://host/cover', url: 'https://host/song', token: 'secret' };
  h.event('playing', unsafe); h.advance(1000); h.event('pause', unsafe);
  const serialized = h.values.get(PLAYBACK_LOG_KEY);
  assert.doesNotMatch(serialized, /https|secret|cover|token|url/i);
  const records = h.read(); records[0].track.title = 'mutated';
  assert.equal(h.read()[0].track.title, '');
});

test('read API tolerates corrupt/unavailable storage, validates duration and caps retention', () => {
  const h = harness();
  h.values.set(PLAYBACK_LOG_KEY, '{bad'); assert.deepEqual(h.read(), []);
  assert.deepEqual(readPlaybackSessions({ getItem() { throw new Error('denied'); } }), []);
  assert.deepEqual(readPlaybackSessions(null), []);
  h.event('playing'); h.advance(1000); h.event('pause');
  const good = h.read()[0];
  h.values.set(PLAYBACK_LOG_KEY, JSON.stringify([null, { ...good, durationMs: -1 }, { ...good, durationMs: 99999 }, { ...good, start: 'bad' }, good, good]));
  assert.equal(h.read().length, 1);
  h.values.set(PLAYBACK_LOG_KEY, JSON.stringify(Array.from({ length: PLAYBACK_LOG_LIMIT + 2 }, (_, i) => ({ ...good, id: `p-${i}` }))));
  assert.equal(h.read().length, PLAYBACK_LOG_LIMIT);
});

// Opt in to exercise the real React hook, native media, and remote polling:
// PLAYBACK_LOG_BROWSER=1 node --test src/player/playback-log.test.mjs
test('browser: central hook logs native lifecycle and verifies remote playback while minimized', {
  skip: process.env.PLAYBACK_LOG_BROWSER !== '1', timeout: 60000
}, async () => {
  const { spawn } = await import('node:child_process');
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { fileURLToPath } = await import('node:url');
  const { launchChromium } = await import('../../scripts/launch-browser.mjs');
  const { hasViteLocalOrigin } = await import('../../scripts/vite-readiness.mjs');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const cache = await mkdtemp(`${tmpdir()}/playback-log-`);
  const port = process.env.PLAYBACK_LOG_PORT || '4197', origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['scripts/serve-playback-fixture.mjs'], {
    cwd: root, env: { ...process.env, PLAYBACK_PORT: port, FLOW_CABIN_VITE_CACHE_DIR: cache }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '', browser;
  server.stdout.on('data', (chunk) => output += chunk); server.stderr.on('data', (chunk) => output += chunk);
  try {
    for (let i = 0; ; i++) {
      if (server.exitCode !== null || i > 100) throw new Error(output || 'Fixture server did not start');
      if (hasViteLocalOrigin(output, origin) && await fetch(origin).then((r) => r.ok, () => false)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    browser = await launchChromium();
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(`${origin}/scripts/fixtures/playback.html`);
    const active = (index = 0) => page.waitForFunction((index) => window.fixture?.playback.playing && fixture.playback.actualTrack === `a-${index}` && !fixture.playback.audio.current.seeking, index);
    const read = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '[]'), PLAYBACK_LOG_KEY);
    await active();
    await page.waitForFunction(() => fixture.playback.audio.current.currentTime >= 1);
    await page.evaluate(() => fixture.playback.audio.current.pause());
    await page.waitForFunction(() => !fixture.playback.playing);
    const first = await read(); assert.equal(first.length, 1); assert.equal(first[0].reason, 'pause'); assert.ok(first[0].durationMs >= 500);
    await page.evaluate(() => fixture.playback.audio.current.play()); await active();
    await page.waitForTimeout(600);
    await page.evaluate(() => fixture.playback.seek(40)); await active();
    await page.waitForTimeout(600);
    await page.waitForFunction(() => document.querySelector('audio[data-deck="standby"]')?.readyState >= 3);
    await page.evaluate(() => fixture.player.next()); await active(1);
    await page.waitForTimeout(600);
    const switched = await read(); assert.ok(switched.some((s) => s.reason === 'track'));
    assert.ok(switched.reduce((sum, s) => sum + s.durationMs, 0) < 15000, '40-second seek is not counted');
    await page.evaluate(() => fixture.playback.seek(59.5)); await active(2);
    const ended = await read(); assert.ok(ended.some((s) => s.reason === 'ended'), JSON.stringify(ended));
    await page.waitForTimeout(600);
    await page.goto(`${origin}/scripts/fixtures/playback.html`);
    const hidden = await read(); assert.ok(hidden.some((s) => s.reason === 'pagehide'), 'real navigation flushes the session');
    assert.equal(new Set(hidden.map((s) => s.id)).size, hidden.length);

    let remotePlaying = true, remoteAt = Date.now(), remotePosition = 0, polls = 0;
    const waitForPolls = async (count) => {
      const deadline = Date.now() + 12000;
      while (polls < count) {
        assert.ok(Date.now() < deadline, `expected ${count} remote polls, received ${polls}`);
        await page.waitForTimeout(100);
      }
    };
    const position = () => remotePosition + (remotePlaying ? (Date.now() - remoteAt) / 1000 : 0);
    const setRemotePlaying = (value) => { remotePosition = position(); remoteAt = Date.now(); remotePlaying = value; };
    await page.route('**/desktop-music/search?**', (route) => route.fulfill({ json: { candidates: [{ provider: 'ma', id: 'remote-a', title: 'a-0', artist: 'Synthetic audio', album: 'Fixture a', duration: 60 }] } }));
    await page.route('**/desktop-music/resolve', (route) => {
      remoteAt = Date.now(); remotePosition = 0;
      return route.fulfill({ json: { remote: true } });
    });
    await page.route('**/desktop-music/ma/state', (route) => {
      polls++;
      return route.fulfill({ json: { state: remotePlaying ? 'playing' : 'paused', title: 'Remote fixture', elapsed: Math.floor(position()), duration: 600 } });
    });
    await page.route('**/desktop-music/ma/control', (route) => {
      setRemotePlaying(route.request().postDataJSON().action === 'play');
      return route.fulfill({ json: { ok: true } });
    });
    await page.evaluate(() => fixture.setProvider('ma'));
    await page.waitForFunction(() => fixture.playback.remote && fixture.playback.playing);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal(await page.evaluate(() => document.documentElement.dataset.appBackground), 'true');
    const atHide = polls;
    await waitForPolls(atHide + 2);
    setRemotePlaying(false);
    await page.waitForFunction(() => !fixture.playback.playing);
    const loggedRemote = (await read()).filter((s) => s.track.title === 'Remote fixture');
    assert.ok(loggedRemote.reduce((sum, s) => sum + s.durationMs, 0) >= 4000, 'whole-second background samples are retained');
    const stopped = polls; await page.waitForTimeout(3300);
    assert.equal(polls, stopped, 'paused hidden player has no recurring polls');
    await page.evaluate(() => fixture.playback.toggle());
    await page.waitForFunction(() => fixture.playback.playing);
    assert.ok(polls > stopped, 'explicit hidden play wakes verification');
    const beforeFocus = polls;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await waitForPolls(beforeFocus + 1);
    await page.evaluate(() => fixture.eject());
    await page.waitForFunction(() => !fixture.playback.remote);
    const ejected = polls; await page.waitForTimeout(3300);
    assert.equal(polls, ejected, 'inactive remote source has no recurring polls');
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close(); server.kill();
    await new Promise((resolve) => server.exitCode !== null ? resolve() : server.once('exit', resolve));
    await rm(cache, { recursive: true, force: true });
  }
});
