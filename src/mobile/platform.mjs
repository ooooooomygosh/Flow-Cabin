import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { createMobileStorage, persistentKey } from './storage.mjs';

export const isAndroid = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const Device = registerPlugin('CabinDevice');
let store;
const report = text => window.dispatchEvent(new CustomEvent('cabin:mobile-notice', { detail: text }));
export async function initializeMobile() {
  if (!isAndroid()) return;
  document.documentElement.dataset.platform = 'android';
  let viewportWidth = innerWidth, fullHeight = window.visualViewport?.height || innerHeight;
  const resize = () => { const height = window.visualViewport?.height || innerHeight; if (Math.abs(innerWidth - viewportWidth) > 80) { viewportWidth = innerWidth; fullHeight = height; } else fullHeight = Math.max(fullHeight, height); document.documentElement.style.setProperty('--mobile-height', `${height}px`); document.documentElement.dataset.mobileKeyboard = String(Boolean(document.activeElement?.matches('input,textarea,select') && Math.max(fullHeight, screen.height) - height > 140)); if (document.activeElement?.matches('input,textarea,select')) document.activeElement.scrollIntoView({ block: 'nearest' }); };
  window.visualViewport?.addEventListener('resize', resize); window.addEventListener('resize', resize); resize();
  document.addEventListener('focusout', () => setTimeout(resize, 100));
  const saved = await Device.loadData(); // Never start an empty cabin after a read/corruption error.
  const previous = window.localStorage;
  const entries = saved.initialized ? saved.entries : Object.fromEntries(Array.from({ length: previous.length }, (_, i) => previous.key(i)).filter(persistentKey).map(key => [key, previous.getItem(key)]));
  store = createMobileStorage({ entries, write: changes => Device.saveData({ changes }), onError: () => report('本机保存未完成，请保留应用并在「设置 → 数据与备份」重新保存或导出备份。') });
  Object.defineProperty(window, 'localStorage', { configurable: true, value: store.storage });
  if (!saved.initialized) await Device.saveData({ changes: Object.entries(entries).map(([key, value]) => ({ key, value })) });
  window.albumMobile = { flushStorage: store.flush, storageStatus: store.status, retrySave: store.flush, setFullscreen: async enabled => {
    await Device.setImmersive({ enabled }); document.documentElement.dataset.mobileFullscreen = String(enabled);
    window.dispatchEvent(new Event('album-desktop-fullscreen')); window.dispatchEvent(new Event('resize'));
  } };
  const flush = () => store.flush().catch(() => {});
  document.addEventListener('visibilitychange', flush);
  await App.addListener('appStateChange', flush);
  await App.addListener('backButton', async () => {
    const dialogs = [...document.querySelectorAll('dialog[open]')], dialog = dialogs.at(-1);
    if (dialog) { const event = new Event('cancel', { cancelable: true }); if (dialog.dispatchEvent(event)) dialog.close(); return; }
    const close = document.querySelector('.focus-dock-close');
    if (close) { close.click(); return; }
    if (document.documentElement.dataset.mobileFullscreen === 'true') { await window.albumMobile.setFullscreen(false); return; }
    await flush(); await App.minimizeApp();
  });
  // A WebView does not implement anchor downloads. Keep this bridge narrow:
  // a native system save picker writes only the file the user explicitly chose.
  window.albumMobile.saveFile = async (blob, filename) => {
    if (blob.size > 24 * 1024 * 1024) throw new Error('文件超过 24 MB，请减小导出尺寸后重试。');
    const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(blob); });
    const result = await Device.saveFile({ filename, mime: blob.type || 'application/octet-stream', data });
    if (!result.cancelled) report('文件已保存到你选择的位置。');
    return result;
  };
  window.albumMobile.musicRequest = async (path, value) => {
    if (path === '/local/summary' || path === '/local/albums') { const mapping = JSON.parse(localStorage.getItem(MUSIC_KEY) || '{}'), albums = Object.values(mapping); return { folders: [], albums: [], albumCount: albums.length, trackCount: albums.reduce((sum, tracks) => sum + tracks.length, 0) }; }
    if (path === '/now-playing') return { available: false };
    if (path === '/apple/permission') return { available: false, granted: false };
    return Device.musicRequest({ path, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
  };
  window.albumMobile.catalogRequest = query => Device.catalogRequest({ query });
  let connecting = false;
  window.albumMobile.platformAccount = async (provider, logout = false) => {
    if (connecting) return; connecting = true;
    try { const result = await (logout ? Device.musicLogout({ provider }) : Device.musicLogin({ provider })); window.dispatchEvent(new CustomEvent('album-music-account', { detail: { provider, ...result } })); window.dispatchEvent(new Event('album-music-settings')); }
    catch (error) { window.dispatchEvent(new CustomEvent('album-music-account', { detail: { provider, ok: false, error: error.message } })); }
    finally { connecting = false; }
  };
  // Start the embedded Portable service, without blocking access to local data.
  Device.startMusic().catch(() => report('手机音乐服务未能启动，请重新打开应用。收藏数据已保留。'));
}
const MUSIC_KEY = 'flow-cabin-android-music-v1';
export const pickMobileMusic = () => Device.pickMusic();
export async function rememberMobileAlbum(key, tracks) {
  const mapping = JSON.parse(localStorage.getItem(MUSIC_KEY) || '{}');
  mapping[key] = tracks.map(({ uri, name, title, artist, album, track, duration }) => ({ uri, name, title, artist, album, track, duration }));
  localStorage.setItem(MUSIC_KEY, JSON.stringify(mapping)); await store.flush();
}
export function mobileTrackUrl(item, index) {
  if (!isAndroid() || !item?.externalIds?.fileAlbum) return '';
  try {
    const track = JSON.parse(localStorage.getItem(MUSIC_KEY) || '{}')[item.externalIds.fileAlbum]?.[index];
    return track?.uri?.startsWith('content://') ? Capacitor.convertFileSrc(track.uri) : '';
  } catch { return ''; }
}
