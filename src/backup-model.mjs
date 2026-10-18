import { normalizeLibrary } from './record-library.mjs';
import { normalizeStudy } from './study/study-model.mjs';
import { normalizeFocus } from './focus/focus-model.mjs';
import { SESSION_LOG_KEY, normalizeSessionRecord, normalizeCover } from './focus/stats/session-source.mjs';
import { MOOD_KEY, META_KEY, MOOD_EVENT, normalizeCare, storedCare, getCatMoodNow } from './cat/cat-care.mjs';
import { LETTERS_KEY, LETTER_EVENT, normalizeLetter } from './ai/ai-model.mjs';
import { normalizeMix, AMBIENCE_TRACKS } from './audio/ambience.mjs';
import { PLAYBACK_LOG_KEY, readPlaybackSessions } from './player/playback-log.mjs';
import { JOURNAL_KEY, JOURNAL_CHANGE, normalizeJournalRecord, readJournalRecords, mergeJournalRecord } from './focus/journal-entries.mjs';

// v3 adds the journal's independent stores. Credentials and AI connection settings are never read.
export const BACKUP_KIND = 'FlowCabinBackup';
export const BACKUP_VERSION = 3;
export const MAX_BACKUP_BYTES = 8 * 1024 * 1024;
// Earlier releases exported "AlbumCircleCollection" files with the same fields.
const KINDS = [BACKUP_KIND, 'AlbumCircleCollection'];
const plain = (value) => value && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const pick = (value, keys) => Object.fromEntries(keys.filter((key) => own(value, key)).map((key) => [key, value[key]]));
const invalid = (domain) => { throw new Error(`备份中的${domain}格式无效，原有内容保持不变。`); };
const object = (value, domain) => { if (!plain(value)) invalid(domain); return value; };
const array = (value, domain) => { if (!Array.isArray(value)) invalid(domain); return value; };
const finite = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const MEMORY_KEYS = Object.freeze({ focusSessions: SESSION_LOG_KEY, catMood: MOOD_KEY, catCare: META_KEY, letters: LETTERS_KEY, playbackSessions: PLAYBACK_LOG_KEY, journalEntries: JOURNAL_KEY });
const FOCUS_FIELDS = ['tasks', 'sessions', 'rewards', 'settings', 'notes'];

function focusRecord(value) {
  object(value, '专注记录');
  for (const key of ['tasks', 'sessions']) if (own(value, key)) array(value[key], '专注记录');
  for (const key of ['rewards', 'settings']) if (own(value, key)) object(value[key], '专注记录');
  if (own(value, 'notes') && typeof value.notes !== 'string') invalid('随手记');
  const normalized = normalizeFocus(value);
  for (const key of ['tasks', 'sessions']) if (own(value, key) && normalized[key].length !== value[key].length) invalid('专注记录');
  // Missing fields in older files must stay missing until merged with local state.
  return pick(normalized, FOCUS_FIELDS.filter((key) => own(value, key)));
}

function sessionRecord(value) {
  const record = normalizeSessionRecord(value);
  if (!record) invalid('专注日志');
  const album = record.album && (typeof value.album === 'string' ? record.album.title : plain(value.album)
    ? { ...(typeof value.album.id === 'string' ? { id: value.album.id } : {}), title: record.album.title, artist: record.album.artist } : null);
  return { ...record, album,
    cover: normalizeCover(value.cover || value.album?.cover) };
}

function letterRecord(value) {
  if (!plain(value) || typeof value.id !== 'string' || !value.id || !finite(value.at)
    || !Array.isArray(value.lines) || value.lines.some((line) => typeof line !== 'string')) invalid('小屋来信');
  const letter = normalizeLetter(value);
  if (!letter) invalid('小屋来信');
  return letter;
}

function playbackRecord(value) {
  // Use the playback owner's validation without its per-store retention cap.
  const record = readPlaybackSessions({ getItem: () => JSON.stringify([value]) })[0];
  if (!record) invalid('听歌记录');
  return record;
}

