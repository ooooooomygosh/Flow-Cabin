import { invalidateRecovery } from '../backup/recovery.mjs';
import { JOURNAL_KEY, JOURNAL_CHANGE, normalizeJournalStoredRecord } from '../focus/journal-entries.mjs';
import { SESSION_LOG_KEY, SESSION_EVENT } from '../focus/session-log.mjs';
import { validateLayout as validateLegacy } from '../room2/layout.mjs';
import { validateLayout as validateSpatial, LAYOUT_PREFIX } from '../home/spatial-layout.mjs';
import { normalizeRecipes, RECIPES_KEY } from '../home/recipes.mjs';
import { normalizeLibrary, LIBRARY_PREFIX } from '../record-library.mjs';
import { normalizeFocus, FOCUS_PREFIX, unlockedIds, UNLOCKS } from '../focus/focus-model.mjs';
import { normalizeWebItem, WEB_COLLECTION_KEY } from '../browser-collection.mjs';
import { listItems, importItems, removeItem } from '../collection-api.mjs';
const validateLayout = value => value?.version === 2 ? validateSpatial(value) : validateLegacy(value);
const FAVORITES = 'flow-cabin-lan-favorites-v1', COMPANION = 'flow-cabin-lan-companion-v1', SYNC_DOMAINS = ['notes','layouts','focus','companion','recipes','favorites'];
const LIBRARY_KEY = LIBRARY_PREFIX+'local-owner', FOCUS_KEY = FOCUS_PREFIX+'local-owner';
const META = 'flow-cabin-lan-revisions-v1', DEVICE = 'flow-cabin-lan-device-v1';
const PREFIX = 'flow-cabin-room-layout-art-v2:', CONFLICT = 'flow-cabin-lan-layout-conflict:';
let queue = Promise.resolve();
export function withSyncLock(operation) { const next = queue.then(operation, operation); queue = next.catch(() => {}); return next; }
export function storageFingerprint(storage = localStorage) {
  const keys = [JOURNAL_KEY, SESSION_LOG_KEY,RECIPES_KEY,LIBRARY_KEY,FAVORITES,COMPANION];
  for (let i = 0; i < storage.length; i++) { const key = storage.key(i); if (key.startsWith(PREFIX) || (key.startsWith(LAYOUT_PREFIX) && !key.startsWith(LAYOUT_PREFIX+'original:')) || key.startsWith(CONFLICT)) keys.push(key); }
  return JSON.stringify([...keys.sort().map(key => [key, storage.getItem(key)]), ['equipped',json(storage,FOCUS_KEY,{})?.rewards?.equipped],['unlocks',json(storage,FOCUS_KEY,{})?.rewards?.bought]]);
}
export function applyIfUnchanged(snapshot, fingerprint, storage = localStorage, target = globalThis.window) {
  if (fingerprint !== storageFingerprint(storage)) throw new Error('同步期间本机内容发生变化，已保留本机内容，请重试同步。');
  return applySnapshot(snapshot, storage, target);
}
const empty = () => ({ version: 2, notes: [], layouts: [], focus: [], companion:[],recipes:[],favorites:[] });
const json = (storage, key, fallback) => { const raw = storage.getItem(key); return raw == null ? fallback : JSON.parse(raw); };
const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))].map(n => n.toString(16).padStart(2, '0')).join('');
export async function exportSnapshot(storage = localStorage) {
  let device = storage.getItem(DEVICE); if (!device) { device = crypto.randomUUID(); storage.setItem(DEVICE, device); }
  const previous = json(storage, META, empty()), result = empty();
  const library=normalizeLibrary(json(storage,LIBRARY_KEY,{})),focus=normalizeFocus(json(storage,FOCUS_KEY,{}));
  const companion=library.rooms['local-room'];
  const source=globalThis.window && storage===globalThis.localStorage ? await listItems() : json(storage,WEB_COLLECTION_KEY,{items:[]}).items;
  const favorites=[];for(const item of source){const value=cleanFavorite(item);value.id=(await hash([value.type,value.artist.toLowerCase(),value.title.toLowerCase()])).slice(0,32);favorites.push(value);}
  const data = { notes: json(storage, JOURNAL_KEY, []), focus: json(storage, SESSION_LOG_KEY, []), layouts: [], recipes:json(storage,RECIPES_KEY,{recipes:[]}).recipes,
    companion:companion?[{id:'home',petId:companion.petId,look:companion.look,accessory:focus.rewards.equipped.accessory,unlocked:[...unlockedIds(focus.rewards.xp,focus.rewards.bought)].filter(id=>UNLOCKS.find(i=>i.id===id)?.kind==='accessory')}]:[],favorites };
  for (let i = 0; i < storage.length; i++) { const key = storage.key(i); if (key.startsWith(PREFIX) || (key.startsWith(LAYOUT_PREFIX) && !key.startsWith(LAYOUT_PREFIX+'original:')) || key.startsWith(CONFLICT)) data.layouts.push({ id: key.startsWith(LAYOUT_PREFIX)?'spatial:'+key.slice(LAYOUT_PREFIX.length):key.slice(key.startsWith(PREFIX) ? PREFIX.length : CONFLICT.length), ...json(storage, key, {}) }); }
  for (const domain of SYNC_DOMAINS) {
    const old = new Map((previous[domain] || []).map(r => [r.id, r]));
    for (const value of data[domain]) {
      const id = value.id, before = old.get(id); old.delete(id);
      if (!id) throw new Error('本机同步数据缺少标识');
      const deleted = value.purgedAt != null;
      if (before && before.deleted === deleted && (deleted || JSON.stringify(before.value) === JSON.stringify(value))) result[domain].push(before);
      else result[domain].push({ id, rev: (before?.rev || 0) + 1, device, at: Date.now(), deleted, ...(deleted ? {} : { value }), ...(before ? { base: await hash(before) } : {}) });
    }
    // Keep deletion markers indefinitely; taking a device offline cannot resurrect a deletion.
    for (const before of old.values()) result[domain].push(before.deleted ? before : { id: before.id, rev: before.rev + 1, device, at: Date.now(), deleted: true, base: await hash(before) });
  }
  storage.setItem(META, JSON.stringify(result)); return result;
}
export function applySnapshot(snapshot, storage = localStorage, target = globalThis.window) {
  if (![1,2].includes(snapshot?.version) || !['notes', 'layouts', 'focus'].every(d => Array.isArray(snapshot[d]) && snapshot[d].length <= 5000)) throw new Error('收到的同步格式无效');
  const notes = snapshot.notes.map(r => {
    const value = r.deleted ? { id: r.id, purgedAt: r.at } : normalizeJournalStoredRecord({ ...r.value, id: r.id });
    if (!value) throw new Error('收到的手记格式无效'); return value;
  });
  const focus = snapshot.focus.filter(r => !r.deleted).map(r => {
    const v = r.value;
    if (!v || v.id !== r.id || !Number.isFinite(v.start) || !Number.isFinite(v.end) || v.end < v.start || !Number.isFinite(v.durationMs) || v.durationMs < 0 || typeof v.completed !== 'boolean') throw new Error('收到的专注记录无效');
    return { id: v.id, start: v.start, end: v.end, durationMs: v.durationMs, completed: v.completed, taskId: String(v.taskId || '').slice(0, 100), taskText: String(v.taskText || '').slice(0, 8000), album: v.album, track: v.track, cover: typeof v.cover === 'string' && v.cover.startsWith('data:image/') && v.cover.length <= 400 * 1024 ? v.cover : '' };
  });
  if(snapshot.version===2&&!['companion','recipes','favorites'].every(d=>Array.isArray(snapshot[d])&&snapshot[d].length<=5000))throw Error('同步扩展数据无效');
  const layouts = snapshot.layouts.map(r => ({ record: r, value: r.deleted ? null : validateLayout(r.value) }));
  // Validate everything before writing, then roll back if quota/storage rejects any write.
  const writes = [[JOURNAL_KEY, JSON.stringify(notes)], [SESSION_LOG_KEY, JSON.stringify(focus)], [META, JSON.stringify(snapshot)]];
  if(snapshot.version===2){
    const recipes=snapshot.recipes.filter(r=>!r.deleted).map(r=>({...r.value,id:r.id.replace('~conflict-','-copy-').slice(0,80)}));
    writes.push([RECIPES_KEY,JSON.stringify(normalizeRecipes({version:1,recipes}))]);
    const home=snapshot.companion.find(r=>r.id==='home'&&!r.deleted)?.value;
    if(home){
      const lib=normalizeLibrary(json(storage,LIBRARY_KEY,{})),state=normalizeFocus(json(storage,FOCUS_KEY,{}));
      const next=normalizeLibrary({...lib,rooms:{...lib.rooms,'local-room':{...lib.rooms['local-room'],petId:home.petId,look:home.look}}});
      const unlocked=(Array.isArray(home.unlocked)?home.unlocked:[]).filter(id=>UNLOCKS.some(i=>i.id===id&&i.kind==='accessory'));
      const rewards={...state.rewards,bought:[...new Set([...state.rewards.bought,...unlocked])],equipped:{...state.rewards.equipped,accessory:home.accessory}};
      writes.push([LIBRARY_KEY,JSON.stringify(next)],[FOCUS_KEY,JSON.stringify(normalizeFocus({...state,rewards}))],[COMPANION,JSON.stringify(home)]);
    }
    writes.push([FAVORITES,JSON.stringify({items:snapshot.favorites.filter(r=>!r.deleted).map(r=>cleanFavorite(r.value)),deleted:snapshot.favorites.filter(r=>r.deleted).map(r=>r.id)})]);
  }
  for (const { record: r, value } of layouts) {
    const key = r.id.includes('~conflict-') ? `flow-cabin-lan-layout-conflict:${r.id}` : r.id.startsWith('spatial:') ? LAYOUT_PREFIX+r.id.slice(8) : PREFIX + r.id;
    writes.push([key, value ? JSON.stringify(value) : null]);
  }
  if (snapshot.notes.some(r=>r.deleted)) invalidateRecovery(storage);
  const before = writes.map(([key]) => [key, storage.getItem(key)]);
  try { for (const [key, raw] of writes) raw === null ? storage.removeItem(key) : storage.setItem(key, raw); }
  catch (error) { for (const [key, raw] of before) { try { raw === null ? storage.removeItem(key) : storage.setItem(key, raw); } catch {} } throw error; }
  for(const [key,raw]of writes){const event=new Event('storage');Object.defineProperties(event,{key:{value:key},newValue:{value:raw}});target?.dispatchEvent(event);}
  target?.dispatchEvent(new Event(JOURNAL_CHANGE)); target?.dispatchEvent(new Event(SESSION_EVENT));
  target?.dispatchEvent(new Event('cabin:lan-synced'));
  return { notes: notes.length, focus: focus.length, layouts: layouts.length, conflicts: snapshot.layouts.filter(r => r.id.includes('~conflict-')).length };
}
export async function syncRequest(route, data) {
  if (globalThis.window?.albumMobile?.syncRequest) return window.albumMobile.syncRequest(route, data);
  const response = await fetch(`/desktop-sync${route}`, { method: data === undefined ? 'GET' : 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  const value = await response.json(); if (!response.ok) throw new Error(value.error || '局域网同步暂不可用'); return value;
}
// Install once at the app root. Listener remains off until explicitly enabled in settings.
export function startLanBridge({ onError = () => {} } = {}) {
  let busy = false, closed = false, lastExchange = 0;
  const tick = async () => {
    if (busy || closed) return; busy = true;
    try { await withSyncLock(async () => {
      const state = await syncRequest('/status'); if (!state.enabled || closed) return;
      let fingerprint = storageFingerprint(), local = await exportSnapshot();
      const merged = await syncRequest('/stage', local);
      if (closed) return;
      if (JSON.stringify(merged) !== JSON.stringify(local)) { applyIfUnchanged(merged, fingerprint); await importSyncedFavorites(); }
      // An explicitly connected realtime peer also exchanges durable changes.
      // HTTPS retains the same pinned certificate and conflict/deletion rules.
      if (Date.now() - lastExchange < 15000) return;
      lastExchange = Date.now();
      const live = await syncRequest('/live/status');
      for (const peerId of live.connections || []) {
        if (closed) break;
        if (!state.peers.some(p=>p.id===peerId && p.address)) continue;
        fingerprint = storageFingerprint(); local = await exportSnapshot();
        const incoming = await syncRequest('/sync', { peerId, snapshot: local });
        if (!closed) { applyIfUnchanged(incoming, fingerprint); await importSyncedFavorites(); }
      }
    }); } catch (error) { onError(error); } finally { busy = false; }
  };
  const timer = setInterval(tick, 5000); tick();
  return () => { closed = true; clearInterval(timer); };
}

export function layoutConflicts(storage = localStorage) { const result = []; for (let i = 0; i < storage.length; i++) { const key = storage.key(i); if (key.startsWith(CONFLICT)) { try { result.push({ key, value: validateLayout(json(storage, key)) }); } catch {} } } return result; }
export function restoreLayoutConflict(key, storage = localStorage) { if (!key.startsWith(CONFLICT)) throw new Error('布局副本无效'); const value = validateLayout(json(storage, key)); storage.setItem((value.version===2?LAYOUT_PREFIX:PREFIX) + value.theme, JSON.stringify(value)); storage.removeItem(key); globalThis.dispatchEvent?.(new Event('storage')); return value; }

function cleanFavorite(input){const value=normalizeWebItem(input,{addedAt: typeof input?.addedAt === 'string' ? input.addedAt : '1970-01-01T00:00:00.000Z'});return {...value,source:'sync',notes:'',cover:value.cover.startsWith('data:image/')?value.cover:'',originalCover:'',externalIds:Object.fromEntries(Object.entries(value.externalIds).filter(([key])=>['qqAlbumMid','qqSongMid','neteaseSongId','itunesTrackId'].includes(key))),trackDetails:value.trackDetails.map(t=>({...t,source:['qq','netease','apple'].includes(t.source)?t.source:'',providerId:['qq','netease','apple'].includes(t.source)?t.providerId:'',mediaMid:t.source==='qq'?t.mediaMid:'',cover:''})),collectionViewUrl:'',trackViewUrl:''};}
export async function importSyncedFavorites(storage=localStorage){
 const saved=json(storage,FAVORITES,[]),items=Array.isArray(saved)?saved:saved.items||[],deleted=new Set(saved.deleted||[]);
 let removed=0;
 if(deleted.size)for(const item of await listItems()){const value=cleanFavorite(item),id=(await hash([value.type,value.artist.toLowerCase(),value.title.toLowerCase()])).slice(0,32);if(deleted.has(id)){await removeItem(item.id);removed++;}}
 const result=items.length?await importItems(items):{added:0};
 if(result.added || removed)globalThis.dispatchEvent?.(new Event('cabin:collection-changed'));return {...result,removed};
}
