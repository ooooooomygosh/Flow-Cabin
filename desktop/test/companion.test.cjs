'use strict';
// Focus timer, cat, soundscape, companion snapshots and the new music sources.
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { EventEmitter } = require('node:events'), { PassThrough } = require('node:stream');
const { createMusicService } = require('../music-service.cjs');
const { cleanSnapshot, cleanCompanion } = require('../wallpaper-model.cjs');
const { createNowPlaying, normalizeState, appName } = require('../now-playing.cjs');
const { createLocalMusic, groupAlbums } = require('../local-music.cjs');
const { sendCompanionCommand } = require('../companion-sync.cjs');

const MIN = 60000;
const focusModel = import('../../src/focus/focus-model.mjs');

test('pomodoro runs on timestamps, pauses exactly and rewards only completed focus', async () => {
  const m = await focusModel, start = new Date(2026, 9, 8, 9, 0).getTime();
  let s = m.normalizeFocus({ settings: { focusMin: 25, shortMin: 5, longMin: 15, longEvery: 2 } });
  s = m.toggle(s, start); assert.equal(s.timer.phase, 'focus'); assert.equal(m.remainingMs(s.timer, start + MIN), 24 * MIN);
  s = m.pause(s, start + 10 * MIN); assert.equal(m.remainingMs(s.timer, start + 60 * MIN), 15 * MIN);
  s = m.resume(s, start + 20 * MIN); assert.equal(s.timer.endsAt, start + 35 * MIN);
  assert.equal(m.tick(s, start + 34 * MIN).event, null);
  let result = m.tick(s, start + 35 * MIN);
  assert.equal(result.event.phase, 'focus'); assert.equal(result.event.completed, true); assert.equal(result.state.timer.phase, 'shortBreak');
  assert.equal(result.state.rewards.fish, 1); assert.equal(result.state.rewards.xp, 25); assert.equal(result.state.sessions.length, 1);
  s = m.startPhase(result.state, 'focus', start + 41 * MIN); result = m.tick(s, start + 66 * MIN);
  assert.equal(result.state.timer.phase, 'longBreak'); // Every second round with longEvery 2.
  s = m.startPhase(result.state, 'focus', start + 90 * MIN); result = m.skip(s, start + 100 * MIN);
  assert.equal(result.event.completed, false); assert.equal(result.state.rewards.fish, 2); assert.equal(result.state.sessions.at(-1).completed, false);
  assert.equal(Math.round((result.state.sessions.at(-1).end - result.state.sessions.at(-1).start) / MIN), 10);
});
test('a long sleep finishes one phase and then waits instead of inventing focus', async () => {
  const m = await focusModel, start = Date.now();
  const s = m.startPhase(m.normalizeFocus({ settings: { focusMin: 25, shortMin: 5 } }), 'focus', start);
  const { state, event } = m.tick(s, start + 8 * 60 * MIN);
  assert.equal(event.completed, true); assert.equal(state.timer.phase, 'idle'); assert.equal(state.rewards.fish, 1);
});
test('statistics split sessions at midnight and count streaks', async () => {
  const m = await focusModel, now = new Date(2026, 9, 8, 12, 0).getTime();
  const late = new Date(2026, 9, 7, 23, 50).getTime();
  const sessions = [{ start: late, end: late + 20 * MIN, completed: true }, { start: new Date(2026, 9, 6, 10).getTime(), end: new Date(2026, 9, 6, 10, 25).getTime(), completed: true }];
  const stats = m.focusStats(sessions, now);
  assert.equal(stats.today, 10); assert.equal(stats.week[5].minutes, 10); assert.equal(stats.week[4].minutes, 25);
  assert.equal(stats.streak, 3); assert.equal(stats.totalMinutes, 45); assert.equal(stats.week.length, 7);
});
test('tasks, unlocks and normalisation reject malformed or locked values', async () => {
  const m = await focusModel; let s = m.normalizeFocus();
  s = m.addTask(s, '  写周报\n ', 1); s = m.addTask(s, '', 2); assert.equal(s.tasks.length, 1); assert.equal(s.tasks[0].text, '写周报');
  s = m.addTask(s, '整理唱片', 3); s = m.moveTask(s, s.tasks[1].id, 0); assert.equal(s.tasks[0].text, '整理唱片');
  s = m.updateTask(s, s.tasks[0].id, { done: true }, 99); assert.equal(s.tasks[0].doneAt, 99); s = m.clearDone(s); assert.equal(s.tasks.length, 1);
  assert.equal(m.equip(s, 'accessory', 'beanie').rewards.equipped.accessory, ''); // Locked at level 1.
  const rich = m.normalizeFocus({ rewards: { xp: 10000, equipped: { accessory: 'beanie', weather: 'starry' } } });
  assert.equal(rich.rewards.equipped.accessory, 'beanie'); assert.equal(rich.rewards.equipped.weather, 'starry');
  assert.equal(m.normalizeFocus({ rewards: { equipped: { accessory: 'crown', weather: '<script>' } } }).rewards.equipped.weather, 'snow');
  assert.deepEqual(m.levelInfo(0), { level: 1, into: 0, need: 50 }); assert.equal(m.levelInfo(50).level, 2);
  const bad = m.normalizeFocus({ settings: { focusMin: 99999, longEvery: -2 }, timer: { phase: 'hack', endsAt: 'x' }, sessions: [{ start: 5, end: 1 }, null] });
  assert.equal(bad.settings.focusMin, 180); assert.equal(bad.settings.longEvery, 2); assert.equal(bad.timer.phase, 'idle'); assert.equal(bad.sessions.length, 0);
  assert.equal(m.formatClock(25 * MIN), '25:00'); assert.equal(m.formatClock(61000), '01:01');
});
test('pixel cat frames are 32×32 with valid palette indices for every pose and accessory', async () => {
  const { catFrame, POSES, PALETTE, ACCESSORIES, SIZE } = await import('../../src/pet/cat-sprites.mjs');
  for (const [pose, count] of Object.entries(POSES)) for (let i = 0; i < count; i++) for (const acc of ACCESSORIES) {
    const frame = catFrame(pose, i, acc); assert.equal(frame.length, SIZE);
    for (const row of frame) { assert.equal(row.length, SIZE); for (const value of row) assert.ok(Number.isInteger(value) && value >= 0 && value < PALETTE.length); }
    assert.ok(frame.flat().filter(Boolean).length > 150, `${pose}/${i}/${acc} draws a cat`);
  }
});
test('cat behaviour follows focus, music, breaks and the night', async () => {
  const { petPose, bubbleText, frameAt } = await import('../../src/pet/pet-model.mjs');
  assert.equal(petPose({ phase: 'focus', playing: true, hour: 2 }), 'focus');
  assert.equal(petPose({ phase: 'focus', paused: true, playing: true, synced: true }), 'groove');
  assert.equal(petPose({ phase: 'shortBreak' }), 'walk'); assert.equal(petPose({ hour: 1 }), 'sleep'); assert.equal(petPose({ hour: 14 }), 'idle');
  assert.equal(petPose({ hour: 14, idleMs: 6 * MIN }), 'sleep'); assert.equal(petPose({ celebrateUntil: 10, now: 5, phase: 'focus' }), 'celebrate');
  // 2.2: the bubble speaks at moments only (start, halfway, last minute, end), not the whole round.
  assert.equal(bubbleText({ phase: 'focus', remaining: 10 * MIN, duration: 25 * MIN, now: 9e6, since: 1 }), '');
  assert.equal(bubbleText({ phase: 'focus', remaining: 25 * MIN, duration: 25 * MIN, now: 1000, since: 500 }), '开始专注啦，我陪着你');
  assert.equal(bubbleText({ track: '晴天', trackChangedAt: 100, now: 200 }), '♪ 晴天'); assert.equal(bubbleText({ track: '晴天', trackChangedAt: 100, now: 99999 }), '');
  assert.equal(frameAt('groove', 0), 0); assert.equal(frameAt('groove', 250), 1); assert.equal(frameAt('groove', 1000), 0);
});
test('generated lo-fi sections are deterministic per seed and use 16-step bars', async () => {
  const { composeSection } = await import('../../src/audio/lofi-engine.mjs');
  const a = composeSection(42), b = composeSection(42), c = composeSection(43);
  assert.deepEqual(a, b); assert.notDeepEqual(a, c);
  assert.equal(a.chords.length, 4); assert.ok(a.bpm >= 68 && a.bpm < 86); assert.equal(a.drums.kick.length, 16); assert.equal(a.drums.hat.length, 16);
  for (const chord of a.chords) { assert.ok(chord.notes.length >= 3); assert.ok(chord.notes.every((note) => note >= 48 && note <= 74)); }
});
test('ambience mix normalises volumes and noise generators stay in range', async () => {
  const { normalizeMix, fillNoise, mulberry32 } = await import('../../src/audio/ambience.mjs');
  const mix = normalizeMix({ master: 5, tracks: { rain: -1, fire: .333, evil: 1 } });
  assert.equal(mix.master, 1); assert.equal(mix.tracks.rain, 0); assert.equal(mix.tracks.fire, .33); assert.equal('evil' in mix.tracks, false);
  for (const colour of ['white', 'pink', 'brown', 'crackle']) { const data = fillNoise(new Float32Array(4096), colour, mulberry32(7)); assert.ok(data.every((v) => Number.isFinite(v) && Math.abs(v) <= 1.5), colour); }
});
test('companion snapshots carry display data only', () => {
  const companion = cleanCompanion({ focus: { phase: 'focus', remaining: 5 * MIN, task: 'x'.repeat(500), fish: 3, accessory: 'crown', weather: 'rain', tasks: ['secret'] }, playing: true, track: '晴天', token: 'PRIVATE' });
  assert.equal(companion.focus.task.length, 120); assert.equal(companion.focus.accessory, ''); assert.equal(companion.focus.weather, 'rain');
  assert.equal(JSON.stringify(companion).includes('PRIVATE'), false); assert.equal(JSON.stringify(companion).includes('secret'), false);
  const room = cleanSnapshot({ look: 'pixel', weather: 'evil', accessory: 'scarf', provider: 'system', grooving: true, focus: { phase: 'nap' } });
  assert.equal(room.weather, 'snow'); assert.equal(room.accessory, 'scarf'); assert.equal(room.provider, 'system'); assert.equal(room.focus.phase, 'idle');
  const sent = []; const site = { isDestroyed: () => false, executeJavaScript: async (code) => { sent.push(code); } };
  assert.equal(sendCompanionCommand(site, 'focus-start'), true); assert.equal(sendCompanionCommand(site, 'shell-exec'), false); assert.equal(sendCompanionCommand(site, 'play-toggle'), false, 'play/pause goes through cabin:player-command'); assert.equal(sent.length, 1);
});
test('desktop pet stays reachable on screen', () => {
  // clampToWorkArea uses Electron's screen; stub it through the require cache.
  const electron = require.resolve('electron'); const old = require.cache[electron];
  require.cache[electron] = { exports: { screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }) } } };
  try {
    delete require.cache[require.resolve('../pet.cjs')]; const { clampToWorkArea: clamp } = require('../pet.cjs');
    const far = clamp({ x: 99999, y: -9999, width: 288, height: 256 }); assert.ok(far.x <= 1920 - 96 && far.y >= -48);
    const placed = clamp({ x: 700, y: 300, width: 288, height: 256 }); assert.deepEqual([placed.x, placed.y], [700, 300], 'a spot inside the work area is kept as is');
    const left = clamp({ x: -99999, y: 99999, width: 288, height: 256 }); assert.ok(left.x >= -96 && left.y <= 1040 - 256 + 10);
  } finally { if (old) require.cache[electron] = old; else delete require.cache[electron]; delete require.cache[require.resolve('../pet.cjs')]; }
});