function journalEntries(value) {
  const entries = array(value, '小屋手记').map((entry) => {
    const record = normalizeJournalRecord(entry);
    if (!record) invalid('小屋手记');
    return record;
  });
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) invalid('小屋手记');
  return entries;
}

function normalizeMemory(value) {
  if (value == null) return null;
  object(value, '小屋记忆');
  if (own(value, 'version') && value.version !== 1) invalid('小屋记忆版本');
  const out = { version: 1 };
  if (own(value, 'focusSessions')) {
    const log = value.focusSessions;
    if (plain(log) && own(log, 'version') && log.version !== 1) invalid('专注日志版本');
    const records = Array.isArray(log) ? log : object(log, '专注日志').sessions;
    out.focusSessions = array(records, '专注日志').map(sessionRecord);
  }
  if (own(value, 'catMood')) {
    const mood = object(value.catMood, '小猫心情');
    if (own(mood, 'v') && mood.v !== 1) invalid('小猫心情版本');
    if (!finite(mood.mood) || mood.mood > 100 || !finite(mood.updatedAt)) invalid('小猫心情');
    if (own(mood, 'totalFeeds') && !finite(mood.totalFeeds)) invalid('小猫照顾');
    if (own(mood, 'feeds')) for (const feed of array(mood.feeds, '喂食记录')) {
      if (!(finite(feed) || (plain(feed) && finite(feed.at) && finite(feed.fishLeft)))) invalid('喂食记录');
    }
    const feeds = (mood.feeds || []).map((feed) => typeof feed === 'number' ? { at: feed, fishLeft: 0 } : { at: feed.at, fishLeft: Math.round(feed.fishLeft) });
    const care = normalizeCare({ ...mood, totalFeeds: Math.max(mood.totalFeeds || 0, feeds.length) }, mood.updatedAt);
    out.catMood = { ...storedCare(care), feeds };
  }
  if (own(value, 'catCare')) {
    const meta = object(value.catCare, '小猫照顾');
    if (own(meta, 'pets') && (!plain(meta.pets) || typeof meta.pets.day !== 'string' || !finite(meta.pets.count))) invalid('摸猫记录');
    if (own(meta, 'rewarded') && array(meta.rewarded, '小猫奖励').some((id) => typeof id !== 'string')) invalid('小猫奖励');
    // Absence is distinct from an explicitly empty field, including in legacy care metadata.
    out.catCare = { ...(own(meta, 'pets') ? { pets: pick(meta.pets, ['day', 'count']) } : {}),
      ...(own(meta, 'rewarded') ? { rewarded: [...meta.rewarded] } : {}) };
  }
  if (own(value, 'letters')) out.letters = array(value.letters, '小屋来信').map(letterRecord);
  if (own(value, 'playbackSessions')) out.playbackSessions = array(value.playbackSessions, '听歌记录').map(playbackRecord);
  if (own(value, 'journalEntries')) out.journalEntries = journalEntries(value.journalEntries);
  return out;
}

function localStorageOrNull() { try { return globalThis.localStorage || null; } catch { return null; } }

export function readBackupMemory(storage = localStorageOrNull()) {
  const memory = { version: 1 };
  if (!storage) return memory;
  for (const [domain, key] of Object.entries(MEMORY_KEYS)) {
    const raw = storage.getItem(key);
    if (raw != null) {
      if (domain === 'journalEntries') {
        try {
          if (!raw) throw new Error('手记存储为空');
          memory[domain] = readJournalRecords({ getItem: () => raw });
        } catch (error) {
          throw new Error(`小屋手记格式异常，原有内容保持不变：${error?.message || '无法读取'}`);
        }
        continue;
      }
      try { memory[domain] = JSON.parse(raw); } catch { invalid(domain); }
    }
  }
  return normalizeMemory(memory);
}

function soundRecord(value) {
  object(value, '声音设置');
  if (own(value, 'tracks') || own(value, 'master')) return normalizeMix(value);
  return Object.fromEntries(AMBIENCE_TRACKS.filter(({ id }) => finite(value[id])).map(({ id }) => [id, Math.min(1, value[id])]));
}

