const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCollectionStore } = require('../collection-store.cjs');
const { createSiteRouter } = require('../site-router.cjs');
const { SITE_ORIGIN, localDownloadType } = require('../policy.cjs');

const memoryStorage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
};
test('focus backup carries notes but not an active timer or arbitrary fields', async () => {
  const { backupFocus, restoreFocus } = await import('../../src/backup-model.mjs');
  const { normalizeFocus } = await import('../../src/focus/focus-model.mjs');
  const current = normalizeFocus({ notes: '<b>纯文本</b>\n第二行' });
  const copy = backupFocus({ ...current, timer: { phase: 'focus' }, secret: 'omit' });
  assert.equal(copy.notes, current.notes); assert.equal(copy.timer, undefined); assert.equal(copy.secret, undefined);
  assert.equal(normalizeFocus(restoreFocus(JSON.parse(JSON.stringify(copy)), current)).notes, current.notes);
});
test('legacy imports preserve existing notes while explicit empty notes clear them', async () => {
  const { restoreFocus } = await import('../../src/backup-model.mjs');
  assert.equal(restoreFocus({ tasks: [] }, { notes: 'retain' }).notes, 'retain');
  assert.equal(restoreFocus({ notes: '' }, { notes: 'retain' }).notes, '');
  assert.deepEqual(restoreFocus(null, { notes: 'retain' }), { notes: 'retain' });
});