test('system now-playing normalises helper output and controls through stdin', async () => {
  assert.equal(appName('Spotify.exe'), 'Spotify'); assert.equal(appName('cloudmusic.exe'), '网易云音乐'); assert.equal(appName('Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic'), '媒体播放器');
  const clean = normalizeState({ available: true, active: true, app: 'QQMusic.exe', title: '晴天\u0000', artist: '周杰伦', playing: true, position: -5, duration: 269, artwork: 'javascript:alert(1)' });
  assert.equal(clean.title, '晴天'); assert.equal(clean.position, 0); assert.equal(clean.artwork, ''); assert.equal(clean.app, 'QQ 音乐');
  assert.equal(normalizeState({ available: true, active: true, title: 'x', artwork: 'data:image/png;base64,AAAA' }).artwork, 'data:image/png;base64,AAAA');
  const written = []; let spawned = 0;
  const fakeSpawn = () => { spawned++; const child = new EventEmitter(); child.stdout = new PassThrough(); child.stdin = { write: (v) => written.push(v), end() {} }; child.kill = () => {}; setTimeout(() => child.stdout.write(JSON.stringify({ available: true, active: true, app: 'Spotify.exe', title: '晴天', artist: '周杰伦', album: '叶惠美', playing: true }) + '\n'), 5); return child; };
  let time = 0; const np = createNowPlaying({ platform: 'win32', helperPath: 'NowPlaying.exe', spawnProcess: fakeSpawn, now: () => time, idleStopMs: 1000 });
  await np.get(); await new Promise((r) => setTimeout(r, 30));
  const state = await np.get(); assert.equal(state.title, '晴天'); assert.equal(state.app, 'Spotify'); assert.equal(spawned, 1);
  await np.control('next'); assert.deepEqual(written, ['next\n']); await assert.rejects(np.control('rm -rf'));
  np.stop(); assert.equal(np.running, false);
  const mac = createNowPlaying({ platform: 'darwin', execFileProcess: (_cmd, args, _o, cb) => cb(null, args.at(-1) === 'read' ? JSON.stringify({ available: true, active: true, app: 'Spotify', title: 'Blonde', artist: 'Frank Ocean', playing: false, artwork: 'https://i.scdn.co/image/x' }) : '{"ok":true}') });
  const macState = await mac.get(); assert.equal(macState.artwork, 'https://i.scdn.co/image/x'); assert.equal(macState.playing, false); assert.deepEqual(await mac.control('toggle'), { ok: true });
  assert.equal((await createNowPlaying({ platform: 'linux' }).get()).available, false);
  let attempts = 0; const missing = createNowPlaying({ platform: 'win32', helperPath: 'missing.exe', spawnProcess: () => { attempts++; throw new Error('ENOENT'); } });
  assert.equal((await missing.get()).available, false); await missing.get(); assert.equal(attempts, 1); missing.stop();
});

