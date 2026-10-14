import assert from 'node:assert/strict';
import test from 'node:test';
import { displayTitle } from './display-title.mjs';

test('inserts a space before a bracket that follows a non-space', () => {
  assert.equal(displayTitle('Meditation(The Paisley Park)'), 'Meditation (The Paisley Park)');
  assert.equal(displayTitle('Second(愿)'), 'Second (愿)');
});
test('leaves full-width brackets as typed', () => {
  assert.equal(displayTitle('愿（Live）'), '愿（Live）');
});
test('never doubles an existing space or touches leading brackets', () => {
  assert.equal(displayTitle('Song (Remix)'), 'Song (Remix)');
  assert.equal(displayTitle('(Intro)'), '(Intro)');
  assert.equal(displayTitle('（序）'), '（序）');
});
test('leaves plain strings and nullish values alone', () => {
  assert.equal(displayTitle('Third'), 'Third');
  assert.equal(displayTitle(null), null);
  assert.equal(displayTitle(undefined), undefined);
});
