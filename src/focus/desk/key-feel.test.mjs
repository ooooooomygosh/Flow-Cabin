import test from 'node:test';
import assert from 'node:assert/strict';
import { createKeyFeel } from './key-feel.mjs';

const button = { closest: (selector) => selector.includes('button') ? button : null };
const gap = { closest: () => null };
const make = () => { const played = []; return { played, feel: createKeyFeel((name) => played.push(name)) }; };

test('a key clicks down when pressed and up when let go, once each', () => {
  const { played, feel } = make();
  feel.onPointerDown({ pointerType: 'mouse', button: 0, target: button });
  feel.onPointerDown({ pointerType: 'mouse', button: 0, target: button });
  assert.deepEqual(played, ['key-press']);
  feel.onPointerUp(); feel.onPointerLeave();
  assert.deepEqual(played, ['key-press', 'key-release']);
});

test('the gap between keys and a right click make no sound', () => {
  const { played, feel } = make();
  feel.onPointerDown({ pointerType: 'mouse', button: 0, target: gap });
  feel.onPointerDown({ pointerType: 'mouse', button: 2, target: button });
  feel.onPointerUp();
  assert.deepEqual(played, []);
});

test('Space and Enter work the key from the keyboard, a held key does not repeat', () => {
  const { played, feel } = make();
  feel.onKeyDown({ key: ' ', repeat: false, target: button });
  feel.onKeyDown({ key: ' ', repeat: true, target: button });
  feel.onKeyUp({ key: ' ' });
  feel.onKeyDown({ key: 'a', repeat: false, target: button });
  feel.onKeyDown({ key: 'Enter', repeat: false, target: button });
  feel.onBlur();
  assert.deepEqual(played, ['key-press', 'key-release', 'key-press', 'key-release']);
});