function studyRecord(value) {
  object(value, '学习记录');
  for (const key of ['decks', 'cards', 'countdowns']) if (own(value, key)) array(value[key], '学习记录');
  if (own(value, 'log')) object(value.log, '学习日志');
  const study = normalizeStudy(value);
  for (const key of ['decks', 'cards', 'countdowns']) if (own(value, key) && value[key].length !== study[key].length) invalid('学习记录');
  return study;
}

function backupItems(items) {
  return array(items, '唱片').map((value) => {
    object(value, '唱片');
    const scalars = (record, fields) => Object.fromEntries(Object.entries(pick(record, fields)).filter(([, entry]) => typeof entry === 'string' || (typeof entry === 'number' && Number.isFinite(entry))));
    const item = scalars(value, ['id', 'type', 'title', 'artist', 'albumTitle', 'trackTimeMillis', 'year', 'label', 'cover', 'originalCover',
      'genre', 'primaryGenreName', 'collectionId', 'collectionViewUrl', 'trackViewUrl', 'notes', 'source', 'addedAt']);
    for (const key of ['tags', 'tracks', 'platforms']) if (Array.isArray(value[key])) item[key] = value[key].map((entry) => typeof entry === 'string' ? entry : entry?.title || entry?.name).filter((entry) => typeof entry === 'string');
    // Catalog identifiers are data, never provider account/session objects.
    if (plain(value.externalIds)) item.externalIds = scalars(value.externalIds, ['qqAlbumMid', 'qqSongMid', 'neteaseAlbumId', 'neteaseSongId', 'itunesCollectionId', 'itunesTrackId', 'playlist', 'localAlbum', 'fileAlbum', 'musicbrainzReleaseId', 'musicbrainzReleaseGroupId', 'barcode']);
    if (Array.isArray(value.trackDetails)) item.trackDetails = value.trackDetails.filter(plain).map((track) => scalars(track, ['title', 'trackNumber', 'lengthMillis', 'source', 'providerId', 'mediaMid', 'cover', 'artist', 'album']));
    return item;
  });
}

// Backups intentionally exclude an active countdown: importing must not start work.
export function backupFocus(state) {
  if (!state) return null;
  return focusRecord(state);
}
export function restoreFocus(saved, current) {
  if (!plain(saved)) return current;
  // Pre-notes backups must not silently erase a newer feature's local content.
  return { ...backupFocus(current), ...focusRecord(saved), notes: own(saved, 'notes') ? saved.notes : current?.notes || '' };
}

export const backupFileName = (now = new Date()) => `FlowCabin-backup-${now.toISOString().slice(0, 10).replace(/-/g, '')}.json`;
export function buildBackup({ items = [], library, roomId = '', focus = null, study = null, sound = null, storage = localStorageOrNull(), memory, now = new Date() }) {
  const backup = { kind: BACKUP_KIND, version: BACKUP_VERSION, exportedAt: now.toISOString(), roomId, items: backupItems(items), library: normalizeLibrary(library),
    focus: focus == null ? null : backupFocus(focus), study: study == null ? null : studyRecord(study),
    sound: sound == null ? null : soundRecord(sound), memory: memory === undefined ? readBackupMemory(storage) : normalizeMemory(memory) };
  // Match the formatted download, so an exported file is always accepted by the importer.
  if (new TextEncoder().encode(JSON.stringify(backup, null, 2)).byteLength > MAX_BACKUP_BYTES) throw new Error('备份文件最大 8 MB。');
  return backup;
}

