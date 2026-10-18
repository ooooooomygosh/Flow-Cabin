import { dayKey } from '../lib/local-calendar.mjs';
import { SESSION_LOG_KEY, normalizeSessionRecord } from './stats/session-source.mjs';
import { PLAYBACK_LOG_KEY, readPlaybackSessions } from '../player/playback-log.mjs';
import { LETTERS_KEY, normalizeLetter } from '../ai/ai-model.mjs';
import { JOURNAL_KEY, readJournalRecords, normalizeJournalRecord } from './journal-entries.mjs';

export const SOUVENIR_PREFIX = 'flow-cabin-souvenirs-v1:';
export const SOUVENIR_CHANGE = 'cabin:souvenirs';
export const SOUVENIRS = Object.freeze([
  { id: 'first-focus', name: '一刻木章', hint: '完成第一轮专注。', icon: 'clock' },
  { id: 'listening-ten', name: '十分钟唱片', hint: '累计 10 分钟已确认的听歌时间。', icon: 'record' },
  { id: 'first-letter', name: '启程信封', hint: '给小屋寄出第一封信。', icon: 'letter' },
  { id: 'journal-three-days', name: '三日书签', hint: '在 3 个不同本地日期创建有正文的手记，无须连续。', icon: 'book' }
].map(Object.freeze));
export const SOUVENIR_KEYS = Object.freeze(SOUVENIRS.map(item => SOUVENIR_PREFIX + item.id));
const IDS = new Set(SOUVENIRS.map(item => item.id));
const TEN_MINUTES = 600000;
const timestamp = value => Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000;
const positive = value => Number.isSafeInteger(value) && value > 0;
const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 160;
const empty = () => ({ version: 1, records: [] });
function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}

// Backup contract: { version: 1, records: [...] }. Invalid input throws instead
// of dropping existing awards. Dates are captured at grant time, never re-zoned.
export function normalizeSouvenirRecord(value) {
  if (!value || !IDS.has(value.id) || !timestamp(value.earnedAt) || !calendarDate(value.earnedOn)) return null;
  const e = value.evidence;
  if (!e || typeof e !== 'object') return null;
  let evidence;
  if (value.id === 'first-focus') {
    if (!identifier(e.sessionId) || !positive(e.durationMs) || e.durationMs > 14400000) return null;
    evidence = { sessionId: e.sessionId, durationMs: e.durationMs };
  } else if (value.id === 'listening-ten') {
    if (!positive(e.verifiedMs) || e.verifiedMs < TEN_MINUTES || !positive(e.segments) || e.segments > 5000) return null;
    evidence = { verifiedMs: e.verifiedMs, segments: e.segments };
  } else if (value.id === 'first-letter') {
    if (!identifier(e.letterId)) return null;
    evidence = { letterId: e.letterId };
  } else {
    if (!Array.isArray(e.days) || e.days.length !== 3 || !e.days.every(calendarDate) || new Set(e.days).size !== 3) return null;
    evidence = { days: [...e.days].sort() };
    if (evidence.days.at(-1) !== value.earnedOn) return null;
  }
  return { id: value.id, earnedAt: value.earnedAt, earnedOn: value.earnedOn, evidence };
}

export function normalizeSouvenirs(value = empty()) {
  if (!value || value.version !== 1 || !Array.isArray(value.records) || value.records.length > SOUVENIRS.length)
    throw new Error('纪念物数据格式无法识别，已保留原数据并停止写入。');
  const records = value.records.map(normalizeSouvenirRecord);
  if (records.some(record => !record) || new Set(records.map(record => record.id)).size !== records.length)
    throw new Error('纪念物记录不完整，已保留原数据并停止写入。');
  return { version: 1, records: records.sort((a, b) => a.id.localeCompare(b.id)) };
}

// Union for backup recovery: never remove an award. The earliest evidence wins;
// deterministic ties make merging commutative and repeatable.
export function mergeSouvenirs(...states) {
  const records = new Map();
  for (const state of states) for (const record of normalizeSouvenirs(state).records) {
    const previous = records.get(record.id);
    if (!previous || record.earnedAt < previous.earnedAt
      || (record.earnedAt === previous.earnedAt && JSON.stringify(record) < JSON.stringify(previous))) records.set(record.id, record);
  }
  return normalizeSouvenirs({ version: 1, records: [...records.values()] });
}

