import test from 'node:test';
import assert from 'node:assert/strict';
import { RESUME_KEY, resumePoint, readResume, writeResume, resumeChanged, markResumeOnLoad, takeResumeOnLoad, restorePlan, RESUME_SAVE_STEP_S } from './deck-resume.mjs';

const memory = (seed = {}) => { const map = new Map(Object.entries(seed)); return { getItem: (key) => map.has(key) ? map.get(key) : null, setItem: (key, value) => map.set(key, String(value)), removeItem: (key) => map.delete(key), map }; };
const album = { id: 'rec-1', type: 'album', title: 'A', artist: 'B', tracks: ['one', 'two', 'three'] };

test('resume point keeps only the song identity and the spot, never a stream URL', () => {
  const point = resumePoint({ record: { ...album, audioPath: 'https://cdn.example/stream?token=secret' }, trackIndex: 1, position: 83.456, duration: 200, playing: true, at: 1000 });
  assert.deepEqual(point, { id: 'rec-1', index: 1, position: 83.5, duration: 200, playing: true, at: 1000 });
  assert.doesNotMatch(JSON.stringify(point), /https?:|token|secret/);
  assert.equal(resumePoint({ record: null }), null);
  assert.equal(resumePoint({ record: album, trackIndex: -1 }), null);
  assert.equal(resumePoint({ record: { id: 'x'.repeat(81) } }), null);
  assert.equal(resumePoint({ record: { id: 7 }, trackIndex: 0 }).id, '7', 'numeric ids share the queue identity');
  assert.equal(resumePoint({ record: album, position: 198, duration: 200 }).position, 0, 'the last seconds restart the song next time');
  assert.equal(resumePoint({ record: album, position: NaN, duration: Infinity }).position, 0);
});

test('resume point survives storage round trips and corrupt values', () => {
  const storage = memory();
  assert.equal(readResume(storage), null);
  assert.equal(writeResume(resumePoint({ record: album, trackIndex: 2, position: 12, duration: 180 }), storage), true);
  assert.deepEqual({ ...readResume(storage), at: 0 }, { id: 'rec-1', index: 2, position: 12, duration: 180, playing: false, at: 0 });
  writeResume(null, storage); assert.equal(storage.getItem(RESUME_KEY), null);
  assert.equal(readResume(memory({ [RESUME_KEY]: 'not json' })), null);
  assert.equal(readResume(memory({ [RESUME_KEY]: JSON.stringify({ id: '', index: 0 }) })), null);
  const failing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
  assert.equal(readResume(failing), null); assert.equal(writeResume(resumePoint({ record: album }), failing), false);
});

test('a new spot is written only when the song, the state or the position moved enough', () => {
  const base = resumePoint({ record: album, trackIndex: 0, position: 10, duration: 100, playing: true });
  assert.equal(resumeChanged(null, base), true);
  assert.equal(resumeChanged(base, { ...base, position: 10 + RESUME_SAVE_STEP_S - .1 }), false);
  assert.equal(resumeChanged(base, { ...base, position: 10 + RESUME_SAVE_STEP_S }), true);
  assert.equal(resumeChanged(base, { ...base, index: 1 }), true);
  assert.equal(resumeChanged(base, { ...base, playing: false }), true);
  assert.equal(resumeChanged(base, null), true);
  const paused = { ...base, playing: false };
  assert.equal(resumeChanged(paused, { ...paused, position: 10.6 }), true, 'a seek while paused is saved at once');
  assert.equal(resumeChanged(paused, { ...paused, position: 10.2 }), false);
});

test('restore puts the record back paused; only the app\'s own reload resumes playing', () => {
  const point = resumePoint({ record: album, trackIndex: 1, position: 42, duration: 120, playing: true });
  assert.deepEqual(restorePlan(point, [album]), { item: album, index: 1, position: 42, duration: 120, autoplay: false });
  assert.equal(restorePlan(point, [album], { resumeOnLoad: true }).autoplay, true);
  assert.equal(restorePlan({ ...point, playing: false }, [album], { resumeOnLoad: true }).autoplay, false);
  assert.equal(restorePlan(point, []), null, 'a record removed from the shelf is not restored');
  assert.equal(restorePlan(null, [album]), null);
  const shorter = { ...album, tracks: ['only'] };
  assert.deepEqual(restorePlan(point, [shorter]), { item: shorter, index: 0, position: 0, duration: 0, autoplay: false }, 'a shorter track list starts its last song from the top');
  assert.equal(restorePlan(resumePoint({ record: { id: 7 }, trackIndex: 0 }), [{ id: 7, tracks: ['a'] }]).item.id, 7);
});

test('the resume-on-load flag is one-shot and expires', () => {
  const storage = memory();
  assert.equal(takeResumeOnLoad(storage, 1000), false);
  markResumeOnLoad(storage, 1000);
  assert.equal(takeResumeOnLoad(storage, 2000), true);
  assert.equal(takeResumeOnLoad(storage, 2000), false, 'consumed');
  markResumeOnLoad(storage, 1000);
  assert.equal(takeResumeOnLoad(storage, 1000 + 10 * 60 * 1000), false, 'a stale flag is ignored');
});
