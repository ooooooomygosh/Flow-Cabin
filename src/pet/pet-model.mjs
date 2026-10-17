// What the cat is doing, derived from the room's state. Pure and testable.
import { POSES } from './cat-sprites.mjs';
import { getPet } from './pet-catalog.mjs';

// `listen` (still, eyes closed) joins once the sprite sheet has it (cat-sprites.mjs, art PR).
export const FPS = Object.freeze({ idle: 2, groove: 4, ...(Object.hasOwn(POSES, 'listen') ? { listen: POSES.listen } : {}), celebrate: 6, walk: 4, sleep: 1, focus: 1.5 });
const IDLE_SLEEP_MS = 5 * 60 * 1000, CELEBRATE_MS = 4000;
export const isNight = (hour) => hour >= 23 || hour < 6;

// `synced`: a real detected beat (src/cat/beat-sync.mjs beatSynced). Without one the cat listens
// (eyes closed, still) instead of dancing to a made-up tempo; `listen` falls back to idle until the sprite has it.
export const LISTEN_POSE = () => (Object.hasOwn(POSES, 'listen') ? 'listen' : 'idle');
export function petPose({ synced = false, playing = false, phase = 'idle', paused = false, idleMs = 0, hour = 12, celebrateUntil = 0, now = 0, poked = 0 } = {}) {
  if (now < celebrateUntil) return 'celebrate';
  if (poked && now - poked < 1500) return 'celebrate';
  if (phase === 'focus' && !paused) return 'focus';
  if (playing) return synced ? 'groove' : LISTEN_POSE();
  if (phase === 'shortBreak' || phase === 'longBreak') return 'walk';
  if (isNight(hour) || idleMs > IDLE_SLEEP_MS) return 'sleep';
  return 'idle';
}
export function frameAt(pose, timeMs) {
  const count = POSES[pose] || 1, fps = FPS[pose] || 2;
  return Math.floor(timeMs / 1000 * fps) % count;
}
// Groove frames move on every half beat; the head dips (frames 1 and 3) on the beat.
// No tempo: hold frame 0 — never dance to a guessed 96 BPM.
export function grooveFrame(now, { bpm, beatAt = 0 } = {}) {
  if (!(bpm > 0)) return { index: 0, wait: 250 };
  const half = 30000 / bpm, since = now - beatAt, halves = Math.floor(since / half);
  return { index: ((halves + 1) % 4 + 4) % 4, wait: half - ((since % half) + half) % half };
}
export function celebrateUntil(now) { return now + CELEBRATE_MS; }

const POKE_LINES = ['喵～', '今天也辛苦啦', '摸摸头 (=^･ω･^=)', '要不要放张唱片？', '喝口水再继续吧', '咕噜咕噜…', '我在陪你哦'];
export function pokeLine(random = Math.random, petId = 'cat') {
  const pet = getPet(petId);
  const lines = pet.id === 'cat' ? POKE_LINES : [pet.greeting, '今天也辛苦啦', '陪你听完这一首', '喝口水再继续吧', '慢慢来，我在这里'];
  const value = random();
  const index = Number.isFinite(value) ? Math.min(lines.length - 1, Math.max(0, Math.floor(value * lines.length))) : 0;
  return lines[index];
}

// The speech bubble: focus countdown first, then a new song, then pokes.
export function bubbleText({ phase = 'idle', paused = false, remaining = 0, track = '', trackChangedAt = 0, poke = '', pokedAt = 0, now = 0, hour = 12 } = {}) {
  if (poke && now - pokedAt < 3000) return poke;
  if (phase === 'focus' && !paused) { const m = Math.ceil(remaining / 60000); return m > 1 ? `专注中 · 还剩 ${m} 分钟` : '最后冲刺！'; }
  if (phase === 'focus' && paused) return '专注暂停中';
  if (phase === 'shortBreak' || phase === 'longBreak') return `休息一下 · ${Math.ceil(remaining / 60000)} 分钟`;
  if (track && now - trackChangedAt < 6000) return `♪ ${track}`;
  if (isNight(hour)) return '';
  return '';
}

// Brief out-and-back walks with at least 90 seconds of rest. No native window
// movement: callers apply this bounded offset inside their existing layout.
export function catStroll(elapsed, restMs = 120000, enabled = true) {
  const rest = Math.max(90000, Math.min(150000, restMs));
  const time = Math.max(0, elapsed) % (rest + 8000);
  if (!enabled || time < rest) return { walking: false, x: 0 };
  const progress = (time - rest) / 8000;
  return { walking: true, x: Math.round(16 * (progress < .5 ? progress * 2 : (1 - progress) * 2)) };
}
