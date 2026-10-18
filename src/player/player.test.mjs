import test from 'node:test';
import assert from 'node:assert/strict';
import { rmsEnergy, smoothEnergy, createPlaybackBroadcaster, PLAYBACK_EVENT, estimatedEnergy } from './playback-signal.mjs';
import { normalizeQueue, enqueue, playNext, dequeue, pruneQueue, cycleRepeat, nextStep, nextPlayableStep, previousStep, queueAddition, playedBag, QUEUE_LIMIT } from './player-queue.mjs';
import { proceduralGrid, quantize, readPalette, nearestIndex, gridToRgba, hexToRgb, GRID, PALETTE_TOKENS, SCENES, sleeveTone } from './pixel-cover.mjs';
import { createBeatTracker, bassLevel } from './beat-tracker.mjs';
import { setBeat, currentBeat, sinceBeat } from './beat-clock.mjs';
import { readId3, readFlac, readTags, parseFileName, groupAlbums } from './audio-tags.mjs';

test('energy: silence is 0, loud signal approaches but stays within 1', () => {
  assert.equal(rmsEnergy(new Uint8Array(256).fill(128)), 0);
  const loud = Uint8Array.from({ length: 256 }, (_, i) => i % 2 ? 255 : 0);
  const value = rmsEnergy(loud); assert.ok(value > 0.9 && value <= 1);
  const quiet = Uint8Array.from({ length: 256 }, (_, i) => 128 + Math.round(Math.sin(i / 4) * 12));
  assert.ok(rmsEnergy(quiet) > 0.05 && rmsEnergy(quiet) < 0.6);
  assert.equal(rmsEnergy(null), 0);
  assert.ok(smoothEnergy(0, 1) > smoothEnergy(1, 0) - 1 && smoothEnergy(0, 1) > 0.5 && smoothEnergy(1, 0) > 0.7);
  for (let t = 0; t < 10000; t += 333) { const e = estimatedEnergy(t); assert.ok(e >= 0 && e <= 1); }
});

class FakeEvent { constructor(type, init) { this.type = type; this.detail = init.detail; } }
test('broadcaster: immediate on state/track change, energy throttled to ~15 fps', () => {
  const sent = [], target = { dispatchEvent: (event) => sent.push(event) }; let clock = 0;
  const cast = createPlaybackBroadcaster({ target, now: () => clock, EventClass: FakeEvent });
  const track = { id: 'a', index: 0, title: 'x' };
  cast.update({ playing: false, track: null });
  cast.update({ playing: true, energy: .5, track }); // track change
  assert.equal(sent.length, 2); assert.equal(sent[1].type, PLAYBACK_EVENT); assert.equal(sent[1].detail.reason, 'track'); assert.equal(sent[1].detail.playing, true);
  clock = 10; cast.update({ playing: true, energy: .9, track }); assert.equal(sent.length, 2, 'throttled');
  clock = 70; cast.update({ playing: true, energy: .9, track }); assert.equal(sent.length, 3); assert.equal(sent[2].detail.reason, 'energy');
  clock = 75; cast.update({ playing: false, energy: .9, track }); assert.equal(sent.length, 4, 'pause goes out immediately'); assert.equal(sent[3].detail.energy, 0);
  clock = 500; cast.update({ playing: false, energy: .1, track }); assert.equal(sent.length, 4, 'no ticks while paused');
  cast.update({ playing: false, track: { ...track, index: 1 } }); assert.equal(sent.at(-1).detail.reason, 'track');
  cast.update({ playing: true, energy: 7, track: { ...track, index: 1 } }); assert.equal(sent.at(-1).detail.energy, 1);
});

