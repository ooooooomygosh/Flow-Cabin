import { THEMES, FURNITURE as LEGACY_FURNITURE } from '../room2/layout.mjs';

export { THEMES };
export const LAYOUT_PREFIX = 'flow-cabin-room-layout-v2:';
export const LEGACY_LAYOUT_PREFIX = 'flow-cabin-room-layout-art-v2:';
export const LAYOUT_CHANGED = 'cabin:layout-changed';
export const ROOM_SIZE = Object.freeze({ width: 1200, height: 800 });
const clone = value => structuredClone(value);
const dimensions = {
  deck: [200, 150, 160, 110], desk: [240, 170, 210, 135], chair: [88, 115, 65, 65],
  records: [150, 150, 120, 70], speaker: [65, 100, 50, 50], books: [135, 185, 110, 55],
  bed: [140, 88, 125, 85], plant: [95, 135, 55, 55], rug: [260, 140, 260, 180],
  tasks: [125, 90, 120, 10], lyrics: [90, 55, 65, 40], calendar: [60, 75, 55, 10],
  weather: [55, 70, 50, 10], clock: [60, 72, 55, 10], mail: [48, 62, 45, 10],
  photo: [55, 62, 40, 30], lamp: [60, 88, 35, 35], notes: [70, 48, 55, 40],
  tea: [78, 65, 55, 40], timer: [44, 48, 35, 30], keyboard: [80, 32, 65, 25],
  mouse: [30, 30, 20, 20], vinyl: [52, 40, 40, 35], cover: [52, 60, 40, 30],
  player: [70, 56, 60, 40], headphones: [50, 60, 40, 40], journal: [55, 42, 45, 30],
  curtain: [120, 190, 110, 10], fireplace: [155, 150, 120, 60],
};
const additions = {
  calendar: { ...LEGACY_FURNITURE.calendar, action: 'calendar' },
  photo: { ...LEGACY_FURNITURE.photo, action: 'postcard' },
  desk: { name: '工作桌', surface: 'floor', action: 'notes' }, chair: { name: '休息椅', surface: 'floor', action: 'rest' },
  records: { name: '唱片柜', surface: 'floor', action: 'library' }, speaker: { name: '音箱', surface: 'floor', action: 'sound' },
  rug: { name: '地毯', surface: 'floor', action: 'pet' }, curtain: { name: '窗帘', surface: 'wall', action: 'curtain' },
  fireplace: { name: '壁炉', surface: 'floor', action: 'sound' },
};
export const FURNITURE = Object.freeze(Object.fromEntries(Object.entries({ ...LEGACY_FURNITURE, ...additions }).map(([id, spec]) => {
  const [w, h, fw, fd] = dimensions[id];
  const surface = ['deck', 'desk'].includes(id) ? 'floor' : ['lyrics', 'photo'].includes(id) ? 'desk' : spec.surface;
  return [id, Object.freeze({ ...spec, name: id === 'lyrics' ? '歌词册' : spec.name, w, h, surface, footprint: { w: fw, d: fd },
    support: ['deck', 'desk', 'records'].includes(id) ? { height: id === 'desk' ? 115 : 85, w: fw, d: fd } : null,
    occludes: surface === 'floor' && id !== 'rug', hitArea: { x: .05, y: .08, w: .9, h: .9 },
    bindings: [spec.action], petAnchor: ['bed', 'chair', 'desk', 'books'].includes(id) ? { du: fw / 2 + 35, dv: 0 } : null,
  })];
})));

