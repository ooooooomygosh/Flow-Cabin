// Toast queue: messages stack instead of replacing each other, errors stay longer,
// an action (撤销) keeps the toast up long enough to be reached.
export const MAX_VISIBLE = 3;
export const durationFor = ({ tone = '', action } = {}) => tone === 'error' ? 6000 : action ? 6000 : 3200;
let next = 0;
export function addToast(list, text, { tone = '', action = null, at = Date.now() } = {}) {
  const message = String(text || '').trim();
  if (!message) return list;
  // The same message twice in a row only refreshes the existing toast.
  const same = list.find(t => t.text === message && t.tone === tone && !t.action && !action);
  if (same) return list.map(t => t === same ? { ...t, at, duration: durationFor({ tone }) } : t);
  const toast = { id: `toast-${++next}`, text: message, tone, at, duration: durationFor({ tone, action }), action: action && typeof action.run === 'function' ? { label: String(action.label || '撤销'), run: action.run } : null };
  // Oldest non-error toasts leave first when the stack is full.
  const kept = [...list, toast];
  while (kept.length > MAX_VISIBLE) { const index = kept.findIndex(t => t.tone !== 'error'); kept.splice(index >= 0 ? index : 0, 1); }
  return kept;
}
export const removeToast = (list, id) => list.filter(t => t.id !== id);
