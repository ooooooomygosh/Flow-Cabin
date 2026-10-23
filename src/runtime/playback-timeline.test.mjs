import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaybackTimeline } from './playback-timeline.mjs';
test('timeline follows pause, seek, rate, track switch and unknown progress without guessing', () => {
  let time = 1000;
  const line = createPlaybackTimeline({ now: () => time });
  line.update({ trackId: 'a', playing: true, position: 10, duration: 60, rate: 2 });
  time += 500; assert.equal(line.position(), 11);
  line.update({ trackId: 'a', playing: false, position: 11 });
  time += 5000; assert.equal(line.position(), 11);
  line.update({ trackId: 'a', playing: true, position: 58, duration: 60 });
  time += 5000; assert.equal(line.position(), 60);
  line.update({ trackId: 'b', playing: true });
  assert.equal(line.position(), null); assert.equal(line.getSnapshot().capabilities.progress, false);
});
