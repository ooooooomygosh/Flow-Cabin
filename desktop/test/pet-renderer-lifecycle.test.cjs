const test = require('node:test');
const assert = require('node:assert/strict');
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };
function fakeClock(initial = 0) {
  let time = initial, id = 0;
  const jobs = new Map();
  return {
    now: () => time,
    setTimer: (fn, delay) => { const key = ++id; jobs.set(key, { fn, at: time + delay }); return key; },
    clearTimer: key => jobs.delete(key),
    jobs,
    advance: end => { while (true) { const job = [...jobs].sort((a, b) => a[1].at - b[1].at)[0]; if (!job || job[1].at > end) break; time = job[1].at; jobs.delete(job[0]); job[1].fn(); } time = end; },
    delayNextUntil: end => { time = end; const job = [...jobs][0]; jobs.delete(job[0]); job[1].fn(); },
  };
}
test('animation wakes only at pose cadence and stops cleanly', async () => {
  const { startPetAnimation } = await import('../../src/pet/pet-animation.mjs');
  const { FPS, frameAt } = await import('../../src/pet/pet-model.mjs');
  for (const [pose, fps] of Object.entries(FPS).filter(([pose]) => pose !== 'groove')) {
    const clock = fakeClock(), frames = [];
    const stop = startPetAnimation({ pose, onFrame: index => frames.push([clock.now(), index]), ...clock });
    assert.deepEqual(frames, [[0, 0]]);
    clock.advance(10000);
    assert.equal(frames.length, 1 + fps * 10, pose);
    for (const [time, frame] of frames) assert.equal(frame, frameAt(pose, time));
    assert.equal(clock.jobs.size, 1);
    stop(); assert.equal(clock.jobs.size, 0);
    clock.advance(12000); assert.equal(frames.length, 1 + fps * 10);
  }
});
test('reduced motion draws once without any timer', async () => {
  const { startPetAnimation } = await import('../../src/pet/pet-animation.mjs');
  const clock = fakeClock(9876), frames = [];
  const stop = startPetAnimation({ pose: 'celebrate', reduceMotion: true, onFrame: n => frames.push(n), ...clock });
  clock.advance(100000); assert.deepEqual(frames, [0]); assert.equal(clock.jobs.size, 0); stop();
});
test('late timers skip missed frames without drift or a catch-up burst', async () => {
  const { startPetAnimation } = await import('../../src/pet/pet-animation.mjs');
  const clock = fakeClock(100), frames = [];
  const stop = startPetAnimation({ pose: 'walk', onFrame: n => frames.push(n), ...clock });
  const { frameAt } = await import('../../src/pet/pet-model.mjs');
  clock.delayNextUntil(2830);
  assert.deepEqual(frames, [frameAt('walk', 100), frameAt('walk', 2830)]);
  assert.equal([...clock.jobs.values()][0].at, 3000);
  clock.advance(3000); assert.deepEqual(frames, [frameAt('walk', 100), frameAt('walk', 2830), frameAt('walk', 3000)]); stop();
});
test('initial snapshot failure is handled and later broadcasts recover', async () => {
  const { subscribePetSnapshot } = await import('../../src/pet/pet-snapshot.mjs');
  let broadcast, removed = false; const values = [];
  const stop = subscribePetSnapshot({ getSnapshot: () => Promise.reject(new Error('IPC teardown')), onSnapshot: fn => { broadcast = fn; return () => { removed = true; }; } }, value => values.push(value));
  await flush(); assert.deepEqual(values, []);
  broadcast({ companion: { petId: 'chick' } }); assert.equal(values[0].companion.petId, 'chick');
  stop(); assert.equal(removed, true); broadcast({ companion: { petId: 'cat' } }); assert.equal(values.length, 1);
});
test('a newer live snapshot wins over a stale initial reply', async () => {
  const { subscribePetSnapshot } = await import('../../src/pet/pet-snapshot.mjs');
  let broadcast, resolve; const values = [];
  const initial = new Promise(done => { resolve = done; });
  const stop = subscribePetSnapshot({ getSnapshot: () => initial, onSnapshot: fn => { broadcast = fn; } }, value => values.push(value));
  broadcast({ companion: { petId: 'fox' } }); resolve({ companion: { petId: 'cat' } });
  await flush(); assert.deepEqual(values, [{ companion: { petId: 'fox' } }]); stop();
});
test('unmount ignores pending snapshot completion; missing or throwing APIs are safe', async () => {
  const { subscribePetSnapshot } = await import('../../src/pet/pet-snapshot.mjs');
  let resolve; const values = [], initial = new Promise(done => { resolve = done; });
  const stop = subscribePetSnapshot({ getSnapshot: () => initial }, v => values.push(v));
  stop(); resolve({ size: 300 }); await flush(); assert.deepEqual(values, []);
  subscribePetSnapshot(undefined, () => assert.fail('no snapshot expected'))();
  subscribePetSnapshot({ getSnapshot: () => { throw new Error('renderer reload'); } }, () => assert.fail('no snapshot expected'))();
  await flush();
});

