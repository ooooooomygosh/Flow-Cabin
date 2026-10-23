// Pure timing helpers shared by the room readout, the fullscreen stage, the desktop
// lyric bar and the phone's second screen. Times are milliseconds on the song clock.

// The end of a line: its own end, else the next line's start, else a reading pause.
// Parsers give the last LRC line an "until forever" end; anything over 30 s is not real.
export function lineEnd(lines, index) {
  const line = lines[index]; if (!line) return 0;
  const own = Number(line.endTime), next = Number(lines[index + 1]?.startTime);
  if (Number.isFinite(own) && own > line.startTime && own - line.startTime <= 30000) return Number.isFinite(next) && next > line.startTime ? Math.min(own, next) : own;
  return Number.isFinite(next) && next > line.startTime ? Math.min(next, line.startTime + 30000) : line.startTime + 5000;
}

// Per-word fill 0..1 for a karaoke line. Word-timed lyrics use their real word times;
// line-timed lyrics fill evenly across the line (it never invents per-word precision:
// the even fill is one continuous sweep, not word steps).
export function wordProgress(line, time, end = line?.endTime) {
  if (!line || !Number.isFinite(time)) return [];
  const words = line.words || [];
  const timed = words.length > 1 && words.every(w => Number.isFinite(w.startTime) && Number.isFinite(w.endTime) && w.endTime >= w.startTime);
  if (timed) return words.map(w => w.endTime <= w.startTime ? (time >= w.startTime ? 1 : 0) : clamp((time - w.startTime) / (w.endTime - w.startTime)));
  // A line followed by a long interlude is still sung at a reading pace (~0.4 s a character).
  const total = Math.max(1, words.reduce((sum, w) => sum + [...String(w.word)].length, 0));
  const start = line.startTime, stop = Math.min(Number.isFinite(end) && end > start ? end : Infinity, start + Math.max(2000, total * 400));
  const swept = clamp((time - start) / (stop - start)) * total;
  let before = 0;
  return words.map(w => { const size = Math.max(1, [...String(w.word)].length), value = clamp((swept - before) / size); before += size; return value; });
}
const clamp = v => Math.max(0, Math.min(1, v));

// Attach translation / romanization lines to the main lines: the nearest secondary line
// within `tolerance` ms, each used once (platform translations are often a few hundred
// milliseconds off the word-timed line they translate).
export function alignSecondary(lines, secondary, field, tolerance = 500) {
  if (!Array.isArray(secondary) || !secondary.length) return lines;
  const used = new Set();
  return lines.map(line => {
    let best = -1, distance = Infinity;
    for (let i = 0; i < secondary.length; i++) {
      if (used.has(i)) continue;
      const d = Math.abs(secondary[i].startTime - line.startTime);
      if (d < distance) { distance = d; best = i; }
      if (secondary[i].startTime - line.startTime > tolerance) break;
    }
    if (best < 0 || distance > tolerance) return line;
    const text = secondary[best].words.map(w => w.word).join('').trim();
    if (!text) return line;
    used.add(best);
    return { ...line, [field]: text };
  });
}

// Song position on a wall-clock anchor { position, at, playing, rate } (ms / Date.now).
export function anchoredPosition(anchor, now = Date.now()) {
  if (!anchor || !Number.isFinite(anchor.position)) return null;
  const elapsed = anchor.playing ? Math.max(0, now - anchor.at) * (anchor.rate || 1) : 0;
  return Number.isFinite(anchor.duration) && anchor.duration > 0 ? Math.min(anchor.duration, anchor.position + elapsed) : anchor.position + elapsed;
}

// Small, bounded wire format for lyric documents sent to another window or device.
export const MAX_WIRE_LINES = 3000;
export function packLyrics(doc) {
  if (!doc?.lines?.length) return { precision: doc?.precision || 'plain', lines: [], plain: String(doc?.plain || '').slice(0, 20000), instrumental: Boolean(doc?.instrumental) };
  return { precision: doc.precision, instrumental: Boolean(doc.instrumental), lines: doc.lines.slice(0, MAX_WIRE_LINES).map((line, i) => ({
    s: Math.round(line.startTime), e: Math.round(lineEnd(doc.lines, i)),
    w: line.words.slice(0, 200).map(w => [String(w.word).slice(0, 200), Math.round(w.startTime), Math.round(w.endTime)]),
    ...(line.translatedLyric ? { t: String(line.translatedLyric).slice(0, 500) } : {}), ...(line.romanLyric ? { r: String(line.romanLyric).slice(0, 500) } : {})
  })) };
}
export function unpackLyrics(value) {
  const lines = Array.isArray(value?.lines) ? value.lines.slice(0, MAX_WIRE_LINES) : [];
  const num = n => Number.isFinite(Number(n)) ? Number(n) : 0;
  return { precision: ['word', 'line', 'plain'].includes(value?.precision) ? value.precision : 'plain', instrumental: value?.instrumental === true, plain: String(value?.plain || '').slice(0, 20000),
    lines: lines.filter(l => l && Array.isArray(l.w)).map(l => ({ startTime: num(l.s), endTime: num(l.e), words: l.w.slice(0, 200).filter(Array.isArray).map(([word, start, end]) => ({ word: String(word ?? '').slice(0, 200), startTime: num(start), endTime: num(end) })), translatedLyric: typeof l.t === 'string' ? l.t.slice(0, 500) : '', romanLyric: typeof l.r === 'string' ? l.r.slice(0, 500) : '' })) };
}
