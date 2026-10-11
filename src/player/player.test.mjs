import test from 'node:test';
import assert from 'node:assert/strict';
import { rmsEnergy, smoothEnergy, createPlaybackBroadcaster, PLAYBACK_EVENT, estimatedEnergy } from './playback-signal.mjs';
import { normalizeQueue, enqueue, playNext, dequeue, pruneQueue, cycleRepeat, nextStep, previousStep, queueAddition, QUEUE_LIMIT } from './player-queue.mjs';
import { proceduralGrid, quantize, readPalette, nearestIndex, gridToRgba, hexToRgb, GRID, PALETTE_TOKENS } from './pixel-cover.mjs';
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
  const scenes = new Set(Array.from({ length: 40 }, (_, i) => proceduralGrid({ title: 'album ' + i }).scene)); assert.equal(scenes.size, 4);
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
