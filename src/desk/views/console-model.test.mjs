import test from 'node:test';
import assert from 'node:assert/strict';
import { CV, PARTS, BUTTONS, FADERS, LEVERS, consoleState, crtLines, fitText, textCols, needleTip, meterScale, faderX, faderValue, faderKey, readLamp, lampFollowing, lampIsDim, lampBrightness, LAMP_KEY, LAMP_DIM, captionArc, consoleLayout, clockText } from './console-model.mjs';
import { W, H } from '../layout.mjs';

const store = (value) => ({ getItem: (k) => (k === LAMP_KEY && value !== undefined ? String(value) : null) });

test('every part of the panel has a job, and every job sits inside the picture', () => {
  assert.equal(new Set(PARTS.map((p) => p.id)).size, PARTS.length);
  assert.deepEqual(BUTTONS.map((b) => b.caption), ['待播', '上一首', '播放', '下一首']);
  assert.deepEqual(FADERS.map((f) => f.name), ['台灯', '环境音']);
  assert.deepEqual(LEVERS.map((l) => l.name), ['随机', '循环']);
  for (const [x, y, r] of CV.buttons) assert(x - r >= 0 && x + r <= W && y - r >= 0 && y + r <= H);
  for (const f of CV.faders) assert(f.run[0] >= f.plate[0] && f.run[1] <= f.plate[0] + f.plate[2]);
  const { cx, cy, rx, ry } = CV.crt; assert(cx - rx > 0 && cx + rx < W && cy - ry > 0 && cy + ry < H);
});

test('the deck as the console sees it: nothing on it, playing, failing, visual, system', () => {
  assert.equal(consoleState({}).screen, 'empty');
  const playing = consoleState({ item: { id: 1 }, provider: 'local', playback: { playing: true, status: 'playing' } });
  assert.equal(playing.screen, 'playing'); assert(playing.audible && playing.playing);
  const failed = consoleState({ item: { id: 1 }, provider: 'qq', playback: { status: 'error', error: '没有版权' } });
  assert.equal(failed.screen, 'error'); assert.equal(failed.failed, '没有版权');
  const visual = consoleState({ item: { id: 1 }, provider: 'visual', playback: { playing: true }, spinning: true });
  assert(visual.visual && !visual.audible && visual.playing);
  const system = consoleState({ provider: 'system', system: { active: true, playing: false } });
  assert.equal(system.screen, 'paused'); assert(system.follow);
});

test('the tube: 架子还空着 with nothing on the deck; title, artist, lyric and time when something plays', () => {
  const empty = crtLines({ state: consoleState({}) });
  assert.equal(empty.head, '架子还空着'); assert.equal(empty.progress, null);
  const state = consoleState({ item: { id: 1, title: '晚风' }, provider: 'local', playback: { playing: true, status: 'playing' } });
  const lines = crtLines({ state, item: { title: '晚风' }, trackName: '留给自己的晚风', trackIndex: 1, trackCount: 12, artist: '某人', album: '晚风', lyric: '风吹过来', position: 75, duration: 300 });
  assert.equal(lines.head, '留给自己的晚风'); assert.equal(lines.sub, '某人 · 晚风'); assert.equal(lines.line, '风吹过来');
  assert.match(lines.foot, /^02\/12 01:15\/05:00 播放中$/); assert.equal(lines.progress, .25);
  assert.equal(crtLines({ state: { ...state, failed: '没接上' }, trackName: 'x', lyric: 'y' }).line, '没接上', 'a failure is said before the lyric');
  assert.equal(clockText(3599), '59:59');
});

test('lines are fitted to the round glass in monospace columns (a CJK character is two)', () => {
  assert.equal(textCols('ab中'), 4);
  assert.equal(fitText('一二三四五六七八九十', 10), '一二三四…');
  assert(textCols(fitText('a very long English title that goes on', 16)) <= 16);
  assert.equal(fitText('短', 16), '短');
});

test('a needle swings DEsk\'s 0.62 rad either side of straight up; the scale has twenty divisions', () => {
  const m = CV.meterR;
  const mid = needleTip(m, .5); assert(Math.abs(mid.x - m.pivot[0]) < 1e-9 && mid.y < m.pivot[1]);
  assert(Math.abs(needleTip(m, 0).deg + 0.62 * 180 / Math.PI) < 1e-9);
  assert(needleTip(m, 1).x > m.pivot[0]);
  const ticks = meterScale(m); assert.equal(ticks.length, 21); assert.equal(ticks.filter((t) => t.long).length, 5);
});

test('fader handles run along their slot and come back to the same value', () => {
  for (const f of FADERS) {
    assert.equal(faderX(f, 0), f.run[0]); assert.equal(faderX(f, 1), f.run[1]);
    assert(Math.abs(faderValue(f, faderX(f, .37)) - .37) < 1e-9);
    assert.equal(faderValue(f, -999), 0);
  }
  assert.equal(faderKey(.5, 'ArrowRight'), .55); assert.equal(faderKey(.5, 'Home'), 0); assert.equal(faderKey(.5, 'x'), null);
});

test('the desk lamp: a remembered level, and the room\'s dim switch seen as the same lamp', () => {
  assert.equal(readLamp(store(), false), 1);
  assert.equal(readLamp(store(), true), LAMP_DIM);
  assert.equal(readLamp(store(.6), true), .6);
  assert.equal(lampFollowing(.8, true), LAMP_DIM); assert.equal(lampFollowing(.2, true), .2); assert.equal(lampFollowing(.2, false), 1);
  assert(lampIsDim(.3) && !lampIsDim(.7));
  assert(lampBrightness(0) > .3 && lampBrightness(1) === 1);
});

test('captions run left to right round the bottom of a ring; a phone gets the panel across its width', () => {
  assert.match(captionArc(100, 100, 30), /^M[\d. ]+ A30 30 0 0 0 [\d. ]+$/);
  const desk = consoleLayout(1440, 900); assert.equal(desk.phone, false); assert.equal(desk.s, 1);
  const phone = consoleLayout(390, 844); assert(phone.phone);
  assert(phone.ox + 235 * phone.s === 0 || Math.abs(phone.ox + 235 * phone.s) < 1e-9);
  assert(Math.abs(phone.s * 930 - 390) < 1e-9 && phone.frameH < 844);
});
