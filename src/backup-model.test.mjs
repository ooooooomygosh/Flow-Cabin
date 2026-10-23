import test from 'node:test';
import assert from 'node:assert/strict';
import { BACKUP_VERSION, MAX_BACKUP_BYTES, backupFileName, backupReplacements, buildBackup, mergeBackupLibrary, parseBackup, readBackupMemory, remapItemKeys, restoreBackupMemory, restoreFocus } from './backup-model.mjs';
import { normalizeLibrary } from './record-library.mjs';
import { normalizeFocus } from './focus/focus-model.mjs';
import { normalizeStudy, review, RATINGS } from './study/study-model.mjs';
import { appendSession, sessionRecord, SESSION_LOG_KEY } from './focus/session-log.mjs';
import { loadSessions } from './focus/stats/session-source.mjs';
import { normalizeCare, feed, pet, focusDone, writeCare, readCare, MOOD_KEY, META_KEY } from './cat/cat-care.mjs';
import { readCatMood, subscribeCatMood } from './focus/stats/cat-mood-source.mjs';
import { saveLetter, readLetters, markRead, LETTERS_KEY, AI_KEY_KEY, AI_SETTINGS_KEY } from './ai/ai-model.mjs';
import { PLAYBACK_LOG_KEY, createPlaybackLog, readPlaybackSessions } from './player/playback-log.mjs';
import { JOURNAL_KEY, JOURNAL_CHANGE, readJournalRecords, saveJournalEntry, moveJournalEntry } from './focus/journal-entries.mjs';
import { SOUVENIR_PREFIX, SOUVENIR_KEYS, SOUVENIR_CHANGE, readSouvenirs, saveSouvenirs } from './focus/souvenirs.mjs';

const memoryStorage = (entries = []) => {
  const data = new Map(entries), reads = [], writes = [];
  return { data, reads, writes, getItem(key) { reads.push(key); return data.get(key) ?? null; },
    setItem(key, value) { writes.push(key); data.set(key, String(value)); }, removeItem(key) { data.delete(key); } };
};
const at = Date.parse('2026-10-18T08:00:00Z');
const souvenirState = (records) => ({ version: 1, records });
const focusSouvenir = (time = at) => ({ id: 'first-focus', earnedAt: time, earnedOn: '2026-10-18', evidence: { sessionId: 'completed-session', durationMs: 1500000 } });
const letterSouvenir = { id: 'first-letter', earnedAt: at, earnedOn: '2026-10-18', evidence: { letterId: 'outgoing-letter' } };

test('souvenirs export and merge all independent keys before announcing restoration', () => {
  const source = memoryStorage(), destination = memoryStorage(), target = new EventTarget();
  assert.equal(saveSouvenirs({ storage: source, state: souvenirState([focusSouvenir()]) }).ok, true);
  assert.equal(saveSouvenirs({ storage: destination, state: souvenirState([focusSouvenir(at + 10), letterSouvenir]) }).ok, true);
  const parsed = parseBackup(JSON.stringify(buildBackup({ storage: source })));
  assert.deepEqual(parsed.memory.souvenirs, readSouvenirs(source));
  assert.match(backupReplacements(parsed, { memory: true })[0].label, /纪念物/);
  let announced = 0;
  target.addEventListener(SOUVENIR_CHANGE, () => {
    announced++;
    assert.deepEqual(readSouvenirs(destination).records, [focusSouvenir(), letterSouvenir]);
  });
  const restored = restoreBackupMemory(parsed, { storage: destination, target });
  assert.deepEqual(restored.changed, [SOUVENIR_PREFIX + 'first-focus']);
  assert.equal(announced, 1);
  assert.deepEqual(restoreBackupMemory(parsed, { storage: destination, target }).changed, []);
  assert.equal(announced, 1, 'identical restore is silent');
});

test('legacy backups and an empty souvenir domain cannot remove earned objects', () => {
  const storage = memoryStorage();
  saveSouvenirs({ storage, state: souvenirState([letterSouvenir]) });
  const before = [...storage.data];
  for (const memory of [{ version: 1 }, { version: 1, souvenirs: souvenirState([]) }]) {
    restoreBackupMemory(parseBackup(JSON.stringify({ kind: 'FlowCabinBackup', version: 2, items: [], memory })), { storage });
    assert.deepEqual([...storage.data], before);
  }
});

test('invalid souvenir data rejects the whole import before writing other domains', () => {
  const storage = memoryStorage();
  assert.throws(() => restoreBackupMemory({ memory: { journalEntries: [], souvenirs: souvenirState([{ ...letterSouvenir, earnedOn: '2026-02-30' }]) } }, { storage }), /纪念物/);
  assert.equal(storage.writes.length, 0);
  storage.setItem(SOUVENIR_PREFIX + 'first-focus', '{corrupt');
  assert.throws(() => buildBackup({ storage }), /纪念物/);
});

test('failure on a souvenir key rolls back both earlier domains and earlier souvenirs', () => {
  const storage = memoryStorage([[JOURNAL_KEY, '[]']]), before = [...storage.data];
  const write = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    if (key === SOUVENIR_PREFIX + 'first-letter') throw new Error('disk full');
    write(key, value);
  };
  const target = new EventTarget(), events = [];
  for (const type of ['storage', SOUVENIR_CHANGE, JOURNAL_CHANGE]) target.addEventListener(type, () => events.push(type));
  assert.throws(() => restoreBackupMemory({ memory: {
    journalEntries: [{ id: 'page', version: 'v1', body: '保留这一天', tags: [], createdAt: at, updatedAt: at, revisions: [] }],
    souvenirs: souvenirState([focusSouvenir(), letterSouvenir])
  } }, { storage, target }), /原有内容保持不变/);
  assert.deepEqual([...storage.data], before);
  assert.deepEqual(events, [], 'observers never see a partial import');
});
const letter = (id = 'w:2026-10-12', time = at) => ({ id, cadence: 'weekly', tone: 'warm', period: '上周', lines: ['今天也很努力。', '明天见。'], source: 'ai', at: time, read: false });
test('letter organization survives backup restore without reviving an older trash or favorite state', () => {
  const storage = memoryStorage();
  const old = { ...letter(), organizedAt: at + 10, favorite: true, trashed: false };
  const latest = { ...old, organizedAt: at + 20, favorite: false, trashed: true };
  saveLetter(storage, latest);
  restoreBackupMemory({ memory: { letters: [old] } }, { storage });
  assert.equal(readLetters(storage)[0].trashed, true);
  assert.equal(readLetters(storage)[0].favorite, false);
  const fresh = memoryStorage();
  restoreBackupMemory(parseBackup(JSON.stringify(buildBackup({ storage }))), { storage: fresh });
  assert.deepEqual(readLetters(fresh), readLetters(storage));
  restoreBackupMemory({ memory: { letters: [{ ...latest, organizedAt: at + 30, trashed: false }] } }, { storage });
  assert.equal(readLetters(storage)[0].trashed, false);
});
const journalEntry = (id = 'journal', patch = {}) => ({ id, version: `v-${id}`, body: '一页手记', tags: ['夜晚', '复盘'],
  createdAt: at, updatedAt: at + 10, revisions: [{ version: `old-${id}`, body: '旧稿', tags: ['旧'], at: at - 100 }], ...patch });
