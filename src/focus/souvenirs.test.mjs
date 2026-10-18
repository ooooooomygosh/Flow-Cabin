import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  SOUVENIRS, SOUVENIR_PREFIX, SOUVENIR_KEYS, SOUVENIR_CHANGE,
  normalizeSouvenirRecord, normalizeSouvenirs, mergeSouvenirs, readSouvenirs,
  saveSouvenirs, eligibleSouvenirs, readSouvenirEvidence, syncSouvenirs, souvenirReason
} from './souvenirs.mjs';
import { SESSION_LOG_KEY } from './stats/session-source.mjs';
import { PLAYBACK_LOG_KEY } from '../player/playback-log.mjs';
import { LETTERS_KEY } from '../ai/ai-model.mjs';
import { JOURNAL_KEY } from './journal-entries.mjs';
import { dayKey } from '../lib/local-calendar.mjs';

const T = new Date(2026, 9, 19, 12).getTime(), MINUTE = 60000;
const session = (extra = {}) => ({ id: 'focus-1', start: T - 25 * MINUTE, end: T, completed: true, durationMs: 25 * MINUTE, ...extra });
const playback = (extra = {}) => ({ id: 'p-one', start: T - 10 * MINUTE, end: T, durationMs: 10 * MINUTE, track: { title: '合成音频', index: 0 }, album: { id: 'fixture', title: '合成测试唱片' }, ...extra });
const letter = (extra = {}) => ({ id: 'letter-1', direction: 'out', status: 'sent', at: T, lines: ['仅用于测试的信'], ...extra });
const journal = (id, at, extra = {}) => ({ id, version: `${id}-v1`, body: '合成手记', tags: [], createdAt: at, updatedAt: at, revisions: [], ...extra });
const journalDays = () => [1, 5, 19].map(day => journal(`page-${day}`, new Date(2026, 9, day, 10).getTime()));
const evidence = () => ({ focus: [session()], playback: [playback()], letters: [letter()], journal: journalDays() });
const earned = (input = evidence()) => eligibleSouvenirs(input, T);
const has = (state, id) => state.records.some(record => record.id === id);
function memory(initial = {}) {
  const data = new Map(Object.entries(initial));
  const store = {
    data, writes: [], failGet: null, failSet: null,
    getItem(key) { if (store.failGet?.(key)) throw new Error('denied'); return data.get(key) ?? null; },
    setItem(key, value) { if (store.failSet?.(key)) throw new Error('quota'); store.writes.push(key); data.set(key, value); }
  };
  return store;
}
function seeded(input = evidence()) {
  return memory({
    [SESSION_LOG_KEY]: JSON.stringify(input.focus || []),
    [PLAYBACK_LOG_KEY]: JSON.stringify(input.playback || []),
    [LETTERS_KEY]: JSON.stringify(input.letters || []),
    [JOURNAL_KEY]: JSON.stringify(input.journal || [])
  });
}

test('four original souvenirs have separate criteria and never grant from an empty room', () => {
  assert.equal(SOUVENIRS.length, 4);
  assert.equal(new Set(SOUVENIR_KEYS).size, 4);
  assert.deepEqual(earned({}).records, []);
  assert.deepEqual(earned().records.map(record => record.id).sort(), SOUVENIRS.map(item => item.id).sort());
  for (const record of earned().records) {
    assert.equal(record.earnedOn, dayKey(record.earnedAt));
    assert.ok(souvenirReason(record).length > 10);
  }
});

test('focus requires explicit completion and valid elapsed time, independent of XP and albums', () => {
  for (const raw of [session({ completed: false }), session({ completed: undefined }), session({ completed: 'true' }), session({ end: T + 1 }), session({ start: T }), session({ start: T - 5 * 3600000 })]) {
    assert.equal(earned({ focus: [raw] }).records.length, 0);
  }
  const result = earned({ focus: [session({ album: { title: '摆在唱机上的唱片' } })], rewards: { xp: 100000, fish: 50 } });
  assert.deepEqual(result.records.map(record => record.id), ['first-focus']);
});

test('first focus is dated by completion, not start or discovery time; duplicates do not add awards', () => {
  const start = new Date(2026, 9, 18, 23, 50).getTime();
  const end = new Date(2026, 9, 19, 0, 15).getTime();
  const first = session({ start, end });
  const result = earned({ focus: [session(), first, first] });
  assert.equal(result.records[0].earnedAt, end);
  assert.equal(result.records[0].earnedOn, '2026-10-19');
  assert.equal(result.records.length, 1);
});

