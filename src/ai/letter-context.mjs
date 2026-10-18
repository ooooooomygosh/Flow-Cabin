import { addDays, startOfDay } from '../lib/local-calendar.mjs';
import { letterSummary } from './ai-model.mjs';

const DAY = 86400000;

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
  includeNotes = false, shareContext = true, weather = null, now = Date.now(), days = 7
} = {}) {
  if (!shareContext) return null;
  return letterSummary(sessions, recentLetterPeriod(now, days), mood, {
    playbackSessions, weather: weather || ambienceSnapshot(undefined, now),
    includeNotes, notes
  });
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
