import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLyrics } from './lyrics-model.mjs';
import { wordProgress, lineEnd, alignSecondary, anchoredPosition, packLyrics, unpackLyrics } from './lyric-timing.mjs';
import { normalizePrefs, readPrefs, writePrefs, DEFAULT_PREFS } from './lyric-prefs.mjs';
import { LYRIC_SKINS, FIXED_SKINS, skinFor, skinStyle } from './lyric-skins.mjs';
import { createParticles, PARTICLE_KINDS } from './lyric-particles.mjs';
import { THEMES } from '../room2/layout.mjs';
import { lyricCacheKey } from './lyric-session.mjs';

test('word-timed lines fill word by word; line-timed lines sweep evenly without inventing word steps', () => {
  const yrc = parseLyrics('[1000,2000](1000,1000,0)Hello (2000,1000,0)world', 'yrc');
  assert.deepEqual(wordProgress(yrc.lines[0], 1500), [.5, 0]);
  assert.deepEqual(wordProgress(yrc.lines[0], 2500), [1, .5]);
  const lrc = parseLyrics('[00:01.00]abcd\n[00:05.00]next');
  const line = lrc.lines[0], end = lineEnd(lrc.lines, 0);
  assert.equal(end, 5000);
  assert.deepEqual(wordProgress(line, 2000, end), [.5], 'four characters sweep over two seconds, not the whole gap');
  assert.deepEqual(wordProgress(line, 9000, end), [1]);
  assert.deepEqual(wordProgress(null, 1), []); assert.deepEqual(wordProgress(line, NaN), []);
  assert.equal(lineEnd(lrc.lines, 1), 10000, 'the last line gets a reading pause');
});

test('translations attach to the nearest line within half a second, each used once', () => {
  const main = parseLyrics('[00:01.00]你好\n[00:04.00]世界\n[00:09.00]再见').lines;
  const trans = parseLyrics('[00:01.30]Hello\n[00:04.45]World\n[00:20.00]Far away').lines;
  const aligned = alignSecondary(main, trans, 'translatedLyric');
  assert.deepEqual(aligned.map(l => l.translatedLyric || ''), ['Hello', 'World', '']);
  assert.equal(alignSecondary(main, [], 'translatedLyric'), main);
  const roman = alignSecondary(main, parseLyrics('[00:01.00]ni hao').lines, 'romanLyric');
  assert.equal(roman[0].romanLyric, 'ni hao');
});

test('wall-clock anchors advance only while playing and stop at the song end', () => {
  assert.equal(anchoredPosition({ position: 1000, at: 0, playing: true, rate: 1 }, 500), 1500);
  assert.equal(anchoredPosition({ position: 1000, at: 0, playing: false }, 500), 1000);
  assert.equal(anchoredPosition({ position: 1000, at: 0, playing: true, rate: 2, duration: 1500 }, 500), 1500);
  assert.equal(anchoredPosition(null), null); assert.equal(anchoredPosition({ position: null }), null);
});

test('the wire format round-trips lyrics and drops anything malformed', () => {
  const doc = parseLyrics('[1000,2000](1000,1000,0)Hello (2000,1000,0)world', 'yrc');
  doc.lines[0].translatedLyric = '你好世界';
  const back = unpackLyrics(JSON.parse(JSON.stringify(packLyrics(doc))));
  assert.equal(back.precision, 'word'); assert.equal(back.lines[0].words[1].word, 'world'); assert.equal(back.lines[0].translatedLyric, '你好世界');
  assert.deepEqual(unpackLyrics({ precision: 'evil', lines: [null, { w: 'x' }, { s: 'a', w: [[1, 'b', null]] }] }).lines.map(l => l.words.map(w => w.word)), [['1']]);
  assert.equal(unpackLyrics(null).precision, 'plain');
  assert.equal(packLyrics({ lines: [], plain: 'text', precision: 'plain' }).plain, 'text');
});

test('display preferences are bounded, persisted and broadcast', () => {
  assert.deepEqual(normalizePrefs(), { ...DEFAULT_PREFS });
  assert.equal(normalizePrefs({ scale: 9, deskSize: 2, deskSkin: 'evil', deskLayout: 'triple', translation: 'yes' }).scale, 1.6);
  const odd = normalizePrefs({ deskSize: 2, deskSkin: 'evil', deskLayout: 'triple', translation: 'yes' });
  assert.equal(odd.deskSize, 20); assert.equal(odd.deskSkin, 'cabin'); assert.equal(odd.deskLayout, 'double'); assert.equal(odd.translation, true);
  const data = new Map(), storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  writePrefs({ romanization: true, deskPet: false }, storage);
  assert.equal(readPrefs(storage).romanization, true); assert.equal(readPrefs(storage).deskPet, false);
  assert.equal(readPrefs({ getItem: () => '{broken' }).scale, 1);
});

