import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMobileStorage } from './storage.mjs';
const key = 'flow-cabin-web-collection-v1';
const create = options => createMobileStorage({ schedule: () => 1, cancel: () => {}, ...options });

test('native hydration restores the existing collection and never persists API credentials', async () => {
  const writes = [], store = create({ entries: { [key]: '{"items":[{"id":"saved"}]}', 'flow-cabin-ai-key-v1': 'secret' }, write: async changes => writes.push(changes) });
  assert.match(store.storage.getItem(key), /saved/); assert.equal(store.storage.getItem('flow-cabin-ai-key-v1'), null);
  store.storage.setItem('flow-cabin-ai-key-v1', 'session-secret'); store.storage.setItem('unrelated-key', 'ignored'); await store.flush(); assert.deepEqual(writes, []);
});
test('writes coalesce, deletions persist, and a new process recovers the committed values', async () => {
  const db = new Map(), writes = [];
  const store = create({ write: async changes => { writes.push(changes); for (const { key, value } of changes) value === null ? db.delete(key) : db.set(key, value); } });
  store.storage.setItem(key, 'old'); store.storage.setItem(key, 'new'); store.storage.setItem('album-circle-focus-v1:local-owner', 'focus'); await store.flush();
  assert.equal(writes.length, 1); assert.equal(db.get(key), 'new');
  const restarted = create({ entries: Object.fromEntries(db), write: async changes => { for (const { key, value } of changes) value === null ? db.delete(key) : db.set(key, value); } });
  assert.equal(restarted.storage.getItem(key), 'new'); restarted.storage.removeItem(key); await restarted.flush(); assert.equal(db.has(key), false);
});
test('a failed native transaction retains newer edits and deletion for an explicit retry', async () => {
  let reject, first = true, db = 'before';
  const store = create({ entries: { [key]: db }, write: async changes => { if (first) { first = false; return new Promise((_, fail) => { reject = fail; }); } db = changes.find(change => change.key === key)?.value; } });
  store.storage.setItem(key, 'draft'); const pending = store.flush(); await Promise.resolve(); store.storage.setItem(key, 'latest'); reject(new Error('disk full'));
  await assert.rejects(pending); assert.equal(db, 'before'); assert.equal(store.status().error, 'disk full');
  store.storage.removeItem(key); await store.flush(); assert.equal(db, null); assert.equal(store.status().pending, false);
});
test('quota failure preserves the previous value and does not queue the oversized edit', async () => {
  const changes = [], store = create({ entries: { [key]: 'original' }, write: async rows => changes.push(rows) });
  assert.throws(() => store.storage.setItem(key, 'x'.repeat(17 * 1024 * 1024)), /存储空间/);
  assert.equal(store.storage.getItem(key), 'original'); await store.flush(); assert.deepEqual(changes, []);
});
test('clear removes all persisted keys and an empty initialized cabin stays empty', async () => {
  let entries = { [key]: 'album', 'flow-cabin-journal-v1': 'notes' };
  const store = create({ entries, write: async changes => { for (const { key, value } of changes) value === null ? delete entries[key] : entries[key] = value; } });
  store.storage.clear(); await store.flush(); assert.deepEqual(entries, {});
  assert.equal(create({ entries, write: async () => {} }).storage.length, 0);
});
test('a synchronous bridge error can be retried after the bridge recovers', async () => {
  let fail = true;
  const store = create({ write: () => { if (fail) throw new Error('bridge unavailable'); } });
  store.storage.setItem(key, 'record'); await assert.rejects(store.flush()); fail = false; await store.flush(); assert.equal(store.status().pending, false);
});
