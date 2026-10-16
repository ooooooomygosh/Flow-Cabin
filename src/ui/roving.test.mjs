import test from 'node:test';
import assert from 'node:assert/strict';
import { rovingIndex } from './roving-keys.mjs';

test('arrows wrap both ways, Home/End jump', () => {
  assert.equal(rovingIndex('ArrowRight', 2, 3), 0);
  assert.equal(rovingIndex('ArrowLeft', 0, 3), 2);
  assert.equal(rovingIndex('ArrowDown', 0, 3), 1);
  assert.equal(rovingIndex('Home', 2, 3), 0);
  assert.equal(rovingIndex('End', 0, 3), 2);
});
test('orientation ignores the cross axis; unknown keys and empty lists do nothing', () => {
  assert.equal(rovingIndex('ArrowDown', 0, 3, 'horizontal'), -1);
  assert.equal(rovingIndex('ArrowRight', 0, 3, 'vertical'), -1);
  assert.equal(rovingIndex('Enter', 0, 3), -1);
  assert.equal(rovingIndex('ArrowRight', 0, 0), -1);
});
test('with nothing selected the first step lands on an end', () => {
  assert.equal(rovingIndex('ArrowRight', -1, 3), 0);
  assert.equal(rovingIndex('ArrowLeft', -1, 3), 2);
});
