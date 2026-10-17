// Procedural lo-fi generator. The idea of an endless, seeded Tone.js lo-fi
// stream follows meel-hd/lofi-engine (MIT); this implementation is original.
// Named imports: only these Tone members reach the vendor-tone chunk (this module is itself loaded lazily).
import { start as startTone, getContext, FMSynth, Filter, Gain, Loop, MembraneSynth, MonoSynth, Noise, NoiseSynth, PolySynth, Reverb, Synth, getDraw, getTransport } from 'tone';
import { mulberry32 } from './ambience.mjs';

const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const KEYS = [0, 2, 3, 5, 7, 8, 10]; // C D Eb F G Ab Bb: warm keys for Rhodes.
const DEGREES = { I: [0, 'maj7'], ii: [2, 'm7'], iii: [4, 'm7'], IV: [5, 'maj7'], V: [7, '7'], vi: [9, 'm7'] };
const QUALITIES = { maj7: [0, 4, 7, 11, 14], m7: [0, 3, 7, 10, 14], 7: [0, 4, 7, 10, 14] };
export const PROGRESSIONS = Object.freeze([
  ['ii', 'V', 'I', 'vi'], ['I', 'vi', 'ii', 'V'], ['IV', 'iii', 'ii', 'I'], ['vi', 'IV', 'I', 'V'],
  ['ii', 'V', 'I', 'I'], ['I', 'iii', 'IV', 'V'], ['IV', 'V', 'iii', 'vi']
]);
const DRUMS = [
  { kick: 'x.........x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
  { kick: 'x.....x...x.....', snare: '....x.......x..x', hat: 'x.xxx.x.x.xxx.x.' },
  { kick: 'x..x......x..x..', snare: '....x.......x...', hat: '..x...x...x...x.' },
  { kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.xx' }
];
export const midiName = (midi) => NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);

// Deterministic: one seed always describes the same 16-bar section.
export function composeSection(seed) {
  const random = mulberry32(seed), pick = (list) => list[Math.floor(random() * list.length)];
  const key = pick(KEYS), progression = pick(PROGRESSIONS), bpm = 68 + Math.floor(random() * 18);
  const chords = progression.map((degree) => {
    const [offset, quality] = DEGREES[degree], root = 48 + ((key + offset) % 12);
    // Close voicing around middle C; drop the fifth or ninth for colour.
    const tones = QUALITIES[quality].filter((interval, index) => !(index === 2 && random() < .4) && !(index === 4 && random() < .45));
    const notes = tones.map((interval) => { let note = root + 12 + interval; while (note > 74) note -= 12; return note; }).sort((a, b) => a - b);
    return { degree, quality, name: NOTE_NAMES[(key + offset) % 12] + (quality === 'maj7' ? 'maj7' : quality), bass: root - 12, notes };
  });
  const groove = pick(DRUMS), steps = (pattern) => [...pattern].map((c) => c === 'x');
  const drums = { kick: steps(groove.kick), snare: steps(groove.snare), hat: steps(groove.hat).map((on) => on || random() < .08) };
  const scale = [0, 2, 4, 7, 9].map((step) => 60 + ((key + step) % 12) + 12);
  const melody = [];
  for (let bar = 0; bar < 4; bar++) for (let eighth = 0; eighth < 8; eighth++) {
    if (random() < .32) melody.push({ bar, step: eighth * 2, note: pick(scale) - (random() < .3 ? 12 : 0), length: random() < .4 ? '4n' : '8n' });
  }
  return { seed, key: NOTE_NAMES[key], bpm, chords, drums, melody, bars: 16 };
}

// Tone shares one transport. Track only players that actually started so a
// late, cancelled factory cannot stop its active replacement.
const activePlayers = new Set();

// useSoundscape imports this module lazily, so Tone stays out of the main bundle until music is wanted.
export async function createLofiPlayer({ onSection } = {}) {
  await startTone();
  const out = new Gain(0).toDestination();
  const tape = new Filter(1800, 'lowpass').connect(out);
  const space = new Reverb({ decay: 3.2, wet: .28 }).connect(tape);
  const keys = new PolySynth(FMSynth, { harmonicity: 2, modulationIndex: 1.2, oscillator: { type: 'sine' }, modulation: { type: 'triangle' }, envelope: { attack: .02, decay: 1.2, sustain: .35, release: 1.8 }, volume: -15 }).connect(space);
  const lead = new Synth({ oscillator: { type: 'triangle' }, envelope: { attack: .01, decay: .4, sustain: .2, release: .8 }, volume: -20 }).connect(space);
  const bass = new MonoSynth({ oscillator: { type: 'sine' }, filter: { Q: 1, type: 'lowpass' }, envelope: { attack: .02, decay: .3, sustain: .6, release: .6 }, filterEnvelope: { baseFrequency: 120, octaves: 1.5 }, volume: -10 }).connect(tape);
  const kick = new MembraneSynth({ pitchDecay: .04, octaves: 5, envelope: { attack: .001, decay: .35, sustain: 0 }, volume: -8 }).connect(tape);
  const snareBand = new Filter(1800, 'bandpass').connect(space), hatHigh = new Filter(7000, 'highpass').connect(tape);
  const crackleLevel = new Gain(.012).connect(out), crackleHigh = new Filter(2500, 'highpass').connect(crackleLevel);
  const snare = new NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: .001, decay: .16, sustain: 0 }, volume: -20 }).connect(snareBand);
  const hat = new NoiseSynth({ noise: { type: 'white' }, envelope: { attack: .001, decay: .04, sustain: 0 }, volume: -30 }).connect(hatHigh);
  const crackle = new Noise('pink').connect(crackleHigh);
  const transport = getTransport();
  let section = composeSection((Math.random() * 2 ** 31) | 0), step = 0;
  onSection?.(section);
  const loop = new Loop((time) => {
    const bar = Math.floor(step / 16), inBar = step % 16, chord = section.chords[bar % 4];
    if (inBar === 0) { keys.triggerAttackRelease(chord.notes.map(midiName), '1m', time + Math.random() * .02, .55 + Math.random() * .2); bass.triggerAttackRelease(midiName(chord.bass), '2n', time); }
    if (inBar === 10 && Math.random() < .5) bass.triggerAttackRelease(midiName(chord.bass + 7), '8n', time);
    if (section.drums.kick[inBar]) kick.triggerAttackRelease('C1', '8n', time);
    if (section.drums.snare[inBar]) snare.triggerAttackRelease('16n', time);
    if (section.drums.hat[inBar]) hat.triggerAttackRelease('32n', time, .4 + Math.random() * .5);
    for (const note of section.melody) if (note.bar === bar % 4 && note.step === inBar && bar >= 4) lead.triggerAttackRelease(midiName(note.note), note.length, time);
    step++;
    if (step >= section.bars * 16) { // A new seeded section every 16 bars.
      step = 0; section = composeSection((Math.random() * 2 ** 31) | 0);
      transport.bpm.rampTo(section.bpm, 2); getDraw().schedule(() => onSection?.(section), time);
    }
  }, '16n');
  let volume = .55, duck = 1, disposed = false, started = false;
  const identity = {};
  const applyVolume = () => out.gain.rampTo(volume * volume * duck, .6);
  return {
    get section() { return section; },
    start() { if (disposed || started) return; started = true; activePlayers.add(identity); transport.bpm.value = section.bpm; transport.swing = .32; transport.swingSubdivision = '16n'; crackle.start(); loop.start(0); transport.start(); applyVolume(); },
    // A beat as heard (wall clock ms): the transport's quarter-note grid at the context time now at the
    // speakers (getOutputTimestamp), so the cat's beat clock gets lo-fi's real phase, not just its tempo.
    beatAt() {
      if (!started || disposed) return 0;
      try {
        const raw = getContext().rawContext, stamp = raw.getOutputTimestamp?.(), length = 60000 / transport.bpm.value;
        if (stamp?.performanceTime > 0 && stamp.contextTime > 0) {
          const quarters = transport.getTicksAtTime(stamp.contextTime) / transport.PPQ;
          return Date.now() - (performance.now() - stamp.performanceTime) - (quarters % 1) * length;
        }
        // No output timestamp (e.g. no audio device): the context's clock plus its reported latency.
        const quarters = transport.getTicksAtTime(raw.currentTime) / transport.PPQ, latency = ((raw.baseLatency || 0) + (raw.outputLatency || 0)) * 1000;
        return raw.currentTime > 0 ? Date.now() + latency - (quarters % 1) * length : 0;
      } catch { return 0; }
    },
    setVolume(value) { volume = value; applyVolume(); },
    setDuck(value) { duck = value ? .25 : 1; applyVolume(); },
    dispose() {
      if (disposed) return; disposed = true;
      // Cancel only this player's scheduled loop. A stale async player must
      // never stop/cancel the shared transport of its replacement.
      loop.dispose();
      if (started) {
        crackle.stop(); activePlayers.delete(identity);
        if (activePlayers.size === 0) transport.stop();
      }
      [keys, lead, bass, kick, snare, hat, crackle, snareBand, hatHigh, crackleHigh, crackleLevel, space, tape, out].forEach((node) => node.dispose());
      // With no player left, Tone's own context sleeps; startTone() wakes it for the next one.
      if (activePlayers.size === 0) { const raw = getContext().rawContext; setTimeout(() => { if (activePlayers.size === 0 && raw.state === 'running') raw.suspend?.().catch?.(() => {}); }, 1500); }
    }
  };
}
