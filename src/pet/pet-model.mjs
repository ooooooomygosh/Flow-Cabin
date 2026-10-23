import { ACTION_FRAMES, PET_ACTIONS } from './pet-actions.mjs';
// What the cat is doing, derived from the room's state. Pure and testable.
import { POSES, LISTEN_POSE, LISTEN_FRAMES, TYPING_POSE, TYPING_FRAMES, CLICK_POSE, CLICK_FRAMES, EAT_POSE, EAT_FRAMES, HOP_POSE, HOP_FRAMES } from './cat-sprites.mjs';
import { getPet } from './pet-catalog.mjs';

// Preserve the original cat timing while every species renders the same semantic actions.
export const FPS = Object.freeze({ ...Object.fromEntries(PET_ACTIONS.map(action => [action, 4])), idle: 2, groove: 4, [LISTEN_POSE]: .5, celebrate: 6, walk: 4, sleep: 1, focus: 1.5, [TYPING_POSE]: 8, [CLICK_POSE]: 10, [EAT_POSE]: 6, [HOP_POSE]: 10 });
export { LISTEN_POSE, TYPING_POSE, CLICK_POSE, EAT_POSE, HOP_POSE };
// 打字跟随: the cat keeps typing this long after the last key activity (global hook or in-cabin).
export const TYPING_HOLD_MS = 900;
export const CLICK_HOLD_MS = 520;
export const typingUntil = (...times) => Math.max(0, ...times.map(Number).filter(Number.isFinite)) + TYPING_HOLD_MS;
// A click and a key can overlap. The most recent input wins; when its short
// reaction ends, still-fresh typing resumes instead of dropping straight to idle.
export function activeInputPose({ typingAt = 0, clickAt = 0, now = Date.now() } = {}) {
  const typed = Number(typingAt) || 0, clicked = Number(clickAt) || 0;
  const typingEnds = typed > 0 ? typed + TYPING_HOLD_MS : 0;
  const clickEnds = clicked > 0 ? clicked + CLICK_HOLD_MS : 0;
  if (clickEnds > now && clicked >= typed) return { pose: CLICK_POSE, until: clickEnds };
  if (typingEnds > now) return { pose: TYPING_POSE, until: typingEnds };
  if (clickEnds > now) return { pose: CLICK_POSE, until: clickEnds };
  return { pose: '', until: 0 };
}
const EXTRA_COUNTS = { [LISTEN_POSE]: LISTEN_FRAMES, [TYPING_POSE]: TYPING_FRAMES, [CLICK_POSE]: CLICK_FRAMES, [EAT_POSE]: EAT_FRAMES, [HOP_POSE]: HOP_FRAMES };
const frameCount = (pose) => EXTRA_COUNTS[pose] || POSES[pose] || ACTION_FRAMES[pose] || 1;
// One-shot actions on the desktop pet: eat plays its 6 frames twice, hop once.
export const ACTION_MS = Object.freeze({ [EAT_POSE]: Math.round(EAT_FRAMES * 2 * 1000 / 6), [HOP_POSE]: Math.round(HOP_FRAMES * 1000 / 10) });
const IDLE_SLEEP_MS = 5 * 60 * 1000, CELEBRATE_MS = 4000;
export const isNight = (hour) => hour >= 23 || hour < 6;

