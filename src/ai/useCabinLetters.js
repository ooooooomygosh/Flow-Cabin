// 小屋来信 state shared by the journal, the 信箱 entry and 设置 › AI（Beta）.
import { useEffect, useState } from 'react';
import { readAi, readLetters, saveLetter, markRead, unreadCount, needsLetter, letterPeriod, letterSummary, letterMessages, cleanLetter, aiReady, AI_EVENT, LETTER_EVENT, TRY_KEY } from './ai-model.mjs';
import { chat, keyState, AI_KEY_EVENT } from './ai-transport.mjs';
import { readCatMood } from '../focus/stats/cat-mood-source.mjs';

const store = () => globalThis.localStorage;
const emit = () => globalThis.dispatchEvent?.(new CustomEvent(LETTER_EVENT));
export function useAiSettings() {
  const read = () => ({ settings: readAi(store()), key: keyState() });
  const [value, setValue] = useState(read);
  useEffect(() => {
    const on = () => setValue(read());
    for (const e of [AI_EVENT, AI_KEY_EVENT, 'storage']) window.addEventListener(e, on);
    return () => { for (const e of [AI_EVENT, AI_KEY_EVENT, 'storage']) window.removeEventListener(e, on); };
  }, []);
  return value;
}
export function useLetters() {
  const [list, setList] = useState(() => readLetters(store()));
  useEffect(() => {
    const on = () => setList(readLetters(store()));
    window.addEventListener(LETTER_EVENT, on); window.addEventListener('storage', on);
    return () => { window.removeEventListener(LETTER_EVENT, on); window.removeEventListener('storage', on); };
  }, []);
  return { list, unread: unreadCount(list), markRead: (id) => { markRead(store(), id); emit(); } };
}

let inflight = null;
// Writes this period's letter once. Returns the saved letter, or null (AI off / failed → template).
export async function deliverLetter({ sessions, now = Date.now(), force = false, chatImpl = chat } = {}) {
  const settings = readAi(store()), key = keyState();
  if (!aiReady(settings, key.stored)) return null;
  const period = letterPeriod(now, settings.cadence);
  let lastTry = null; try { lastTry = JSON.parse(store().getItem(TRY_KEY) || 'null'); } catch { /* ignore */ }
  if (!force && !needsLetter(readLetters(store()), period, lastTry, now)) return null;
  if (inflight) return inflight;
  inflight = (async () => {
    try { store().setItem(TRY_KEY, JSON.stringify({ id: period.id, at: now })); } catch { /* ignore */ }
    const mood = (() => { try { return readCatMood(store(), period.from, period.to); } catch { return null; } })();
    const summary = letterSummary(sessions, period, mood);
    const result = await chatImpl(settings, letterMessages(summary, settings.tone));
    const lines = result.ok ? cleanLetter(result.text) : [];
    if (!lines.length) return null;
    const letter = { id: period.id, cadence: settings.cadence, tone: settings.tone, period: period.label, lines, source: 'ai', at: now, read: false };
    saveLetter(store(), letter); emit();
    return letter;
  })().finally(() => { inflight = null; });
  return inflight;
}
// Mounted with the journal (always present while focus is on): checks on load, on settings
// changes and every 30 minutes.
export function useLetterDelivery(sessions) {
  const { settings, key } = useAiSettings();
  useEffect(() => {
    if (!aiReady(settings, key.stored)) return undefined;
    const run = () => { deliverLetter({ sessions }).catch(() => {}); };
    const first = setTimeout(run, 1500), timer = setInterval(run, 30 * 60000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [settings.enabled, settings.baseUrl, settings.model, settings.cadence, key.stored, sessions?.length]);
}
