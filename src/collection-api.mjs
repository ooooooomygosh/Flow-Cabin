import { browserCollectionRequest, WEB_COLLECTION_KEY } from './browser-collection.mjs';
let fallback = false;
// Production web builds have no desktop /api server. Native protocols and the
// preload's client flag always retain the desktop store; never split native data.
const native = () => globalThis.document?.documentElement?.dataset?.desktopClient === 'true' || globalThis.albumDesktopAppearance?.client === true || (globalThis.location && !['http:', 'https:'].includes(globalThis.location.protocol));
export function usesBrowserCollection() {
  if (native()) return false;
  try { return Boolean(import.meta.env?.PROD || fallback || globalThis.localStorage?.getItem(WEB_COLLECTION_KEY)); } catch { return Boolean(import.meta.env?.PROD || fallback); }
}
const browser = (path, options) => globalThis.navigator?.locks?.request ? navigator.locks.request(WEB_COLLECTION_KEY, () => browserCollectionRequest(path, options)) : browserCollectionRequest(path, options);
export async function collectionRequest(path = '/api/items', { method = 'GET', body, signal } = {}) {
  if (signal?.aborted) throw signal.reason || new Error('操作已取消。');
  if (usesBrowserCollection()) return browser(path, { method, body });
  const response = await fetch(path, { method, signal, headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (!native() && method === 'GET' && path === '/api/items' && [404, 405, 501].includes(response.status)) { fallback = true; return browser(path, { method, body }); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) throw new Error(result.error || '操作失败，请稍后重试。');
  return result;
}
export const listItems = () => collectionRequest().then(result => result.items || []);
export const addItem = item => collectionRequest('/api/items', { method: 'POST', body: item });
export const updateItem = (id, patch) => collectionRequest('/api/items?id=' + encodeURIComponent(id), { method: 'PATCH', body: patch });
export const removeItem = id => collectionRequest('/api/items?id=' + encodeURIComponent(id), { method: 'DELETE' });
export const importItems = items => collectionRequest('/api/items/import', { method: 'POST', body: { items } });
