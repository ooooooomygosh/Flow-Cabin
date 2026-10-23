import { buildBackup } from '../backup-model.mjs';
import { saveRecovery } from './recovery.mjs';
import { LIBRARY_PREFIX } from '../record-library.mjs';
import { FOCUS_PREFIX } from '../focus/focus-model.mjs';
import { STUDY_PREFIX } from '../study/study-model.mjs';
import { SOUND_KEY } from '../audio/ambience.mjs';
import { listItems } from '../collection-api.mjs';
export const DATA_VERSION_KEY = 'flow-cabin-data-version', DATA_VERSION = '2.1';
export function currentBackup(items, storage = globalThis.localStorage) {
  const read = key => { const value = storage.getItem(key); return value ? JSON.parse(value) : null; };
  return buildBackup({ items, storage, roomId:'local-room', library:read(LIBRARY_PREFIX+'local-owner'), focus:read(FOCUS_PREFIX+'local-owner'), study:read(STUDY_PREFIX+'local-owner'), sound:read(SOUND_KEY) });
}
export async function checkpointBeforeUpdate() {
  const entry = await saveRecovery(currentBackup(await listItems()), { reason:'应用更新前' });
  await globalThis.albumMobile?.flushStorage?.(); return entry;
}
export async function prepareDataUpgrade(items, storage = globalThis.localStorage) {
  if (storage.getItem(DATA_VERSION_KEY) === DATA_VERSION) return;
  const backup = currentBackup(items, storage);
  if (items.length || backup.focus || backup.study || Object.keys(backup.cabin.legacyLayouts).length || backup.memory?.journalEntries?.length) await saveRecovery(backup, { storage, reason:'2.1 数据迁移前' });
  storage.setItem(DATA_VERSION_KEY, DATA_VERSION);
  await globalThis.albumMobile?.flushStorage?.();
}