test('listening uses verified duration, never wall span or focus duration', () => {
  const partial = playback({ start: T - 60 * MINUTE, durationMs: 9 * MINUTE + 59999 });
  assert.equal(has(earned({ playback: [partial], focus: [session()] }), 'listening-ten'), false);
  assert.equal(has(earned({ playback: [playback()] }), 'listening-ten'), true);
  assert.equal(has(earned({ playback: [playback({ durationMs: 0 }), playback({ durationMs: 11 * MINUTE }), playback({ end: T + 1 })] }), 'listening-ten'), false);
});

test('duplicate checkpoints, duplicate intervals and overlapping windows cannot double listening time', () => {
  const five = playback({ start: T - 5 * MINUTE, durationMs: 5 * MINUTE });
  assert.equal(earned({ playback: [five, five, { ...five, id: 'p-copy' }] }).records.length, 0);
  const old = playback({ end: T - 5 * MINUTE, durationMs: 5 * MINUTE });
  const latest = playback();
  const result = earned({ playback: [old, latest, old] });
  assert.equal(result.records[0].evidence.verifiedMs, 10 * MINUTE);
  assert.equal(result.records[0].evidence.segments, 1);
  const overlap = playback({ id: 'p-overlap', start: T - 8 * MINUTE, end: T - 3 * MINUTE, durationMs: 5 * MINUTE });
  assert.equal(earned({ playback: [five, overlap] }).records.length, 0, 'only eight distinct wall minutes');
});

test('non-overlapping verified segments accumulate; award uses threshold segment end', () => {
  const result = earned({ playback: [
    playback({ id: 'p-two', start: T - 4 * MINUTE, durationMs: 4 * MINUTE }),
    playback({ id: 'p-one', start: T - 30 * MINUTE, end: T - 20 * MINUTE, durationMs: 6 * MINUTE })
  ] });
  assert.deepEqual(result.records[0].evidence, { verifiedMs: 10 * MINUTE, segments: 2 });
  assert.equal(result.records[0].earnedAt, T);
});

test('letters need explicit sent outgoing status; incoming, drafts and interrupted sends do not count', () => {
  const input = ['draft', 'sending', 'failed', undefined].map(status => letter({ status }));
  input.push(letter({ direction: 'in', status: 'delivered' }), letter({ at: T + 1 }), letter({ lines: [] }));
  assert.equal(earned({ letters: input }).records.length, 0);
  const first = letter({ id: 'first', at: T - MINUTE, trashed: true, organizedAt: T });
  const result = earned({ letters: [letter(), first, first] });
  assert.equal(result.records[0].evidence.letterId, 'first');
  assert.equal(result.records[0].earnedAt, T - MINUTE);
  assert.equal(Object.hasOwn(result.records[0].evidence, 'lines'), false);
});

test('journal counts three distinct creation dates without a streak requirement', () => {
  const pages = journalDays();
  const result = earned({ journal: [...pages, pages[0]] });
  assert.deepEqual(result.records[0].evidence.days, ['2026-10-01', '2026-10-05', '2026-10-19']);
  assert.equal(result.records[0].earnedAt, pages[2].createdAt);
  assert.equal(earned({ journal: [pages[0], { ...pages[0], id: 'same-day-two' }, { ...pages[0], id: 'same-day-three' }] }).records.length, 0);
});

test('journal edits, tags and trash changes do not manufacture writing days; blank pages do not qualify', () => {
  const pages = journalDays();
  assert.equal(earned({ journal: pages.map(entry => ({ ...entry, body: '   ' })) }).records.length, 0);
  assert.equal(earned({ journal: [pages[0], { ...pages[0], version: 'edited', updatedAt: pages[1].createdAt }, { ...pages[0], version: 'trashed', deletedAt: T, updatedAt: T }] }).records.length, 0);
  assert.equal(has(earned({ journal: pages.map(entry => ({ ...entry, deletedAt: T, updatedAt: T })) }), 'journal-three-days'), true);
  assert.equal(earned({ journal: [...pages.slice(0, 2), { ...pages[2], updatedAt: T + 1 }] }).records.length, 0);
});