test('queue: dedupes, caps, prunes and cycles repeat', () => {
  let q = normalizeQueue(null); assert.deepEqual(q, { ids: [], repeat: 'off', shuffle: false });
  q = enqueue(q, 'a'); q = enqueue(q, 'b'); q = enqueue(q, 'a'); assert.deepEqual(q.ids, ['b', 'a']);
  q = playNext(q, 'c'); assert.deepEqual(q.ids, ['c', 'b', 'a']);
  q = dequeue(q, 'b'); assert.deepEqual(q.ids, ['c', 'a']);
  assert.deepEqual(pruneQueue(q, ['a']).ids, ['a']);
  for (let i = 0; i < 80; i++) q = enqueue(q, 'x' + i); assert.equal(q.ids.length, QUEUE_LIMIT);
  assert.equal(cycleRepeat(q).repeat, 'all'); assert.equal(cycleRepeat(cycleRepeat(q)).repeat, 'one'); assert.equal(cycleRepeat(cycleRepeat(cycleRepeat(q))).repeat, 'off');
  assert.equal(normalizeQueue({ ids: [1, '', 'ok'], repeat: 'bogus' }).repeat, 'off');
});

test('queue: next/previous follow album order, queue, repeat and shuffle', () => {
  const base = normalizeQueue({});
  assert.deepEqual(nextStep({ trackIndex: 0, trackCount: 3, queue: base }), { type: 'track', index: 1 });
  assert.deepEqual(nextStep({ trackIndex: 2, trackCount: 3, queue: base }), { type: 'stop' });
  assert.deepEqual(nextStep({ trackIndex: 2, trackCount: 3, queue: enqueue(base, 'z') }), { type: 'album', id: 'z' });
  assert.deepEqual(nextStep({ trackIndex: 2, trackCount: 3, queue: { ...base, repeat: 'all' } }), { type: 'track', index: 0 });
  assert.deepEqual(nextStep({ trackIndex: 1, trackCount: 3, queue: { ...base, repeat: 'one' } }), { type: 'restart' });
  assert.deepEqual(nextStep({ trackIndex: 1, trackCount: 3, queue: { ...base, repeat: 'one' }, manual: true }), { type: 'track', index: 2 });
  for (const r of [0, .3, .7, .99]) { const step = nextStep({ trackIndex: 1, trackCount: 3, queue: { ...base, shuffle: true }, random: () => r }); assert.equal(step.type, 'track'); assert.notEqual(step.index, 1); assert.ok(step.index >= 0 && step.index < 3); }
  assert.deepEqual(previousStep({ trackIndex: 2, position: 1 }), { type: 'track', index: 1 });
  assert.deepEqual(previousStep({ trackIndex: 2, position: 12 }), { type: 'restart' });
  assert.deepEqual(previousStep({ trackIndex: 0, position: 0 }), { type: 'restart' });
});

test('pixel covers: deterministic, palette-bound, framed', () => {
  const a = proceduralGrid({ title: '晴天', artist: '周杰伦' }), b = proceduralGrid({ title: '晴天', artist: '周杰伦' }), c = proceduralGrid({ title: 'Blue', artist: 'Joni Mitchell' });
  assert.deepEqual(a.grid, b.grid); assert.notDeepEqual(a.grid, c.grid);
  assert.equal(a.grid.length, GRID * GRID); assert.ok([...a.grid].every((i) => i < PALETTE_TOKENS.length));
  assert.equal(a.grid[0], 0); assert.equal(a.grid[GRID * GRID - 1], 0); // shadow frame
  const scenes = new Set(Array.from({ length: 80 }, (_, i) => proceduralGrid({ title: 'album ' + i }).scene)); assert.equal(SCENES.length, 8); assert.equal(scenes.size, SCENES.length, 'every motif is reachable');
  assert.equal(sleeveTone({ title: '晴天', artist: '周杰伦' }), sleeveTone({ title: '晴天', artist: '周杰伦' }), 'label tone is per record');
  assert.ok(Array.from({ length: 40 }, (_, i) => sleeveTone({ title: 'album ' + i })).every((hex) => PALETTE_TOKENS.some(([, value]) => value === hex) && !['#0d0805', '#1c120b', '#2e1d12'].includes(hex)), 'label tone is a bright palette ink');
  const palette = readPalette({ getPropertyValue: (name) => name === '--px-accent' ? ' #ff0000 ' : '' });
  assert.deepEqual(palette[PALETTE_TOKENS.findIndex(([n]) => n === '--px-accent')], [255, 0, 0], 'live CSS token wins');
  assert.deepEqual(palette[0], hexToRgb('#0d0805'), 'fallback when token missing');
  const rgba = gridToRgba(a.grid, GRID, palette, 2); assert.equal(rgba.length, GRID * 2 * GRID * 2 * 4);
});