function populateMemory(storage) {
  const record = sessionRecord({ start: at - 25 * 60000, end: at, completed: true, todo: { id: 'task', text: '读书' },
    album: { id: 'album', title: 'Night', artist: 'Artist', thumb: 'data:image/png;base64,AAAA' }, track: { title: 'Track', artist: 'Artist', album: 'Night' } });
  appendSession(record, storage);
  let care = focusDone(normalizeCare(null, at), record, at);
  care = pet(feed(care, 5, at + 1).care, at + 2);
  writeCare(care, storage);
  saveLetter(storage, letter());
  markRead(storage, letter().id);
  return { record, care };
}

const library = normalizeLibrary({
  styles: { 'item:old': { base: '#aa0000' }, 'qq:1': { base: '#00aa00' } }, genres: { 'item:old': ['爵士'] },
  rooms: { home: { boxes: [{ id: 'b1', name: '夜晚', keys: ['item:old', 'qq:1'] }], look: 'pixel' } }
});

test('backup round-trips through build and parse', () => {
  const now = new Date('2026-10-16T08:00:00Z');
  const backup = buildBackup({ storage: null, items: [{ id: 'a', title: 'T', artist: 'A' }], library, focus: { tasks: [], sessions: [], rewards: {}, settings: {}, notes: 'n', timer: { phase: 'focus' } }, sound: { rain: 0.5 }, now });
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

// 回归：备份里的 roomId 是文件内容，不能让它去读对象的原型。
test('a room id from a backup file never reaches the object prototype', () => {
  const current = normalizeLibrary({ rooms: { home: { look: 'pixel' } } });
  for (const roomId of ['__proto__', 'constructor', 'prototype', 'toString']) {
    const merged = mergeBackupLibrary(current, { library, roomId }, 'home');
    assert.deepEqual(Object.keys(merged.rooms), ['home'], roomId);
    assert.equal(Object.hasOwn(merged.rooms, roomId), false, roomId);
    assert.equal(Object.getPrototypeOf(merged.rooms), Object.prototype, roomId);
    assert.equal({}.polluted, undefined, 'the prototype is untouched');
    // 备份里的房间内容照旧落到当前房间：不能因为编号不认识就把整间房丢掉。
    assert.deepEqual(merged.rooms.home.boxes[0].keys, ['item:old', 'qq:1'], roomId);
    assert.equal(merged.rooms.home.look, 'pixel', roomId);
  }
  // 正常房间名照旧生效：本机其它房间保留，备份里的房间写进当前房间。
  const merged = mergeBackupLibrary(current, { library, roomId: 'home' }, 'here');
  assert.deepEqual(Object.keys(merged.rooms), ['home', 'here']);
  assert.deepEqual(merged.rooms.here.boxes[0].keys, ['item:old', 'qq:1']);
});

test('v3 round-trip uses real session, care, letters and study writers/readers', () => {
  const source = memoryStorage(), { record, care } = populateMemory(source), destination = memoryStorage();
  const study = review(normalizeStudy({ decks: [{ id: 'deck', name: 'English' }], cards: [{ id: 'card', deckId: 'deck', front: 'cat', back: '猫' }], countdowns: [{ id: 'exam', title: '考试', date: '2026-12-01' }], newPerDay: 7 }), 'card', RATINGS[2].rating, at);
  const focus = normalizeFocus({ notes: '日记\n第二行', sessions: [record], tasks: [{ id: 'task', text: '读书' }], rewards: { fish: 4, xp: 25 }, timer: { phase: 'focus', endsAt: at + 60000 } });
  const backup = buildBackup({ storage: source, library, roomId: 'home', focus, study, sound: { master: .5, tracks: { rain: .2 } } });
  const parsed = parseBackup(JSON.stringify(backup));
  assert.equal(backup.version, BACKUP_VERSION);
  assert.equal(parsed.version, BACKUP_VERSION);
  assert.equal(parsed.roomId, 'home');
  assert.deepEqual(parsed.study, study, 'FSRS memory and review log survive');
  assert.deepEqual(normalizeFocus(restoreFocus(parsed.focus, {})), { ...focus, timer: normalizeFocus().timer });
  assert.deepEqual(parsed.memory, backup.memory);
  const target = new EventTarget(), events = [];
  target.addEventListener('storage', () => {
    for (const key of [SESSION_LOG_KEY, MOOD_KEY, META_KEY, LETTERS_KEY]) assert.ok(destination.getItem(key), 'observers see all stores committed');
  });
  for (const type of ['storage', 'cabin:cat-mood', 'cabin:letter', 'cabin:focus-session', 'cabin:cat-fed']) target.addEventListener(type, (event) => events.push(event));
  let moods = 0;
  const unsubscribe = subscribeCatMood(target, () => { moods++; });
  assert.deepEqual(restoreBackupMemory(parsed, { storage: destination, target }).changed, [SESSION_LOG_KEY, MOOD_KEY, META_KEY, LETTERS_KEY]);
  assert.deepEqual(loadSessions({ storage: destination }), loadSessions({ storage: source }));
  assert.equal(JSON.parse(destination.getItem(SESSION_LOG_KEY))[0].cover, record.cover);
  assert.deepEqual(readCare(destination, at + 2), care);
  assert.deepEqual(readLetters(destination), readLetters(source));
  assert.deepEqual(readCatMood(destination, at - 1, at + 10), readCatMood(source, at - 1, at + 10));
  assert.ok(moods > 0);
  assert.equal(events.filter((event) => event.type === 'storage').length, 4);
  assert.ok(events.some((event) => event.type === 'cabin:letter'));
  assert.ok(!events.some((event) => ['cabin:focus-session', 'cabin:cat-fed'].includes(event.type)), 'restore does not grant rewards or play a new feeding');
  for (const event of events.filter((event) => event.type === 'storage')) {
    assert.equal(event.storageArea, destination);
    assert.equal(event.newValue, destination.getItem(event.key));
  }
  unsubscribe();
});

test('v3 independently round-trips long journal entries, history and the trash', () => {
  const source = memoryStorage(), destination = memoryStorage(), target = new EventTarget(), events = [];
  let entry = saveJournalEntry({ storage: source, body: '第一稿。', tags: ['夜晚', '初稿'], now: at });
  assert.equal(entry.ok, true);
  const longBody = '长'.repeat(7900);
  entry = saveJournalEntry({ storage: source, id: entry.entry.id, expectedVersion: entry.entry.version,
    body: longBody, tags: ['夜晚', '长文', '复盘'], now: at });
  assert.equal(entry.ok, true);
  assert.equal(entry.entry.updatedAt, at + 1, 'same-millisecond edits still advance monotonically');
  const trashed = moveJournalEntry({ storage: source, id: entry.entry.id, expectedVersion: entry.entry.version, trash: true, now: at + 1 });
  assert.equal(trashed.ok, true);
  assert.equal(trashed.entry.updatedAt, at + 2, 'same-millisecond moves still advance monotonically');
  assert.equal(saveJournalEntry({ storage: source, body: '还留在今天的一页。', tags: ['今天'], now: at + 30 }).ok, true);

  const records = readJournalRecords(source);
  assert.equal(records.find((record) => record.id === trashed.entry.id).body.length, longBody.length);
  assert.ok(records.find((record) => record.id === trashed.entry.id).revisions.some((revision) => revision.body === '第一稿。'));
  assert.equal(records.find((record) => record.id === trashed.entry.id).deletedAt, at + 2);

  const backup = buildBackup({ storage: source }), parsed = parseBackup(JSON.stringify(backup));
  assert.equal(backup.version, BACKUP_VERSION);
  assert.deepEqual(backup.memory.journalEntries, records);
  assert.deepEqual(parsed.memory.journalEntries, records);
  const replacement = backupReplacements(parsed, { memory: true })[0];
  assert.equal(replacement.id, 'memory');
  assert.match(replacement.label, /手记/);

  target.addEventListener('storage', (event) => events.push(event));
  target.addEventListener(JOURNAL_CHANGE, (event) => events.push(event));
  assert.deepEqual(restoreBackupMemory(parsed, { storage: destination, target }).changed, [JOURNAL_KEY]);
  assert.deepEqual(readJournalRecords(destination), records);
  assert.ok(events.some((event) => event.type === 'storage' && event.key === JOURNAL_KEY && event.storageArea === destination));
  assert.ok(events.some((event) => event.type === JOURNAL_CHANGE));
});

test('older backups without journalEntries leave this computer hand-written pages untouched', () => {
  const destination = memoryStorage();
  assert.equal(saveJournalEntry({ storage: destination, body: '只属于本机的一页。', tags: ['本机'], now: at }).ok, true);
  const before = destination.getItem(JOURNAL_KEY), entries = readJournalRecords(destination);
  const parsed = parseBackup(JSON.stringify({ kind: 'FlowCabinBackup', version: 2, items: [], memory: { version: 1, letters: [] } }));
  const restored = restoreBackupMemory(parsed, { storage: destination, target: new EventTarget() });
  assert.ok(!restored.changed.includes(JOURNAL_KEY));
  assert.equal(destination.getItem(JOURNAL_KEY), before);
  assert.deepEqual(readJournalRecords(destination), entries);
});

test('journal merge deduplicates history without reviving a deleted page at the same timestamp', () => {
  const destination = memoryStorage();
  const shared = { version: 'shared-v1', body: '共同初稿', tags: ['共同'], at: at + 1 };
  const local = journalEntry('shared', { version: 'local-v3', body: '本地删除版本', tags: ['本机'], updatedAt: at + 300,
    deletedAt: at + 300, revisions: [shared, { version: 'local-v2', body: '本地二稿', tags: ['本机'], at: at + 2 }] });
  const incoming = journalEntry('shared', { version: 'zzzz-incoming-v9', body: '另一台电脑的未删除版本', tags: ['远端'], updatedAt: at + 300,
    revisions: [shared, { version: 'remote-v1', body: '远端旧稿', tags: ['远端'], at: at + 3 }] });
  destination.setItem(JOURNAL_KEY, JSON.stringify([local]));
  const parsed = parseBackup(JSON.stringify(buildBackup({ storage: null, memory: { version: 1, journalEntries: [incoming] } })));
  restoreBackupMemory(parsed, { storage: destination, target: new EventTarget() });
  const merged = readJournalRecords(destination)[0];
  assert.equal(merged.id, 'shared');
  assert.equal(merged.version, 'local-v3');
  assert.equal(merged.body, '本地删除版本');
  assert.equal(merged.deletedAt, at + 300);
  const versions = merged.revisions.map((revision) => revision.version);
  assert.equal(new Set(versions).size, versions.length);
  for (const version of ['shared-v1', 'local-v2', 'remote-v1', 'zzzz-incoming-v9']) assert.ok(versions.includes(version));
});

test('legacy letter records normalize as incoming delivered letters in every backup version', () => {
  for (const version of [1, 2, 3, 4]) {
    const parsed = parseBackup(JSON.stringify({ kind: 'FlowCabinBackup', version, items: [], memory: { version: 1, letters: [letter()] } }));
    const expected = { ...letter(), direction: 'in', status: 'delivered' };
    assert.deepEqual(parsed.memory.letters, [expected]);
    const destination = memoryStorage();
    restoreBackupMemory(parsed, { storage: destination });
    assert.deepEqual(readLetters(destination), [expected], `v${version} letters keep their original fields`);
  }
});

test('outbound drafts and sent reply threads round-trip with subject, evidence and read timestamps', () => {
  const source = memoryStorage(), destination = memoryStorage();
  const draft = { id: 'draft:my-letter', direction: 'out', status: 'draft', source: 'user', subject: '还没寄出的信',
    lines: ['今天想慢一点。'], at: at + 1, read: true };
  const sent = { id: 'my:thread', direction: 'out', status: 'sent', source: 'user', subject: '想和你说一件事',
    lines: ['今天完成了一件小事。'], at: at + 2, read: true,
    evidence: [{ kind: 'focus', text: '专注 25 分钟' }, { kind: 'private', text: '不应保存' }] };
  const failed = { id: 'my:failed', direction: 'out', status: 'failed', source: 'user', subject: '没有寄出的第二封',
    lines: ['网络断开了。'], at: at + 2.5, read: true, error: '网络暂时不可用' };
  const reply = { id: 'reply:my:thread', direction: 'in', status: 'delivered', cadence: 'weekly', tone: 'calm',
    period: '刚刚', subject: '小屋回信', replyTo: sent.id, lines: ['我收到了。', '慢一点也很好。'], source: 'template',
    at: at + 3, read: true, readAt: at + 4, evidence: [{ kind: 'note', text: '参考了随手记 · 仅本次' }] };
  for (const value of [draft, sent, failed, reply]) saveLetter(source, value);
  const parsed = parseBackup(JSON.stringify(buildBackup({ storage: source })));
  restoreBackupMemory(parsed, { storage: destination });
  const byId = new Map(readLetters(destination).map((value) => [value.id, value]));
  assert.equal(byId.get(draft.id).status, 'draft');
  assert.equal(byId.get(draft.id).direction, 'out');
  assert.equal(byId.get(sent.id).status, 'sent');
  assert.equal(byId.get(sent.id).source, 'user');
  assert.equal(byId.get(sent.id).subject, '想和你说一件事');
  assert.deepEqual(byId.get(sent.id).evidence, [{ kind: 'focus', text: '专注 25 分钟' }]);
  assert.equal(byId.get(failed.id).status, 'failed');
  assert.equal(byId.get(failed.id).error, '网络暂时不可用');
  assert.equal(byId.get(reply.id).replyTo, sent.id);
  assert.equal(byId.get(reply.id).subject, '小屋回信');
  assert.equal(byId.get(reply.id).readAt, at + 4);
  assert.deepEqual(byId.get(reply.id).evidence, [{ kind: 'note', text: '参考了随手记 · 仅本次' }]);
});

test('letter merge keeps newer outbound fields and preserves an incoming read receipt', () => {
  const destination = memoryStorage();
  saveLetter(destination, { id: 'my:merge', direction: 'out', status: 'sent', source: 'user', subject: '已经寄出',
    lines: ['新版本'], at: at + 100, read: true });
  saveLetter(destination, { id: 'w:read', direction: 'in', status: 'delivered', lines: ['旧的一页'],
    at: at, read: true, readAt: at + 50 });
  restoreBackupMemory({ memory: { version: 1, letters: [
    { id: 'my:merge', direction: 'out', status: 'draft', source: 'user', subject: '旧草稿', lines: ['旧版本'], at, read: true },
    { id: 'my:merge', direction: 'in', status: 'delivered', lines: ['错误方向'], at: at + 300, read: false },
    { id: 'w:read', direction: 'in', status: 'delivered', lines: ['新的一页'], at: at + 200, read: false }
  ] } }, { storage: destination });
  const byId = new Map(readLetters(destination).map((value) => [value.id, value]));
  assert.equal(byId.get('my:merge').direction, 'out', 'an outbound letter is never converted into an incoming letter');
  assert.equal(byId.get('my:merge').status, 'sent');
  assert.equal(byId.get('my:merge').subject, '已经寄出');
  assert.deepEqual(byId.get('my:merge').lines, ['新版本']);
  assert.deepEqual(byId.get('w:read').lines, ['新的一页']);
  assert.equal(byId.get('w:read').read, true);
  assert.equal(byId.get('w:read').readAt, at + 50);
});

test('v1/v2 and unversioned files preserve absent domains and newer focus fields', () => {
  const storage = memoryStorage(); populateMemory(storage);
  const before = [...storage.data], current = normalizeFocus({ notes: '保留', tasks: [{ id: 'local', text: '本机任务' }], rewards: { fish: 12 } });
  for (const kind of ['AlbumCircleCollection', 'FlowCabinBackup']) for (const version of [undefined, 1, 2]) {
    const parsed = parseBackup(JSON.stringify({ kind, version, items: [], focus: { settings: { focusMin: 50 } } }));
    assert.equal(parsed.memory, null);
    assert.deepEqual(restoreBackupMemory(parsed, { storage }), { changed: [] });
    const restored = normalizeFocus(restoreFocus(parsed.focus, current));
    assert.equal(restored.notes, current.notes);
    assert.deepEqual(restored.tasks, current.tasks);
    assert.deepEqual(restored.rewards, current.rewards);
    assert.equal(restored.settings.focusMin, 50);
  }
  assert.deepEqual([...storage.data], before);
  assert.equal(normalizeFocus(restoreFocus({ notes: '' }, current)).notes, '');
});

test('legacy wrapped session logs migrate without losing album, track and cover', () => {
  const storage = memoryStorage();
  const { record } = populateMemory(storage);
  storage.setItem(SESSION_LOG_KEY, JSON.stringify({ version: 1, sessions: [{ ...record, start: undefined, end: undefined, startedAt: record.start, endedAt: record.end }] }));
  const parsed = parseBackup(JSON.stringify(buildBackup({ storage })));
  const destination = memoryStorage();
  restoreBackupMemory(parsed, { storage: destination });
  assert.deepEqual(loadSessions({ storage: destination }), loadSessions({ storage }));
  assert.equal(JSON.parse(destination.getItem(SESSION_LOG_KEY))[0].album.id, 'album');
});

test('study logs and daily limits remain restorable with no decks or countdowns', () => {
  for (const study of [{ log: { '2026-10-18': { reviews: 8, learned: 3 } } }, { newPerDay: 0 }]) {
    const parsed = parseBackup(JSON.stringify(buildBackup({ study, storage: null })));
    assert.deepEqual(parsed.study, normalizeStudy(study));
    assert.equal(backupReplacements(parsed, { study: true })[0].id, 'study');
  }
});

test('restore merges local history and is idempotent, including read and reward state', () => {
  const source = memoryStorage(), destination = memoryStorage();
  const { record } = populateMemory(source); populateMemory(destination);
  const localSession = { ...record, id: 'local', start: at + 60000, end: at + 120000 };
  appendSession(localSession, destination);
  saveLetter(destination, letter('local', at + 10));
  markRead(destination, letter().id);
  saveLetter(source, letter());
  const care = readCare(destination, at + 2);
  writeCare({ ...care, pets: { ...care.pets, count: 8 }, rewarded: [...care.rewarded, 'local'], feeds: [...care.feeds, { at: at + 20, fishLeft: 2 }], totalFeeds: 2 }, destination);
  const parsed = parseBackup(JSON.stringify(buildBackup({ storage: source }))), target = new EventTarget();
  let eventCount = 0; target.addEventListener('storage', () => { eventCount++; });
  restoreBackupMemory(parsed, { storage: destination, target });
  assert.equal(loadSessions({ storage: destination }).length, 2);
  assert.equal(readLetters(destination).length, 2);
  assert.equal(readLetters(destination).find((value) => value.id === letter().id).read, true);
  assert.equal(readCare(destination, at).pets.count, 8);
  assert.ok(readCare(destination, at).rewarded.includes('local'));
  assert.equal(readCare(destination, at).feeds.length, 2);
  const saved = [...destination.data], beforeEvents = eventCount;
  assert.deepEqual(restoreBackupMemory(parsed, { storage: destination, target }), { changed: [] });
  assert.equal(eventCount, beforeEvents);
  assert.deepEqual([...destination.data], saved);
  restoreBackupMemory({ memory: { version: 1, focusSessions: [], letters: [], catCare: {} } }, { storage: destination });
  assert.deepEqual([...destination.data], saved, 'empty imported lists do not erase local history');
});

test('backup reads only memory allowlist and drops arbitrary credential-bearing fields', () => {
  const storage = memoryStorage(); const { record } = populateMemory(storage);
  let journal = saveJournalEntry({ storage, body: '只备份正文与历史。', tags: ['私密'], now: at });
  journal = saveJournalEntry({ storage, id: journal.entry.id, expectedVersion: journal.entry.version, body: '第二稿。', tags: ['私密'], now: at + 1 });
  assert.equal(journal.ok, true);
  storage.setItem(AI_KEY_KEY, 'DO_NOT_EXPORT_KEY');
  storage.setItem(AI_SETTINGS_KEY, JSON.stringify({ baseUrl: 'https://example.test?token=DO_NOT_EXPORT_KEY' }));
  storage.setItem('provider-login', 'DO_NOT_EXPORT_KEY');
  const addSecret = (key) => {
    const value = JSON.parse(storage.getItem(key));
    storage.setItem(key, JSON.stringify(Array.isArray(value) ? value.map((entry) => ({ ...entry, credentials: 'DO_NOT_EXPORT_KEY' })) : { ...value, apiKey: 'DO_NOT_EXPORT_KEY' }));
  };
  for (const key of [SESSION_LOG_KEY, MOOD_KEY, META_KEY, LETTERS_KEY, JOURNAL_KEY]) addSecret(key);
  const journalRows = JSON.parse(storage.getItem(JOURNAL_KEY));
  journalRows[0].revisions[0].connection = { accessToken: 'DO_NOT_EXPORT_KEY' };
  storage.setItem(JOURNAL_KEY, JSON.stringify(journalRows));
  storage.reads.length = 0;
  const backup = buildBackup({ storage, apiKey: 'DO_NOT_EXPORT_KEY',
    focus: { sessions: [{ ...record, token: 'DO_NOT_EXPORT_KEY' }], settings: { apiKey: 'DO_NOT_EXPORT_KEY' } },
    study: { apiKey: 'DO_NOT_EXPORT_KEY' }, sound: { rain: .5, apiKey: 'DO_NOT_EXPORT_KEY' },
    items: [{ id: 'album', title: 'Night', artist: 'Artist', credential: 'DO_NOT_EXPORT_KEY', externalIds: { itunesTrackId: '123', apiKey: 'DO_NOT_EXPORT_KEY' },
      trackDetails: [{ title: 'Track', credential: 'DO_NOT_EXPORT_KEY' }] }] });
  assert.deepEqual(storage.reads, [...['pixel','warm','night-study','forest','seaside','starlight','rain-train','greenhouse'].flatMap(theme => [`flow-cabin-room-layout-v2:${theme}`, `flow-cabin-room-layout-v2:original:${theme}`, `flow-cabin-room-layout-art-v2:${theme}`]), 'flow-cabin-life-v1','flow-cabin-sky-v1','flow-cabin-location-v1','flow-cabin-recipes-v1','flow-cabin-lights-v1','cabin.petPack.v1', SESSION_LOG_KEY, MOOD_KEY, META_KEY, LETTERS_KEY, PLAYBACK_LOG_KEY, JOURNAL_KEY, ...SOUVENIR_KEYS]);
  assert.ok(!JSON.stringify(backup).includes('DO_NOT_EXPORT_KEY'));
  assert.equal(backup.memory.journalEntries[0].body, '第二稿。');
  assert.equal(backup.items[0].externalIds.itunesTrackId, '123');
  const destination = memoryStorage([[AI_KEY_KEY, 'LOCAL_KEY'], ['unrelated', 'keep']]);
  restoreBackupMemory(parseBackup(JSON.stringify(backup)), { storage: destination });
  assert.equal(destination.getItem(AI_KEY_KEY), 'LOCAL_KEY');
  assert.equal(destination.getItem('unrelated'), 'keep');
});

test('invalid versions, structures and records are rejected without storage changes', () => {
  const base = { kind: 'FlowCabinBackup', version: 3, items: [] }, storage = memoryStorage(); populateMemory(storage);
  const before = [...storage.data];
  const invalid = [
    ...[0, -1, BACKUP_VERSION + 1, '3', 2.5, null].map((version) => ({ version })),
    { focus: [] }, { focus: { notes: {} } }, { focus: { tasks: [null] } }, { focus: { sessions: [{ start: 1, end: 0 }] } },
    { study: [] }, { study: { decks: 'bad' } }, { study: { cards: [{ id: 'orphan', front: 'lost' }] } },
    { sound: [] }, { memory: [] }, { memory: { version: 2 } }, { memory: { focusSessions: null } },
    { memory: { focusSessions: [{ start: 1, end: 0 }] } }, { memory: { focusSessions: { version: 2, sessions: [] } } },
    { memory: { catMood: { mood: 101, updatedAt: at } } }, { memory: { catMood: { mood: 60, updatedAt: at, feeds: [null] } } },
    { memory: { catCare: { pets: { day: '2026-10-18', count: -1 } } } }, { memory: { catCare: { rewarded: {} } } },
    { memory: { letters: [{ ...letter(), lines: [{}] }] } }, { memory: { letters: [{ ...letter(), at: 'bad' }] } },
    { memory: { playbackSessions: {} } }, { memory: { playbackSessions: [{ id: 'play', start: at, end: at + 1000, durationMs: 1001 }] } },
    { memory: { journalEntries: {} } }, { memory: { journalEntries: [null] } },
    { memory: { journalEntries: [journalEntry('too-long', { body: '长'.repeat(8001) })] } },
    { memory: { journalEntries: [journalEntry('duplicate'), journalEntry('duplicate')] } }
  ];
  for (const patch of invalid) assert.throws(() => parseBackup(JSON.stringify({ ...base, ...patch })), /格式无效|版本/);
  assert.throws(() => restoreBackupMemory({ memory: { letters: [null] } }, { storage }), /格式无效/);
  assert.deepEqual([...storage.data], before);
});

test('preview and parsing never write, and memory replacement requires an available handler', () => {
  const storage = memoryStorage(); populateMemory(storage);
  const backup = buildBackup({ storage }), before = storage.writes.length;
  const parsed = parseBackup(JSON.stringify(backup));
  assert.deepEqual(backupReplacements(parsed), []);
  assert.deepEqual(backupReplacements(parsed, { memory: true }).map((entry) => entry.id), ['memory']);
  assert.equal(storage.writes.length, before);
});

test('UTF-8 byte limits apply to parsing and the actual formatted export', () => {
  assert.throws(() => parseBackup(`{"kind":"FlowCabinBackup","items":[],"padding":"${'猫'.repeat(Math.ceil(MAX_BACKUP_BYTES / 3))}"}`), /32 MB/);
  assert.throws(() => buildBackup({ storage: null, items: [{ id: 'oversize', title: '猫'.repeat(Math.ceil(MAX_BACKUP_BYTES / 3)) }] }), /32 MB/);
});

test('failed writes roll back every committed store and emit no refresh', () => {
  const source = memoryStorage(); populateMemory(source);
  const parsed = parseBackup(JSON.stringify(buildBackup({ storage: source })));
  for (const preexisting of [false, true]) {
    const destination = memoryStorage([[AI_KEY_KEY, 'LOCAL_KEY']]);
    if (preexisting) {
      appendSession({ ...JSON.parse(source.getItem(SESSION_LOG_KEY))[0], id: 'old' }, destination);
      writeCare(normalizeCare(null, at), destination);
    }
    const before = [...destination.data], write = destination.setItem, target = new EventTarget();
    let refreshes = 0; target.addEventListener('storage', () => refreshes++);
    destination.setItem = (key, value) => { if (key === LETTERS_KEY) throw new Error('quota'); write(key, value); };
    assert.throws(() => restoreBackupMemory(parsed, { storage: destination, target }), /原有内容保持不变/);
    assert.deepEqual([...destination.data], before);
    assert.equal(refreshes, 0);
  }
});

test('a journal write failure rolls back earlier stores and keeps the local page', () => {
  const source = memoryStorage(); populateMemory(source);
  assert.equal(saveJournalEntry({ storage: source, body: '备份里的新一页。', tags: ['备份'], now: at + 40 }).ok, true);
  const parsed = parseBackup(JSON.stringify(buildBackup({ storage: source })));
  const destination = memoryStorage([[AI_KEY_KEY, 'LOCAL_KEY']]);
  const local = journalEntry('local', { body: '本机不能丢的一页', updatedAt: at + 50 });
  destination.setItem(JOURNAL_KEY, JSON.stringify([local]));
  const before = [...destination.data], write = destination.setItem, target = new EventTarget(), events = [];
  target.addEventListener('storage', () => events.push('storage'));
  target.addEventListener(JOURNAL_CHANGE, () => events.push(JOURNAL_CHANGE));
  destination.setItem = (key, value) => {
    if (key === JOURNAL_KEY) throw new Error('quota');
    write(key, value);
  };
  assert.throws(() => restoreBackupMemory(parsed, { storage: destination, target }), /原有内容保持不变/);
  assert.deepEqual([...destination.data], before);
  assert.deepEqual(events, []);
  assert.equal(readJournalRecords(destination)[0].body, '本机不能丢的一页');
});

test('unavailable or corrupt local storage fails visibly rather than claiming a complete backup', () => {
  assert.throws(() => buildBackup({ storage: { getItem() { throw new Error('blocked'); } } }), /blocked/);
  assert.throws(() => readBackupMemory(memoryStorage([[LETTERS_KEY, '{bad'] ])), /格式无效/);
  const badJournal = memoryStorage([[JOURNAL_KEY, '{bad']]);
  assert.throws(() => readBackupMemory(badJournal), /小屋手记格式异常/);
  assert.throws(() => buildBackup({ storage: badJournal }), /小屋手记格式异常/);
  assert.throws(() => restoreBackupMemory({ memory: { journalEntries: [journalEntry()] } }, { storage: badJournal }), /小屋手记格式异常/);
  assert.equal(badJournal.getItem(JOURNAL_KEY), '{bad');
  assert.throws(() => restoreBackupMemory({ memory: { letters: [letter()] } }, { storage: null }), /无法保存/);
});

test('legacy album identities survive session backup without inventing catalog ids', () => {
  for (const album of ['Night', { title: 'Night', artist: 'Artist' }, null]) {
    const source = memoryStorage(), destination = memoryStorage();
    source.setItem(SESSION_LOG_KEY, JSON.stringify([{ id: 'session', start: at, end: at + 60000, album, track: { title: 'Track', artist: 'Artist', album: 'Night' }, cover: '/cover.png' }]));
    const parsed = parseBackup(JSON.stringify(buildBackup({ storage: source })));
    restoreBackupMemory(parsed, { storage: destination });
    assert.deepEqual(loadSessions({ storage: destination }), loadSessions({ storage: source }));
  }
});

test('older sparse memories cannot erase newer letters, album snapshots or cat care', () => {
  const destination = memoryStorage(), { record } = populateMemory(destination);
  saveLetter(destination, { ...letter(), at: at + 100, lines: ['Newer letter'], read: true });
  const incoming = { version: 1, letters: [letter()], focusSessions: [{ ...record, album: null, track: null, cover: '', taskText: '' }],
    catMood: { mood: 35, updatedAt: at - 100, feeds: [], totalFeeds: 0 }, catCare: { pets: { day: '2026-1-1', count: 9 }, rewarded: [] } };
  const currentCare = readCare(destination, at + 2);
  restoreBackupMemory({ memory: incoming }, { storage: destination });
  assert.equal(readLetters(destination)[0].lines[0], 'Newer letter');
  assert.deepEqual(readCare(destination, at + 2), currentCare);
  const restored = JSON.parse(destination.getItem(SESSION_LOG_KEY))[0];
  assert.deepEqual(restored.album, record.album);
  assert.deepEqual(restored.track, record.track);
  assert.equal(restored.cover, record.cover);
  assert.equal(restored.taskText, record.taskText);
});

test('merging histories does not truncate existing feeds, rewards, sessions or letters', () => {
  const destination = memoryStorage(), source = memoryStorage();
  const { record } = populateMemory(source);
  const feeds = Array.from({ length: 400 }, (_, index) => ({ at: at - index - 1, fishLeft: 2 }));
  destination.setItem(MOOD_KEY, JSON.stringify({ v: 1, mood: 60, updatedAt: at - 1, feeds, totalFeeds: 400 }));
  destination.setItem(META_KEY, JSON.stringify({ rewarded: Array.from({ length: 200 }, (_, index) => `local-${index}`) }));
  destination.setItem(LETTERS_KEY, JSON.stringify(Array.from({ length: 60 }, (_, index) => letter(`local-${index}`, at - index - 1))));
  destination.setItem(SESSION_LOG_KEY, JSON.stringify(Array.from({ length: 5000 }, (_, index) => ({ ...record, id: `local-${index}`, start: at - (index + 1) * 60000, end: at - index * 60000 }))));
  restoreBackupMemory(parseBackup(JSON.stringify(buildBackup({ storage: source }))), { storage: destination });
  const memory = readBackupMemory(destination);
  assert.equal(memory.catMood.feeds.length, 401);
  assert.equal(memory.catCare.rewarded.length, 201);
  assert.equal(memory.letters.length, 61);
  assert.equal(memory.focusSessions.length, 5001);
});

test('real playback logs round-trip verified listening time and refresh without a focus session', () => {
  const source = memoryStorage(), destination = memoryStorage(), target = new EventTarget(), events = [];
  let time = at;
  const log = createPlaybackLog({ storage: source, now: () => time, wallNow: () => time, makeId: () => 'backup-test' });
  const track = { id: 'album', index: 0, title: 'Song', artist: 'Artist', album: 'Night', url: 'https://example.test/?token=SECRET', apiKey: 'SECRET' };
  log.remoteSample({ playing: true, position: 0, track });
  time += 1000; log.remoteSample({ playing: true, position: 1, track });
  time += 1000; log.remoteSample({ playing: true, position: 2, track });
  time += 1000; log.remoteSample({ playing: false, position: 2, track });
  const recorded = readPlaybackSessions(source);
  assert.equal(recorded[0].end - recorded[0].start, 2000);
  assert.equal(recorded[0].durationMs, 1000);
  const backup = buildBackup({ storage: source });
  assert.equal(JSON.stringify(backup).includes('SECRET'), false);
  assert.deepEqual(backup.memory.playbackSessions, recorded);
  target.addEventListener('storage', (event) => events.push(event.key));
  target.addEventListener('cabin:focus-session', () => assert.fail('listening is not focus'));
  restoreBackupMemory(parseBackup(JSON.stringify(backup)), { storage: destination, target });
  assert.deepEqual(readPlaybackSessions(destination), recorded);
  assert.deepEqual(events, [PLAYBACK_LOG_KEY]);
});

test('playback restore upserts checkpoints without adding durations or replacing a final flush', () => {
  const storage = memoryStorage();
  const final = { id: 'p-song', start: at, end: at + 30000, durationMs: 20000, reason: 'pause', track: { index: 0, title: 'Song', artist: 'Artist' }, album: { id: 'album', title: 'Night', artist: 'Artist' } };
  storage.setItem(PLAYBACK_LOG_KEY, JSON.stringify([final]));
  const checkpoint = { ...final, end: at + 15000, durationMs: 10000, reason: 'checkpoint' };
  const parsed = parseBackup(JSON.stringify(buildBackup({ storage: null, memory: { playbackSessions: [checkpoint] } })));
  restoreBackupMemory(parsed, { storage });
  assert.deepEqual(readPlaybackSessions(storage), [final]);
  const updated = { ...final, end: at + 40000, durationMs: 25000 };
  restoreBackupMemory({ memory: { playbackSessions: [updated] } }, { storage });
  restoreBackupMemory({ memory: { playbackSessions: [updated] } }, { storage });
  assert.deepEqual(readPlaybackSessions(storage), [updated]);
  restoreBackupMemory(parseBackup('{"kind":"FlowCabinBackup","version":2,"items":[]}'), { storage });
  assert.deepEqual(readPlaybackSessions(storage), [updated]);
});

test('v4 deletion markers beat old and future-dated backups; fresh profiles can recover an external old copy', async () => {
  const { purgeJournalEntry } = await import('./focus/journal-entries.mjs');
  const { organizeLetterThread, purgeLetterThread } = await import('./ai/letter-reply.mjs');
  const storage = memoryStorage();
  let page = saveJournalEntry({ storage, body: 'private-journal-original', now: at }).entry;
  page = saveJournalEntry({ storage, id: page.id, expectedVersion: page.version, body: 'private-journal-edited', tags: ['private-tag'], now: at + 1 }).entry;
  saveLetter(storage, { id: 'outgoing-letter', direction: 'out', status: 'sent', lines: ['private-letter'], at });
  saveLetter(storage, { id: 'draft:my-letter', direction: 'out', status: 'draft', lines: ['private-letter'], at });
  saveLetter(storage, { id: 'reply-letter', replyTo: 'outgoing-letter', lines: ['private-reply'], at: at + 1 });
  saveSouvenirs({ storage, state: souvenirState([letterSouvenir]) });
  const old = buildBackup({ storage });
  page = moveJournalEntry({ storage, id: page.id, expectedVersion: page.version, trash: true, now: at + 2 }).entry;
  assert.equal(purgeJournalEntry({ storage, id: page.id, expectedVersion: page.version, now: at + 3 }).ok, true);
  organizeLetterThread({ storage, id: 'outgoing-letter', action: 'trash' });
  assert.equal(purgeLetterThread({ storage, id: 'outgoing-letter', expectedOrganizedAt: readLetters(storage).find((x) => x.id === 'outgoing-letter').organizedAt }).ok, true);
  const clean = buildBackup({ storage });
  assert.equal(clean.version, BACKUP_VERSION); assert.ok(!JSON.stringify(clean).includes('private-'));
  for (const version of [1, 2, 3, 4]) {
    const saved = parseBackup(JSON.stringify({ ...old, version }));
    saved.memory.journalEntries[0].updatedAt = at + 99999;
    saved.memory.letters.forEach((letter) => { letter.at = at + 99999; });
    restoreBackupMemory(saved, { storage });
    assert.deepEqual(readJournalRecords(storage), []); assert.deepEqual(readLetters(storage), []);
    assert.ok(!JSON.stringify(buildBackup({ storage })).includes('private-'));
  }
  const fresh = memoryStorage();
  restoreBackupMemory(parseBackup(JSON.stringify(old)), { storage: fresh });
  assert.equal(readJournalRecords(fresh).length, 1); assert.equal(readLetters(fresh).length, 3);
  restoreBackupMemory(parseBackup(JSON.stringify(clean)), { storage: fresh });
  assert.deepEqual(readJournalRecords(fresh), []); assert.deepEqual(readLetters(fresh), []);
  assert.deepEqual(readSouvenirs(fresh), souvenirState([letterSouvenir]));
  assert.deepEqual(restoreBackupMemory(parseBackup(JSON.stringify(clean)), { storage: fresh }).changed, []);
  const before = new Map(fresh.data);
  const bad = { getItem: fresh.getItem, removeItem: fresh.removeItem, setItem(key, value) { if (key === JOURNAL_KEY) throw new Error('quota'); fresh.setItem(key, value); } };
  const other = { memory: { letters: [{ id: 'another', lines: ['new'], at }], journalEntries: [{ id: 'another', purgedAt: at }] } };
  assert.throws(() => restoreBackupMemory(other, { storage: bad }), /原有内容保持不变/);
  assert.deepEqual(fresh.data, before);
});

test('malformed deletion markers reject backup before writing and discard hidden payload fields', () => {
  const storage = memoryStorage();
  for (const domain of ['letters', 'journalEntries']) {
    for (const marker of [{ id: 'x', purgedAt: -1 }, { id: '', purgedAt: at }, { id: 'x', purgedAt: 'yesterday' }]) {
      assert.throws(() => restoreBackupMemory({ memory: { [domain]: [marker] } }, { storage }), /格式无效/);
    }
    const parsed = parseBackup(JSON.stringify({ kind: 'FlowCabinBackup', version: 4, items: [], memory: { [domain]: [{ id: 'x', purgedAt: at, body: 'private', lines: ['private'], revisions: [{ body: 'private' }] }] } }));
    assert.deepEqual(parsed.memory[domain], [{ id: 'x', purgedAt: at }]);
  }
  assert.equal(storage.writes.length, 0);
});

// 最高优先级：导入要么整份成功，要么原封不动。
test('an import either lands completely or changes nothing at all', () => {
  const storage = memoryStorage();
  populateMemory(storage);
  const before = [...storage.data];
  // 1) 文件里有任何一处不合法，解析阶段就停下，本机一个字节都不动。
  const broken = [
    { version: 4, memory: { letters: [{ id: 'x', at: 'yesterday', lines: ['a'] }] } },
    { version: 4, memory: { journalEntries: [{ id: 'x', body: 'b', createdAt: at, updatedAt: at, revisions: [] }, { id: 'x', body: 'b', createdAt: at, updatedAt: at, revisions: [] }] } },
    { version: 4, memory: { souvenirs: souvenirState([{ ...focusSouvenir(), earnedOn: '2026-02-30' }]) } },
    { version: 4, focus: { tasks: [null] } },
    { version: 4, study: { decks: 'not a list' } }
  ];
  for (const patch of broken) {
    assert.throws(() => parseBackup(JSON.stringify({ kind: 'FlowCabinBackup', items: [], ...patch })), /格式无效|版本|纪念物/);
    assert.deepEqual([...storage.data], before, 'a rejected file never touches the machine');
  }
  // 2) 本机自己的存储坏了，也要先停下来，不能写一半。
  const corrupt = memoryStorage([[JOURNAL_KEY, '{bad']]);
  assert.throws(() => restoreBackupMemory({ memory: { focusSessions: [{ id: 's', start: at, end: at + 60000, completed: true }], letters: [letter()] } }, { storage: corrupt }), /小屋手记格式异常/);
  assert.equal(corrupt.writes.length, 0, 'nothing was written');
  assert.equal(corrupt.getItem(JOURNAL_KEY), '{bad');
  // 3) 写盘时中途失败，已经写进去的都要退回来。
  const destination = memoryStorage();
  const write = destination.setItem;
  destination.setItem = (key, value) => { if (key === LETTERS_KEY) throw new Error('quota'); write(key, value); };
  assert.throws(() => restoreBackupMemory({ memory: { focusSessions: [{ id: 's', start: at, end: at + 60000, completed: true }], letters: [letter()] } }, { storage: destination }), /原有内容保持不变/);
  assert.deepEqual([...destination.data], []);
});

// 最高优先级：旧版本的备份必须还能读进来。
test('every shipped backup version still imports, and a newer one is refused', () => {
  const storage = memoryStorage();
  const focus = { tasks: [{ id: 't', text: '读书' }], notes: '随手记', settings: { focusMin: 30 } };
  const study = { decks: [{ id: 'd', name: '英语' }], cards: [], countdowns: [] };
  for (const version of [undefined, 1, 2, 3, 4, BACKUP_VERSION]) {
    const file = JSON.stringify({ kind: 'FlowCabinBackup', ...(version === undefined ? {} : { version }), items: [],
      focus, study, sound: { rain: 0.5 } });
    const parsed = parseBackup(file);
    assert.equal(parsed.version, version === undefined ? 1 : version);
    assert.deepEqual(parsed.focus.tasks, normalizeFocus(focus).tasks, 'the tasks are normalised, not copied raw');
    assert.equal(parsed.focus.notes, '随手记');
    assert.equal(parsed.focus.settings.focusMin, 30);
    assert.deepEqual(parsed.study.decks, normalizeStudy(study).decks);
    assert.deepEqual(parsed.sound, { rain: 0.5 });
    assert.equal(parsed.memory, null, 'older files carry no memory domain');
    assert.deepEqual(restoreBackupMemory(parsed, { storage }), { changed: [] }, 'an old file never touches the memory store');
  }
  for (const version of [0, -1, BACKUP_VERSION + 1, 99, '4', 2.5, null, true]) {
    assert.throws(() => parseBackup(JSON.stringify({ kind: 'FlowCabinBackup', version, items: [] })), /版本/);
  }
});

// 未知字段：既不报错，也不写进本机。
test('unknown fields in a backup are ignored, never written back', () => {
  const storage = memoryStorage();
  const parsed = parseBackup(JSON.stringify({ kind: 'FlowCabinBackup', version: BACKUP_VERSION, items: [],
    futureDomain: { anything: true }, focus: { tasks: [], notes: 'n', futureField: 'x' }, memory: { version: 1, futureDomain: { secret: 'x' } } }));
  assert.equal(Object.hasOwn(parsed, 'futureDomain'), false);
  assert.equal(Object.hasOwn(parsed.focus, 'futureField'), false);
  assert.equal(Object.hasOwn(parsed.memory, 'futureDomain'), false);
  restoreBackupMemory(parsed, { storage });
  assert.equal(JSON.stringify([...storage.data]).includes('futureDomain'), false);
  // 备份里带一个未知的小屋记忆域：整份都不导入，不猜也不丢。
  const unknown = parseBackup(JSON.stringify({ kind: 'FlowCabinBackup', version: BACKUP_VERSION, items: [], memory: { version: 1, futureDomain: { x: 1 } } }));
  assert.equal(Object.hasOwn(unknown.memory, 'futureDomain'), false);
  assert.deepEqual(restoreBackupMemory(unknown, { storage }), { changed: [] });
});

// 正在跑的计时器不能被备份带回来：恢复不是“继续工作”。
test('a restore never brings a running timer back', () => {
  const running = normalizeFocus({ timer: { phase: 'focus', endsAt: at + 60000, remaining: 60000, startedAt: at } });
  const parsed = parseBackup(JSON.stringify({ kind: 'FlowCabinBackup', version: BACKUP_VERSION, items: [], focus: running }));
  assert.equal(parsed.focus.timer, undefined);
  const restored = normalizeFocus(restoreFocus(parsed.focus, running));
  assert.equal(restored.timer.phase, 'idle');
  assert.equal(restored.timer.endsAt, 0);
});
