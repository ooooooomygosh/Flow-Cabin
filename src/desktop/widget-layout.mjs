// Desktop widget positions, stored as fractions of the room so a layout made
// on a laptop still makes sense on a 4K monitor. Pure helpers for tests.
export const WIDGET_KEY = 'album-circle-desktop-widgets-v1';
export const WIDGET_IDS = ['clock', 'music', 'focus', 'todo'];
// Until the user drags a card the layout follows the scene, keeping the cards
// off what each scene is about (the record shelf, the window, the desk).
// x stays ≤ .77 so a 220-px card still fits a 960-px window.
// The base suits scenes with a free right wall (forest lamp, seaside window,
// starlight's star chart): the round and the list stack there.
const BASE = { clock: { x: .025, y: .04 }, music: { x: .025, y: .72 }, focus: { x: .77, y: .06 }, todo: { x: .77, y: .5 } };
// The fireplace (pixel, warm) and the deep shelf (night-study) fill the lower
// right, so the list moves to the left wall between the clock and the music.
const LEFT_LIST = { todo: { x: .025, y: .42 } };
export const SCENE_WIDGETS = Object.freeze({ pixel: LEFT_LIST, warm: LEFT_LIST, 'night-study': LEFT_LIST });
export const defaultWidgetLayout = (look) => Object.fromEntries(WIDGET_IDS.map((id) => [id, { ...(SCENE_WIDGETS[look]?.[id] || BASE[id]) }]));
const fraction = (value, fallback) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(.98, Number(value))) : fallback;
export function clampWidget(position, width = .2, height = .15) {
  return { x: Math.max(0, Math.min(1 - Math.min(width, 1), fraction(position?.x, 0))), y: Math.max(0, Math.min(1 - Math.min(height, 1), fraction(position?.y, 0))) };
}
export function normalizeWidgetLayout(value, look) {
  const base = defaultWidgetLayout(look), raw = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(WIDGET_IDS.map((id) => [id, { x: fraction(raw[id]?.x, base[id].x), y: fraction(raw[id]?.y, base[id].y) }]));
}
export function readWidgetLayout(storage = globalThis.localStorage, look) { try { return normalizeWidgetLayout(JSON.parse(storage.getItem(WIDGET_KEY)), look); } catch { return defaultWidgetLayout(look); } }
// The layout the user arranged, or null while the cards still follow the scene.
export function readSavedWidgetLayout(storage = globalThis.localStorage) { try { const raw = JSON.parse(storage.getItem(WIDGET_KEY)); return raw && typeof raw === 'object' ? normalizeWidgetLayout(raw) : null; } catch { return null; } }
export function writeWidgetLayout(layout, storage = globalThis.localStorage) { try { storage.setItem(WIDGET_KEY, JSON.stringify(normalizeWidgetLayout(layout))); } catch {} }
// 整理小组件: forget the arrangement, so the cards follow the scene again.
export function clearWidgetLayout(storage = globalThis.localStorage) { try { storage.removeItem(WIDGET_KEY); } catch {} }
