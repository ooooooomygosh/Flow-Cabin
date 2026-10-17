// Audio sources: one stable module for the deck, 音源设置 and onboarding.
// Documented in docs/player.md › 「音源接口（给新手引导用）」. Keep signatures stable.
import { musicRequest, trackArtist, findPlayableSource, localAlbumItem, normalizeLocalLibrary } from '../room-playback.mjs';
import { desktopCommand } from '../desktop/desktop-command.mjs';
import { playChime } from '../lib/chime.mjs';

// Providers whose sound comes out of another player; the deck polls them.
export const REMOTE_PROVIDERS = new Set(['ma', 'appleMusic']);
export const remoteControlPath = (provider) => provider === 'appleMusic' ? '/apple/control' : '/ma/control';

import { SOURCES } from './providers.mjs';
export { PROVIDERS, DECK_PROVIDERS, SOURCES, isDeckProvider, providerLabel } from './providers.mjs';

const isMac = () => typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent || '');

// listSources(): every source with whether it can work on this computer.
export function listSources({ mac = isMac() } = {}) {
  return SOURCES.map((source) => ({ ...source, supported: source.platform ? source.platform === 'darwin' && mac : true }));
}

// connectSource(id): starts the official login window (QQ / 网易云) or the
// folder picker (local). Resolves when the attempt finishes: { ok, cancelled, error }.
// Listens for the same 'album-music-account' / 'album-local-music' events the settings use.
export function connectSource(id, { timeoutMs = 10 * 60 * 1000, target = typeof window === 'undefined' ? null : window, command = desktopCommand } = {}) {
  if (!['qq', 'netease', 'local'].includes(id)) return Promise.resolve({ ok: false, error: id === 'appleMusic' ? '系统 Apple Music 无需登录，请调用 requestPermission(\'appleMusic\')。' : '此音源没有登录步骤。' });
  if (!target) return Promise.resolve({ ok: false, error: '需要在心流小屋桌面版中连接。' });
  const event = id === 'local' ? 'album-local-music' : 'album-music-account';
  return new Promise((resolve) => {
    const done = (value) => { clearTimeout(timer); target.removeEventListener(event, listener); resolve(value); };
    const listener = (e) => { const d = e.detail || {}; if (d.scanning) return; done({ ok: Boolean(d.ok), cancelled: Boolean(d.cancelled), error: d.error || '' }); };
    const timer = setTimeout(() => done({ ok: false, cancelled: true, error: '连接超时，请重试。' }), timeoutMs);
    target.addEventListener(event, listener);
    command(id === 'local' ? 'local-music-folder' : 'music-login', id === 'local' ? {} : { provider: id });
  });
}

// getSourceStatus(id): { id, supported, connected, detail } — never throws.
// "connected" for QQ / 网易云 means login saved; playback rights are only
// proven by testPlayback().
export async function getSourceStatus(id, { request = musicRequest } = {}) {
  const base = listSources().find((source) => source.id === id);
  if (!base) return { id, supported: false, connected: false, detail: '未知音源。' };
  try {
    if (id === 'qq' || id === 'netease') { const config = await request('/config'); const connected = Boolean(config[id === 'qq' ? 'qqLoggedIn' : 'neteaseLoggedIn']); return { id, supported: true, connected, detail: connected ? '已保存登录信息' : '未登录，可尝试游客音频', app: config.localApps?.[id] || null }; }
    if (id === 'local') { const summary = await request('/local/summary'); return { id, supported: true, connected: Number(summary.trackCount) > 0, detail: `${Number(summary.albumCount) || 0} 张专辑 · ${Number(summary.trackCount) || 0} 首歌曲` }; }
    if (id === 'appleMusic') { const result = await request('/apple/permission'); return { id, supported: Boolean(result.available), connected: Boolean(result.granted), needsPermission: Boolean(result.needsPermission), detail: result.granted ? '已允许控制“音乐”App' : result.error || '尚未授权' }; }
    if (id === 'ma') { const config = await request('/config'); return { id, supported: true, connected: Boolean(config.maURL && config.playerId), detail: config.maURL || '未配置' }; }
    if (id === 'system') { const state = await request('/now-playing'); return { id, supported: Boolean(state.available), connected: Boolean(state.available), detail: state.error || '' }; }
  } catch (error) { return { ...base, id, supported: base.supported ?? true, connected: false, detail: error.message }; }
  return { id, supported: false, connected: false, detail: '' };
}

