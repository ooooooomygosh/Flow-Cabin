import { readAi, readLetters, saveLetter, needsLetter, letterPeriod, letterSummary, letterMessages, cleanLetter, aiReady, chatUrl, AI_EVENT, LETTER_EVENT, AI_SETTINGS_KEY, AI_KEY_KEY, TRY_KEY } from './ai-model.mjs';
import { chat, keyState, AI_KEY_EVENT } from './ai-transport.mjs';
import { readCatMood } from '../focus/stats/cat-mood-source.mjs';

let inflight = null;
// Writes this period's letter once. Returns the saved letter, or null (AI off / failed → template).
export async function deliverLetter({ sessions, now = Date.now(), force = false, chatImpl = chat, win = globalThis } = {}) {
  const settings = readAi(win.localStorage), key = keyState(win);
  if (!aiReady(settings, key.stored) || key.endpoint !== chatUrl(settings.baseUrl)) return null;
  const period = letterPeriod(now, settings.cadence);
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
    try { win.localStorage.setItem(TRY_KEY, JSON.stringify({ id: period.id, at: now })); } catch { /* ignore */ }
    const mood = (() => { try { return readCatMood(win.localStorage, period.from, period.to); } catch { return null; } })();
    const summary = letterSummary(sessions, period, mood);
    const result = await chatImpl(settings, letterMessages(summary, settings.tone));
    if (stale || JSON.stringify(readAi(win.localStorage)) !== JSON.stringify(settings) || keyState(win).revision !== key.revision) return null;
    const lines = result.ok ? cleanLetter(result.text) : [];
    if (!lines.length) return null;
    const letter = { id: period.id, cadence: settings.cadence, tone: settings.tone, period: period.label, lines, source: 'ai', at: now, read: false };
    saveLetter(win.localStorage, letter); win.dispatchEvent?.(new CustomEvent(LETTER_EVENT));
    return letter;
  })().finally(() => {
    inflight = null;
    for (const event of [AI_EVENT, AI_KEY_EVENT, 'pagehide']) win.removeEventListener?.(event, invalidate);
    win.removeEventListener?.('storage', storageChanged);
  });
  return inflight;
}