test('local calendar handles UTC offsets and 23/25-hour DST days rather than dividing by 24 hours', () => {
  const url = new URL('./souvenirs.mjs', import.meta.url).href;
  for (const [zone, dates, expected] of [
    ['America/New_York', [[2026, 2, 7], [2026, 2, 8], [2026, 2, 9]], ['2026-03-07', '2026-03-08', '2026-03-09']],
    ['America/New_York', [[2026, 9, 31], [2026, 10, 1], [2026, 10, 2]], ['2026-10-31', '2026-11-01', '2026-11-02']],
    ['Pacific/Kiritimati', [[2026, 9, 1], [2026, 9, 5], [2026, 9, 19]], ['2026-10-01', '2026-10-05', '2026-10-19']]
  ]) {
    const script = `import { eligibleSouvenirs } from ${JSON.stringify(url)};
      const journal = ${JSON.stringify(dates)}.map((d,i) => { const at = new Date(...d,0,15).getTime(); return {id:String(i), version:'v1',body:'fixture',tags:[],createdAt:at,updatedAt:at,revisions:[]}; });
      console.log(JSON.stringify(eligibleSouvenirs({journal},journal.at(-1).createdAt).records[0]));`;
    const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: zone }, encoding: 'utf8' }));
    assert.deepEqual(result.evidence.days, expected);
    assert.equal(result.earnedOn, expected.at(-1));
  }
});

test('normalization and JSON roundtrip preserve dates/evidence without retaining private text', () => {
  const state = earned();
  state.records[0].privateBody = '不应保存正文';
  const normalized = normalizeSouvenirs(state);
  assert.equal(Object.hasOwn(normalized.records[0], 'privateBody'), false);
  assert.deepEqual(normalizeSouvenirs(JSON.parse(JSON.stringify(normalized))), normalized);
  const record = { ...normalized.records[0], earnedOn: '2026-10-18' };
  assert.equal(normalizeSouvenirRecord(record).earnedOn, '2026-10-18', 'normalization must not re-zone an already granted date');
});

test('malformed or future-version backup records fail closed instead of dropping awards', () => {
  const record = earned().records[0];
  for (const state of [null, [], { version: 2, records: [] }, { version: 1, records: [record, record] }, { version: 1, records: [{ ...record, earnedOn: '2026-02-30' }] }, { version: 1, records: [{ ...record, evidence: {} }] }]) {
    assert.throws(() => normalizeSouvenirs(state));
  }
});

test('backup merge is a union, idempotent and commutative with deterministic date ties', () => {
  const full = earned();
  const first = { version: 1, records: [full.records[0]] };
  const changed = { version: 1, records: [{ ...full.records[0], earnedAt: full.records[0].earnedAt - 1 }] };
  assert.deepEqual(mergeSouvenirs(full, first, full), full);
  assert.deepEqual(mergeSouvenirs(first, changed), mergeSouvenirs(changed, first));
  assert.equal(mergeSouvenirs(full, changed).records.length, 4);
  assert.equal(mergeSouvenirs(first, changed).records[0].earnedAt, changed.records[0].earnedAt);
});

test('storage grants each kind once and does not touch fish, rewards or source logs', () => {
  const storage = seeded();
  storage.data.set('album-circle-focus-v1:local-owner', '{"rewards":{"fish":7,"xp":100}}');
  const before = new Map(storage.data), target = new EventTarget();
  let events = 0; target.addEventListener(SOUVENIR_CHANGE, () => events++);
  const first = syncSouvenirs({ storage, now: T, target });
  assert.equal(first.ok, true);
  assert.equal(first.state.records.length, 4);
  const count = storage.writes.length;
  assert.equal(count, 4);
  const again = syncSouvenirs({ storage, previous: first.state, now: T, target });
  assert.equal(again.ok, true);
  assert.equal(storage.writes.length, count);
  assert.equal(events, 1);
  for (const [key, value] of before) assert.equal(storage.getItem(key), value);
  assert.ok(storage.writes.every(key => SOUVENIR_KEYS.includes(key)));
});

test('clearing source logs never revokes saved awards; a restarted reader sees all four', () => {
  const storage = seeded();
  const first = syncSouvenirs({ storage, now: T });
  for (const key of [SESSION_LOG_KEY, PLAYBACK_LOG_KEY, LETTERS_KEY, JOURNAL_KEY]) storage.data.delete(key);
  assert.deepEqual(syncSouvenirs({ storage, now: T + MINUTE }).state, first.state);
  assert.deepEqual(readSouvenirs(storage), first.state);
});

