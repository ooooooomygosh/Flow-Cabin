// What is on the desk and in its drawer, and where each thing leads, as plain data (tested).
// The desk is DEsk's (https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors); in the drawer lie
// four things cut from DEsk's own drawer (notepad, compass, folder, screwdriver) and five drawn the way
// DEsk draws its icons, lit by its lamp (scripts/desk-drawer-art.py: diary, companion, cardbox, postcard,
// nightlamp).

// The four things at the back of the desk. `key` opens it from the keyboard, as Super+A/C/N/D do on DEsk.
export const EDGE = Object.freeze([
  { id: 'console', name: '唱机', plate: '唱机', key: 'c', look: 'console' },
  { id: 'clock', name: '台钟', key: '' },
  { id: 'post', name: '信箱', key: 'n', look: 'post' },
  { id: 'shelf', name: '唱片架', plate: '唱片架', key: 'a', look: 'shelf' },
]);

// The drawer, left to right. `lab` names the 实验室 switch the thing waits for.
export const DRAWER = Object.freeze([
  { id: 'diary', name: '唱片日记', art: 'diary.svg', size: 92, action: 'diary' },
  { id: 'pet', name: '伙伴', art: 'companion.svg', size: 96, action: 'pet' },
  { id: 'notes', name: '随手记', art: 'notepad.webp', action: 'notes' },
  { id: 'weather', name: '窗外与天气', art: 'compass.webp', action: 'weather' },
  { id: 'study', name: '词书', art: 'cardbox.svg', size: 90, action: 'study', lab: 'study' },
  { id: 'postcard', name: '明信片', art: 'postcard.svg', size: 92, action: 'postcard', lab: 'postcard' },
  { id: 'recipes', name: '场景配方', art: 'recipe.svg', size: 88, action: 'recipes', lab: 'scenes' },
  { id: 'sleep', name: '睡前模式', art: 'nightlamp.svg', size: 86, action: 'sleep', lab: 'scenes' },
  { id: 'backup', name: '备份与恢复', art: 'folder.webp', action: 'backup' },
  { id: 'settings', name: '设置', art: 'screwdriver.webp', action: 'settings' },
]);

// The companion's photograph on top of the stack (companion.svg, 256 units): the window the pet's own
// picture is laid into, and how far the photo is turned (scripts/desk-drawer-art.py PET_WINDOW).
export const PET_WINDOW = Object.freeze({ x: 69, y: 45, w: 118, h: 118, angle: -6 });

export const drawerItems = (labs = {}) => DRAWER.filter((item) => !item.lab || labs[item.lab]);

// Where each of n things lies on the felt (the band's coordinates: felt from x 200 to 1240).
export function drawerPlaces(n, span = 940) {
  const mid = 720, y = 70;
  if (n <= 1) return [{ x: mid, y }];
  const step = Math.min(170, span / (n - 1)), start = mid - step * (n - 1) / 2;
  return Array.from({ length: n }, (_, i) => ({ x: start + i * step, y }));
}

// The views the camera looks up to, and what each part of them is (in the view's 1440x900 picture).
// Clicking anywhere that is not one of them looks back down at the desk. On the bookcase the binders
// and the index book are the record library itself (src/desk/ShelfView.jsx, geometry in plates.json).
export const VIEWS = Object.freeze({
  shelf: {
    name: '唱片架', back: '回到书桌',
    spots: [
      { id: 'memo', name: '随手记（便签本）', rect: [350, 498, 140, 132], action: 'notes' },
      { id: 'calendar', name: '待办与日程（台历）', rect: [518, 505, 178, 128], action: 'tasks' },
      { id: 'clock', name: '专注（座钟）', rect: [772, 500, 140, 142], action: 'timer' },
      { id: 'post', name: '信箱', rect: [944, 596, 132, 142], action: 'post' },
    ],
  },
  // The Control Panel is the record player's console: its parts are drawn and handled by
  // views/ConsoleView.jsx (views/index.js VIEW_BODY), not as spots.
  console: { name: '唱机', back: '回到书桌', spots: [] },
  post: {
    name: '信箱', back: '回到书桌',
    // the letters standing in it are the desk's own (src/desk/PostLetters.jsx, layout.mjs boxCards)
    spots: [],
  },
});

// Single keys on the desk (no modifier, not while typing, not while a dialog is open).
export function deskKey(key, state = {}) {
  const k = String(key || '').toLowerCase();
  if (k === 'escape') return state.look ? { type: 'back' } : state.drawer ? { type: 'drawer', open: false } : null;
  if (state.look) return null;
  if (k === 'd') return { type: 'drawer', open: !state.drawer };
  const edge = EDGE.find((e) => e.key && e.key === k);
  return edge ? { type: 'look', which: edge.look } : null;
}

// The clock's four keys (DEsk: 时钟 日期 音乐 电源; here the last one is 专注).
export const CLOCK_KEYS = Object.freeze([
  { id: 'clock', name: '时钟', rect: [0, 0, 57, 33] },
  { id: 'date', name: '日期', rect: [57, 0, 57, 33] },
  { id: 'music', name: '音乐', rect: [0, 33, 57, 33] },
  { id: 'focus', name: '专注', rect: [57, 33, 57, 33] },
]);

// What the clock shows when nothing was chosen: a running round first, then the music, then the time.
export function autoMode({ focusPhase = 'idle', playing = false } = {}) {
  if (focusPhase !== 'idle') return 'focus';
  if (playing) return 'music';
  return 'clock';
}