const storageError = () => new Error('纪念物存储无法读取，已保留当前记录。请检查本机存储后重试。');
export function readSouvenirs(storage) {
  if (!storage?.getItem) throw storageError();
  const records = [];
  for (const item of SOUVENIRS) {
    let raw, value;
    try {
      raw = storage.getItem(SOUVENIR_PREFIX + item.id);
      if (raw == null) continue;
      value = JSON.parse(raw);
    } catch { throw storageError(); }
    const record = normalizeSouvenirRecord(value);
    if (!record || record.id !== item.id) throw new Error('纪念物记录无法读取，原数据没有被覆盖。请检查备份后重试。');
    records.push(record);
  }
  return normalizeSouvenirs({ version: 1, records });
}

// One key per award prevents different windows awarding different kinds from
// replacing each other's records. Partial writes remain recoverable on retry.
export function saveSouvenirs({ storage, state, target } = {}) {
  let desired = normalizeSouvenirs(state), saved = empty();
  try {
    saved = readSouvenirs(storage);
    desired = mergeSouvenirs(saved, desired);
    if (!storage?.setItem) throw new Error();
    let changed = false;
    for (const record of desired.records) {
      const current = readSouvenirs(storage);
      const merged = mergeSouvenirs(current, { version: 1, records: [record] });
      const next = merged.records.find(item => item.id === record.id);
      if (JSON.stringify(current.records.find(item => item.id === record.id)) !== JSON.stringify(next)) {
        storage.setItem(SOUVENIR_PREFIX + record.id, JSON.stringify(next));
        changed = true;
      }
      saved = mergeSouvenirs(current, { version: 1, records: [next] });
    }
    // Re-read captures awards written by another window during this update.
    saved = readSouvenirs(storage);
    if (changed) {
      try { target?.dispatchEvent?.(new Event(SOUVENIR_CHANGE)); } catch { /* persistence already succeeded */ }
    }
    return { ok: true, state: mergeSouvenirs(desired, saved), savedIds: saved.records.map(record => record.id), error: '' };
  } catch {
    return { ok: false, state: desired, savedIds: saved.records.map(record => record.id), error: '纪念物尚未全部保存，当前记录仍保留在此窗口。请检查本机存储后重试。' };
  }
}

function sourceArray(storage, key, sessions = false) {
  if (!storage?.getItem) throw storageError();
  const raw = storage.getItem(key);
  if (raw == null) return [];
  const parsed = JSON.parse(raw);
  const list = sessions && !Array.isArray(parsed) ? parsed?.sessions : parsed;
  if (!Array.isArray(list)) throw new Error('invalid log');
  return list;
}

export function readSouvenirEvidence(storage) {
  const result = { focus: [], playback: [], letters: [], journal: [], errors: [] };
  for (const [name, label, read] of [
    ['focus', '专注完成日志', () => sourceArray(storage, SESSION_LOG_KEY, true)],
    ['playback', '已确认播放日志', () => sourceArray(storage, PLAYBACK_LOG_KEY)],
    ['letters', '信箱', () => sourceArray(storage, LETTERS_KEY)],
    ['journal', '手记', () => { if (!storage?.getItem) throw storageError(); return readJournalRecords(storage); }]
  ]) {
    try { result[name] = read(); }
    catch { result.errors.push(`${label}暂时无法读取，相关纪念物稍后重试；已有纪念物保留。`); }
  }
  return result;
}