test('pixel covers: quantize maps photo pixels into the cabin palette', () => {
  const palette = readPalette(null), size = 4, pixels = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) pixels.set([i < 8 ? 250 : 10, i < 8 ? 240 : 10, i < 8 ? 220 : 12, 255], i * 4);
  const out = quantize(pixels, size, palette, { dither: 0, warmth: 0 });
  assert.equal(out[0], nearestIndex([250, 240, 220], palette)); assert.equal(palette[out[0]].join(), hexToRgb('#ffe9cb').join());
  assert.equal(palette[out[15]].join(), hexToRgb('#0d0805').join());
});

const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
function id3v23(frames) {
  const body = frames.flatMap(([id, payload]) => { const size = payload.length; return [...ascii(id), size >>> 24 & 255, size >>> 16 & 255, size >>> 8 & 255, size & 255, 0, 0, ...payload]; });
  const n = body.length; return Uint8Array.from([...ascii('ID3'), 3, 0, 0, n >> 21 & 127, n >> 14 & 127, n >> 7 & 127, n & 127, ...body]);
}
const utf16 = (s) => [1, 0xff, 0xfe, ...[...s].flatMap((c) => [c.charCodeAt(0) & 255, c.charCodeAt(0) >> 8])];
test('tags: ID3v2.3 text (latin1 / utf-16) and APIC picture', () => {
  const bytes = id3v23([['TIT2', [0, ...ascii('Morning')]], ['TPE1', utf16('周杰伦')], ['TALB', [3, ...new TextEncoder().encode('范特西')]], ['TRCK', [0, ...ascii('3/10')]], ['TYER', [0, ...ascii('2001')]], ['APIC', [0, ...ascii('image/png'), 0, 3, 0, 137, 80, 78, 71]]]);
  const tags = readId3(bytes);
  assert.equal(tags.title, 'Morning'); assert.equal(tags.artist, '周杰伦'); assert.equal(tags.album, '范特西'); assert.equal(tags.track, '3/10'); assert.equal(tags.year, '2001');
  assert.equal(tags.picture.mime, 'image/png'); assert.deepEqual([...tags.picture.data], [137, 80, 78, 71]);
  assert.deepEqual(readTags(Uint8Array.from([1, 2, 3])), {});
});
test('tags: FLAC vorbis comments and stream duration', () => {
  const le = (n) => [n & 255, n >> 8 & 255, n >> 16 & 255, n >>> 24 & 255];
  const comments = ['TITLE=夜曲', 'ARTIST=周杰伦', 'ALBUM=十一月的萧邦', 'TRACKNUMBER=1', 'DATE=2005-11-01'].map((s) => [...new TextEncoder().encode(s)]);
  const vorbis = [...le(3), ...ascii('lib'), ...le(comments.length), ...comments.flatMap((c) => [...le(c.length), ...c])];
  const info = new Array(34).fill(0); const rate = 44100, samples = 44100 * 200; info[10] = rate >> 12 & 255; info[11] = rate >> 4 & 255; info[12] = (rate & 15) << 4; info[14] = samples >>> 24 & 255; info[15] = samples >> 16 & 255; info[16] = samples >> 8 & 255; info[17] = samples & 255;
  const bytes = Uint8Array.from([...ascii('fLaC'), 0, 0, 0, 34, ...info, 0x84, vorbis.length >> 16, vorbis.length >> 8 & 255, vorbis.length & 255, ...vorbis]);
  const tags = readFlac(bytes);
  assert.equal(tags.title, '夜曲'); assert.equal(tags.album, '十一月的萧邦'); assert.equal(tags.year, '2005-11-01'); assert.equal(Math.round(tags.duration), 200);
});
test('tags: filenames and grouping into ordered albums', () => {
  assert.deepEqual(parseFileName('03 - 周杰伦 - 晴天.mp3'), { track: 3, title: '晴天', artist: '周杰伦' });
  assert.deepEqual(parseFileName('07. Pink Moon.flac'), { track: 7, title: 'Pink Moon', artist: '' });
  const albums = groupAlbums([
    { path: 'Music/叶惠美/02 晴天.mp3', name: '02 晴天.mp3', tags: { album: '叶惠美', artist: '周杰伦', track: '2', year: '2003' } },
    { path: 'Music/叶惠美/01 以父之名.mp3', name: '01 以父之名.mp3', tags: { album: '叶惠美', artist: '周杰伦', track: '1/11' } },
    { path: 'Music/Demos/03 - Me - idea.wav', name: '03 - Me - idea.wav', tags: {} }
  ]);
  assert.equal(albums.length, 2);
  const yhm = albums.find((a) => a.title === '叶惠美'); assert.deepEqual(yhm.tracks.map((t) => t.title), ['以父之名', '晴天']); assert.equal(yhm.year, '2003'); assert.equal(yhm.artist, '周杰伦');
  const demos = albums.find((a) => a.title === 'Demos'); assert.equal(demos.artist, 'Me'); assert.equal(demos.tracks[0].title, 'idea');
});

