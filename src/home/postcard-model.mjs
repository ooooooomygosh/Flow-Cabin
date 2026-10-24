// 小屋明信片: what text may go on the card. Each item says exactly what it
// would print, so the person decides line by line before anything leaves the
// cabin. Private items (task text, note excerpt, place) start unchecked.

export const POSTCARD_ITEMS = Object.freeze([
  { id: 'signature', label: '房间、伙伴和日期', private: false },
  { id: 'achievement', label: '完成数量', private: false },
  { id: 'tasks', label: '任务文字', private: true },
  { id: 'note', label: '随手记摘录', private: true },
  { id: 'place', label: '地区和天气', private: true }
]);
export const DEFAULT_INCLUDE = Object.freeze(Object.fromEntries(POSTCARD_ITEMS.map((item) => [item.id, !item.private])));
const MAX_LINES = 5;

// input: { theme, pet, date, tasks: [{ text, done }], notes, weather: { on, city, temperature } }
// → [{ id, label, private, text, available }]; `text` is '' when there is nothing to print.
export function postcardItems(input = {}) {
  const { theme = '小屋', pet = '', date = new Date(), tasks = [], notes = '', weather = {} } = input;
  const done = tasks.filter((task) => task?.done).length;
  const texts = {
    signature: [theme, pet, new Date(date).toLocaleDateString('zh-CN')].filter(Boolean).join(' · '),
    achievement: tasks.length ? `已完成 ${done} 项小事` : '',
    tasks: tasks.length ? '今日任务：' + tasks.slice(0, 3).map((task) => `${task.done ? '✓ ' : ''}${String(task.text || '').trim()}`).filter((line) => line.trim()).join(' · ') : '',
    note: String(notes || '').replace(/\s+/g, ' ').trim().slice(0, 100),
    place: weather.on && Number.isFinite(weather.temperature) ? `${weather.city || '附近'} · ${Math.round(weather.temperature)}°` : ''
  };
  return POSTCARD_ITEMS.map((item) => ({ ...item, text: texts[item.id], available: Boolean(texts[item.id]) }));
}

// The lines that will be drawn, in item order: only checked items with text.
export function postcardLines(items, include = DEFAULT_INCLUDE) {
  return items.filter((item) => include[item.id] && item.available).map((item) => item.text).slice(0, MAX_LINES);
}

// The caption is the one free-text line; keep it short and single-line.
export const cleanCaption = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
