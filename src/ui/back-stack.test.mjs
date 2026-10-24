import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackStack, installEscapeBack } from './back-stack.mjs';

test('back closes the most recent layer, one per press, and reports an empty stack', () => {
  const stack = createBackStack(), closed = [];
  // Like useBackLayer: closing a layer makes its owner unregister it.
  const layer = name => { const remove = stack.push(() => { closed.push(name); remove(); }, name); return remove; };
  layer('corner'); layer('lyrics');
  assert.equal(stack.depth, 2); assert.equal(stack.top(), 'lyrics');
  assert.equal(stack.back(), true); assert.deepEqual(closed, ['lyrics']);
  assert.equal(stack.back(), true); assert.deepEqual(closed, ['lyrics', 'corner']);
  assert.equal(stack.back(), false); assert.equal(stack.depth, 0);
});

test('unregistering a middle layer keeps the order of the others', () => {
  const stack = createBackStack(), closed = [];
  const a = stack.push(() => closed.push('a'));
  const b = stack.push(() => closed.push('b'));
  stack.push(() => closed.push('c'));
  b();
  const seen = [];
  stack.subscribe(depth => seen.push(depth));
  a(); assert.equal(stack.depth, 1); assert.deepEqual(seen, [1]);
  stack.back(); assert.deepEqual(closed, ['c']);
  assert.throws(() => stack.push('nope'), TypeError);
  assert.equal(createBackStack().back(), false);
});

test('Esc steps back only when no modal dialog owns it and nobody is typing', () => {
  const stack = createBackStack(), closed = [];
  let handler, dialogOpen = false, active = null;
  const target = { addEventListener: (_, fn) => { handler = fn; }, removeEventListener() {}, querySelector: () => dialogOpen ? {} : null, get activeElement() { return active; } };
  const remove = installEscapeBack({ target, stack });
  stack.push(() => closed.push('corner'));
  const press = (extra = {}) => { const event = { key: 'Escape', repeat: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra }; handler(event); return event; };
  dialogOpen = true; press(); assert.deepEqual(closed, []);
  dialogOpen = false; active = { matches: () => true }; press(); assert.deepEqual(closed, []);
  active = null; press({ repeat: true }); assert.deepEqual(closed, []);
  assert.equal(press().defaultPrevented, true); assert.deepEqual(closed, ['corner']);
  remove();
});
