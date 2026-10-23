import { cleanPetPack } from '../pet/pack-metadata.mjs';
const MEDIA_LIMIT = 16 * 1024 * 1024;
export function normalizePetAssets(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || ![1,2].includes(value.version)) throw Error('伙伴素材备份格式无效');
  const media = value.media, clips = {};
  for (const [action, clip] of Object.entries(media?.clips || {})) clips[action] = { file: action + '.webm', data: clip?.data };
  const metadata = cleanPetPack({ ...value, media: { ...media, clips } });
  if (!metadata) throw Error('伙伴素材配置无效');
  let total = 0;
  const data = text => {
    if (typeof text !== 'string' || !text.length || text.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw Error('伙伴素材编码无效');
    total += text.length * 3 / 4 - (text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0);
    if (total > MEDIA_LIMIT) throw Error('伙伴素材超过 16 MB'); return text;
  };
  const fallback = data(media.data);
  const videos = Object.fromEntries(Object.entries(clips).map(([action, clip]) => [action, { data: data(clip.data) }]));
  return { ...metadata, version: value.version, authorized: value.authorized === true, media: { ...metadata.media, data: fallback, ...(media.type === 'webm' ? { clips: videos } : {}) } };
}
async function request(path, body) {
  if(globalThis.window?.albumMobile?.petRequest)return (await window.albumMobile.petRequest('/packs/'+path,body)).pack;
  const response = await fetch('/desktop-pets/packs/' + path, { credentials:'omit', method:body ? 'POST':'GET', ...(body ? { headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) } : {}) });
  const value = await response.json(); if (!response.ok) throw Error(value.error || '伙伴素材读写失败'); return value.pack;
}
export async function addPetAssets(backup) {
  const id = backup.cabin?.petPack?.id; if (!id) return backup;
  return { ...backup, petAssets: normalizePetAssets(await request(id + '/export')) };
}
export async function restorePetAssets(backup) {
  if (!backup.petAssets) return backup;
  const pack = await request('restore', normalizePetAssets(backup.petAssets));
  if (backup.cabin?.petPack?.id === backup.petAssets.id) backup.cabin.petPack = { ...backup.cabin.petPack, id:pack.id };
  return backup;
}
