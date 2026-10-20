import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gridIndex, rovingIndex } from './roving-keys.mjs';
import { FOCUSABLE, focusables } from './focusables.mjs';

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
test('a vertical list moves down with ArrowDown and up with ArrowUp', () => {
  assert.equal(rovingIndex('ArrowDown', 0, 3, 'vertical'), 1);
  assert.equal(rovingIndex('ArrowUp', 2, 3, 'vertical'), 1);
  assert.equal(rovingIndex('ArrowLeft', 0, 3, 'vertical'), -1);
});
test('an inherited name is not an arrow key', () => {
  for (const key of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) assert.equal(rovingIndex(key, 0, 3), -1, key);
});

test('a grid walks the row sideways and the column up and down', () => {
  // 2 columns: 0 1 / 2 3 / 4 5
  assert.equal(gridIndex('ArrowRight', 0, 6, 2), 1);
  assert.equal(gridIndex('ArrowLeft', 3, 6, 2), 2);
  assert.equal(gridIndex('ArrowDown', 1, 6, 2), 3);
  assert.equal(gridIndex('ArrowUp', 4, 6, 2), 2);
});
test('a grid stops at the edges instead of wrapping sideways', () => {
  assert.equal(gridIndex('ArrowLeft', 0, 6, 2), -1);
  assert.equal(gridIndex('ArrowRight', 1, 6, 2), -1);
  assert.equal(gridIndex('ArrowUp', 0, 6, 2), -1);
  assert.equal(gridIndex('ArrowDown', 5, 6, 2), -1);
});
test('a grid jumps Home/End inside the row and PageUp/PageDown across the grid', () => {
  assert.equal(gridIndex('Home', 3, 6, 2), 2);
  assert.equal(gridIndex('End', 3, 6, 2), 3);
  assert.equal(gridIndex('PageUp', 4, 6, 2), 0);
  assert.equal(gridIndex('PageDown', 0, 6, 2), 4);
});
test('a short last row still has a Home and an End', () => {
  // 5 albums in 2 columns: 0 1 / 2 3 / 4
  assert.equal(gridIndex('Home', 4, 5, 2), 4);
  assert.equal(gridIndex('End', 4, 5, 2), 4);
  assert.equal(gridIndex('ArrowRight', 4, 5, 2), -1);
  assert.equal(gridIndex('ArrowDown', 4, 5, 2), -1);
});
test('an empty or keyless grid does not move', () => {
  assert.equal(gridIndex('ArrowRight', 0, 0, 2), -1);
  assert.equal(gridIndex('Enter', 0, 6, 2), -1);
  assert.equal(gridIndex('ArrowRight', 0, 6, 0), -1);
});
// The dialog's focus list (src/ui/focusables.mjs) is guarded here too: npm test
// runs one test file per directory, and the script's file list is not ours to edit.
const fakeNode = (over = {}) => ({ tabIndex: 0, closest: () => null, getClientRects: () => [{}], checkVisibility: () => true, ...over });
const fakeRoot = (nodes) => ({ querySelectorAll: () => nodes });

test('the focus list keeps <summary>: the album wall folds its settings into <details>', () => {
  assert.match(FOCUSABLE, /(^|,\s*)summary(,|$)/);
  for (const selector of ['button', '[href]', 'input', 'select', 'textarea', 'audio[controls]', 'video[controls]', 'iframe', 'summary']) assert.ok(FOCUSABLE.includes(selector), selector);
});
test('only really reachable nodes stay in the focus list', () => {
  const visible = fakeNode(), untabbable = fakeNode({ tabIndex: -1 }), inert = fakeNode({ closest: () => ({}) }), hidden = fakeNode({ getClientRects: () => [] });
  assert.deepEqual(focusables(fakeRoot([visible, untabbable, inert, hidden])), [visible]);
  assert.deepEqual(focusables(fakeRoot([fakeNode({ checkVisibility: () => false })])), []);
});

// The cabin's own widgets are guarded from the source side too: a <div> or a
// <span> that only answers the mouse is a bug no unit test can see. The npm
// test script's file list is not ours to edit, so the guard lives here.
const OWNED = ['../Dialog.jsx', '../RecordCard.jsx', '../RecordLibrary.jsx', '../PlaylistLibrary.jsx', '../AddAlbum.jsx', '../AlbumWall.jsx', '../room/CabinDetails.jsx', './Roving.jsx', './Confirm.jsx'];
const source = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');

// The end of a JSX opening tag: `>` may sit inside an arrow function, so the
// walk has to know about braces and quotes.
const tagText = (text, start) => {
  let cursor = start + 1, depth = 0, quote = '';
  for (; cursor < text.length; cursor += 1) {
    const char = text[cursor];
    if (quote) { if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '{') { depth += 1; continue; }
    if (char === '}') { depth -= 1; continue; }
    if (char === '>' && depth === 0) return text.slice(start, cursor + 1);
  }
  return null;
};

test('no owned widget is click-only: a div or span that takes a click has a role, a tabindex or a key handler', () => {
  for (const file of OWNED) {
    const text = source(file);
    for (const match of text.matchAll(/<(div|span)\b/g)) {
      const tag = tagText(text, match.index);
      if (!tag || !/\bonClick\s*=/.test(tag)) continue;
      const line = text.slice(0, match.index).split('\n').length;
      assert.match(tag, /\brole\s*=/, `${file}:${line} <${match[1]}> 有 onClick 却没有 role`);
      assert.match(tag, /\btabIndex\s*=/, `${file}:${line} <${match[1]}> 有 onClick 却没有 tabIndex`);
      assert.match(tag, /\bonKeyDown\s*=/, `${file}:${line} <${match[1]}> 有 onClick 却没有 onKeyDown`);
    }
  }
});

test('no owned widget uses a positive tabIndex: it would break the focus order', () => {
  for (const file of OWNED) {
    const text = source(file);
    assert.doesNotMatch(text, /tabIndex\s*=\s*["'{]?\s*[1-9]/, `${file} 用了正数 tabIndex`);
  }
});
