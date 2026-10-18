// 学习 · study tools: spaced-repetition flashcards (FSRS via ts-fsrs, the
// scheduler Anki adopted) and exam countdowns. Everything stays in this
// browser profile; pure functions so the rules are testable.
import { fsrs, generatorParameters, createEmptyCard, Rating, State } from 'ts-fsrs';

export const STUDY_PREFIX = 'album-circle-study-v1:';
export const LIMITS = Object.freeze({ decks: 40, cards: 5000, side: 600, source: 300, countdowns: 12, perDayNew: 20 });
export const RATINGS = Object.freeze([
  { rating: Rating.Again, key: '1', label: '忘了', tone: 'again' },
  { rating: Rating.Hard, key: '2', label: '模糊', tone: 'hard' },
  { rating: Rating.Good, key: '3', label: '记得', tone: 'good' },
  { rating: Rating.Easy, key: '4', label: '简单', tone: 'easy' }
]);
const scheduler = fsrs(generatorParameters({ enable_fuzz: true, request_retention: 0.9, maximum_interval: 3650 }));
const strict = fsrs(generatorParameters({ enable_fuzz: false, request_retention: 0.9, maximum_interval: 3650 }));
const DAY = 86400000;
const text = (value, max) => (typeof value === 'string' ? value : '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').trim().slice(0, max);
// Optional metadata keeps legacy cards/decks unchanged; source is plain text.
export function sourceFields(value) {
  const source = text(value, LIMITS.source);
  return source ? { source } : {};
}
const number = (value, low, high, fallback = 0) => Number.isFinite(Number(value)) ? Math.max(low, Math.min(high, Number(value))) : fallback;
const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
import { dayKey } from '../focus/focus-model.mjs';
export { dayKey };

// Cards keep FSRS memory state with times as epoch milliseconds (JSON-safe).
function toFsrs(memory, now) {
  if (!memory) return createEmptyCard(new Date(now));
  return { due: new Date(memory.due), stability: memory.stability, difficulty: memory.difficulty, elapsed_days: memory.elapsed_days, scheduled_days: memory.scheduled_days, reps: memory.reps, lapses: memory.lapses, state: memory.state, last_review: memory.last_review ? new Date(memory.last_review) : undefined };
}
function fromFsrs(card) {
  return { due: card.due.getTime(), stability: card.stability, difficulty: card.difficulty, elapsed_days: card.elapsed_days, scheduled_days: card.scheduled_days, reps: card.reps, lapses: card.lapses, state: card.state, last_review: card.last_review ? card.last_review.getTime() : 0 };
}
function normalizeMemory(value) {
  if (!value || typeof value !== 'object') return null;
  const memory = { due: number(value.due, 0, 9e15, 0), stability: number(value.stability, 0, 1e6, 0), difficulty: number(value.difficulty, 0, 10, 0), elapsed_days: number(value.elapsed_days, 0, 1e5, 0), scheduled_days: number(value.scheduled_days, 0, 1e5, 0), reps: number(value.reps, 0, 1e6, 0), lapses: number(value.lapses, 0, 1e6, 0), state: [0, 1, 2, 3].includes(value.state) ? value.state : 0, last_review: number(value.last_review, 0, 9e15, 0) };
  // Invalid persisted schedules must not produce NaN intervals on the next review.
  // Preserve card content and restart learning for incomplete reviewed cards.
  if (!Number.isFinite(new Date(memory.due).getTime())
    || (memory.state !== State.New && (memory.stability <= 0 || memory.last_review <= 0
      || !Number.isFinite(new Date(memory.last_review).getTime())))) return null;
  return memory;
}
function normalizeCard(value, decks) {
  if (!value || typeof value !== 'object') return null;
  const front = text(value.front, LIMITS.side), back = text(value.back, LIMITS.side), deckId = text(value.deckId, 60);
  if (!front || !decks.has(deckId)) return null;
  return { id: text(value.id, 60) || uid('card'), deckId, front, back, ...sourceFields(value.source), createdAt: number(value.createdAt, 0, 9e15, 0), memory: normalizeMemory(value.memory) };
}
export function normalizeStudy(value = {}) {
  const v = value && typeof value === 'object' ? value : {};
  const decks = (Array.isArray(v.decks) ? v.decks : []).map((deck) => deck && typeof deck === 'object' && text(deck.name, 40) ? { id: text(deck.id, 60) || uid('deck'), name: text(deck.name, 40), ...sourceFields(deck.source), createdAt: number(deck.createdAt, 0, 9e15, 0) } : null).filter(Boolean).slice(0, LIMITS.decks);
  const ids = new Set(decks.map((deck) => deck.id));
  const log = v.log && typeof v.log === 'object' ? Object.fromEntries(Object.entries(v.log).filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key)).slice(-400).map(([key, entry]) => [key, { reviews: number(entry?.reviews, 0, 1e5, 0), learned: number(entry?.learned, 0, 1e5, 0) }])) : {};
  return {
    version: 1, decks,
    cards: (Array.isArray(v.cards) ? v.cards : []).map((card) => normalizeCard(card, ids)).filter(Boolean).slice(0, LIMITS.cards),
    countdowns: (Array.isArray(v.countdowns) ? v.countdowns : []).map((entry) => entry && text(entry.title, 40) && /^\d{4}-\d{2}-\d{2}$/.test(entry.date || '') ? { id: text(entry.id, 60) || uid('exam'), title: text(entry.title, 40), date: entry.date } : null).filter(Boolean).slice(0, LIMITS.countdowns),
    newPerDay: number(v.newPerDay, 0, 200, LIMITS.perDayNew),
    log
  };
}

