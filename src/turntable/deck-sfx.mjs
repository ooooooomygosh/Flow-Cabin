// Tiny synthesized deck sounds: the needle touching down (a soft thump with
// a crackle), lifting off (a short tick) and a sleeve sliding out. Generated
// with Web Audio, quiet by design, silent until the listener has interacted.
import { createIdleSuspend } from '../audio/idle-suspend.mjs';

const KEY = 'album-circle-deck-sfx-v1';
let context = null, idle = null, awake = false;
export function deckSoundsEnabled() { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } }
export function setDeckSounds(on) { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch {} }
function ctx() {
  const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Context) return null;
  if (!context) { context = new Context({ latencyHint: 'interactive' }); idle = createIdleSuspend(context, { ms: 2000 }); }
  if (context.state === 'running') awake = true;
  idle.wake(); idle.idle();
  // Silent until the listener has interacted (no burst of queued sounds later); once it
  // has run, a context we put to sleep wakes and plays this sound a few ms late.
  return awake && context.state !== 'closed' ? context : null;
}
function noise(audio, seconds, shape) {
  const buffer = audio.createBuffer(1, Math.max(1, Math.floor(audio.sampleRate * seconds)), audio.sampleRate), data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * shape(i / data.length);
  const source = audio.createBufferSource(); source.buffer = buffer; return source;
}
export function playDeckSound(kind, volume = .5) {
  if (!deckSoundsEnabled() || volume <= 0) return;
  const audio = ctx(); if (!audio) return;
  const out = audio.createGain(); out.gain.value = Math.min(.18, .14 * volume); out.connect(audio.destination);
  const now = audio.currentTime;
  if (kind === 'drop') {
    const thump = audio.createOscillator(), g = audio.createGain();
    thump.frequency.setValueAtTime(95, now); thump.frequency.exponentialRampToValueAtTime(42, now + .09);
    g.gain.setValueAtTime(.9, now); g.gain.exponentialRampToValueAtTime(.001, now + .12);
    thump.connect(g).connect(out); thump.start(now); thump.stop(now + .13);
    const crackle = noise(audio, .5, (t) => (Math.random() < .03 ? 1 : .05) * (1 - t)), band = audio.createBiquadFilter();
    band.type = 'bandpass'; band.frequency.value = 2400; band.Q.value = .8; crackle.connect(band).connect(out); crackle.start(now + .02);
  } else if (kind === 'lift') {
    const tick = noise(audio, .04, (t) => 1 - t), high = audio.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 1800;
    tick.connect(high).connect(out); tick.start(now);
  } else if (kind === 'sleeve') {
    const slide = noise(audio, .32, (t) => Math.sin(Math.PI * t) * .5), low = audio.createBiquadFilter(); low.type = 'lowpass'; low.frequency.setValueAtTime(900, now); low.frequency.linearRampToValueAtTime(2600, now + .3);
    slide.connect(low).connect(out); slide.start(now);
  }
}