// Validate before any import writes. The shelf receives allowlisted item metadata
// and performs its own catalog normalization and id remapping.
export function parseBackup(text) {
  if (typeof text !== 'string') throw new Error('文件内容无法读取。');
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) throw new Error('备份文件最大 8 MB。');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('文件内容无法读取。'); }
  if (!plain(data) || !KINDS.includes(data.kind) || !Array.isArray(data.items)) throw new Error('请选择心流小屋导出的备份文件。');
  const version = own(data, 'version') ? data.version : 1;
  if (![1, 2, BACKUP_VERSION].includes(version)) throw new Error('不支持此备份版本，请使用兼容版本的小屋。');
  const study = data.study == null ? null : studyRecord(data.study);
  return {
    version, items: backupItems(data.items), roomId: typeof data.roomId === 'string' ? data.roomId : '', library: normalizeLibrary(data.library),
    focus: data.focus == null ? null : focusRecord(data.focus),
    study: study && (study.decks.length || study.countdowns.length || Object.keys(study.log).length || own(data.study, 'newPerDay')) ? study : null,
    sound: data.sound == null ? null : soundRecord(data.sound),
    memory: normalizeMemory(data.memory)
  };
}

// What a restore would overwrite on this computer besides the shelf; asked once before replacing.
export function backupReplacements(parsed, available = {}) {
  const out = [];
  if (parsed.focus && available.focus) out.push({ id: 'focus', label: '专注记录、待办与随手记' });
  if (parsed.study && available.study) out.push({ id: 'study', label: `学习记录（${parsed.study.decks.length} 个卡组、${parsed.study.cards.length} 张闪卡、${parsed.study.countdowns.length} 个倒计时）` });
  if (parsed.sound && available.sound) out.push({ id: 'sound', label: '环境声音设置' });
  if (available.memory && parsed.memory && Object.keys(parsed.memory).some((key) => own(MEMORY_KEYS, key))) out.push({ id: 'memory', label: '小屋手记、专注与听歌日志、小猫照顾与来信（合并保留本机记录）' });
  return out;
}

const mergeRecords = (local, incoming, key, combine = (previous, record) => record) => {
  const records = new Map(local.map((record) => [key(record), record]));
  for (const record of incoming) records.set(key(record), records.has(key(record)) ? combine(records.get(key(record)), record) : record);
  return [...records.values()];
};

const LETTER_STATUS_ORDER = Object.freeze({ draft: 0, sending: 1, failed: 2, sent: 3, delivered: 3 });
function mergeLetter(local, saved) {
  // A user letter and an incoming letter are different sides of a thread. If
  // legacy data ever collides on an id, keep the outbound side instead of
  // silently turning the user's own words into a letter from the cabin.
  const candidates = local.direction === saved.direction ? [local, saved] : local.direction === 'out' ? [local] : [saved];
  const latest = candidates.reduce((best, record) => record.at > best.at
    || (record.at === best.at && (LETTER_STATUS_ORDER[record.status] || 0) > (LETTER_STATUS_ORDER[best.status] || 0))
    ? record : best);
  const read = latest.direction === 'out' || local.read || saved.read;
  const readTimes = read ? candidates.map((record) => record.readAt).filter(finite) : [];
  const readAt = readTimes.length ? Math.max(...readTimes) : null;
  const merged = { ...latest, read };
  const organized = candidates.reduce((best, record) => (record.organizedAt || 0) > (best.organizedAt || 0)
    || (record.organizedAt === best.organizedAt && record.trashed) ? record : best);
  if (organized.organizedAt != null) Object.assign(merged, {
    organizedAt: organized.organizedAt, favorite: organized.favorite, trashed: organized.trashed
  });
  if (readAt == null) delete merged.readAt; else merged.readAt = readAt;
  return normalizeLetter(merged);
}