// `synced`: a real detected beat (src/cat/beat-sync.mjs beatSynced). Without one the cat listens
// briefly instead of dancing to a made-up tempo.
export function petPose({ synced = false, playing = false, phase = 'idle', paused = false, idleMs = 0, hour = 12, celebrateUntil = 0, now = 0, poked = 0 } = {}) {
  if (now < celebrateUntil) return 'celebrate';
  if (poked && now - poked < 1500) return 'celebrate';
  if (phase === 'focus' && !paused) return 'focus';
  // A brief listening expression, followed by open-eyed breathing. This is
  // natural idle motion, never a fabricated beat.
  if (playing) return synced ? 'groove' : (Math.max(0, now) % 12000 < 1500 ? LISTEN_POSE : 'idle');
  if (phase === 'shortBreak' || phase === 'longBreak') return 'walk';
  if (isNight(hour) || idleMs > IDLE_SLEEP_MS) return 'sleep';
  return 'idle';
}
export function frameAt(pose, timeMs) {
  const count = frameCount(pose), fps = FPS[pose] || 2;
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

// How long a focus moment stays in the bubble.
export const BUBBLE_MS = 6000;
// The speech bubble speaks only at moments (2.2): a poke, the start of a round, halfway, the last
// minute, the end, a pause, a new song. In between it is quiet and never covers the desktop.
// `since`: when the phase / pause / overtime state last changed; `previous`: the phase before it.
// `bubbles: false` silences it; 免打扰 (`quiet`) keeps only the answers to a poke.
export function bubbleText({ phase = 'idle', paused = false, remaining = 0, duration = 0, due = false, since = 0, previous = '', track = '', trackChangedAt = 0, poke = '', pokedAt = 0, now = 0, bubbles = true, quiet = false } = {}) {
  if (!bubbles) return '';
  if (poke && now - pokedAt < 3000) return poke;
  if (quiet) return '';
  const fresh = since > 0 && now - since >= 0 && now - since < BUBBLE_MS, minutes = Math.max(1, Math.ceil(remaining / 60000));
  if (phase === 'focus' && paused) return fresh ? '专注暂停中，等你回来' : '';
  if (phase === 'focus') {
    if (due) return fresh ? '时间到啦，我还陪着你' : '';
    if (fresh) return previous === 'focus' ? '继续加油' : '开始专注啦，我陪着你';
    const elapsed = duration - remaining;
    if (duration >= 4 * 60000 && elapsed >= duration / 2 && elapsed - duration / 2 < BUBBLE_MS) return `过半啦 · 还剩 ${minutes} 分钟`;
    if (remaining <= 60000 && remaining > 60000 - BUBBLE_MS) return '最后 1 分钟！';
    return '';
  }
  if (phase === 'shortBreak' || phase === 'longBreak') {
    if (fresh) return previous === 'focus' ? `专注完成！休息 ${minutes} 分钟吧` : `休息一下 · ${minutes} 分钟`;
    return '';
  }
  if (fresh && previous === 'focus') return '这一轮结束啦';
  if (fresh && (previous === 'shortBreak' || previous === 'longBreak')) return '休息好了吗？';
  if (track && now - trackChangedAt < BUBBLE_MS) return `♪ ${track}`;
  return '';
}

// 陪伴感: now and then (never more than once in REQUEST_GAP) the pet asks for a fish or a pat,
// only while nothing else is going on, and never in 免打扰. Hungry when it has not eaten today,
// lonely when its mood has dropped. `random` keeps it occasional instead of clockwork.
export const REQUEST_GAP = 45 * 60000;
export function petRequest({ now = 0, lastAt = 0, tier = 'ok', feedsToday = 0, fish = 0, quiet = false, phase = 'idle', hour = 12, random = Math.random } = {}) {
  if (quiet || phase !== 'idle' || isNight(hour) || now - lastAt < REQUEST_GAP) return null;
  if (!(random() < 0.35)) return null;
  if (feedsToday === 0 && fish > 0) return { kind: 'food', text: '肚子有点饿…喂我一条小鱼干？' };
  if (tier === 'droopy' || tier === 'sleepy') return { kind: 'attention', text: '摸摸我好不好？' };
  if (tier === 'ok') return { kind: 'attention', text: '要不要起来走走？我陪你。' };
  return null;
}
// The mood shows in the body, not only in words: a droopy pet dozes off between moments.
export function moodPose(pose, tier, now = 0) {
  if ((tier === 'droopy' || tier === 'sleepy') && pose === 'idle' && Math.floor(now / 20000) % 2 === 1) return 'sleep';
  return pose;
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
