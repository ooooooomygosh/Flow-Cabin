'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mergeSnapshots } = require('../lan-model.cjs');
class Storage {
  values = new Map(); get length() { return this.values.size; } key(i) { return [...this.values.keys()][i]; }
  getItem(k) { return this.values.get(k) ?? null; } setItem(k,v) { this.values.set(k,String(v)); } removeItem(k) { this.values.delete(k); }
}
const journal = body => ({ id: 'note', version: body, body, tags: [], createdAt: 1, updatedAt: 2, revisions: [] });
test('real renderer storage exports existing journal/layout/focus data and merges conflict copies without loss', async () => {
  const { exportSnapshot, applySnapshot, layoutConflicts, restoreLayoutConflict } = await import('../../src/sync/storage.mjs');
  const { defaultLayout } = await import('../../src/room2/layout.mjs');
  const a = new Storage(), b = new Storage();
  const fill = (storage, body) => {
    storage.setItem('flow-cabin-journal-v1', JSON.stringify([journal(body)]));
    storage.setItem('flow-cabin-focus-sessions-v1', JSON.stringify([{ id: 's1', start: 1, end: 100, durationMs: 99, completed: true }]));
    storage.setItem('flow-cabin-room-layout-art-v2:pixel', JSON.stringify(defaultLayout()));
  };
  fill(a, 'one'); fill(b, 'two');
  const first = await exportSnapshot(a), second = await exportSnapshot(b);
  second.layouts[0].value.revision = 2;
  const merged = mergeSnapshots(first, second);
  const summary = applySnapshot(merged, a);
  assert.equal(summary.notes, 2); assert.equal(summary.focus, 1); assert.equal(summary.conflicts, 1);
  assert.equal(JSON.parse(a.getItem('flow-cabin-journal-v1')).length, 2);
  const roundtrip = await exportSnapshot(a);
  assert.equal(roundtrip.layouts.filter(r => !r.deleted).length, 2);
  const copies = layoutConflicts(a); assert.equal(copies.length, 1);
  restoreLayoutConflict(copies[0].key, a); assert.equal(layoutConflicts(a).length, 0);
});
test('purged notes remain tombstones; corrupt incoming data leaves all local storage untouched', async () => {
  const { exportSnapshot, applySnapshot, storageFingerprint, applyIfUnchanged } = await import('../../src/sync/storage.mjs');
  const a = new Storage(); a.setItem('flow-cabin-journal-v1', JSON.stringify([{ id: 'gone', purgedAt: 99 }]));
  const snapshot = await exportSnapshot(a); assert.equal(snapshot.notes[0].deleted, true);
  applySnapshot(snapshot, a);
  const before = JSON.stringify([...a.values]);
  assert.throws(() => applySnapshot({ ...snapshot, notes: [{ id: 'invalid', value: { body: 'bad' } }] }, a));
  assert.equal(JSON.stringify([...a.values]), before);
  const fingerprint = storageFingerprint(a); a.setItem('flow-cabin-journal-v1', JSON.stringify([journal('edited during transfer')]));
  assert.throws(() => applyIfUnchanged(snapshot, fingerprint, a), /本机内容发生变化/);
  assert.match(a.getItem('flow-cabin-journal-v1'), /edited during transfer/);
});