test('every room has a complete lyric skin; fixed skins override the room', () => {
  for (const theme of THEMES) {
    const skin = skinFor(theme.id);
    assert.equal(skin.id, theme.id, theme.id);
    for (const key of ['base', 'fill', 'glow', 'stroke', 'accent']) assert.match(skin[key], /^#[0-9a-f]{6}$/i, `${theme.id} ${key}`);
    assert.ok(PARTICLE_KINDS.includes(skin.particle), `${theme.id} particle`);
    assert.equal(Object.keys(skinStyle(skin)).length, 8);
  }
  assert.equal(Object.keys(LYRIC_SKINS).length, THEMES.length);
  assert.equal(skinFor('unknown').id, 'pixel');
  for (const id of Object.keys(FIXED_SKINS)) assert.equal(skinFor('forest', id).id, id);
  assert.equal(skinFor('forest', 'cabin').id, 'forest');
});

test('particles stay under their cap, react to energy and need no canvas to step', () => {
  let seed = 1; const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const kind of PARTICLE_KINDS) {
    const layer = createParticles(null, { kind, random });
    layer.setEnergy(1); layer.pulse();
    for (let i = 0; i < 600; i++) layer.step(16);
    assert.ok(layer.count <= ({ rain: 110 }[kind] || 70), `${kind}: ${layer.count}`);
    if (kind === 'none') assert.equal(layer.count, 0);
  }
  const calm = createParticles(null, { kind: 'embers', random }), lively = createParticles(null, { kind: 'embers', random });
  lively.setEnergy(1);
  for (let i = 0; i < 60; i++) { calm.step(16); lively.step(16); }
  assert.ok(lively.count > calm.count);
});

test('the lyric cache waits for a known duration but not for its exact value', () => {
  const base = { provider: 'qq', id: 'x', title: 'Song', artist: 'A', album: '' };
  assert.notEqual(lyricCacheKey({ ...base, duration: 0 }), lyricCacheKey({ ...base, duration: 201 }));
  assert.equal(lyricCacheKey({ ...base, duration: 200.4 }), lyricCacheKey({ ...base, duration: 201 }));
});

test('paper lyrics darken the room colour enough to read on a light page', async () => {
  const { paperStyle, mixHex } = await import('./lyric-skins.mjs');
  assert.equal(mixHex('#000000', '#ffffff', .5), '#808080');
  const lum = hex => { const [r, g, b] = hex.match(/\w\w/g).map(h => parseInt(h, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * r + .7152 * g + .0722 * b; };
  for (const theme of THEMES) {
    const fill = paperStyle(skinFor(theme.id))['--lyric-fill'], paper = lum('#f3e6c8');
    assert.ok((paper + .05) / (lum(fill) + .05) >= 3, `${theme.id}: ${fill} on paper`);
  }
});

test('the lyric feed sends the whole song once per change, then only a clock anchor', async () => {
  const { createLyricFeed } = await import('./lyric-feed.mjs');
  let t = 1000; const feed = createLyricFeed({ now: () => t });
  const doc = parseLyrics('[00:01.00]你好\n[00:04.00]世界');
  feed.setSource(() => ({ position: 5000, playing: true, rate: 1, duration: 200000, energy: .4, bpm: 120, beatAt: 900 }));
  feed.setDoc('song-a', doc, { title: '歌', artist: '人' }); feed.setOffset(500);
  const first = feed.take(-1);
  assert.equal(first.docRev, 1); assert.equal(first.doc.lines.length, 2); assert.equal(first.title, '歌');
  assert.deepEqual(first.anchor, { position: 4500, at: 1000, playing: true, rate: 1, duration: 200000 });
  t = 2000; const next = feed.take(1);
  assert.equal('doc' in next, false, 'a reader that has the lyrics only gets the clock'); assert.equal(next.anchor.at, 2000);
  feed.setDoc('song-a', doc, {}); assert.equal(feed.take(1).docRev, 1, 'the same lyrics do not bump the revision');
  feed.setDoc('song-b', null, { title: '无歌词' }); const empty = feed.take(1);
  assert.equal(empty.docRev, 2); assert.equal(empty.doc, null);
  feed.setSource(() => ({ position: null })); assert.equal(feed.take(2).anchor.position, null);
});

test('a remote song position uses differences on one clock each, never across devices', async () => {
  const { remotePosition } = await import('./remote-position.mjs');
  // Sender clock is 1 hour ahead of ours: anchoredAt/sentAt are on its clock, receivedAt on ours.
  const snapshot = { music: { position: 10, playing: true, rate: 1, duration: 200, anchoredAt: 3_600_000 + 1000 }, sentAt: 3_600_000 + 1200, receivedAt: 5000 };
  assert.equal(remotePosition(snapshot, 5300), 10000 + 200 + 300);
  assert.equal(remotePosition({ ...snapshot, music: { ...snapshot.music, playing: false } }, 9e9), 10000);
  assert.equal(remotePosition({ ...snapshot, music: { ...snapshot.music, rate: 2 } }, 5300), 10000 + 1000);
  assert.equal(remotePosition({ music: { position: 10, playing: true } }, 1), 10000, 'an older peer without timestamps is shown as last reported');
  assert.equal(remotePosition({ ...snapshot, music: { ...snapshot.music, duration: 10.1 } }, 9e9), 10100);
  assert.equal(remotePosition(null), null);
});

test('the lyric feed hands a phone the current line and a few around it', async () => {
  const { createLyricFeed } = await import('./lyric-feed.mjs');
  const feed = createLyricFeed(), doc = parseLyrics(Array.from({ length: 20 }, (_, i) => `[00:${String(i * 2).padStart(2, '0')}.00]第${i + 1}句`).join('\n'));
  feed.setDoc('k', doc); feed.setSource(() => ({ position: 10500 }));
  const sung = feed.around(1, 3);
  assert.equal(sung.current, '第6句'); assert.equal(sung.next, '第7句');
  assert.deepEqual(sung.lines.map(l => l.w[0][0]), ['第5句', '第6句', '第7句', '第8句', '第9句']);
  assert.equal(sung.lines.at(-1).e, 18000, 'the last sent line still ends where the next begins');
  assert.deepEqual(createLyricFeed().around(), { lines: [], current: '', next: '' });
});
