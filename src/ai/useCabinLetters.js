// 小屋来信 state shared by the journal, the 信箱 entry and 设置 › AI（Beta）.
import { useEffect, useState } from 'react';
import { readAi, readLetters, markRead, unreadCount, AI_EVENT, LETTER_EVENT } from './ai-model.mjs';
import { keyState, AI_KEY_EVENT } from './ai-transport.mjs';
import { deliverLetter } from './letter-delivery.mjs';
import {
  mailboxRows, pageSlice, readLetterDraft, saveLetterDraft, clearLetterDraft, sendCabinLetter, recoverCabinLetter
} from './letter-reply.mjs';
export { deliverLetter } from './letter-delivery.mjs';

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
  return {
    list,
    unread: unreadCount(list),
    draft: readLetterDraft(store()),
    rows: (filter = 'all') => mailboxRows(list, filter),
    page: (rows, page, size) => pageSlice(rows, page, size),
    markRead: (id) => { markRead(store(), id); emit(); },
    saveDraft: (value) => saveLetterDraft(store(), value),
    clearDraft: () => clearLetterDraft(store()),
    send: (value) => sendCabinLetter({ storage: store(), ...value }),
    recover: (id) => recoverCabinLetter({ storage: store(), id })
  };
}

// Mounted with the journal (always present while focus is on): checks on load,
// on settings changes and every 30 minutes. AI is optional; the local letter
// still has a chance to arrive when the endpoint is off or unavailable.
export function useLetterDelivery(sessions, notes = '') {
  const { settings, key } = useAiSettings();
  useEffect(() => {
    const run = () => { deliverLetter({ sessions, notes }).catch(() => {}); };
    const first = setTimeout(run, 1500), timer = setInterval(run, 30 * 60000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [settings.enabled, settings.shareNotes, settings.cadence, settings.tone, key.stored, sessions?.length, notes]);
}
