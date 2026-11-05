import test from 'node:test';
import assert from 'node:assert/strict';
import { NOTE_COLOURS, noteColour, noteLines, readNotes, sameNotes, currentNote, flipPlan, targetScroll } from './settings-notes.mjs';

test('six sticky-note colours, and neighbouring pads start on different ones', () => {
  assert.equal(NOTE_COLOURS.length, 6);
  assert.deepEqual(NOTE_COLOURS, ['#FCE066', '#FAADBD', '#9ED1F5', '#BAE394', '#FCBD73', '#CCB8F0']);
  assert.equal(noteColour(0, 0), '#FCE066');
  assert.equal(noteColour(0, 1), '#BAE394');
  assert.equal(noteColour(6, 0), noteColour(0, 0));
  assert.notEqual(noteColour(0, 0), noteColour(0, 1));
  assert.equal(noteColour(-1, 0), '#CCB8F0');
});

test('a note carries one or two lines of handwriting', () => {
  assert.deepEqual(noteLines('音源'), ['音源']);
  assert.deepEqual(noteLines('音质\n过渡'), ['音质', '过渡']);
  assert.deepEqual(noteLines('a\nb\nc'), ['a', 'b']);
  assert.deepEqual(noteLines(''), ['']);
});

const fake = (list) => ({ querySelectorAll: () => list.map(([id, note]) => ({ id, getAttribute: (name) => name === 'data-note' ? note : id })) });
test('notes are read from the parts of the open page, in page order, once each', () => {
  assert.deepEqual(readNotes(fake([['a', '音源'], ['b', '音质\n过渡'], ['a', 'dup'], ['', 'no id'], ['c', '  ']])), [{ id: 'a', label: '音源' }, { id: 'b', label: '音质\n过渡' }]);
  assert.deepEqual(readNotes(null), []);
  assert.equal(sameNotes([{ id: 'a', label: 'x' }], [{ id: 'a', label: 'x' }]), true);
  assert.equal(sameNotes([{ id: 'a', label: 'x' }], [{ id: 'a', label: 'y' }]), false);
});

test('the note of the part being read is the last one that reached the top', () => {
  const tops = [{ id: 'a', top: 10 }, { id: 'b', top: 300 }, { id: 'c', top: 700 }];
  assert.equal(currentNote(tops), 'a');
  assert.equal(currentNote([{ id: 'a', top: 120 }, { id: 'b', top: 400 }]), 'a');
  assert.equal(currentNote([{ id: 'a', top: -400 }, { id: 'b', top: 30 }, { id: 'c', top: 500 }]), 'b');
  assert.equal(currentNote([{ id: 'a', top: -400 }, { id: 'b', top: -20 }]), 'b');
  assert.equal(currentNote([]), '');
});

test('a page lifts going down, drops going up, and small moves or reduced motion only scroll', () => {
  assert.equal(flipPlan(0, 400).kind, 'lift');
  assert.equal(flipPlan(400, 0).kind, 'drop');
  assert.equal(flipPlan(100, 105).kind, 'jump');
  assert.equal(flipPlan(0, 400, { reduced: true }).kind, 'jump');
  assert.equal(flipPlan(0, 400).to, 400);
});

test('scroll targets stay inside the pad', () => {
  assert.equal(targetScroll({ scrollTop: 0, partTop: 300, panelTop: 100, scrollHeight: 1200, clientHeight: 500 }), 192);
  assert.equal(targetScroll({ scrollTop: 50, partTop: 20, panelTop: 100, scrollHeight: 1200, clientHeight: 500 }), 0);
  assert.equal(targetScroll({ scrollTop: 0, partTop: 2000, panelTop: 0, scrollHeight: 1200, clientHeight: 500 }), 700);
  assert.equal(targetScroll({ scrollHeight: 100, clientHeight: 500 }), 0);
});
