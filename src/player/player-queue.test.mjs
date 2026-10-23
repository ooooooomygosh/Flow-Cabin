import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQueue, enqueue, playNext, dequeue, pruneQueue, nextStep, nextPlayableStep, previousStep, queueAddition, trackEntry, parseEntry, isTrackEntry, moveEntry, clearQueue, contextAfter, pushHistory, rewindHistory, recordListen, normalizeListenHistory, LISTEN_HISTORY_LIMIT, HISTORY_TRAIL_LIMIT } from './player-queue.mjs';

test('queue ops: single songs are entries next to whole records', () => {
  assert.equal(trackEntry('rec', 4), 'track:4:rec');
  assert.equal(trackEntry(7, 0), 'track:0:7');
  for (const bad of [[null, 0], ['', 1], ['rec', -1], ['rec', 1.5], ['rec', 10000], ['x'.repeat(81), 0], ['track:1:rec', 0]]) assert.equal(trackEntry(...bad), '');
  assert.deepEqual(parseEntry('track:4:rec'), { id: 'rec', index: 4, track: true });
  assert.deepEqual(parseEntry('rec'), { id: 'rec', index: 0, track: false });
  assert.equal(isTrackEntry('track:0:a'), true); assert.equal(isTrackEntry('a'), false);
  let queue = enqueue(normalizeQueue({}), 'album-b');
  queue = queueAddition(queue, trackEntry('list', 3)).queue;
  queue = queueAddition(queue, trackEntry('list', 7), true).queue;
  assert.deepEqual(queue.ids, ['track:7:list', 'album-b', 'track:3:list']);
  assert.deepEqual(normalizeQueue({ ids: ['track:1:a', 'track:1:a', `track:2:${'x'.repeat(81)}`] }).ids, ['track:1:a'], 'deduped, the record part is length-checked');
  assert.deepEqual(pruneQueue(queue, ['list']).ids, ['track:7:list', 'track:3:list'], 'songs leave with their record');
  assert.deepEqual(dequeue(queue, 'track:3:list').ids, ['track:7:list', 'album-b']);
  assert.match(queueAddition(queue, trackEntry('', 1)).error, /无法加入待播/);
});

test('queue ops: drag reorder, clear', () => {
  const queue = normalizeQueue({ ids: ['a', 'b', 'c', 'd'], repeat: 'all', shuffle: true });
  assert.deepEqual(moveEntry(queue, 0, 2).ids, ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveEntry(queue, 3, 0).ids, ['d', 'a', 'b', 'c']);
  assert.deepEqual(moveEntry(queue, 1, 99).ids, ['a', 'c', 'd', 'b'], 'past the end lands last');
  assert.deepEqual(moveEntry(queue, 9, 0).ids, queue.ids, 'unknown source changes nothing');
  assert.deepEqual(moveEntry(queue, 1, -4).ids, ['b', 'a', 'c', 'd']);
  assert.deepEqual(clearQueue(queue), { ids: [], repeat: 'all', shuffle: true }, 'clearing keeps the play modes');
});

test('queue: a queued song plays right after the current song, then the record carries on', () => {
  const queue = normalizeQueue({ ids: ['album-b', trackEntry('list', 5)] });
  assert.deepEqual(nextStep({ trackIndex: 1, trackCount: 4, queue }), { type: 'album', id: 'track:5:list' }, 'before the rest of this record');
  assert.deepEqual(nextStep({ trackIndex: 1, trackCount: 4, queue: { ...queue, repeat: 'one' } }), { type: 'restart' }, 'repeat-one still repeats');
  const context = contextAfter({ recordId: 'rec', trackIndex: 1, trackCount: 4, queue });
  assert.deepEqual(context, { id: 'rec', index: 2 });
  const after = normalizeQueue({ ids: ['album-b'] });
  assert.deepEqual(nextStep({ trackIndex: 5, trackCount: 9, queue: after, solo: true, context }), { type: 'resume', id: 'rec', index: 2 });
  assert.deepEqual(nextStep({ trackIndex: 5, trackCount: 9, queue: normalizeQueue({ ids: [trackEntry('x', 0)] }), solo: true, context }), { type: 'album', id: 'track:0:x' }, 'more queued songs first');
  assert.deepEqual(nextStep({ trackIndex: 5, trackCount: 9, queue: after, solo: true, context: null }), { type: 'album', id: 'album-b' }, 'the record had ended: 待播 records follow');
  assert.deepEqual(nextStep({ trackIndex: 5, trackCount: 9, queue: normalizeQueue({}), solo: true }), { type: 'stop' });
  assert.equal(contextAfter({ recordId: 'rec', trackIndex: 3, trackCount: 4, queue }), null, 'last song: nothing to come back to');
  assert.deepEqual(nextPlayableStep({ trackIndex: 1, trackCount: 4, queue, blocked: () => true }), { type: 'album', id: 'track:5:list' });
});