test('disabled lifecycle creates no animation work and can resume at the current frame', async () => {
  const { startPetAnimation } = await import('../../src/pet/pet-animation.mjs');
  const clock = fakeClock(1250), frames = [];
  const beat = () => ({ bpm: 120, beatAt: 0 });
  const disabled = startPetAnimation({ pose: 'groove', enabled: false, onFrame: n => frames.push(n), ...clock, wallClock: clock.now, beat });
  clock.advance(2000); assert.deepEqual(frames, []); assert.equal(clock.jobs.size, 0); disabled();
  const enabled = startPetAnimation({ pose: 'groove', enabled: true, onFrame: n => frames.push(n), ...clock, wallClock: clock.now, beat });
  assert.deepEqual(frames, [1], 'at 2000 ms, 120 BPM: on a beat, head dipped'); assert.equal(clock.jobs.size, 1); enabled(); assert.equal(clock.jobs.size, 0);
});

test('motion reconciles initial focus, visibility, desktop exemptions, OS preference and cleanup', async () => {
  const { readPetMotion, subscribePetMotion } = await import('../../src/pet/pet-motion.mjs');
  const target = extra => Object.assign(new EventTarget(), extra);
  const media = target({ matches: false }), win = target({ matchMedia: () => media });
  const doc = target({ hidden: false, hasFocus: () => false }), values = [];
  assert.deepEqual(readPetMotion(win, doc, media), { visible: false, reduced: false });
  const stop = subscribePetMotion(v => values.push(v), win, doc);
  assert.equal(values.at(-1).visible, false, 'mount respects initial unfocused main window');
  win.dispatchEvent(new Event('focus')); assert.equal(values.at(-1).visible, true);
  win.dispatchEvent(new Event('blur')); assert.equal(values.at(-1).visible, false);
  for (const bridge of ['albumPet', 'albumWallpaper']) {
    win[bridge] = {}; win.dispatchEvent(new Event('blur')); assert.equal(values.at(-1).visible, true);
    doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); assert.equal(values.at(-1).visible, false);
    doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange')); assert.equal(values.at(-1).visible, true);
    delete win[bridge];
  }
  media.matches = true; media.dispatchEvent(new Event('change')); assert.equal(values.at(-1).reduced, true);
  const count = values.length; stop(); win.dispatchEvent(new Event('focus')); doc.dispatchEvent(new Event('visibilitychange')); media.dispatchEvent(new Event('change'));
  assert.equal(values.length, count);
});

test('live snapshots keep species and cat cosmetics independent without stale rollback', async () => {
  const { subscribePetSnapshot } = await import('../../src/pet/pet-snapshot.mjs');
  let broadcast, resolve; const values = [];
  const stop = subscribePetSnapshot({ getSnapshot: () => new Promise(r => { resolve = r; }), onSnapshot: fn => { broadcast = fn; } }, v => values.push(v));
  await flush();
  broadcast({ companion: { petId: 'bunny', focus: { petId: 'bunny', catSkin: 'black' } } });
  resolve({ companion: { petId: 'cat', focus: { catSkin: 'orange' } } }); await flush();
  assert.equal(values.length, 1); assert.equal(values[0].companion.petId, 'bunny'); assert.equal(values[0].companion.focus.catSkin, 'black'); stop();
});

test('grooving follows the beat: two frames per beat, the head dips on each beat, tempo changes apply at once', async () => {
  const { startPetAnimation } = await import('../../src/pet/pet-animation.mjs');
  const { grooveFrame } = await import('../../src/pet/pet-model.mjs');
  const clock = fakeClock(1000), frames = []; let beat = { bpm: 120, beatAt: 1000 };
  const stop = startPetAnimation({ pose: 'groove', onFrame: index => frames.push([clock.now(), index]), ...clock, wallClock: clock.now, beat: () => beat, beatLead: 0 });
  clock.advance(2000);
  assert.deepEqual(frames.map(([time]) => time), [1000, 1250, 1500, 1750, 2000], 'a frame every half beat (250 ms at 120 BPM)');
  assert.deepEqual(frames.map(([, index]) => index), [1, 2, 3, 0, 1], 'frames 1 and 3 (head dip) land on the beats');
  beat = { bpm: 60, beatAt: 2000 }; clock.advance(3000);
  assert.deepEqual(frames.slice(5).map(([time]) => time), [2500, 3000], 'after the change, frames move every 500 ms on the new beat');
  assert.deepEqual(grooveFrame(4000, { bpm: 60, beatAt: 2000 }), { index: 1, wait: 500 });
  stop(); assert.equal(clock.jobs.size, 0);
  // Default lead: each frame is picked one display frame (16 ms) early, so it paints on the beat.
  const lead = fakeClock(1000), led = [];
  const stopLead = startPetAnimation({ pose: 'groove', onFrame: index => led.push(lead.now()), ...lead, wallClock: lead.now, beat: () => ({ bpm: 120, beatAt: 1000 }) });
  lead.advance(2000); assert.deepEqual(led, [1000, 1234, 1484, 1734, 1984]); stopLead();
});