test('desktop backup download and collection import share the v3 memory round-trip', async (t) => {
  const model = await import('../../src/backup-model.mjs');
  const sessions = await import('../../src/focus/session-log.mjs');
  const stats = await import('../../src/focus/stats/session-source.mjs');
  const cat = await import('../../src/cat/cat-care.mjs');
  const letters = await import('../../src/ai/ai-model.mjs');
  const playback = await import('../../src/player/playback-log.mjs');
  const { normalizeLibrary } = await import('../../src/record-library.mjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cabin-backup-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const collection = createCollectionStore({ directory });
  collection.importItems([{ id: 'occupied', title: 'Local album', artist: 'Local artist' }]);
  const router = createSiteRouter({ webRoot: path.join(__dirname, 'fixtures/web'), qq: {}, collection, forward: async () => { throw new Error('unexpected network'); } });
  const at = Date.parse('2026-10-18T08:00:00Z'), source = memoryStorage(), destination = memoryStorage();
  const record = sessions.sessionRecord({ start: at - 1500000, end: at, completed: true, todo: { id: 'todo', text: 'Read' }, album: { id: 'occupied', title: 'Backup album', artist: 'Artist', thumb: 'data:image/png;base64,AAAA' } });
  sessions.appendSession(record, source);
  cat.writeCare(cat.feed(cat.focusDone(cat.normalizeCare(null, at), record, at), 3, at + 1).care, source);
  letters.saveLetter(source, { id: 'w:2026-10-12', cadence: 'weekly', tone: 'calm', period: '上周', lines: ['A good week.'], source: 'ai', at, read: true });
  source.setItem(letters.AI_KEY_KEY, 'NOT_IN_BACKUP');
  source.setItem(playback.PLAYBACK_LOG_KEY, JSON.stringify([{ id: 'p-backup', start: at, end: at + 10000, durationMs: 2500, reason: 'pause', track: { index: 0, title: 'Song', artist: 'Artist' }, album: { id: 'occupied', title: 'Backup album', artist: 'Artist' } }]));
  destination.setItem(letters.AI_KEY_KEY, 'LOCAL_KEY');
  const library = normalizeLibrary({ styles: { 'item:occupied': { base: '#aa0000' } }, rooms: { home: { boxes: [{ id: 'box', name: 'Night', keys: ['item:occupied'] }] } } });
  const backup = model.buildBackup({ storage: source, roomId: 'home', library, items: [{ id: 'occupied', title: 'Backup album', artist: 'Artist', addedAt: new Date(at).toISOString(), externalIds: { itunesTrackId: '123' } }] });
  const text = JSON.stringify(backup, null, 2), filename = model.backupFileName(new Date(at));
  assert.equal(localDownloadType({ url: `blob:${SITE_ORIGIN}/backup`, filename, bytes: Buffer.byteLength(text), mimeType: 'application/json' }), 'backup');
  assert.equal(text.includes('NOT_IN_BACKUP'), false);
  const parsed = model.parseBackup(text);
  const importItems = async () => {
    const response = await router(new Request(`${SITE_ORIGIN}/api/items/import`, { method: 'POST', body: JSON.stringify({ items: parsed.items }) }));
    assert.equal(response.status, 200);
    return response.json();
  };
  const imported = await importItems();
  assert.equal(imported.added, 1);
  assert.equal(imported.total, 2);
  assert.ok(imported.ids.occupied && imported.ids.occupied !== 'occupied');
  const merged = model.mergeBackupLibrary(normalizeLibrary(), parsed, 'local-room', imported.ids);
  assert.equal(merged.styles[`item:${imported.ids.occupied}`].base, '#aa0000');
  assert.deepEqual(merged.rooms['local-room'].boxes[0].keys, [`item:${imported.ids.occupied}`]);
  const target = new EventTarget(), keys = [];
  target.addEventListener('storage', (event) => keys.push(event.key));
  model.restoreBackupMemory(parsed, { storage: destination, target });
  assert.deepEqual(stats.loadSessions({ storage: destination }), stats.loadSessions({ storage: source }));
  assert.deepEqual(cat.readCare(destination, at + 1), cat.readCare(source, at + 1));
  assert.deepEqual(letters.readLetters(destination), letters.readLetters(source));
  assert.deepEqual(playback.readPlaybackSessions(destination), playback.readPlaybackSessions(source));
  assert.equal(playback.readPlaybackSessions(destination)[0].durationMs, 2500);
  assert.equal(destination.getItem(letters.AI_KEY_KEY), 'LOCAL_KEY');
  assert.deepEqual(keys, [sessions.SESSION_LOG_KEY, cat.MOOD_KEY, cat.META_KEY, letters.LETTERS_KEY, playback.PLAYBACK_LOG_KEY]);
  assert.equal((await importItems()).added, 0);
  assert.deepEqual(model.restoreBackupMemory(parsed, { storage: destination, target }), { changed: [] });
  const reopened = createCollectionStore({ directory });
  assert.equal(reopened.list().length, 2);
  assert.equal(reopened.list().find((item) => item.title === 'Backup album').externalIds.itunesTrackId, '123');
});

test('desktop legacy migrations and invalid imports leave existing memories untouched', async () => {
  const { buildBackup, parseBackup, restoreBackupMemory, restoreFocus } = await import('../../src/backup-model.mjs');
  const { LETTERS_KEY } = await import('../../src/ai/ai-model.mjs');
  const storage = memoryStorage();
  storage.setItem(LETTERS_KEY, JSON.stringify([{ id: 'local', lines: ['Keep me'], at: 1 }]));
  const before = storage.getItem(LETTERS_KEY);
  for (const version of [undefined, 1, 2]) {
    const parsed = parseBackup(JSON.stringify({ kind: 'AlbumCircleCollection', version, items: [], focus: { tasks: [] } }));
    restoreBackupMemory(parsed, { storage });
    assert.equal(storage.getItem(LETTERS_KEY), before);
    assert.equal(restoreFocus(parsed.focus, { notes: 'Local journal' }).notes, 'Local journal');
  }
  const backup = buildBackup({ storage });
  for (const patch of [{ version: 99 }, { memory: { letters: 'bad' } }, { memory: { catMood: { mood: 'bad' } } }, { focus: { sessions: {} } }]) {
    assert.throws(() => parseBackup(JSON.stringify({ ...backup, ...patch })), /版本|格式无效/);
    assert.equal(storage.getItem(LETTERS_KEY), before);
  }
});