export function addDeck(state, name, now = Date.now()) {
  const value = text(name, 40); if (!value || state.decks.length >= LIMITS.decks) return state;
  return { ...state, decks: [...state.decks, { id: uid('deck'), name: value, createdAt: now }] };
}
export function renameDeck(state, deckId, name) { const value = text(name, 40); return value ? { ...state, decks: state.decks.map((deck) => deck.id === deckId ? { ...deck, name: value } : deck) } : state; }
export function removeDeck(state, deckId) { return { ...state, decks: state.decks.filter((deck) => deck.id !== deckId), cards: state.cards.filter((card) => card.deckId !== deckId) }; }
// One card per line: "front - back", "front | back", "front<TAB>back" (Anki / Excel export) or "front：back".
export function parseCards(input) {
  return String(input || '').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => {
    const parts = line.includes('\t') ? line.split('\t') : line.split(/\s+[-–—|]\s+|\s*[：:]\s+|\s*：\s*/);
    return { front: text(parts[0], LIMITS.side), back: text(parts.slice(1).join(' / '), LIMITS.side) };
  }).filter((card) => card.front);
}
// One duplicate rule for typed, pasted and imported cards: ｗｉｎｄｏｗ, Window and window are the same card.
export const cardKey = (front) => String(front || '').normalize('NFKC').trim().toLowerCase();
export function addCards(state, deckId, cards, now = Date.now()) {
  if (!state.decks.some((deck) => deck.id === deckId)) return { state, added: 0 };
  const existing = new Set(state.cards.filter((card) => card.deckId === deckId).map((card) => cardKey(card.front)));
  const fresh = [];
  for (const card of cards) {
    if (state.cards.length + fresh.length >= LIMITS.cards) break;
    const key = cardKey(card.front); if (existing.has(key)) continue; existing.add(key);
    fresh.push({ id: uid('card'), deckId, front: card.front, back: card.back, ...sourceFields(card.source), createdAt: now + fresh.length, memory: null });
  }
  return { state: { ...state, cards: [...state.cards, ...fresh] }, added: fresh.length };
}
export function updateCard(state, cardId, change) {
  return { ...state, cards: state.cards.map((card) => card.id === cardId ? { ...card, front: text(change.front ?? card.front, LIMITS.side) || card.front, back: text(change.back ?? card.back, LIMITS.side) } : card) };
}
export function removeCard(state, cardId) { return { ...state, cards: state.cards.filter((card) => card.id !== cardId) }; }
// 撤销 after a delete: the card (memory included) returns while its deck still exists.
export function restoreCard(state, card) {
  if (!card || state.cards.length >= LIMITS.cards || state.cards.some((entry) => entry.id === card.id) || !state.decks.some((deck) => deck.id === card.deckId)) return state;
  return { ...state, cards: [...state.cards, card].sort((a, b) => a.createdAt - b.createdAt) };
}