const safeStorage = { isEncryptionAvailable: () => true, encryptString: (v) => Buffer.from(v), decryptString: (b) => b.toString() };
test('local music groups tags into albums and streams only indexed files with ranges', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'album-local-music-')), music = path.join(directory, 'Music');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(music, 'Jay', '叶惠美'), { recursive: true }); fs.mkdirSync(path.join(music, '.hidden'));
  const tags = { '02.mp3': { title: '晴天', track: { no: 2 } }, '01.flac': { title: '以父之名', track: { no: 1 } }, 'notes.txt': null };
  for (const name of Object.keys(tags)) fs.writeFileSync(path.join(music, 'Jay', '叶惠美', name), Buffer.from('0123456789abcdef' + name));
  fs.writeFileSync(path.join(music, '.hidden', 'x.mp3'), 'hidden');
  const parseFile = async (file) => { const tag = tags[path.basename(file)]; return { common: { ...tag, artist: '周杰伦', album: '叶惠美', year: 2003, picture: [] }, format: { duration: 200 } }; };
  const local = createLocalMusic({ directory, loadParser: async () => parseFile });
  const summary = await local.addFolder(music);
  assert.equal(summary.albumCount, 1); assert.equal(summary.trackCount, 2);
  const [album] = local.albums(); assert.deepEqual(album.tracks.map((track) => track.title), ['以父之名', '晴天']); assert.equal(album.year, '2003');
  assert.equal(JSON.stringify(local.albums()).includes(music), false, 'album list hides file paths');
  assert.equal(local.search('周杰伦 晴天')[0].id, album.tracks[1].id); assert.equal(local.search('不存在').length, 0);
  assert.equal(local.track('../../etc/passwd'), null);

  const service = createMusicService({ directory, safeStorage, login: async () => ({}), logout: async () => {}, upstream: {}, localMusic: local });
  t.after(() => service.stop());
  const request = (url, init = {}) => service.proxy(new Request('https://album-circle.vercel.app/desktop-music' + url, init), url, fetch);
  const resolved = await (await request('/resolve', { method: 'POST', body: JSON.stringify({ provider: 'local', id: album.tracks[1].id }) })).json();
  assert.equal(resolved.audioPath, '/desktop-music/local/audio/' + album.tracks[1].id);
  const full = await request('/local/audio/' + album.tracks[1].id); assert.equal(full.status, 200); assert.equal(full.headers.get('content-type'), 'audio/mpeg');
  const part = await request('/local/audio/' + album.tracks[1].id, { headers: { Range: 'bytes=4-7' } });
  assert.equal(part.status, 206); assert.equal(await part.text(), '4567'); assert.match(part.headers.get('content-range'), /^bytes 4-7\/\d+$/);
  assert.equal((await request('/local/audio/' + album.tracks[1].id, { headers: { Range: 'bytes=999-' } })).status, 416);
  assert.equal((await request('/local/audio/..%2F..%2Fsecret')).status, 404);
  assert.equal((await request('/search?provider=local&query=' + encodeURIComponent('以父之名'))).status, 200);
  const grouped = groupAlbums([{ file: '/a/Mix/x.mp3', title: 'x' }, { file: '/a/Mix/y.mp3', title: 'y', artist: 'B' }]);
  assert.equal(grouped.length, 2); assert.equal(grouped.find((a) => a.artist === '未知艺人').title, 'Mix');
});

