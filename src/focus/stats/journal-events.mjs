// Hook point for the 小屋日记 overlay.
// window.dispatchEvent(new CustomEvent('cabin:open-journal', { detail: { tab: 'weekly' } }))
export const JOURNAL_EVENT = 'cabin:open-journal';
export const JOURNAL_TABS = Object.freeze([['overview', '概览'], ['tasks', '待办'], ['weekly', '周报'], ['letters', '信箱']]);
export const journalTab = (tab) => JOURNAL_TABS.some(([id]) => id === tab) ? tab : 'overview';
export const isJournalKey = (e) => (e.key === 'l' || e.key === 'L') && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && !e.repeat && !e.defaultPrevented;
export function openJournal(tab, target = globalThis.window) { target?.dispatchEvent(new CustomEvent(JOURNAL_EVENT, { detail: tab ? { tab: journalTab(tab) } : {} })); }
