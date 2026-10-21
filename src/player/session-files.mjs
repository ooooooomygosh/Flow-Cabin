// Files picked in the browser stay on this computer and are only playable in
// this session (object URLs). Nothing is uploaded or copied.
import { mobileTrackUrl } from '../mobile/platform.mjs';
const urls = new Map();
export const sessionKey = (albumKey, index) => `${albumKey}#${index}`;
export function registerSessionAlbum(albumKey, files) {
  for (const [key, url] of urls) if (key.startsWith(albumKey + '#')) { URL.revokeObjectURL(url); urls.delete(key); }
  files.forEach((file, index) => { if (file) urls.set(sessionKey(albumKey, index), URL.createObjectURL(file)); });
}
export function sessionTrackUrl(item, index) {
  const mobile = mobileTrackUrl(item, index); if (mobile) return mobile;
  const key = item?.externalIds?.fileAlbum;
  return key ? urls.get(sessionKey(key, index)) || '' : '';
}
export const isSessionAlbum = (item) => Boolean(item?.externalIds?.fileAlbum);