// earnedAt means the supporting log time, not the time this screen was opened.
// Playback can only date the threshold to a confirmed segment's end.
export function eligibleSouvenirs({ focus = [], playback = [], letters = [], journal = [] } = {}, now = Date.now()) {
  if (!timestamp(now)) throw new Error('纪念物需要有效的本机时间。');
  const records = [];
  const award = (id, at, evidence) => records.push({ id, earnedAt: at, earnedOn: dayKey(at), evidence });
  const firstFocus = focus.filter(record => record?.completed === true).map(normalizeSessionRecord)
    .filter(record => record && timestamp(record.start) && timestamp(record.end) && record.end <= now && record.durationMs > 0)
    .sort((a, b) => a.end - b.end || a.id.localeCompare(b.id))[0];
  if (firstFocus) award('first-focus', firstFocus.end, { sessionId: firstFocus.id, durationMs: firstFocus.durationMs });

  // Checkpoints with the same id replace each other, rather than accumulating.
  const byId = new Map();
  for (const raw of playback) {
    const record = readPlaybackSessions({ getItem: () => JSON.stringify([raw]) })[0];
    if (!record || !timestamp(record.start) || !timestamp(record.end) || record.end > now) continue;
    const old = byId.get(record.id);
    if (!old || record.durationMs > old.durationMs || (record.durationMs === old.durationMs && record.end < old.end)) byId.set(record.id, record);
  }
  const segments = [...byId.values()].sort((a, b) => a.start - b.start || b.durationMs - a.durationMs || a.end - b.end);
  let verifiedMs = 0, count = 0, coveredUntil = 0;
  for (const record of segments) {
    // Overlapping windows cannot count the same wall-clock span twice. With no
    // per-sample positions in the log, count only its unoccupied span.
    const credit = Math.min(record.durationMs, Math.max(0, record.end - Math.max(record.start, coveredUntil)));
    coveredUntil = Math.max(coveredUntil, record.end);
    if (credit <= 0) continue;
    verifiedMs += credit; count++;
    if (verifiedMs >= TEN_MINUTES) {
      award('listening-ten', record.end, { verifiedMs, segments: count });
      break;
    }
  }

  const firstLetter = letters.filter(record => record?.direction === 'out' && record.status === 'sent').map(normalizeLetter)
    .filter(record => record && timestamp(record.at) && record.at <= now)
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))[0];
  if (firstLetter) award('first-letter', firstLetter.at, { letterId: firstLetter.id });

  // Creation dates, not updatedAt: editing tags, restoring or moving to trash
  // cannot manufacture extra writing days. Retained trash still records writing.
  const pages = new Map();
  for (const raw of journal) {
    const entry = normalizeJournalRecord(raw);
    if (!entry || entry.updatedAt > now || !timestamp(entry.createdAt)) continue;
    const old = pages.get(entry.id);
    if (!old || entry.updatedAt > old.updatedAt) pages.set(entry.id, entry);
  }
  const days = new Map();
  for (const entry of [...pages.values()].sort((a, b) => a.createdAt - b.createdAt)) {
    if (!entry.body.trim() && !entry.revisions.some(revision => revision.body.trim())) continue;
    const day = dayKey(entry.createdAt);
    if (!days.has(day)) days.set(day, entry.createdAt);
  }
  if (days.size >= 3) {
    const firstThree = [...days.entries()].slice(0, 3);
    award('journal-three-days', firstThree[2][1], { days: firstThree.map(([day]) => day) });
  }
  return normalizeSouvenirs({ version: 1, records });
}

export function syncSouvenirs({ storage, previous = empty(), now = Date.now(), target } = {}) {
  let saved;
  try { saved = readSouvenirs(storage); }
  catch (error) { return { ok: false, state: normalizeSouvenirs(previous), savedIds: [], error: error.message }; }
  const evidence = readSouvenirEvidence(storage);
  const state = mergeSouvenirs(previous, saved, eligibleSouvenirs(evidence, now));
  const result = saveSouvenirs({ storage, state, target });
  return { ...result, ok: result.ok && !evidence.errors.length, error: [result.error, ...evidence.errors].filter(Boolean).join(' ') };
}

export function souvenirReason(record) {
  const value = normalizeSouvenirRecord(record);
  if (!value) return '';
  const e = value.evidence;
  if (value.id === 'first-focus') return `完成第一轮专注，完成日志记录了 ${Math.round(e.durationMs / 6000) / 10} 分钟。`;
  if (value.id === 'listening-ten') return `去重后的 ${e.segments} 段已确认播放累计 ${Math.floor(e.verifiedMs / 6000) / 10} 分钟，达到 10 分钟。专注时长不计入。`;
  if (value.id === 'first-letter') return '信箱中第一封写给小屋的信已寄出；草稿和寄送中的信不计入。';
  return `有正文的手记创建于 ${e.days.join('、')}，共 3 个本地日期，无须连续。`;
}
