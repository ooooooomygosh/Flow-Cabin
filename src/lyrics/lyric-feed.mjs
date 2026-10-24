import { packLyrics } from './lyric-timing.mjs';
import { activeLyric } from './lyrics-model.mjs';

// What the desktop lyric bar (and the phone's second screen) read from the cabin page.
// The page has no IPC to the shell, so the shell asks `take(knownDocRev)` a few times a
// second. The answer is small: the whole song's lyrics only when they changed since the
// caller's copy, otherwise just a wall-clock anchor and the music's energy and beat. The
// reader animates word fills on its own clock between answers.
export function createLyricFeed({ now = () => Date.now() } = {}) {
  let doc = null, docRev = 0, meta = { title: '', artist: '', key: '' }, offset = 0, skin = 'pixel', prefs = {}, pet = { id: 'cat', accessory: '' }, source = () => null;
  return {
    setDoc(key, value, info = {}) {
      if (key === meta.key && value === doc) return;
      doc = value; docRev++; meta = { key, title: String(info.title || '').slice(0, 300), artist: String(info.artist || '').slice(0, 300) };
    },
    setOffset(value) { offset = Number(value) || 0; },
    setSkin(value) { skin = String(value || 'pixel'); },
    setPrefs(value) { prefs = value || {}; },
    setPet(value) { pet = { id: String(value?.id || 'cat').slice(0, 40), accessory: String(value?.accessory || '').slice(0, 40) }; },
    // () => { position (ms, song clock), playing, rate, duration (ms), energy, bpm, beatAt }
    setSource(fn) { source = typeof fn === 'function' ? fn : () => null; },
    // The current line, one before and a few after, packed: what a phone needs to sing along.
    around(before = 1, after = 8) {
      if (!doc?.lines?.length) return { lines: [], current: '', next: '' };
      const s = source() || {}, position = Number.isFinite(s.position) ? s.position - offset : null, index = position === null ? -1 : activeLyric(doc.lines, position, 0);
      // Pack one extra line so the last sent line still knows when the next one starts.
      const start = Math.max(0, index - before), end = Math.max(0, index) + after + 1;
      const packed = packLyrics({ ...doc, lines: doc.lines.slice(start, end + 1) }).lines.slice(0, end - start);
      const text = line => line ? line.words.map(w => w.word).join('') : '';
      return { lines: packed, current: text(doc.lines[index]), next: text(doc.lines[index + 1]) };
    },
    take(knownRev = -1) {
      const s = source() || {}, at = now();
      return {
        docRev, title: meta.title, artist: meta.artist, skin, prefs, pet,
        ...(Number(knownRev) === docRev ? {} : { doc: doc ? packLyrics(doc) : null }),
        anchor: { position: Number.isFinite(s.position) ? s.position - offset : null, at, playing: Boolean(s.playing), rate: Number(s.rate) || 1, duration: Number(s.duration) || 0 },
        energy: Number(s.energy) || 0, bpm: Number(s.bpm) || 0, beatAt: Number(s.beatAt) || 0
      };
    }
  };
}
