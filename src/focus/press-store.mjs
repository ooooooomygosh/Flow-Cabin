// 压制唱片: the one pending end-of-round card per window. A finished round (≥ 5 minutes, ran its
// course) arrives as `cabin:focus-session`; exactly one host shows it — 沉浸 when open, else the
// focus panel's 「这一段」, else a small card over the cabin. Interrupted or short rounds never
// produce a card (and no failure message either).
import { SESSION_EVENT, setSessionNote, normalizeSessionNote } from './session-log.mjs';
import { isPressed } from './stats/record-diary.mjs';

const PRIORITY = { display: 2, dock: 1 };
export function createPressStore({ target = globalThis.window, save = setSessionNote } = {}) {
  let record = null, draft = '', hosts = [], snapshot = { record: null, host: '' }, installed = false, error = '';
  const listeners = new Set();
  const host = () => hosts.slice().sort((a, b) => PRIORITY[b.kind] - PRIORITY[a.kind])[0]?.kind || '';
  const emit = () => { snapshot = { record, host: host(), error }; for (const cb of [...listeners]) cb(); };
  const offer = (value) => {
    if (!isPressed(value) || !value?.id) return false;
    if (record && record.id !== value.id) keep();
    record = value; draft = ''; error = ''; emit(); return true;
  };
  // Saves the note (if any) and puts the record away. Returns false when the note could not be written.
  function keep() {
    if (!record) return true;
    const note = normalizeSessionNote(draft);
    if (note) { const saved = save(record.id, note, { target }); if (!saved?.ok) { error = saved?.error || '这句话没能保存。'; emit(); return false; } }
    record = null; draft = ''; error = ''; emit(); return true;
  }
  const install = () => {
    if (installed || !target?.addEventListener) return; installed = true;
    target.addEventListener(SESSION_EVENT, (event) => offer(event.detail));
    // A new round started anywhere (shortcut, tray, 自动开始): the card is put away with what was typed.
    target.addEventListener('album-focus-start', () => keep());
  };
  return {
    subscribe(cb) { install(); listeners.add(cb); return () => listeners.delete(cb); },
    get: () => snapshot, offer, keep,
    draft: () => draft, setDraft(value) { draft = typeof value === 'string' ? value : ''; if (error) { error = ''; emit(); } },
    claim(kind) { const entry = { kind }; hosts = [...hosts, entry]; emit(); return () => { hosts = hosts.filter((item) => item !== entry); emit(); }; }
  };
}
let store = null;
export const pressStore = () => (store ||= createPressStore());