test('shuffle previous goes back to the song really heard before', () => {
  let trail = [];
  for (const index of [3, 0, 4]) trail = pushHistory(trail, { id: 'rec', index });
  trail = pushHistory(trail, { id: 'rec', index: 4 });
  assert.deepEqual(trail, [{ id: 'rec', index: 3 }, { id: 'rec', index: 0 }, { id: 'rec', index: 4 }], 'one entry per song start');
  assert.deepEqual(previousStep({ trackIndex: 4, position: 1, history: trail, useHistory: true }), { type: 'history', id: 'rec', index: 0 });
  assert.deepEqual(previousStep({ trackIndex: 4, position: 1, history: trail }), { type: 'track', index: 3 }, 'album order without shuffle');
  assert.deepEqual(previousStep({ trackIndex: 4, position: 8, history: trail, useHistory: true }), { type: 'restart' }, 'past 3 s it restarts');
  assert.deepEqual(previousStep({ trackIndex: 0, position: 0, history: [{ id: 'rec', index: 0 }], useHistory: true }), { type: 'restart' });
  const back = rewindHistory(trail);
  assert.deepEqual(back, { target: { id: 'rec', index: 0 }, trail: [{ id: 'rec', index: 3 }, { id: 'rec', index: 0 }] });
  assert.deepEqual(previousStep({ trackIndex: 0, position: 0, history: back.trail, useHistory: true }), { type: 'history', id: 'rec', index: 3 }, 'pressing again keeps walking back');
  assert.deepEqual(rewindHistory([{ id: 'a', index: 0 }]), { target: null, trail: [] });
  assert.deepEqual(pushHistory(trail, { id: '', index: 1 }), trail); assert.deepEqual(pushHistory(trail, { id: 'a', index: -1 }), trail);
  let long = []; for (let i = 0; i < HISTORY_TRAIL_LIMIT + 10; i++) long = pushHistory(long, { id: 'r', index: i });
  assert.equal(long.length, HISTORY_TRAIL_LIMIT); assert.equal(long[0].index, 10);
});

test('listening history: newest first, deduped, bounded and cleaned', () => {
  let list = [];
  list = recordListen(list, { id: 'a', index: 0, title: 'One', artist: 'X', at: 1 });
  list = recordListen(list, { id: 'b', index: 2, title: 'Two', artist: 'Y', at: 2 });
  list = recordListen(list, { id: 'a', index: 0, title: 'One', artist: 'X', at: 3 });
  assert.deepEqual(list.map((entry) => `${entry.id}:${entry.index}@${entry.at}`), ['a:0@3', 'b:2@2']);
  for (let i = 0; i < LISTEN_HISTORY_LIMIT + 5; i++) list = recordListen(list, { id: 'r', index: i, at: i });
  assert.equal(list.length, LISTEN_HISTORY_LIMIT);
  assert.deepEqual(normalizeListenHistory([null, { id: 'ok', index: 1, at: 5, title: 7 }, { id: 'bad', index: -1, at: 1 }, 'x']), [{ id: 'ok', index: 1, title: '', artist: '', at: 5 }]);
  assert.deepEqual(normalizeListenHistory('nope'), []);
  assert.deepEqual(recordListen([], { id: '', index: 0 }), []);
});

test('queue: previous whole-record behaviour is unchanged', () => {
  const base = normalizeQueue({});
  assert.deepEqual(nextStep({ trackIndex: 2, trackCount: 3, queue: enqueue(base, 'z') }), { type: 'album', id: 'z' });
  assert.deepEqual(nextStep({ trackIndex: 0, trackCount: 3, queue: playNext(enqueue(base, 'z'), 'y') }), { type: 'track', index: 1 }, 'records still wait for this one to end');
});