test('pet companion carries music energy: cleaned, adaptive polling, relayed as cabin:playback', async () => {
  const clean = cleanCompanion({ petId: 'fox', playing: true, musicPlaying: true, energy: 7, energyEstimated: true, cookie: 'secret' });
  assert.equal(clean.musicPlaying, true); assert.equal(clean.energy, 1); assert.equal(clean.energyEstimated, true); assert.equal('cookie' in clean, false);
  assert.deepEqual([cleanCompanion({ musicPlaying: false, energy: .8 }).energy, cleanCompanion({ musicPlaying: true, energy: 'loud' }).energy, cleanCompanion({ musicPlaying: true, energy: .456 }).energy], [0, 0, .46]);
  const { createCompanionPoller } = require('../companion-sync.cjs');
  let value = { musicPlaying: true, energy: .1 }, reads = 0; const seen = [];
  const poller = createCompanionPoller({ getSite: () => ({ isDestroyed: () => false, executeJavaScript: async () => { reads++; value = { ...value, energy: value.energy + .05 }; return value; } }), clean: (v) => v, interval: (last) => last?.musicPlaying ? 60 : 5000, onValue: (v) => seen.push(v) });
  poller.start(); await new Promise((resolve) => setTimeout(resolve, 400)); poller.stop();
  assert.ok(reads >= 4 && reads <= 9, `fast while playing: ${reads} polls in 400 ms`);
  value = { musicPlaying: false, energy: 0 }; reads = 0; poller.start(); await new Promise((resolve) => setTimeout(resolve, 300)); poller.stop();
  assert.equal(reads, 1, 'slow poll when music is paused');
  const { createPlaybackRelay, subscribePetSnapshot } = await import('../../src/pet/pet-snapshot.mjs');
  class FakeEvent { constructor(type, init) { this.type = type; this.detail = init.detail; } }
  const events = [], target = { dispatchEvent: (event) => events.push(event) }, relay = createPlaybackRelay(target, FakeEvent);
  let broadcast; const applied = [];
  const stop = subscribePetSnapshot({ getSnapshot: async () => null, onSnapshot: (fn) => { broadcast = fn; } }, (v) => applied.push(v), relay);
  broadcast({ companion: { musicPlaying: true, energy: .4 } }); broadcast({ companion: { musicPlaying: true, energy: .4 } }); broadcast({ size: 192 }); broadcast({ companion: { musicPlaying: false, energy: .4 } }); broadcast({ companion: null });
  stop();
  assert.equal(applied.length, 5, 'pet code still gets every snapshot');
  assert.deepEqual(events.map((e) => [e.type, e.detail.playing, e.detail.energy]), [['cabin:playback', true, .4], ['cabin:playback', false, 0]]);
});