test('quota failure keeps pending awards in memory and retry saves them even if source logs are removed', () => {
  const storage = seeded();
  storage.failSet = () => true;
  const failed = syncSouvenirs({ storage, now: T });
  assert.equal(failed.ok, false);
  assert.equal(failed.state.records.length, 4);
  assert.deepEqual(failed.savedIds, []);
  assert.match(failed.error, /尚未全部保存/);
  assert.equal(readSouvenirs(storage).records.length, 0);
  storage.failSet = null;
  for (const key of [SESSION_LOG_KEY, PLAYBACK_LOG_KEY, LETTERS_KEY, JOURNAL_KEY]) storage.data.delete(key);
  const recovered = syncSouvenirs({ storage, previous: failed.state, now: T });
  assert.equal(recovered.ok, true);
  assert.deepEqual(readSouvenirs(storage), failed.state);
});

test('partial writes preserve previously saved records and retry completes the remainder', () => {
  const storage = seeded();
  storage.failSet = key => key === SOUVENIR_PREFIX + 'journal-three-days';
  const failed = syncSouvenirs({ storage, now: T });
  assert.equal(failed.ok, false);
  const persisted = readSouvenirs(storage);
  assert.ok(persisted.records.length > 0 && persisted.records.length < 4);
  assert.deepEqual(failed.savedIds, persisted.records.map(record => record.id));
  storage.failSet = null;
  assert.equal(syncSouvenirs({ storage, previous: failed.state, now: T }).ok, true);
  assert.equal(readSouvenirs(storage).records.length, 4);
});

test('denied reads keep the last known state and never attempt an overwrite', () => {
  const storage = seeded(), saved = syncSouvenirs({ storage, now: T }).state;
  storage.writes.length = 0;
  storage.failGet = key => key.startsWith(SOUVENIR_PREFIX);
  const failed = syncSouvenirs({ storage, previous: saved, now: T });
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.state, saved);
  assert.equal(storage.writes.length, 0);
  assert.match(failed.error, /无法读取/);
  storage.failGet = null;
  assert.equal(syncSouvenirs({ storage, previous: failed.state, now: T }).ok, true);
});

test('corrupt souvenir data is preserved byte for byte until repaired, then recovery merges old records', () => {
  const storage = seeded(), saved = syncSouvenirs({ storage, now: T }).state;
  const key = SOUVENIR_KEYS[0], original = storage.getItem(key);
  storage.data.set(key, '{broken');
  storage.writes.length = 0;
  assert.throws(() => readSouvenirs(storage));
  const result = syncSouvenirs({ storage, previous: saved, now: T });
  assert.equal(result.ok, false);
  assert.equal(storage.getItem(key), '{broken');
  assert.equal(storage.writes.length, 0);
  storage.data.set(key, original);
  assert.deepEqual(syncSouvenirs({ storage, previous: result.state, now: T }).state, saved);
});

test('source failures are visible but cannot erase previously awarded souvenirs', () => {
  const storage = seeded();
  const saved = syncSouvenirs({ storage, now: T }).state;
  storage.data.set(PLAYBACK_LOG_KEY, '{"invalid":true}');
  storage.failGet = key => key === LETTERS_KEY;
  const result = syncSouvenirs({ storage, previous: saved, now: T });
  assert.equal(result.ok, false);
  assert.match(result.error, /播放日志/);
  assert.match(result.error, /信箱/);
  assert.deepEqual(result.state, saved);
  assert.equal(readSouvenirEvidence(storage).errors.length, 2);
});

test('independent window snapshots and backup recovery cannot erase another kind of award', () => {
  const storage = memory(), records = earned().records;
  const first = { version: 1, records: records.slice(0, 2) };
  const second = { version: 1, records: records.slice(2) };
  assert.equal(saveSouvenirs({ storage, state: first }).ok, true);
  assert.equal(saveSouvenirs({ storage, state: second }).ok, true);
  assert.deepEqual(readSouvenirs(storage), earned());
  assert.equal(saveSouvenirs({ storage, state: first }).ok, true);
  assert.deepEqual(readSouvenirs(storage), earned());
});

test('missing storage and a throwing notification target are reported according to persistence outcome', () => {
  assert.throws(() => readSouvenirs(null));
  const failed = syncSouvenirs({ storage: null, now: T });
  assert.equal(failed.ok, false);
  assert.match(failed.error, /无法读取/);
  const storage = memory();
  const saved = saveSouvenirs({ storage, state: earned(), target: { dispatchEvent() { throw new Error('detached'); } } });
  assert.equal(saved.ok, true);
  assert.deepEqual(readSouvenirs(storage), earned());
});
