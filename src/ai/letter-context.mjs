import { addDays, startOfDay } from '../lib/local-calendar.mjs';
import { letterSummary } from './ai-model.mjs';

const DAY = 86400000;
export const LETTER_JOURNAL_LIMIT = 3;
export const LETTER_JOURNAL_CHARS = 240;

export function journalExcerpt(entry) {
  if (!entry || entry.deletedAt != null || typeof entry.body !== 'string' || !entry.body.trim()) return null;
  return {
    id: entry.id, version: entry.version, createdAt: entry.createdAt,
    excerpt: entry.body.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, LETTER_JOURNAL_CHARS)
  };
}

export function journalSelectionCurrent(selected, entries) {
  return selected.length <= LETTER_JOURNAL_LIMIT && selected.every((item) => {
    const current = journalExcerpt(entries.find((entry) => entry.id === item.id));
    return current && current.version === item.version && current.excerpt === item.excerpt;
  });
}

// A quieter window for letters the user writes by hand. Automatic letters keep
// their daily / weekly period; both feed the same evidence contract.
export function recentLetterPeriod(now = Date.now(), days = 7) {
  const count = Math.max(1, Math.min(31, Math.round(days) || 7));
  return {
    id: `recent:${count}:${Math.floor(now / DAY)}`,
    from: addDays(startOfDay(now), -(count - 1)),
    to: now,
    label: count === 1 ? '今天' : `最近 ${count} 天`
  };
}

export function ambienceSnapshot(doc = globalThis.document, now = Date.now()) {
  const room = doc?.querySelector?.('.room-scene');
  const kind = room?.dataset?.weather;
  if (!kind) return null;
  return {
    kind,
    bucket: room?.dataset?.timeOfDay || '',
    source: room?.dataset?.weatherSource === 'real' ? 'real' : 'manual',
    at: now
  };
}

export function buildLetterContext({
  sessions = [], playbackSessions = [], mood = null, notes = '',
  includeNotes = false, shareContext = true, weather = null, now = Date.now(), days = 7, selectedJournal = []
} = {}) {
  if (!shareContext) return null;
  const summary = letterSummary(sessions, recentLetterPeriod(now, days), mood, {
    playbackSessions, weather: weather || ambienceSnapshot(undefined, now),
    includeNotes, notes
  });
  const excerpts = selectedJournal.slice(0, LETTER_JOURNAL_LIMIT)
    .filter((item) => typeof item?.excerpt === 'string' && item.excerpt.trim())
    .map((item) => ({ excerpt: item.excerpt.slice(0, LETTER_JOURNAL_CHARS) }));
  if (excerpts.length) {
    summary.journal = excerpts;
    summary.evidence.push({ kind: 'note', text: `本次选择了 ${excerpts.length} 页手记摘录 · 共 ${excerpts.reduce((n, item) => n + item.excerpt.length, 0)} 字` });
  }
  return summary;
}

// Weather alone is not enough reason to put an unread letter in the inbox.
export function hasLetterFacts(summary) {
  return Boolean(summary && (
    summary.focusMinutes > 0
    || summary.listening?.minutes > 0
    || summary.cat?.feeds > 0
    || summary.note?.chars > 0
  ));
}
