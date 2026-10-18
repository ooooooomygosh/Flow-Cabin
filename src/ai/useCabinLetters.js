// 小屋来信 state shared by the journal, the 信箱 entry and 设置 › AI（Beta）.
import { useEffect, useState } from 'react';
import { readAi, readLetters, markRead, unreadCount, aiReady, AI_EVENT, LETTER_EVENT } from './ai-model.mjs';
import { keyState, AI_KEY_EVENT } from './ai-transport.mjs';
import { deliverLetter } from './letter-delivery.mjs';
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
  return { list, unread: unreadCount(list), markRead: (id) => { markRead(store(), id); emit(); } };
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
