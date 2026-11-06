import test from 'node:test';
import assert from 'node:assert/strict';
import { CURL, CORNER_ACTS, newCurl, curlTick, curlFrame, curlBox, cornerAt, slotXY, maxRect, PACKET } from './sheet-corner.mjs';
import { noteOpen, takeOpener, foldPacket, unfoldPacket, dropPacketFor, listPackets, onPackets, clearPackets } from './packets.mjs';

const settle = (c, from, seconds, step = 1 / 60) => { let t = from, fired = []; for (; t < from + seconds; t += step) { const r = curlTick(c, step, t); if (r.fire >= 0) fired.push(r.fire); } return { t, fired }; };

test('the corner rests at DEsk\'s size, stirs on the fold, turns up after half a second', () => {
  const c = newCurl();
  assert.equal(c.s, CURL.rest);
  c.hoverAt = 1;
  settle(c, 1, 0.3);
  assert(!c.near && c.s > CURL.rest * 1.4 && c.s < CURL.rest * 2, 'stirred, not yet up');
  settle(c, 1.3, 1.2);
  assert(c.near, 'turned up after 0.5 s');
  assert(Math.abs(c.s - CURL.open) < 1, 'open to the full flap');
});

test('each printed act turns the corner its own way, then fires once', () => {
  for (const [act, want] of [[0, 0], [1, 1], [2, 2]]) {
    const c = Object.assign(newCurl(), { near: true, s: CURL.open, act, actAt: 0 });
    const { fired } = settle(c, 0, 0.5);
    assert.deepEqual(fired, [want], `act ${act}`);
  }
});

test('the pictures: nearest size, the lit frame only at the open size, a box as DEsk draws it', () => {
  const [s] = curlFrame(CURL, 20, -1);
  assert.equal(s, 21);
  const [hs, r] = curlFrame(CURL, CURL.open, 2);
  assert(CURL.hot_sizes.includes(hs) && r === CURL.rects[`${hs}:2`]);
  assert.equal(curlFrame(CURL, 60, 1)[1], CURL.rects['60:-1']);
  assert.equal(curlBox(CURL.open), CURL.box);
  assert.equal(CORNER_ACTS.map((a) => a.name).join(''), '折起展开丢掉');
});

test('hit test: the fold at the corner, the three printed items on the turned-up flap', () => {
  const rect = { x: 100, y: 50, w: 600 }, c = newCurl();
  assert(cornerAt(rect, c, 690, 60).onFold);
  assert(!cornerAt(rect, c, 500, 60).onFold);
  c.near = true;
  CURL.items.forEach((r, i) => {
    const px = rect.x + rect.w - CURL.box + r[0] + r[2] / 2, py = rect.y + r[1] + r[3] / 2;
    assert.equal(cornerAt(rect, c, px, py).hot, i);
  });
});

test('packets lie in a row along the front of the desk; opened out is below the back edge, full width', () => {
  const a = slotXY(0), b = slotXY(1);
  assert.equal(a.x, 36);
  assert(b.x > a.x + a.w && b.y === a.y);
  assert(a.y + a.h < 900 - 32);
  assert.equal(Math.round(a.w), Math.round(PACKET.w * 0.8));
  const many = slotXY(40, { width: 800, height: 900 });
  assert(many.y < a.y, 'a full row starts another above it');
  assert.deepEqual(maxRect(1440, 900), { x: 0, y: 86, w: 1440, h: 814 });
});

test('a sheet takes the note of what opened it; folding leaves one packet per sheet that reopens it', () => {
  clearPackets();
  noteOpen('settings');
  assert.equal(takeOpener('a'), 'settings');
  assert.equal(takeOpener('a'), 'settings', 'the same sheet rendered twice');
  assert.equal(takeOpener('b'), '', 'a second sheet takes nothing');
  let seen = 0; const off = onPackets(() => seen++);
  const p = foldPacket({ title: '设置', action: 'settings' });
  foldPacket({ title: '设置', action: 'settings' });
  assert.equal(listPackets().length, 1);
  foldPacket({ title: '随手记', action: 'notes' });
  dropPacketFor('notes');
  assert.equal(listPackets().length, 1);
  const q = unfoldPacket(listPackets()[0].id);
  assert.equal(q.action, 'settings');
  assert.equal(listPackets().length, 0);
  assert(p && seen >= 4);
  off();
});
