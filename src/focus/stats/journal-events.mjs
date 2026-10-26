// Hook point for the 唱片日记 overlay (formerly 小屋日记).
// window.dispatchEvent(new CustomEvent('cabin:open-journal', { detail: { tab: 'week' } }))
export const JOURNAL_EVENT = 'cabin:open-journal';
// 3.0: 这一周 (default) · 本周合集 · 一年唱片墙 · 手记 · 统计 · 信箱 (信箱 only with the 小屋来信 lab).
export const JOURNAL_TABS = Object.freeze([['week', '这一周'], ['collection', '本周合集'], ['wall', '唱片墙'], ['entries', '手记'], ['stats', '统计'], ['letters', '信箱']]);
// Tabs other entries (or older versions) still ask for.
export const JOURNAL_ALIASES = Object.freeze({ overview: 'week', weekly: 'collection', tasks: 'stats', heatmap: 'wall' });
export const journalTab = (tab) => { const id = JOURNAL_ALIASES[tab] || tab; return JOURNAL_TABS.some(([value]) => value === id) ? id : 'week'; };
export const isJournalKey = (e) => (e.key === 'l' || e.key === 'L') && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && !e.repeat && !e.defaultPrevented;
export function openJournal(tab, target = globalThis.window) { target?.dispatchEvent(new CustomEvent(JOURNAL_EVENT, { detail: tab ? { tab: journalTab(tab) } : {} })); }
