export const THEMES = Object.freeze([
  { id: 'pixel', name: '像素小屋', wall: 0x604634, floor: 0x382b24, light: 0xf3c87c },
  { id: 'warm', name: '琥珀小屋', wall: 0x75513b, floor: 0x493020, light: 0xffd38a },
  { id: 'night-study', name: '月夜书桌', wall: 0x29364e, floor: 0x242530, light: 0xdec18d },
  { id: 'forest', name: '林间书屋', wall: 0x50644a, floor: 0x334632, light: 0xc9dea1 },
  { id: 'seaside', name: '海边小屋', wall: 0x49737d, floor: 0x375760, light: 0xe6dcb3 },
  { id: 'starlight', name: '星光小屋', wall: 0x474468, floor: 0x302e48, light: 0xd1c6f0 },
  { id: 'rain-train', name: '雨夜列车书房', wall: 0x303e50, floor: 0x252e3c, light: 0xc6a078 },
  { id: 'greenhouse', name: '屋顶温室', wall: 0x668575, floor: 0x465f48, light: 0xe1ebaf },
]);
export const FURNITURE = Object.freeze({
  clock: { name: '专注钟', surface: 'wall', w: 48, h: 64, action: 'timer' },
  calendar: { name: '挂历', surface: 'wall', w: 64, h: 80, action: 'journal' },
  weather: { name: '天气仪', surface: 'wall', w: 64, h: 80, action: 'weather' },
  deck: { name: '唱机', surface: 'desk', w: 112, h: 88, action: 'music' },
  lyrics: { name: '歌词投影', surface: 'wall', w: 144, h: 112, action: 'lyrics' },
  tasks: { name: '任务板', surface: 'wall', w: 144, h: 112, action: 'tasks' },
  books: { name: '书架', surface: 'floor', w: 144, h: 160, action: 'study' },
  notes: { name: '笔记本', surface: 'desk', w: 80, h: 56, action: 'notes' },
  mail: { name: '信箱', surface: 'wall', w: 48, h: 64, action: 'mail' },
  tea: { name: '茶壶', surface: 'desk', w: 80, h: 64, action: 'tea' },
  plant: { name: '植物', surface: 'floor', w: 96, h: 120, action: 'plant' },
  bed: { name: '宠物窝', surface: 'floor', w: 144, h: 96, action: 'pet' },
  photo: { name: '相框', surface: 'wall', w: 80, h: 80, action: 'stats' },
  lamp: { name: '台灯', surface: 'desk', w: 64, h: 96, action: 'lamp' },
});
export const SURFACES = Object.freeze({ wall: { x: 16, y: 56, w: 1168, h: 256 }, desk: { x: 16, y: 232, w: 1168, h: 112 }, floor: { x: 16, y: 384, w: 1168, h: 248 } });
const clone = value => JSON.parse(JSON.stringify(value));
export function bounds(item) { const type = FURNITURE[item.type]; return { ...item, w: item.rotation === 90 ? type.h : type.w, h: item.rotation === 90 ? type.w : type.h }; }
export function placement(layout, id, x, y, rotation) {
  const original = layout.items.find(item => item.id === id); if (!original) throw Error('找不到家具。');
  const item = { ...original, x: Math.round(x / 8) * 8, y: Math.round(y / 8) * 8, rotation: rotation === 90 ? 90 : 0 };
  if (![item.x, item.y].every(Number.isFinite)) throw Error('位置必须是有效数字。');
  if (FURNITURE[item.type].surface === 'desk') item.y = 336 - bounds(item).h;
  const b = bounds(item), area = SURFACES[FURNITURE[item.type].surface];
  if (b.x < area.x || b.y < area.y || b.x + b.w > area.x + area.w || b.y + b.h > area.y + area.h) throw Error(`请放在${{ wall: '墙面', desk: '桌面', floor: '地面' }[FURNITURE[item.type].surface]}范围内。`);
  if (FURNITURE[item.type].surface === 'wall' && [[112, 320], [496, 704], [888, 1096]].some(([left, right]) => b.x < right && b.x + b.w > left && b.y < 288 && b.y + b.h > 76)) throw Error('请留出窗户位置，把家具挂在窗间墙面。');
  if (layout.items.some(other => other.id !== id && (() => { const o = bounds(other); return b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y; })())) throw Error('这里已有家具，请留出空间。');
  return { ...layout, revision: layout.revision + 1, items: layout.items.map(other => other.id === id ? item : other) };
}
export function defaultLayout(theme = 'pixel', preset = 'work') {
  const slots = { lyrics: [336, 200], deck: [184, 248], clock: [392, 80], tasks: [736, 112], notes: [560, 280], lamp: [664, 240], books: [80, 392], calendar: [32, 144], weather: [1120, 144], tea: [944, 272], plant: [1072, 416], bed: [880, 536], mail: [32, 240], photo: [768, 232] };
  if (preset === 'listen') { slots.deck = [184, 248]; slots.notes = [536, 280]; slots.lamp = [664, 240]; }
  if (preset === 'rest') { slots.bed = [864, 528]; slots.plant = [1080, 432]; slots.tea = [968, 272]; }
  return { version: 1, theme: THEMES.some(t => t.id === theme) ? theme : 'pixel', revision: 0, items: Object.entries(slots).map(([type, [x, y]]) => ({ id: type, type, x, y, rotation: 0 })) };
}
export function validateLayout(value) {
  if (value?.version !== 1 || !THEMES.some(t => t.id === value.theme) || !Array.isArray(value.items) || value.items.length > 50) throw Error('不支持的布局文件。');
  const result = { version: 1, theme: value.theme, revision: Math.max(0, Number(value.revision) || 0), items: [] }, ids = new Set();
  for (const item of value.items) {
    if (!item || !FURNITURE[item.type] || typeof item.id !== 'string' || !/^[\w-]{1,80}$/.test(item.id) || ids.has(item.id)) throw Error('家具数据无效或重复。');
    ids.add(item.id); const safe = { id: item.id, type: item.type, x: item.x, y: item.y, rotation: item.rotation === 90 ? 90 : 0 };
    result.items.push(safe); const normalized = placement(result, item.id, item.x, item.y, item.rotation).items.at(-1);
    if (normalized.x !== safe.x || normalized.y !== safe.y) throw Error('家具位置必须对齐网格和承托面。');
  }
  return result;
}
export function createLayoutHistory(initial, limit = 50) {
  let present = validateLayout(initial), past = [], future = [];
  return { get: () => clone(present), apply(next) { const safe = validateLayout(next); past.push(present); if (past.length > limit) past.shift(); present = safe; future = []; return clone(present); }, undo() { if (past.length) { future.push(present); present = past.pop(); } return clone(present); }, redo() { if (future.length) { past.push(present); present = future.pop(); } return clone(present); }, get canUndo() { return past.length > 0; }, get canRedo() { return future.length > 0; } };
}
