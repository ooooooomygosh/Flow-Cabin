import test from 'node:test';
import assert from 'node:assert/strict';
import {
  JOURNAL_KEY, JOURNAL_CHANGE, readJournalRecords, normalizeJournalRecord,
  saveJournalEntry, archiveScratch, moveJournalEntry, restoreJournalRevision,
  findJournalEntries, mergeJournalRecord
} from './journal-entries.mjs';
const memory = () => {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), data };
};

test('handwritten pages preserve long paragraphs, dates and tags', () => {
  const storage = memory(), target = new EventTarget(); let events = 0;
  target.addEventListener(JOURNAL_CHANGE, () => events++);
  const body = '一'.repeat(7990) + '\n最后一句。';
  const result = saveJournalEntry({ storage, body, tags: '日常，音乐,日常', now: 1000, target });
  assert.equal(result.ok, true); assert.equal(events, 1);
  const [entry] = readJournalRecords(storage);
  assert.equal(entry.body, body); assert.deepEqual(entry.tags, ['日常', '音乐']); assert.equal(entry.createdAt, 1000);
  assert.deepEqual(normalizeJournalRecord(entry), entry);
  assert.equal(saveJournalEntry({ storage, body: 'x'.repeat(8001) }).ok, false);
  assert.equal(saveJournalEntry({ storage, body: 'keep', tags: 'x'.repeat(25) }).ok, false);
  assert.equal(readJournalRecords(storage).length, 1);
});

test('editing has one checkpoint per visit and restoring keeps the current version', () => {
  const storage = memory();
  let entry = saveJournalEntry({ storage, body: '第一版', now: 1 }).entry;
  const firstVersion = entry.version;
  entry = saveJournalEntry({ storage, id: entry.id, expectedVersion: entry.version, body: '第二', now: 2 }).entry;
  entry = saveJournalEntry({ storage, id: entry.id, expectedVersion: entry.version, body: '第二版', checkpoint: false, now: 3 }).entry;
  assert.equal(entry.revisions.length, 1); assert.equal(entry.revisions[0].body, '第一版');
  const currentVersion = entry.version;
  const restored = restoreJournalRevision({ storage, id: entry.id, expectedVersion: entry.version, revision: firstVersion, now: 4 });
  assert.equal(restored.ok, true); assert.equal(restored.entry.body, '第一版');
  assert.equal(restored.entry.revisions.find((item) => item.version === currentVersion).body, '第二版');
  assert.equal(readJournalRecords(storage)[0].revisions.length, 2);
});

test('concurrent edits never overwrite another window, even in the same millisecond', () => {
  const storage = memory();
  const original = saveJournalEntry({ storage, body: '共同起点', now: 10 }).entry;
  const first = saveJournalEntry({ storage, id: original.id, expectedVersion: original.version, body: '窗口 A', now: 10 });
  const late = saveJournalEntry({ storage, id: original.id, expectedVersion: original.version, body: '窗口 B', now: 10 });
  assert.equal(first.ok, true); assert.equal(late.ok, false); assert.equal(late.conflict, true);
  assert.equal(readJournalRecords(storage)[0].body, '窗口 A');
  assert.equal(saveJournalEntry({ storage, body: '窗口 B', now: 10 }).ok, true);
  assert.equal(readJournalRecords(storage).length, 2);
});

test('trash is reversible, searchable separately, and cannot be edited by a stale editor', () => {
  const storage = memory();
  const entry = saveJournalEntry({ storage, body: '雨声和音乐', tags: ['音乐'], now: 100 }).entry;
  const trashed = moveJournalEntry({ storage, id: entry.id, expectedVersion: entry.version, trash: true, now: 101 });
  assert.equal(trashed.ok, true);
  const records = readJournalRecords(storage);
  assert.equal(findJournalEntries(records).length, 0);
  assert.equal(findJournalEntries(records, { trash: true, query: '雨声', tag: '音乐' }).length, 1);
  assert.equal(saveJournalEntry({ storage, id: entry.id, expectedVersion: trashed.entry.version, body: 'stale' }).conflict, true);
  const restored = moveJournalEntry({ storage, id: entry.id, expectedVersion: trashed.entry.version, trash: false, now: 102 });
  assert.equal(restored.ok, true); assert.equal(restored.entry.deletedAt, undefined);
  assert.equal(findJournalEntries(readJournalRecords(storage), { query: '音乐' }).length, 1);
});

test('scratch archive is repeatable without duplicates and leaves old scratch storage untouched', () => {
  const storage = memory(), body = '会议结束后的两句话';
  storage.setItem('album-circle-focus-v1:local-owner', JSON.stringify({ notes: body }));
  const now = new Date(2026, 9, 19, 12).getTime();
  const first = archiveScratch({ storage, body, now });
  const second = archiveScratch({ storage, body, now: now + 1000 });
  assert.equal(first.entry.id, second.entry.id);
  assert.equal(readJournalRecords(storage).length, 1);
  assert.equal(JSON.parse(storage.getItem('album-circle-focus-v1:local-owner')).notes, body);
  assert.equal(archiveScratch({ storage, body, now: now + 86400000 }).ok, true);
  assert.equal(readJournalRecords(storage).length, 2);
});

test('bad storage and failed writes do not reset history or announce a saved entry', () => {
  const storage = memory(), target = new EventTarget(); let events = 0;
  target.addEventListener(JOURNAL_CHANGE, () => events++);
  storage.setItem(JOURNAL_KEY, '{broken');
  assert.equal(saveJournalEntry({ storage, body: 'new', target }).ok, false);
  assert.equal(storage.getItem(JOURNAL_KEY), '{broken'); assert.equal(events, 0);
  const blocked = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  assert.equal(saveJournalEntry({ storage: blocked, body: 'new', target }).ok, false);
  assert.equal(events, 0);
});

