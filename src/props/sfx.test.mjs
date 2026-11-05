// Ported from DEsk (https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors), src/sfx.c.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSfx, SFX_NAMES, SFX_RATE, SFX_VARIANTS } from './sfx-synth.mjs';
import {
  playSfx, setSfxVolume, setSfxEnabled, sfxEnabled, sfxVolume, reloadSfxSettings,
  configureSfx, warmSfx, duckSfx, SFX_STORAGE_KEY,
} from './sfx.mjs';

test('sound table is sane', () => {
  assert.equal(SFX_RATE, 48000);
  assert.ok(SFX_NAMES.length >= 40);
  assert.equal(new Set(SFX_NAMES).size, SFX_NAMES.length);
  for (const n of SFX_NAMES) assert.ok(SFX_VARIANTS[n] >= 1, n);
  assert.equal(makeSfx('no-such-sound', 0), null);
});

test('every sound and variant synthesises to sane audio', () => {
  for (const name of SFX_NAMES) {
    for (let v = 0; v < SFX_VARIANTS[name]; v++) {
      const x = makeSfx(name, v);
      const tag = `${name}#${v}`;
      assert.ok(x instanceof Float32Array, tag);
      assert.ok(x.length > 0, tag);
      let peak = 0;
      for (let i = 0; i < x.length; i++) {
        assert.ok(Number.isFinite(x[i]), `${tag} sample ${i}`);
        peak = Math.max(peak, Math.abs(x[i]));
      }
      assert.ok(peak > 0, `${tag} is silent`);
      assert.ok(peak <= 1.0, `${tag} clips: ${peak}`);
      const secs = x.length / SFX_RATE;
      assert.ok(secs >= 0.005 && secs <= 4, `${tag} duration ${secs}`);
    }
  }
});

test('variants differ and synthesis is deterministic', () => {
  for (const name of SFX_NAMES) {
    const a = makeSfx(name, 0), a2 = makeSfx(name, 0);
    assert.deepEqual(a, a2, `${name} not deterministic`);
    if (SFX_VARIANTS[name] > 1) {
      const b = makeSfx(name, 1);
      const same = a.length === b.length && a.every((s, i) => s === b[i]);
      assert.ok(!same, `${name} variants identical`);
    }
  }
});

// ---- player ----

function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _m: m,
  };
}

function fakeContext() {
  const log = { started: [], buffers: 0, pans: [], rates: [], gains: [] };
  const param = (v = 1) => ({ value: v, cancelScheduledValues() {}, setTargetAtTime(x) { this.value = x; } });
  const node = () => ({ connect() {}, disconnect() {} });
  return {
    log,
    state: 'running',
    currentTime: 10,
    destination: node(),
    createGain() { const n = node(); n.gain = param(); log.gains.push(n); return n; },
    createStereoPanner() { const n = node(); n.pan = param(0); log.pans.push(n.pan); return n; },
    createBuffer(ch, len, rate) {
      log.buffers++;
      const d = new Float32Array(len);
      return { length: len, sampleRate: rate, getChannelData: () => d, copyToChannel: (a) => d.set(a) };
    },
    createBufferSource() {
      const n = node();
      n.playbackRate = param();
      n.start = (t) => log.started.push({ t, src: n });
      n.stop = () => { n.stopped = true; };
      log.rates.push(n.playbackRate);
      return n;
    },
  };
}

test('playSfx is a safe no-op without AudioContext', () => {
  configureSfx({});
  const h = playSfx('key-press', { pan: 0.3 });
  assert.equal(typeof h.stop, 'function');
  h.stop();
  assert.doesNotThrow(() => playSfx('nope'));
  assert.doesNotThrow(() => duckSfx(true));
  duckSfx(false);
});

test('settings persist to localStorage and are clamped', () => {
  const st = fakeStorage();
  globalThis.localStorage = st;
  reloadSfxSettings();
  assert.equal(sfxEnabled(), true);
  assert.equal(sfxVolume(), 0.6);
  setSfxVolume(0.25);
  setSfxEnabled(false);
  assert.deepEqual(JSON.parse(st.getItem(SFX_STORAGE_KEY)), { enabled: false, volume: 0.25 });
  setSfxVolume(7);
  assert.equal(sfxVolume(), 1);
  setSfxVolume(-1);
  assert.equal(sfxVolume(), 0);
  setSfxVolume(0.4);
  setSfxEnabled(true);
  reloadSfxSettings();
  assert.equal(sfxEnabled(), true);
  assert.equal(sfxVolume(), 0.4);
  // junk and a throwing store both fall back to defaults
  globalThis.localStorage = fakeStorage({ [SFX_STORAGE_KEY]: '{nope' });
  reloadSfxSettings();
  assert.equal(sfxEnabled(), true);
  assert.equal(sfxVolume(), 0.6);
  globalThis.localStorage = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  reloadSfxSettings();
  assert.doesNotThrow(() => setSfxVolume(0.5));
  assert.equal(sfxVolume(), 0.5);
  delete globalThis.localStorage;
});

test('playSfx with a context: variants alternate, pan clamps, disabled is silent', () => {
  globalThis.localStorage = fakeStorage();
  reloadSfxSettings();
  const c = fakeContext();
  configureSfx({ getContext: () => c });
  const h = playSfx('page-turn', { pan: 1, when: 0.5, rate: 2 });
  assert.equal(c.log.started.length, 1);
  assert.equal(c.log.started[0].t, 10.5);
  assert.equal(c.log.pans[0].value, 0.7);
  assert.ok(c.log.rates[0].value > 1.9 && c.log.rates[0].value < 2.15);
  h.stop();
  assert.ok(c.log.started[0].src.stopped);
  // a different variant each time: count distinct buffers across plays
  const seen = [];
  for (let i = 0; i < 12; i++) {
    playSfx('page-turn');
    seen.push(c.log.started[c.log.started.length - 1].src.buffer);
  }
  for (let i = 1; i < seen.length; i++) assert.notEqual(seen[i], seen[i - 1], 'same variant twice in a row');
  const before = c.log.started.length;
  setSfxEnabled(false);
  playSfx('page-turn');
  assert.equal(c.log.started.length, before);
  setSfxEnabled(true);
  configureSfx({});
  delete globalThis.localStorage;
});

test('warmSfx synthesises in the background and can be cancelled', async () => {
  const w = warmSfx(['key-press', 'tick']);
  await w.done;
  const c = warmSfx(['bell']);
  c.cancel();
  await c.done;
});
