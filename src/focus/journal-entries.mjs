import { dayKey } from '../lib/local-calendar.mjs';

export const JOURNAL_KEY = 'flow-cabin-journal-v1';
export const JOURNAL_CHANGE = 'cabin:journal-entries';
export const JOURNAL_BODY_LIMIT = 8000;
export const JOURNAL_BYTES_LIMIT = 4 * 1024 * 1024;
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const date = (value) => Number.isFinite(value) && value >= 0 && value <= 8640000000000000;
const validText = (value) => typeof value === 'string' && value.length <= JOURNAL_BODY_LIMIT;
export const journalTags = (value) => [...new Set((Array.isArray(value) ? value : String(value || '').split(/[,，#\s]+/))
  .filter((tag) => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean))].slice(0, 8).map((tag) => tag.slice(0, 24));
const snapshot = (entry) => ({ version: entry.version, body: entry.body, tags: entry.tags, at: entry.updatedAt });

export function normalizeJournalRecord(value) {
  if (!value || typeof value.id !== 'string' || !value.id || value.id.length > 100
    || typeof value.version !== 'string' || !value.version || !validText(value.body)
    || !date(value.createdAt) || !date(value.updatedAt) || value.updatedAt < value.createdAt
    || !Array.isArray(value.revisions) || (value.deletedAt != null && !date(value.deletedAt))) return null;
  const revisions = [];
  for (const item of value.revisions) {
    if (!item || typeof item.version !== 'string' || !item.version || !validText(item.body) || !date(item.at)) return null;
    revisions.push({ version: item.version, body: item.body, tags: journalTags(item.tags), at: item.at });
  }
  return {
    id: value.id, version: value.version, body: value.body, tags: journalTags(value.tags),
    createdAt: value.createdAt, updatedAt: value.updatedAt, revisions,
    ...(value.deletedAt != null ? { deletedAt: value.deletedAt } : {}),
    ...(value.origin === 'scratch' ? { origin: 'scratch' } : {})
  };
}

export function readJournalRecords(storage) {
  const raw = storage?.getItem(JOURNAL_KEY);
  if (!raw) return [];
  let value;
  try { value = JSON.parse(raw); }
  catch { throw new Error('手记数据无法读取，请保留原数据并检查备份。'); }
  if (!Array.isArray(value)) throw new Error('手记数据无法读取，请保留原数据并检查备份。');
  const entries = value.map(normalizeJournalRecord);
  if (entries.some((entry) => !entry) || new Set(entries.map((entry) => entry.id)).size !== entries.length)
    throw new Error('手记数据格式异常，已停止写入以保护原文。');
  return entries.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
}

function write(storage, records, target) {
  const raw = JSON.stringify(records);
  if (new TextEncoder().encode(raw).byteLength > JOURNAL_BYTES_LIMIT)
    throw new Error('手记空间已满，原有内容没有被清理。请先导出备份。');
  storage.setItem(JOURNAL_KEY, raw);
  target?.dispatchEvent?.(new Event(JOURNAL_CHANGE));
}
const failure = (error) => ({ ok: false, error: /^手记/.test(error?.message || '') ? error.message : '手记没有保存，文字仍留在这里。请检查本机存储后重试，或复制原文。' });
const conflict = () => ({ ok: false, conflict: true, error: '这页在另一窗口被修改了。你的文字还在，可以另存为新的一页。' });

export function saveJournalEntry({ storage, id, expectedVersion, body, tags = [], checkpoint = true, now = Date.now(), target = globalThis.window, origin } = {}) {
  if (!validText(body)) return { ok: false, error: `每页最多 ${JOURNAL_BODY_LIMIT} 字，原文没有被截断。` };
  const rawTags = (Array.isArray(tags) ? tags : String(tags).split(/[,，#\s]+/)).filter((tag) => typeof tag === 'string' && tag.trim());
  if (new Set(rawTags.map((tag) => tag.trim())).size > 8 || rawTags.some((tag) => tag.trim().length > 24))
    return { ok: false, error: '最多 8 个标签，每个最多 24 字。请调整标签后重试保存。' };
  try {
    const entries = readJournalRecords(storage), previous = id ? entries.find((entry) => entry.id === id) : null;
    if (id && (!previous || previous.version !== expectedVersion || previous.deletedAt != null)) return conflict();
    const nextTags = journalTags(tags);
    if (previous && previous.body === body && JSON.stringify(previous.tags) === JSON.stringify(nextTags)) return { ok: true, entry: previous };
    const entry = {
      id: previous?.id || uid(), version: uid(), body, tags: nextTags,
      createdAt: previous?.createdAt ?? now, updatedAt: previous ? Math.max(now, previous.updatedAt + 1) : now,
      revisions: previous ? [...previous.revisions, ...(checkpoint ? [snapshot(previous)] : [])] : [],
      ...(previous?.origin === 'scratch' || origin === 'scratch' ? { origin: 'scratch' } : {})
    };
    write(storage, [entry, ...entries.filter((item) => item.id !== entry.id)], target);
    return { ok: true, entry };
  } catch (error) { return failure(error); }
}

export function archiveScratch({ storage, body, now = Date.now(), target = globalThis.window } = {}) {
  if (!body?.trim()) return { ok: false, error: '先写下几句话，再收进日记。' };
  try {
    const found = readJournalRecords(storage).find((entry) => entry.origin === 'scratch' && entry.deletedAt == null
      && entry.body === body && dayKey(entry.createdAt) === dayKey(now));
    if (found) return { ok: true, entry: found };
    return saveJournalEntry({ storage, body, origin: 'scratch', now, target });
  } catch (error) { return failure(error); }
}

export function moveJournalEntry({ storage, id, expectedVersion, trash, now = Date.now(), target = globalThis.window } = {}) {
  try {
    const entries = readJournalRecords(storage), previous = entries.find((entry) => entry.id === id);
    if (!previous || previous.version !== expectedVersion) return conflict();
    const entry = { ...previous, version: uid(), updatedAt: Math.max(now, previous.updatedAt + 1) };
    if (trash) entry.deletedAt = entry.updatedAt;
    else delete entry.deletedAt;
    write(storage, entries.map((item) => item.id === id ? entry : item), target);
    return { ok: true, entry };
  } catch (error) { return failure(error); }
}

export function restoreJournalRevision({ storage, id, expectedVersion, revision, now = Date.now(), target = globalThis.window } = {}) {
  try {
    const entry = readJournalRecords(storage).find((item) => item.id === id);
    const old = entry?.revisions.find((item) => item.version === revision);
    if (!old) return { ok: false, error: '找不到这个历史版本。' };
    return saveJournalEntry({ storage, id, expectedVersion, body: old.body, tags: old.tags, checkpoint: true, now, target });
  } catch (error) { return failure(error); }
}

export function findJournalEntries(entries, { query = '', tag = '', trash = false } = {}) {
  const term = query.trim().toLocaleLowerCase();
  return entries.filter((entry) => (entry.deletedAt != null) === trash && (!tag || entry.tags.includes(tag))
    && (!term || `${entry.body}\n${entry.tags.join(' ')}`.toLocaleLowerCase().includes(term)));
}

// Backups preserve both edits when histories diverge; newer trash state wins.
export function mergeJournalRecord(local, incoming) {
  const sameTime = local.updatedAt === incoming.updatedAt;
  const localWinsTie = (local.deletedAt != null) !== (incoming.deletedAt != null) ? local.deletedAt != null : local.version > incoming.version;
  const newer = local.updatedAt > incoming.updatedAt || (sameTime && localWinsTie) ? local : incoming;
  const older = newer === local ? incoming : local;
  const history = new Map([...local.revisions, ...incoming.revisions].map((item) => [item.version, item]));
  if (older.version !== newer.version && (older.body !== newer.body || JSON.stringify(older.tags) !== JSON.stringify(newer.tags))) history.set(older.version, snapshot(older));
  history.delete(newer.version);
  return { ...newer, revisions: [...history.values()].sort((a, b) => a.at - b.at || a.version.localeCompare(b.version)) };
}