test('lo-fi section tempo survives the display-only snapshot and respects source precedence', async () => {
  const { readCompanion } = require('../companion-sync.cjs'), vm = require('node:vm');
  const raw = { playing: true, musicPlaying: false, lofiBpm: 78.26, energy: .9, bpm: 120, beatAt: 1000, token: 'private' };
  const value = await readCompanion({ isDestroyed: () => false, executeJavaScript: async script => vm.runInNewContext(script, { window: { albumCompanionSnapshot: () => raw }, document: { documentElement: { dataset: {} } } }) });
  const clean = cleanCompanion(value.companion);
  assert.equal(clean.lofiBpm, 78.3); assert.equal(clean.musicPlaying, false); assert.equal(clean.energy, 0); assert.equal(clean.bpm, 0); assert.equal(clean.beatAt, 0); assert.equal('token' in clean, false);
  assert.equal(cleanCompanion({ ...raw, musicPlaying: true }).lofiBpm, 0);
  assert.equal(cleanCompanion({ ...raw, playing: false }).lofiBpm, 0);
  for (const lofiBpm of [undefined, null, 0, -80, 39, 221, Infinity, NaN, 'bad']) assert.equal(cleanCompanion({ ...raw, lofiBpm }).lofiBpm, 0);
});

test('lo-fi relay updates tempo without pretending music plays, then resets on stop', async t => {
  const { createPlaybackRelay, playbackFromCompanion } = await import('../../src/pet/pet-snapshot.mjs');
  const { setBeat, currentBeat } = await import('../../src/player/beat-clock.mjs');
  setBeat({ bpm: 0 }); t.after(() => setBeat({ bpm: 0 }));
  class FakeEvent { constructor(type, init) { this.type = type; this.detail = init.detail; } }
  const events = [], relay = createPlaybackRelay({ dispatchEvent: event => events.push(event) }, FakeEvent);
  const source = { playing: true, musicPlaying: false, lofiBpm: 80 };
  relay({ companion: source }); assert.equal(currentBeat().bpm, 80); assert.equal(currentBeat().detected, false);
  assert.deepEqual(playbackFromCompanion(source), { playing: false, energy: 0, estimated: false, bpm: 0, beatAt: 0, source: 'companion' });
  relay({ companion: source }); assert.equal(events.length, 1);
  relay({ companion: { ...source, lofiBpm: 85 } }); assert.equal(events.length, 2); assert.equal(currentBeat().bpm, 85);
  setBeat({ bpm: 120, beatAt: 1000 }); relay({ companion: { ...source, musicPlaying: true, bpm: 120, beatAt: 1000 } }); assert.equal(currentBeat().bpm, 120, 'lo-fi does not overwrite real music');
  relay({ companion: source }); assert.equal(currentBeat().bpm, 80); assert.equal(currentBeat().detected, false);
  relay({ companion: { ...source, playing: false, lofiBpm: 0 } }); assert.equal(currentBeat().bpm, 96); assert.equal(events.at(-1).detail.playing, false);
  relay({ companion: source }); relay({ companion: null }); assert.equal(currentBeat().bpm, 96);
  relay({ companion: { ...source, lofiBpm: Infinity } }); assert.equal(currentBeat().bpm, 96);
});

test('the last feed (care) survives the page read so the desktop pet can eat or explain', async () => {
  const { readCompanion } = require('../companion-sync.cjs'), vm = require('node:vm');
  const raw = { care: { fedAt: 1234, ok: false, note: '小猫今天已经吃饱啦，明天再喂吧～', tier: 'happy', secret: 'x' } };
  const value = await readCompanion({ isDestroyed: () => false, executeJavaScript: async script => vm.runInNewContext(script, { window: { albumCompanionSnapshot: () => raw }, document: { documentElement: { dataset: {} } } }) });
  const care = cleanCompanion(value.companion).care;
  assert.equal(care.fedAt, 1234); assert.equal(care.ok, false); assert.match(care.note, /吃饱啦/); assert.equal('secret' in care, false);
});