// Today's queue: due reviews first (most overdue first), then new cards up to the daily limit.
export function studyQueue(state, deckId, now = Date.now()) {
  const pool = state.cards.filter((card) => !deckId || card.deckId === deckId);
  const learnedToday = state.log[dayKey(now)]?.learned || 0;
  const due = pool.filter((card) => card.memory && card.memory.due <= now).sort((a, b) => a.memory.due - b.memory.due);
  const fresh = pool.filter((card) => !card.memory).sort((a, b) => a.createdAt - b.createdAt).slice(0, Math.max(0, state.newPerDay - learnedToday));
  return { cards: [...due, ...fresh], due: due.length, fresh: fresh.length, total: pool.length, upcoming: pool.filter((card) => card.memory && card.memory.due > now).sort((a, b) => a.memory.due - b.memory.due)[0]?.memory.due || 0 };
}
// A deck with no cards is empty, not finished. Keep empty, unstarted,
// in-progress and completed distinct so the shelf can offer the right action.
export function deckStatus(state, deckId, now = Date.now()) {
  const cards = state.cards.filter((card) => card.deckId === deckId);
  const learned = cards.filter((card) => card.memory).length;
  const unlearned = cards.length - learned;
  const queue = studyQueue(state, deckId, now);
  const base = { total: cards.length, learned, unlearned, due: queue.due, fresh: queue.fresh, upcoming: queue.upcoming };
  if (!cards.length) return { ...base, kind: 'empty', label: '空词书', detail: '添加或导入词条后开始', action: 'edit' };
  if (!learned) return { ...base, kind: 'new', label: '未开始', detail: queue.cards.length ? '' : '今日新词额度已用完', action: 'review' };
  if (queue.cards.length) {
    const label = [queue.due ? `待复习 ${queue.due}` : '', queue.fresh ? `新 ${queue.fresh}` : ''].filter(Boolean).join(' · ');
    return { ...base, kind: 'active', label, detail: unlearned > queue.fresh ? `还剩 ${unlearned} 张新词` : '', action: 'review' };
  }
  if (unlearned) return { ...base, kind: 'paused', label: '今日新词已学完', detail: `还剩 ${unlearned} 张新词`, action: 'review' };
  return { ...base, kind: 'done', label: '已完成', detail: '', action: 'review' };
}
export function review(state, cardId, rating, now = Date.now()) {
  const card = state.cards.find((entry) => entry.id === cardId); if (!card) return state;
  const result = scheduler.next(toFsrs(card.memory, now), new Date(now), rating);
  const key = dayKey(now), day = state.log[key] || { reviews: 0, learned: 0 };
  return { ...state, cards: state.cards.map((entry) => entry.id === cardId ? { ...entry, memory: fromFsrs(result.card) } : entry), log: { ...state.log, [key]: { reviews: day.reviews + 1, learned: day.learned + (card.memory ? 0 : 1) } } };
}
// "10 分钟 / 3 天" under each rating button, from the unfuzzed schedule.
export function previews(card, now = Date.now()) {
  const options = strict.repeat(toFsrs(card?.memory, now), new Date(now));
  return Object.fromEntries(RATINGS.map(({ rating }) => [rating, intervalLabel(options[rating].card.due.getTime() - now)]));
}
export function intervalLabel(ms) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.round(minutes / 60); if (hours < 24) return `${hours} 小时`;
  const days = Math.round(ms / DAY); if (days < 31) return `${days} 天`;
  const months = Math.round(days / 30); return months < 12 ? `${months} 个月` : `${(days / 365).toFixed(1).replace(/\.0$/, '')} 年`;
}
export const cardStage = (card) => !card.memory ? 'new' : card.memory.state === State.Review ? 'review' : 'learning';

// Exam countdowns: whole local days until the date (0 = today).
export function daysUntil(date, now = Date.now()) {
  const [y, m, d] = String(date).split('-').map(Number), target = new Date(y, m - 1, d).getTime(), today = new Date(now); today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / DAY);
}
export function addCountdown(state, title, date) {
  const value = text(title, 40); if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || state.countdowns.length >= LIMITS.countdowns) return state;
  return { ...state, countdowns: [...state.countdowns, { id: uid('exam'), title: value, date }].sort((a, b) => a.date.localeCompare(b.date)) };
}
export function removeCountdown(state, id) { return { ...state, countdowns: state.countdowns.filter((entry) => entry.id !== id) }; }
export function restoreCountdown(state, entry) {
  if (!entry || state.countdowns.length >= LIMITS.countdowns || state.countdowns.some((item) => item.id === entry.id)) return state;
  return { ...state, countdowns: [...state.countdowns, entry].sort((a, b) => a.date.localeCompare(b.date)) };
}
export function nextCountdown(state, now = Date.now()) { return state.countdowns.map((entry) => ({ ...entry, days: daysUntil(entry.date, now) })).filter((entry) => entry.days >= 0).sort((a, b) => a.days - b.days)[0] || null; }

// Focus heatmap: the last N weeks as columns of 7 days (Sunday first), levels 0–4.
export function heatmap(minutesByDay, now = Date.now(), weeks = 18) {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const start = new Date(today); start.setDate(start.getDate() - today.getDay() - (weeks - 1) * 7);
  const columns = [];
  for (let week = 0; week < weeks; week++) {
    const column = [];
    for (let day = 0; day < 7; day++) {
      const date = new Date(start); date.setDate(start.getDate() + week * 7 + day);
      const key = dayKey(date.getTime()), minutes = Math.round(minutesByDay.get(key) || 0), future = date > today;
      column.push({ key, minutes, future, level: future || !minutes ? 0 : minutes < 25 ? 1 : minutes < 60 ? 2 : minutes < 120 ? 3 : 4 });
    }
    columns.push(column);
  }
  return columns;
}
