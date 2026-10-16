import { normalizeLibrary } from './record-library.mjs';
import { normalizeStudy } from './study/study-model.mjs';

// The backup file format (v2). Everything lives on this computer; a backup moves it to another one.
export const BACKUP_KIND = 'FlowCabinBackup';
export const MAX_BACKUP_BYTES = 8 * 1024 * 1024;
// Earlier releases exported "AlbumCircleCollection" files with the same fields.
const KINDS = [BACKUP_KIND, 'AlbumCircleCollection'];
const plain = (value) => value && typeof value === 'object' && !Array.isArray(value);

// Backups intentionally exclude an active countdown: importing must not start work.
export function backupFocus(state) {
  if (!state) return null;
  return { tasks: state.tasks, sessions: state.sessions, rewards: state.rewards, settings: state.settings, notes: typeof state.notes === 'string' ? state.notes : '' };
}
export function restoreFocus(saved, current) {
  if (!plain(saved)) return current;
  // Pre-notes backups must not silently erase a newer feature's local content.
  return { ...saved, notes: Object.prototype.hasOwnProperty.call(saved, 'notes') ? saved.notes : current?.notes || '' };
}

export const backupFileName = (now = new Date()) => `FlowCabin-backup-${now.toISOString().slice(0, 10).replace(/-/g, '')}.json`;
export function buildBackup({ items = [], library, focus = null, study = null, sound = null, now = new Date() }) {
  return { kind: BACKUP_KIND, version: 2, exportedAt: now.toISOString(), items, library, focus: focus ? backupFocus(focus) : null, study: study || null, sound: plain(sound) ? sound : null };
}

// Validates a backup file's text. Throws a user-facing message; `items` are sent to the shelf as-is
// (the desktop store normalises them), everything else is normalised here.
export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('文件内容无法读取。'); }
  if (!plain(data) || !KINDS.includes(data.kind) || !Array.isArray(data.items)) throw new Error('请选择心流小屋导出的备份文件。');
  const study = data.study ? normalizeStudy(data.study) : null;
  return {
    items: data.items, roomId: typeof data.roomId === 'string' ? data.roomId : '', library: normalizeLibrary(data.library),
    focus: plain(data.focus) ? data.focus : null,
    study: study && (study.decks.length || study.countdowns.length) ? study : null,
    sound: plain(data.sound) ? data.sound : null
  };
}

// What a restore would overwrite on this computer besides the shelf; asked once before replacing.
export function backupReplacements(parsed, available = {}) {
  const out = [];
  if (parsed.focus && available.focus) out.push({ id: 'focus', label: '专注记录、待办与随手记' });
  if (parsed.study && available.study) out.push({ id: 'study', label: `学习记录（${parsed.study.decks.length} 个卡组、${parsed.study.cards.length} 张闪卡、${parsed.study.countdowns.length} 个倒计时）` });
  if (parsed.sound && available.sound) out.push({ id: 'sound', label: '环境声音设置' });
  return out;
}

// Moves `item:<old id>` keys to the ids the shelf actually gave restored albums.
export function remapItemKeys(library, ids = {}) {
  if (!Object.keys(ids).length) return library;
  const key = (value) => value.startsWith('item:') && Object.prototype.hasOwnProperty.call(ids, value.slice(5)) ? 'item:' + ids[value.slice(5)] : value;
  const entries = (object) => Object.fromEntries(Object.entries(object).map(([name, value]) => [key(name), value]));
  return { ...library, styles: entries(library.styles), genres: entries(library.genres),
    rooms: Object.fromEntries(Object.entries(library.rooms).map(([roomId, room]) => [roomId, { ...room, boxes: room.boxes.map((box) => ({ ...box, keys: [...new Set(box.keys.map(key))] })) }])) };
}
// Merges a restored library into this computer's: vinyl styles and genres per album, and this room's boxes and look.
export function mergeBackupLibrary(current, parsed, roomId, ids = {}) {
  const source = remapItemKeys(parsed.library, ids), room = source.rooms[parsed.roomId || roomId] || source.rooms[roomId];
  return { ...current, styles: { ...current.styles, ...source.styles }, genres: { ...current.genres, ...source.genres }, rooms: room ? { ...current.rooms, [roomId]: { ...(current.rooms[roomId] || {}), ...room } } : current.rooms };
}
