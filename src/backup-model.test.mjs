import test from 'node:test';
import assert from 'node:assert/strict';
import { backupFileName, backupReplacements, buildBackup, mergeBackupLibrary, parseBackup, remapItemKeys, restoreFocus } from './backup-model.mjs';
import { normalizeLibrary } from './record-library.mjs';

const library = normalizeLibrary({
  styles: { 'item:old': { base: '#aa0000' }, 'qq:1': { base: '#00aa00' } }, genres: { 'item:old': ['爵士'] },
  rooms: { home: { boxes: [{ id: 'b1', name: '夜晚', keys: ['item:old', 'qq:1'] }], look: 'pixel' } }
});

test('backup round-trips through build and parse', () => {
  const now = new Date('2026-10-16T08:00:00Z');
  const backup = buildBackup({ items: [{ id: 'a', title: 'T', artist: 'A' }], library, focus: { tasks: [], sessions: [], rewards: {}, settings: {}, notes: 'n', timer: { phase: 'focus' } }, sound: { rain: 0.5 }, now });
  assert.equal(backupFileName(now), 'FlowCabin-backup-20261016.json');
  assert.equal(backup.focus.timer, undefined, 'an active countdown is never exported');
  const parsed = parseBackup(JSON.stringify(backup));
  assert.equal(parsed.items.length, 1); assert.deepEqual(parsed.library.styles['item:old'].base, '#aa0000'); assert.deepEqual(parsed.sound, { rain: 0.5 });
  assert.equal(parsed.study, null, 'an empty study record asks nothing');
  assert.equal(parseBackup(JSON.stringify({ kind: 'AlbumCircleCollection', items: [] })).items.length, 0);
  assert.throws(() => parseBackup('{bad'), /文件内容无法读取/);
  assert.throws(() => parseBackup('{"kind":"Other","items":[]}'), /心流小屋导出的备份/);
  assert.throws(() => parseBackup('[]'), /心流小屋导出的备份/);
});

test('restore asks once for everything that would overwrite this computer', () => {
  const parsed = parseBackup(JSON.stringify({ kind: 'FlowCabinBackup', items: [], focus: { notes: 'x' }, study: { decks: [{ id: 'd', name: '英语' }], cards: [] }, sound: { rain: 1 } }));
  assert.deepEqual(backupReplacements(parsed, { focus: true, study: true, sound: true }).map((entry) => entry.id), ['focus', 'study', 'sound']);
  assert.deepEqual(backupReplacements(parsed, { focus: true }).map((entry) => entry.id), ['focus']);
  assert.equal(restoreFocus({ tasks: [] }, { notes: '本机' }).notes, '本机', 'pre-notes backups keep local notes');
});

test('vinyl styles, genres and boxes follow albums the shelf gave a new id', () => {
  const moved = remapItemKeys(library, { old: 'new' });
  assert.equal(moved.styles['item:new'].base, '#aa0000'); assert.equal(moved.styles['item:old'], undefined);
  assert.deepEqual(moved.genres['item:new'], ['爵士']); assert.deepEqual(moved.rooms.home.boxes[0].keys, ['item:new', 'qq:1']);
  assert.equal(remapItemKeys(library, {}), library);
  const merged = mergeBackupLibrary(normalizeLibrary({ styles: { 'qq:9': { base: '#000000' } } }), { library, roomId: 'home' }, 'here', { old: 'new' });
  assert.ok(merged.styles['qq:9'] && merged.styles['item:new']); assert.deepEqual(merged.rooms.here.boxes[0].keys, ['item:new', 'qq:1']);
});