// requestPermission('appleMusic'): runs a harmless osascript probe (asks the
// "音乐" App for its version). The first call makes macOS show the
// Automation prompt. Resolves { granted, needsPermission, error }.
export async function requestPermission(kind, { request = musicRequest } = {}) {
  if (kind !== 'appleMusic') return { granted: false, error: '不支持此权限。' };
  try { const result = await request('/apple/permission'); return { granted: Boolean(result.granted), needsPermission: Boolean(result.needsPermission), available: Boolean(result.available), error: result.error || '' }; }
  catch (error) { return { granted: false, error: error.message }; }
}

// testPlayback({ provider }): matches a well-known track on that source, plays
// ~3 s at low volume and stops. { ok, provider, quality, error } — ok only if
// the audio element actually reached "playing".
export const TEST_TRACK = Object.freeze({ id: 'flow-cabin-playback-test', type: 'album', title: '晴天', artist: '周杰伦', tracks: ['晴天'], trackDetails: [{ title: '晴天', lengthMillis: 269000 }] });
// 本地音乐 tests with the first song of the user's own library (a fixed catalog song is
// rarely in it); an empty library confirms the speakers with a chime instead.
export async function localTestRecord({ request = musicRequest } = {}) {
  const album = normalizeLocalLibrary(await request('/local/albums')).albums.find((entry) => entry.tracks.length);
  return album ? { ...localAlbumItem(album), id: 'flow-cabin-playback-test' } : null;
}
export async function testPlayback({ provider = 'auto', seconds = 3, request = musicRequest, createAudio = () => new Audio(), find, chime = () => playChime('test') } = {}) {
  let record = TEST_TRACK;
  if (provider === 'local') {
    try { record = await localTestRecord({ request }); } catch (error) { return { ok: false, provider, error: error.message || '读不到本地音乐。' }; }
    if (!record) return { ...chime(), provider, title: '提示音（本地音乐里还没有歌曲）' };
  }
  const audio = createAudio(); let started = null;
  try {
    const result = await (find || findPlayableSource)({ record, index: 0, provider, request, play: async (candidate, resolved) => {
      if (resolved.remote) throw new Error('试播只检查小屋内播放。');
      audio.volume = .15; audio.src = resolved.audioPath;
      await audio.play();
      started = { candidate, quality: resolved.quality || '' };
    } });
    if (!started) return { ok: false, provider, error: result?.error || '没有找到可试播的音源。' };
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    return { ok: true, provider: started.candidate.provider, quality: started.quality, title: started.candidate.title };
  } catch (error) { return { ok: false, provider, error: error.message || '试播失败。' }; }
  finally { try { audio.pause(); audio.removeAttribute?.('src'); audio.load?.(); } catch {} }
}

// Where "在本机 App 中打开" would go for the current track, or null.
// Offered only after in-app playback failed, for QQ 音乐 / 网易云.
export function localAppTarget({ record, index, provider, status, candidates = [], resolvedProvider } = {}) {
  if (status !== 'error' || !record) return null;
  const raw = record.tracks?.[index], title = typeof raw === 'string' ? raw : raw?.title || raw?.name || '';
  if (!title) return null;
  const detail = record.trackDetails?.[index] || {};
  const platform = ['qq', 'netease'].includes(provider) ? provider : ['qq', 'netease'].includes(resolvedProvider) ? resolvedProvider : detail.source === 'netease' ? 'netease' : provider === 'auto' ? 'qq' : '';
  if (!platform) return null;
  const known = candidates.find((candidate) => candidate.provider === platform);
  const id = platform === 'netease' ? (/^\d{1,20}$/.test(detail.providerId || '') && detail.source === 'netease' ? detail.providerId : known?.id || '') : (/^[a-z\d]{14}$/i.test(detail.providerId || '') && !['netease', 'apple', 'local'].includes(detail.source) ? detail.providerId : known?.id || '');
  return { provider: platform, id, query: `${trackArtist(record, index)} ${title}`.trim(), label: platform === 'qq' ? '在 QQ 音乐中打开' : '在网易云音乐中打开' };
}