// Call only after the user accepts the import. Parsing and previewing never write.
// All stores commit before any refresh; historical sessions must never emit a completion event.
export function restoreBackupMemory(parsed, { storage = localStorageOrNull(), target = globalThis.window } = {}) {
  const incoming = normalizeMemory(parsed?.memory);
  if (!incoming || !Object.keys(MEMORY_KEYS).some((key) => own(incoming, key))) return { changed: [] };
  if (!storage) throw new Error('无法保存小屋记忆，请检查存储空间。');
  const current = readBackupMemory(storage), next = { ...incoming };
  if (incoming.focusSessions) next.focusSessions = mergeRecords(current.focusSessions || [], incoming.focusSessions, (record) => record.id,
    (local, saved) => ({ ...saved, album: saved.album || local.album, track: saved.track || local.track, cover: saved.cover || local.cover, taskText: saved.taskText || local.taskText, taskId: saved.taskId || local.taskId })).sort((a, b) => a.start - b.start);
  if (incoming.playbackSessions) next.playbackSessions = mergeRecords(current.playbackSessions || [], incoming.playbackSessions, (record) => record.id,
    (local, saved) => local.durationMs > saved.durationMs || (local.durationMs === saved.durationMs
      && (local.end > saved.end || (local.reason !== 'checkpoint' && saved.reason === 'checkpoint'))) ? local : saved).sort((a, b) => a.start - b.start);
  if (incoming.letters) {
    next.letters = mergeRecords(current.letters || [], incoming.letters, (record) => record.id, mergeLetter)
      .sort((a, b) => b.at - a.at);
  }
  if (incoming.journalEntries) {
    next.journalEntries = mergeRecords(current.journalEntries || [], incoming.journalEntries, (record) => record.id, mergeJournalRecord)
      .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  }
  if (incoming.catMood && current.catMood) {
    const feeds = mergeRecords(current.catMood.feeds, incoming.catMood.feeds, (feed) => feed.at).sort((a, b) => a.at - b.at);
    const latest = current.catMood.updatedAt > incoming.catMood.updatedAt ? current.catMood : incoming.catMood;
    next.catMood = { ...storedCare(normalizeCare({ ...latest, feeds, totalFeeds: Math.max(current.catMood.totalFeeds, incoming.catMood.totalFeeds, feeds.length) }, latest.updatedAt)), feeds };
  }
  if (incoming.catCare) {
    const local = current.catCare || {}, saved = incoming.catCare;
    next.catCare = { ...local, ...saved, rewarded: [...new Set([...(local.rewarded || []), ...(saved.rewarded || [])])] };
    if (local.pets && saved.pets) {
      const dayTime = (day) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d).getTime() || 0; };
      next.catCare.pets = local.pets.day === saved.pets.day ? { day: saved.pets.day, count: Math.max(local.pets.count, saved.pets.count) }
        : dayTime(local.pets.day) > dayTime(saved.pets.day) ? local.pets : saved.pets;
    }
  }
  const writes = Object.entries(MEMORY_KEYS).filter(([domain]) => own(next, domain)).map(([domain, key]) => ({ key, oldValue: storage.getItem(key), newValue: JSON.stringify(next[domain]) })).filter((write) => write.oldValue !== write.newValue);
  const committed = [];
  try {
    for (const write of writes) { storage.setItem(write.key, write.newValue); committed.push(write); }
  } catch {
    let rollbackFailed = false;
    for (const write of committed.reverse()) {
      try { if (write.oldValue == null) storage.removeItem(write.key); else storage.setItem(write.key, write.oldValue); } catch { rollbackFailed = true; }
    }
    throw new Error(rollbackFailed ? '小屋记忆保存失败，部分写入无法回滚，请保留备份后重试。' : '小屋记忆未能保存，原有内容保持不变。');
  }
  const EventClass = target?.Event || globalThis.Event, CustomEventClass = target?.CustomEvent || globalThis.CustomEvent;
  for (const write of writes) {
    if (!target?.dispatchEvent || !EventClass) continue;
    const event = new EventClass('storage');
    Object.defineProperties(event, Object.fromEntries(Object.entries({ ...pick(write, ['key', 'oldValue', 'newValue']), storageArea: storage }).map(([key, value]) => [key, { value }])));
    target.dispatchEvent(event);
  }
  if (target?.dispatchEvent && CustomEventClass) {
    if (writes.some(({ key }) => key === MOOD_KEY || key === META_KEY)) target.dispatchEvent(new CustomEventClass(MOOD_EVENT, { detail: getCatMoodNow(storage) }));
    if (writes.some(({ key }) => key === LETTERS_KEY)) target.dispatchEvent(new CustomEventClass(LETTER_EVENT));
    if (writes.some(({ key }) => key === JOURNAL_KEY)) target.dispatchEvent(new CustomEventClass(JOURNAL_CHANGE));
  }
  return { changed: writes.map(({ key }) => key) };
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