test('backup merge preserves divergent text, older history and a newer trash marker', () => {
  const storage = memory();
  const a = saveJournalEntry({ storage, body: '最早的一页', now: 1 }).entry;
  const b = saveJournalEntry({ storage, id: a.id, expectedVersion: a.version, body: '主机修改', now: 2 }).entry;
  const c = { ...a, version: 'other', body: '另一台的修改', updatedAt: 3 };
  const merged = mergeJournalRecord(b, c);
  assert.equal(merged.body, '另一台的修改');
  assert.equal(merged.revisions.length, 2);
  assert.deepEqual(mergeJournalRecord(merged, b), merged);
  const trashed = { ...merged, deletedAt: 4, updatedAt: 4, version: 'trashed' };
  assert.equal(mergeJournalRecord(trashed, b).deletedAt, 4);
});

test('history has no count cap and invalid dates cannot reach the renderer', () => {
  const storage = memory();
  let entry = saveJournalEntry({ storage, body: '0', now: 1 }).entry;
  for (let index = 1; index <= 65; index++) entry = saveJournalEntry({ storage, id: entry.id, expectedVersion: entry.version, body: String(index), now: index + 1 }).entry;
  assert.equal(readJournalRecords(storage)[0].revisions.length, 65);
  assert.equal(normalizeJournalRecord({ ...entry, createdAt: 1e99 }), null);
  assert.equal(normalizeJournalRecord({ ...entry, revisions: [{ version: 'bad', body: 'x', at: 1e99 }] }), null);
});

test('permanent deletion is trash-only, strips history, blocks stale editors and survives unrelated saves', async () => {
  const { purgeJournalEntry, readJournalState } = await import('./journal-entries.mjs');
  const storage = memory(), target = new EventTarget(); let events = 0;
  target.addEventListener(JOURNAL_CHANGE, () => events++);
  const first = saveJournalEntry({ storage, body: 'private-first', tags: ['secret'], target: null, now: 10 }).entry;
  const edited = saveJournalEntry({ storage, id: first.id, expectedVersion: first.version, body: 'private-last', target: null, now: 11 }).entry;
  assert.equal(purgeJournalEntry({ storage, id: first.id, expectedVersion: edited.version, target }).ok, false);
  const trash = moveJournalEntry({ storage, id: first.id, expectedVersion: edited.version, trash: true, now: 12, target: null }).entry;
  const before = storage.getItem(JOURNAL_KEY);
  const bad = { getItem: storage.getItem, setItem() { throw new Error('quota'); } };
  assert.equal(purgeJournalEntry({ storage: bad, id: first.id, expectedVersion: trash.version, target }).ok, false);
  assert.equal(storage.getItem(JOURNAL_KEY), before); assert.equal(events, 0);
  assert.equal(purgeJournalEntry({ storage, id: first.id, expectedVersion: edited.version, target }).ok, false);
  assert.equal(purgeJournalEntry({ storage, id: first.id, expectedVersion: trash.version, now: 13, target }).ok, true);
  assert.equal(events, 1);
  assert.deepEqual(readJournalState(storage), [{ id: first.id, purgedAt: 13 }]);
  assert.deepEqual(readJournalRecords(storage), []);
  assert.equal(saveJournalEntry({ storage, id: first.id, expectedVersion: edited.version, body: 'late' }).deleted, true);
  assert.equal(moveJournalEntry({ storage, id: first.id, expectedVersion: trash.version, trash: false }).ok, false);
  assert.equal(restoreJournalRevision({ storage, id: first.id, expectedVersion: trash.version, revision: first.version }).ok, false);
  saveJournalEntry({ storage, body: 'unrelated', now: 14 });
  assert.ok(readJournalState(storage).some((entry) => entry.purgedAt === 13));
  for (const secret of ['private-first', 'private-last', 'secret']) assert.ok(!storage.getItem(JOURNAL_KEY).includes(secret));
  assert.deepEqual(mergeJournalRecord(edited, { id: first.id, purgedAt: 13 }), { id: first.id, purgedAt: 13 });
  assert.deepEqual(mergeJournalRecord({ id: first.id, purgedAt: 13 }, { ...edited, updatedAt: 999 }), { id: first.id, purgedAt: 13 });
});

test('journal search: every word must match, # searches tags, full-width folds, and the hit is shown in context', async () => {
  const { findJournalEntries: find, journalSnippet } = await import('./journal-entries.mjs');
  const entries = [
    { id: 'a', body: '今天下了一整天的雨，听着 Lofi 写完了周报。', tags: ['工作'], deletedAt: null },
    { id: 'b', body: '和朋友去看海，雨停了。', tags: ['周末', '雨天'], deletedAt: null }
  ];
  assert.deepEqual(find(entries, { query: '雨' }).map((entry) => entry.id), ['a', 'b']);
  assert.deepEqual(find(entries, { query: '雨 周报' }).map((entry) => entry.id), ['a'], 'all words must match');
  assert.deepEqual(find(entries, { query: 'ＬＯＦＩ' }).map((entry) => entry.id), ['a'], 'full-width and case fold');
  assert.deepEqual(find(entries, { query: '#雨' }).map((entry) => entry.id), ['b'], 'a # term looks only at tags');
  assert.deepEqual(find(entries, { query: '   ' }).map((entry) => entry.id), ['a', 'b']);
  const hit = journalSnippet(entries[0].body, '周报', 4);
  assert.equal(hit.match, '周报');
  assert.ok(hit.before.startsWith('…') && hit.before.endsWith('写完了'));
  assert.equal(journalSnippet(entries[1].body, '#雨'), null, 'a tag-only hit has no body snippet');
  assert.equal(journalSnippet('abc', 'zzz'), null);
});
