import { readAi, readLetters, readLetterRecords, trySaveLetter, needsLetter, letterPeriod, letterSummary, letterMessages, cleanLetter, templateLetter, aiReady, chatUrl, AI_EVENT, LETTER_EVENT, AI_SETTINGS_KEY, AI_KEY_KEY, TRY_KEY } from './ai-model.mjs';
import { chat, keyState, AI_KEY_EVENT } from './ai-transport.mjs';
import { readCatMood } from '../focus/stats/cat-mood-source.mjs';
import { readPlaybackSessions } from '../player/playback-log.mjs';
import { ambienceSnapshot, hasLetterFacts } from './letter-context.mjs';

let inflight = null;
// Writes this period's letter once. AI is tried first when connected; an
// evidence-based local letter is saved when AI is off, fails, or returns empty.
export async function deliverLetter({ sessions, notes = '', now = Date.now(), force = false, chatImpl = chat, win = globalThis } = {}) {
  const settings = readAi(win.localStorage), key = keyState(win);
  const period = letterPeriod(now, settings.cadence);
  try {
    if (readLetterRecords(win.localStorage).some((letter) => letter.id === period.id && letter.purgedAt != null)) return null;
  } catch { return null; }
  let lastTry = null; try { lastTry = JSON.parse(win.localStorage.getItem(TRY_KEY) || 'null'); } catch { /* ignore */ }
  if (!force && !needsLetter(readLetters(win.localStorage), period, lastTry, now)) return null;
  if (inflight) return inflight;
  let stale = false;
  const invalidate = () => { stale = true; };
  const storageChanged = (event) => {
    if (event.storageArea && event.storageArea !== win.localStorage) return;
    if (event.key === null || [AI_SETTINGS_KEY, AI_KEY_KEY].includes(event.key)) invalidate();
  };
  for (const event of [AI_EVENT, AI_KEY_EVENT, 'pagehide']) win.addEventListener?.(event, invalidate);
  win.addEventListener?.('storage', storageChanged);
  inflight = (async () => {
    const mood = (() => { try { return readCatMood(win.localStorage, period.from, period.to); } catch { return null; } })();
    const summary = letterSummary(sessions, period, mood, {
      playbackSessions: readPlaybackSessions(win.localStorage),
      weather: ambienceSnapshot(win.document, now),
      includeNotes: settings.shareNotes && Boolean(notes),
      notes
    });
    if (!force && !hasLetterFacts(summary)) return null;
    const ready = aiReady(settings, key.stored) && key.endpoint === chatUrl(settings.baseUrl);
    let result = null;
    if (ready) {
      try { win.localStorage.setItem(TRY_KEY, JSON.stringify({ id: period.id, at: now })); } catch { /* ignore */ }
      try { result = await chatImpl(settings, letterMessages(summary, settings.tone)); }
      catch { result = null; }
      if (stale || JSON.stringify(readAi(win.localStorage)) !== JSON.stringify(settings) || keyState(win).revision !== key.revision) return null;
    }
    const aiLines = result?.ok ? cleanLetter(result.text) : [];
    const lines = aiLines.length ? aiLines : templateLetter(summary);
    if (!lines.length) return null;
    const letter = {
      id: period.id, direction: 'in', status: 'delivered',
      cadence: settings.cadence, tone: settings.tone, period: period.label,
      subject: `${period.label}的小屋来信`, lines, source: aiLines.length ? 'ai' : 'template',
      at: now, read: false, ...(summary.evidence?.length ? { evidence: summary.evidence } : {})
    };
    const saved = trySaveLetter(win.localStorage, letter);
    if (!saved.ok) return null;
    win.dispatchEvent?.(new CustomEvent(LETTER_EVENT));
    return letter;
  })().finally(() => {
    inflight = null;
    for (const event of [AI_EVENT, AI_KEY_EVENT, 'pagehide']) win.removeEventListener?.(event, invalidate);
    win.removeEventListener?.('storage', storageChanged);
  });
  return inflight;
}