test('local-music responses: {} and partial albums never crash readers', async () => {
  const { normalizeLocalLibrary, normalizeLocalAlbum, localAlbumItem } = await import('../room-playback.mjs');
  for (const raw of [{}, null, undefined, 'oops', { albums: null, folders: 'x' }]) {
    const lib = normalizeLocalLibrary(raw);
    assert.deepEqual(lib.albums, []); assert.deepEqual(lib.folders, []); assert.equal(lib.albumCount, 0); assert.equal(lib.trackCount, 0);
  }
  const lib = normalizeLocalLibrary({ albums: [{ id: 'a', title: '残缺' }, null, { id: 'b', tracks: [{ id: 't', title: '歌' }, null, 5] }, { title: 'no id' }], folders: [{ name: 'M', path: '/m' }, {}] });
  assert.deepEqual(lib.albums.map((a) => [a.id, a.tracks.length]), [['a', 0], ['b', 1]]); assert.equal(lib.trackCount, 1); assert.equal(lib.albumCount, 2); assert.equal(lib.folders.length, 1);
  assert.equal(normalizeLocalAlbum(null), null);
  const item = localAlbumItem({ id: 'a' }); assert.deepEqual(item.tracks, []); assert.deepEqual(item.trackDetails, []); assert.equal(item.title, '未命名专辑');
  assert.doesNotThrow(() => localAlbumItem(undefined));
});


test('queue additions reject overflow without dropping existing records and deduplicate rapid calls', () => {
  const full = normalizeQueue({ ids: Array.from({ length: QUEUE_LIMIT }, (_, i) => `r${i}`) });
  for (const first of [false, true]) { const result = queueAddition(full, 'extra', first); assert.match(result.error, /50/); assert.equal(result.queue, undefined); }
  const promoted = queueAddition(full, 'r49', true).queue; assert.equal(promoted.ids[0], 'r49'); assert.equal(promoted.ids.length, 50);
  let q = normalizeQueue(); for (let i = 0; i < 10; i++) q = queueAddition(q, 'same').queue;
  assert.deepEqual(q.ids, ['same']); assert.equal(full.ids[0], 'r0');
});

