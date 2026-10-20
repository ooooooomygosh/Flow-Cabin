// 专注画面 preferences: which face shows the clock / the pomodoro, what it shows
// and whether seconds show. A key of its own, so the size-capped, synced focus
// record (album-circle-focus-v1:<user>) stays untouched. `mode: ''` follows the
// scene's own face until the user picks one.
export const DISPLAY_KEY = 'album-circle-focus-display-v1';
export const FACE_IDS = Object.freeze(['flip', 'ring', 'record', 'minimal', 'window', 'growth']);
export const FACE_LABELS = Object.freeze({ flip: '琥珀翻页钟', ring: '像素番茄环', record: '唱片计时', minimal: '极简大字', window: '窗景时钟', growth: '小盆栽' });
export const FACE_HINTS = Object.freeze({ flip: '胡桃木与黄铜，数字一张张翻过去', ring: '一圈小珠子，跟着这一轮慢慢点亮', record: '一轮专注是一面唱片，唱臂走到内圈就结束', minimal: '只留下大大的数字', window: '窗外天色跟着时间走，数字凝在玻璃上', growth: '专注时小苗一点点长高' });
export const SHOW_MODES = Object.freeze([['auto', '自动'], ['clock', '时钟'], ['timer', '计时']]);
// The face a scene opens with (琥珀/像素: the flip clock; window scenes: the window).
export const SCENE_FACES = Object.freeze({ warm: 'flip', pixel: 'flip', 'night-study': 'window', starlight: 'window', seaside: 'window', forest: 'growth' });
export const DEFAULT_DISPLAY = Object.freeze({ mode: '', show: 'auto', seconds: false, autoEnter: false });

export function normalizeDisplay(value) {
  const v = value && typeof value === 'object' ? value : {};
  return { mode: FACE_IDS.includes(v.mode) ? v.mode : '', show: SHOW_MODES.some(([id]) => id === v.show) ? v.show : 'auto', seconds: v.seconds === true, autoEnter: v.autoEnter === true };
}
export const faceFor = (display, look) => normalizeDisplay(display).mode || SCENE_FACES[look] || 'flip';
// ←/→ in the whole-window display.
export function cycleFace(id, step = 1) { const i = FACE_IDS.indexOf(id); return FACE_IDS[((i < 0 ? 0 : i) + step + FACE_IDS.length * 4) % FACE_IDS.length]; }
export function readDisplay(storage = globalThis.localStorage) { try { return normalizeDisplay(JSON.parse(storage.getItem(DISPLAY_KEY))); } catch { return { ...DEFAULT_DISPLAY }; } }
export function writeDisplay(value, storage = globalThis.localStorage) { try { storage.setItem(DISPLAY_KEY, JSON.stringify(normalizeDisplay(value))); return true; } catch { return false; } }

// One live value per window (useSyncExternalStore): settings, the dock, the
// whole-window display and the zen clock all agree; other windows sync through
// the storage event.
export function createDisplayStore(storage = globalThis.localStorage, win = globalThis.window) {
  let value = readDisplay(storage);
  const listeners = new Set(), emit = () => { for (const fn of [...listeners]) fn(); };
  const onStorage = (event) => { if (event.key !== DISPLAY_KEY) return; value = readDisplay(storage); emit(); };
  return {
    get: () => value,
    set(change) { value = normalizeDisplay({ ...value, ...(typeof change === 'function' ? change(value) : change) }); writeDisplay(value, storage); emit(); return value; },
    subscribe(fn) { if (!listeners.size) win?.addEventListener?.('storage', onStorage); listeners.add(fn); return () => { listeners.delete(fn); if (!listeners.size) win?.removeEventListener?.('storage', onStorage); }; }
  };
}
