import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLyrics, activeLyric, lyricTrackKey } from './lyrics-model.mjs';
test('LRC stays line timed, offsets and seeking use real timestamps', () => {
  const doc = parseLyrics('[00:01.00]你好\n[00:03.50]Hello');
  assert.equal(doc.precision, 'line'); assert.equal(doc.lines[1].startTime, 3500);
  assert.equal(activeLyric(doc.lines, null), -1); assert.equal(activeLyric(doc.lines, 999), -1);
  assert.equal(activeLyric(doc.lines, 3500), 1); assert.equal(activeLyric(doc.lines, 3500, 100), 0);
  const imported = parseLyrics('[offset:500]\n[00:01.00]Hi');
  assert.equal(imported.offset, 500);
  assert.equal(activeLyric(imported.lines, 1200, imported.offset), -1);
  assert.equal(activeLyric(imported.lines, 1500, imported.offset), 0);
});
test('enhanced, YRC and QRC retain word timestamps without synthesising timing', () => {
  for (const [format, text] of [['eslrc', '[00:01.00]<00:01.00>Hello <00:02.00>world<00:03.00>'], ['yrc', '[1000,2000](1000,1000,0)Hello (2000,1000,0)world'], ['qrc', '[1000,2000]Hello (1000,1000)world(2000,1000)']]) {
    const doc = parseLyrics(text, format); assert.equal(doc.precision, 'word', format); assert.equal(doc.lines[0].words[0].startTime, 1000);
  }
});
test('plain lyrics, hostile XML and version identity are handled explicitly', () => {
  assert.equal(parseLyrics('纯文本', 'txt').precision, 'plain');
  assert.throws(() => parseLyrics('<!DOCTYPE x>', 'ttml'));
  assert.throws(() => parseLyrics('x'.repeat(1048577)));
  assert.notEqual(lyricTrackKey({ title: 'Song', duration: 200 }), lyricTrackKey({ title: 'Song', duration: 280 }));
});