const kickTrack = (bpm, { offset = 37, ms = 12000, offbeat = .25 } = {}) => {
  const tracker = createBeatTracker(), length = 60000 / bpm; let seed = 7; const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let time = 0; time < ms; time += 16.7) tracker.push(time, .2 + Math.exp(-((time + offset) % length) / 70) * .6 + Math.exp(-((time + offset + length / 2) % length) / 50) * offbeat + random() * .08);
  return tracker.state();
};
test('beat tracker: finds the tempo and lands on the kick, not the off-beat', () => {
  for (const bpm of [80, 100, 124, 150]) {
    const state = kickTrack(bpm), length = 60000 / bpm;
    assert.ok(state.confident, `${bpm}: confident`);
    assert.ok(Math.abs(state.bpm - bpm) / bpm < .03, `${bpm}: found ${state.bpm}`);
    const error = (((state.beatAt + 37) % length) + length * 1.5) % length - length / 2;
    assert.ok(Math.abs(error) < 40, `${bpm}: beat off by ${Math.round(error)} ms`);
  }
});
test('beat tracker: noise and silence give no beat', () => {
  const noisy = createBeatTracker(); let seed = 3; const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let time = 0; time < 12000; time += 16.7) noisy.push(time, .3 + random() * .05);
  assert.equal(noisy.state().confident, false); assert.equal(noisy.state().bpm, 0);
  const flat = createBeatTracker(); for (let time = 0; time < 12000; time += 16.7) flat.push(time, .4);
  assert.equal(flat.state().confident, false);
  assert.equal(bassLevel(new Uint8Array(1024).fill(255), 48000, 2048), 1); assert.equal(bassLevel(new Uint8Array(0)), 0);
});
test('beat tracker: seeded noise never locks, including transient estimates', () => {
  // 171: final-state CI failure; 15: transient lock; 2786/4787: accidental phase alignment.
  const seeds = new Set([171, 15, 2786, 4787, ...Array.from({ length: 1000 }, (_, i) => i + 1)]);
  for (const seed of seeds) {
    const tracker = createBeatTracker(); let random = seed;
    for (let time = 0; time < 10000; time += 1000 / 60) {
      random = random * 16807 % 2147483647;
      tracker.push(time, random / 2147483647 * .3);
      assert.equal(tracker.state().confident, false, `noise seed ${seed} at ${time} ms`);
    }
    assert.equal(tracker.state().bpm, 0, `noise seed ${seed} never acquired a tempo`);
  }
});
test('beat tracker: click precision and fast locking survive track resets', () => {
  const tracker = createBeatTracker();
  for (const [index, bpm] of [120, 90, 120].entries()) {
    tracker.reset();
    assert.equal(tracker.state().confident, false);
    assert.equal(tracker.state().bpm, 0, 'reset drops the previous track tempo');
    const start = index * 10000, length = 60000 / bpm;
    let locked = null;
    for (let elapsed = 0; elapsed < 10000; elapsed += 1000 / 60) {
      const phase = elapsed % length;
      tracker.push(start + elapsed, phase < 60 ? .8 * Math.exp(-phase / 25) : .1);
      if (locked === null && tracker.state().confident) locked = elapsed;
    }
    const state = tracker.state();
    assert.equal(state.confident, true, `${bpm}: re-locked`);
    assert.ok(locked !== null && locked < 4500, `${bpm}: locked at ${locked}`);
    assert.ok(Math.abs(state.bpm - bpm) < .6, `${bpm}: found ${state.bpm}`);
    let error = ((state.beatAt - start) % length + length) % length;
    if (error > length / 2) error -= length;
    assert.ok(Math.abs(error) < 12, `${bpm}: phase ${error} ms`);
  }
});
test('beat tracker: long noise passages and slower sampling do not acquire a beat', () => {
  for (const initial of [182, 265, 643]) {
    const tracker = createBeatTracker(); let seed = initial;
    // Mulberry32 exercises a different noise sequence from the Park-Miller fixtures.
    const random = () => {
      seed = (seed + 0x6D2B79F5) | 0;
      let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
      value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
    for (let time = 0; time < 60000; time += 1000 / 60) {
      tracker.push(time, random() * .3);
      assert.equal(tracker.state().confident, false, `long noise seed ${initial} at ${time}`);
    }
    assert.equal(tracker.state().bpm, 0);
  }
  for (const fps of [30, 60, 120]) for (const amplitude of [.05, .3, 1]) {
    const tracker = createBeatTracker(); let seed = 34;
    for (let time = 0; time < 10000; time += 1000 / fps) {
      seed = seed * 16807 % 2147483647;
      tracker.push(time, seed / 2147483647 * amplitude);
      assert.equal(tracker.state().confident, false, `noise at ${fps} Hz, amplitude ${amplitude}, time ${time}`);
    }
    assert.equal(tracker.state().bpm, 0);
  }
});
test('beat clock and playback signal: a beat is sent when the tempo or phase changes, not every beat', () => {
  setBeat({ bpm: 120, beatAt: 1000 }); assert.equal(sinceBeat(1600), 100); assert.equal(currentBeat().detected, true);
  setBeat({ bpm: 0 }); assert.equal(currentBeat().bpm, 96, 'no beat: calm default tempo');
  let time = 0; const sent = [];
  const cast = createPlaybackBroadcaster({ target: { dispatchEvent: (event) => sent.push(event.detail) }, now: () => time, EventClass: class { constructor(type, init) { this.detail = init.detail; } } });
  cast.update({ playing: true, energy: .5, bpm: 120, beatAt: 1000 });
  time = 10; assert.equal(cast.update({ playing: true, energy: .5, bpm: 120, beatAt: 1500 }), null, 'the next beat of the same tempo is not news');
  time = 20; assert.equal(cast.update({ playing: true, energy: .5, bpm: 120, beatAt: 1560 })?.reason, 'beat', 'a 60 ms phase shift is');
  time = 30; assert.equal(cast.update({ playing: true, energy: .5, bpm: 126, beatAt: 1560 })?.reason, 'beat');
  assert.equal(sent.at(-1).bpm, 126); assert.equal(cast.update({ playing: false, bpm: 126, beatAt: 1560 }).bpm, 0);
});

test('queue: shuffle is a bag per record, then falls through to 待播, repeat-all or stop', () => {
  const queue = normalizeQueue({ shuffle: true }), heard = [];
  let bag = playedBag(null, 'r', 2, 5), index = 2;
  for (let i = 0; i < 4; i++) { const step = nextStep({ trackIndex: index, trackCount: 5, queue, played: bag.played, random: () => .5 }); assert.equal(step.type, 'track'); assert.ok(!bag.played.includes(step.index), 'never a track already heard'); index = step.index; heard.push(index); bag = playedBag(bag, 'r', index, 5); }
  assert.deepEqual([2, ...heard].sort(), [0, 1, 2, 3, 4], 'each track once');
  assert.deepEqual(nextStep({ trackIndex: index, trackCount: 5, queue, played: bag.played }), { type: 'stop' });
  assert.deepEqual(nextStep({ trackIndex: index, trackCount: 5, queue: enqueue(queue, 'z'), played: bag.played }), { type: 'album', id: 'z' }, 'the 待播 queue plays once the bag is empty');
  const again = nextStep({ trackIndex: index, trackCount: 5, queue: { ...queue, repeat: 'all' }, played: bag.played, random: () => 0 });
  assert.equal(again.type, 'track'); assert.notEqual(again.index, index, 'a new round never repeats the last track');
  assert.deepEqual(playedBag(bag, 'r', again.index, 5), { id: 'r', played: [again.index] }, 'a full bag starts over');
  assert.deepEqual(playedBag(bag, 'other', 0, 5), { id: 'other', played: [0] }, 'a new record starts a new bag');
  assert.deepEqual(nextPlayableStep({ trackIndex: 0, trackCount: 3, queue, played: [0, 1], blocked: (i) => i === 2 }), { type: 'track', index: 2 }, 'only a blocked track left: the plain step');
  assert.deepEqual(nextPlayableStep({ trackIndex: 0, trackCount: 4, queue: enqueue(queue, 'z'), played: [0, 1], random: () => 0, blocked: (i) => i >= 2 }), { type: 'album', id: 'z' });
});