export function project({ u, v, z = 0 }) { return { x: 600 + .62 * (u - v), y: 308 + .278 * (u + v) - z }; }
export function unproject(x, y, z = 0) { const a = (x - 600) / .62, b = (y + z - 308) / .278; return { u: (a + b) / 2, v: (b - a) / 2 }; }
export function bounds(item) { const { x, y } = project(item), { w, h } = FURNITURE[item.type]; return { x: x - w / 2, y: y - h, w, h }; }
const snap = n => Math.round(n / 10) * 10;
const footprint = item => { const f = FURNITURE[item.type].footprint, reversed = item.facing === 'left'; return { u: item.u, v: item.v, w: reversed ? f.d : f.w, d: reversed ? f.w : f.d }; };
const overlaps = (a, b, gap = 8) => Math.abs(a.u - b.u) * 2 < a.w + b.w + gap && Math.abs(a.v - b.v) * 2 < a.d + b.d + gap;

function checkItem(layout, item) {
  const spec = FURNITURE[item.type];
  if (!spec || ![item.u, item.v, item.z].every(Number.isFinite) || !['left', 'right'].includes(item.facing)) throw Error('家具位置或朝向无效。');
  if (item.u < 0 || item.v < 0 || item.u > 800 || item.v > 800) throw Error('请把家具留在房间内。');
  if (spec.surface === 'wall') {
    if (!['wall-left', 'wall-right'].includes(item.mount) || item.z < 90 || item.z > 255 || (item.mount === 'wall-left' ? item.u !== 0 : item.v !== 0)) throw Error('这件家具需要挂在墙面上。');
    if (layout.items.some(other => other.id !== item.id && other.mount === item.mount && Math.abs((item.mount === 'wall-left' ? item.v - other.v : item.u - other.u)) < (spec.w + FURNITURE[other.type].w) * .6 && Math.abs(item.z - other.z) < (spec.h + FURNITURE[other.type].h) * .45)) throw Error('墙面这里已有物件。');
  } else if (spec.surface === 'desk') {
    const support = layout.items.find(parent => parent.id === item.mount), area = support && FURNITURE[support.type].support;
    if (!area || item.z !== area.height || Math.abs(item.u - support.u) > area.w / 2 || Math.abs(item.v - support.v) > area.d / 2) throw Error('请把这件小物放在桌面上。');
    if (layout.items.some(other => other.id !== item.id && other.mount === item.mount && overlaps(footprint(item), footprint(other), 0))) throw Error('桌面这里已有物件。');
  } else {
    const f = footprint(item);
    if (item.mount !== 'floor' || item.z !== 0 || item.u < f.w / 2 || item.v < f.d / 2 || item.u + f.w / 2 > 800 || item.v + f.d / 2 > 800) throw Error('请把家具放在地板范围内。');
    if (spec.occludes && layout.items.some(other => other.id !== item.id && other.mount === 'floor' && FURNITURE[other.type].occludes && overlaps(f, footprint(other)))) throw Error('这里已有家具，换个空位试试。');
  }
}
export function validateLayout(value) {
  if (value?.version !== 2 || !THEMES.some(t => t.id === value.theme) || !Array.isArray(value.items) || value.items.length > 70 || !Number.isSafeInteger(value.revision) || value.revision < 0) throw Error('不支持的空间布局。');
  const ids = new Set();
  const items = value.items.map(i => {
    if (!i || typeof i.id !== 'string' || !/^[\w-]{1,80}$/.test(i.id) || ids.has(i.id) || !FURNITURE[i.type]) throw Error('家具身份无效或重复。');
    ids.add(i.id);
    return { id: i.id, type: i.type, u: i.u, v: i.v, z: i.z, facing: i.facing, mount: i.mount };
  });
  const out = { version: 2, theme: value.theme, revision: value.revision, preset: ['work', 'listen', 'rest', 'custom'].includes(value.preset) ? value.preset : 'custom', items };
  items.forEach(item => checkItem(out, item)); return out;
}
const item = (type, u, v, z = 0, mount = 'floor', facing = 'right') => ({ id: type, type, u, v, z, mount, facing });
export function defaultLayout(theme = 'pixel', preset = 'work') {
  const objects = [
    item('deck', 710, 280), item('desk', 170, 500), item('records', 600, 480), item('books', 90, 100),
    item('chair', 270, 650), item('bed', 550, 700), item('plant', 750, 600),
    item('clock', 100, 0, 100, 'wall-right'), item('lyrics', 600, 480, 85, 'records'),
    item('tasks', 0, 110, 155, 'wall-left', 'left'), item('calendar', 240, 0, 90, 'wall-right'),
    item('weather', 565, 0, 130, 'wall-right'), item('mail', 0, 720, 110, 'wall-left', 'left'),
    item('notes', 190, 510, 115, 'desk'), item('lamp', 110, 460, 115, 'desk'),
  ];
  if (preset === 'listen') { objects.find(i => i.type === 'chair').u = 730; objects.find(i => i.type === 'chair').v = 460; }
  if (preset === 'rest') { objects.find(i => i.type === 'chair').u = 430; objects.find(i => i.type === 'chair').v = 670; objects.find(i => i.type === 'bed').u = 600; objects.find(i => i.type === 'bed').v = 700; }
  return validateLayout({ version: 2, theme, preset, revision: 0, items: objects });
}
export function placeFurniture(layout, id, patch) {
  const original = layout.items.find(i => i.id === id); if (!original) throw Error('找不到这件家具。');
  const moved = { ...original, ...patch, u: snap(patch.u ?? original.u), v: snap(patch.v ?? original.v) };
  const delta = { u: moved.u - original.u, v: moved.v - original.v };
  const next = { ...layout, preset: 'custom', revision: layout.revision + 1, items: layout.items.map(i => i.id === id ? moved : i.mount === id ? { ...i, u: i.u + delta.u, v: i.v + delta.v } : i) };
  return validateLayout(next);
}
export function removeFurniture(layout, id) { return validateLayout({ ...layout, preset: 'custom', revision: layout.revision + 1, items: layout.items.filter(i => i.id !== id && i.mount !== id) }); }
export function addFurniture(layout, type, options = {}) {
  if (!FURNITURE[type] || layout.items.some(i => i.id === (options.id || type))) throw Error('这件家具已在房间里。');
  const spec = FURNITURE[type], mounts = spec.surface === 'wall' ? ['wall-left', 'wall-right'] : spec.surface === 'desk' ? layout.items.filter(i => FURNITURE[i.type].support).map(i => i.id) : ['floor'];
  const seeds = [];
  for (const mount of mounts) for (let a = 60; a <= 740; a += 20) for (let b = spec.surface === 'wall' ? 110 : 60; b <= (spec.surface === 'wall' ? 250 : 740); b += 20) {
    const wall = mount.startsWith('wall-'), u = mount === 'wall-left' ? 0 : a, v = mount === 'wall-right' ? 0 : wall ? a : b;
    seeds.push({ ...item(type, u, v, wall ? b : spec.surface === 'desk' ? FURNITURE[layout.items.find(i => i.id === mount).type].support.height : 0, mount, mount === 'wall-left' ? 'left' : 'right'), id: options.id || type });
  }
  if (options.near) seeds.sort((a, b) => Math.hypot(a.u - options.near.u, a.v - options.near.v) - Math.hypot(b.u - options.near.u, b.v - options.near.v));
  for (const candidate of seeds) { const next = { ...layout, revision: layout.revision + 1, items: [...layout.items, candidate] }; try { checkItem(next, candidate); return next; } catch {} }
  throw Error('没有足够空位，先移动或收起一件家具。');
}
export function migrateLayout(value) {
  if (value?.version === 2) return validateLayout(value);
  if (value?.version !== 1 || !THEMES.some(t => t.id === value.theme) || !Array.isArray(value.items) || value.items.length > 50) throw Error('旧布局格式无效，已保留原文件。');
  const defaults = defaultLayout(value.theme), byType = new Map(defaults.items.map(i => [i.type, i]));
  let next = { ...defaults, items: defaults.items.filter(i => ['desk', 'records', 'chair', 'speaker'].includes(i.type)), preset: 'custom' };
  const ids = new Set();
  for (const old of [...value.items].sort((a, b) => (LEGACY_FURNITURE[a.type]?.surface === 'desk') - (LEGACY_FURNITURE[b.type]?.surface === 'desk'))) {
    if (!LEGACY_FURNITURE[old?.type] || !/^[\w-]{1,80}$/.test(old.id) || ids.has(old.id) || ![old.x, old.y].every(Number.isFinite)) throw Error('旧布局家具数据无效，已保留原文件。');
    ids.add(old.id);
    const preferred = byType.get(old.type), near = preferred || { u: Math.max(50, Math.min(750, old.x / 1200 * 800)), v: Math.max(50, Math.min(750, old.y / 640 * 800)) };
    if (preferred) {
      const candidate = { ...preferred, id: old.id, facing: old.rotation === 90 ? 'left' : preferred.facing }, attempt = { ...next, items: [...next.items, candidate] };
      try { checkItem(attempt, candidate); next = attempt; continue; } catch {}
    }
    next = addFurniture(next, old.type, { id: old.id, near });
  }
  return validateLayout(next);
}
export function readLayout(storage, theme) {
  const raw = storage.getItem(LAYOUT_PREFIX + theme); if (raw) return validateLayout(JSON.parse(raw));
  const old = storage.getItem(LEGACY_LAYOUT_PREFIX + theme); if (!old) return defaultLayout(theme);
  const next = migrateLayout(JSON.parse(old));
  // Keep the exact original before writing the migration. A quota failure stops the migration.
  if (!storage.getItem(`${LAYOUT_PREFIX}original:${theme}`)) storage.setItem(`${LAYOUT_PREFIX}original:${theme}`, old);
  storage.setItem(LAYOUT_PREFIX + theme, JSON.stringify(next)); return next;
}
export function saveLayout(storage, layout) { const safe = validateLayout(layout); storage.setItem(LAYOUT_PREFIX + safe.theme, JSON.stringify(safe)); return safe; }
export function createHistory(initial) {
  let current = validateLayout(initial), past = [], future = [];
  return { get: () => clone(current), get canUndo() { return past.length > 0; }, get canRedo() { return future.length > 0; },
    apply(next) { const safe = validateLayout(next); past = [...past.slice(-49), current]; current = safe; future = []; return clone(current); },
    undo() { if (past.length) { future.push(current); current = past.pop(); } return clone(current); },
    redo() { if (future.length) { past.push(current); current = future.pop(); } return clone(current); },
  };
}
export function petPath(layout, from, to) {
  // A small 40-unit navigation grid is deterministic and never crosses occupied furniture.
  const step = 40, key = p => `${p.u},${p.v}`, grid = p => ({ u: Math.max(40, Math.min(760, Math.round(p.u / step) * step)), v: Math.max(40, Math.min(760, Math.round(p.v / step) * step)) });
  const occupied = p => layout.items.some(i => i.mount === 'floor' && FURNITURE[i.type].occludes && i.type !== 'bed' && overlaps({ ...p, w: 24, d: 24 }, footprint(i), 8));
  const start = grid(from), target = grid(to), queue = [start], prev = new Map([[key(start), null]]);
  let nearest = start;
  for (let index = 0; index < queue.length; index++) {
    const p = queue[index]; if (Math.hypot(p.u - target.u, p.v - target.v) < Math.hypot(nearest.u - target.u, nearest.v - target.v)) nearest = p;
    if (key(p) === key(target)) break;
    for (const [du, dv] of [[step, 0], [-step, 0], [0, step], [0, -step]]) { const n = { u: p.u + du, v: p.v + dv }; if (n.u < 40 || n.v < 40 || n.u > 760 || n.v > 760 || prev.has(key(n)) || occupied(n)) continue; prev.set(key(n), p); queue.push(n); }
  }
  const path = []; for (let p = nearest; p; p = prev.get(key(p))) path.unshift(p); return path;
}
