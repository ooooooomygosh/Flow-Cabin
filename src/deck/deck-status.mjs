// Pure pieces of the cabin deck (useRoomPlayback): volume persistence, the
// plain-language status line and how account / setting changes affect a deck.
export const VOLUME_KEY = 'album-circle-player-volume-v1';
export const clampVolume = (value) => Math.max(0, Math.min(1, value));
export function readVolume(storage = globalThis.localStorage) {
  try { const value = JSON.parse(storage.getItem(VOLUME_KEY)); return { volume: Number.isFinite(value?.volume) ? clampVolume(value.volume) : .65, muted: Boolean(value?.muted) }; }
  catch { return { volume: .65, muted: false }; }
}
export function writeVolume(value, storage = globalThis.localStorage) { try { storage.setItem(VOLUME_KEY, JSON.stringify(value)); } catch {} }

// Plain-language messages for media element failures (MediaError codes).
export const MEDIA_ERRORS = { 1: '播放被中断，请重新播放。', 2: '网络中断，音频没有加载完。检查网络后点「重试」。', 3: '这个音频文件无法解码，可能已损坏或格式不受支持。', 4: '音源地址不可用或格式不受支持。可能需要重新登录平台，或换一个音源。' };
export const mediaErrorMessage = (code) => MEDIA_ERRORS[code] || '音频加载失败。请重新播放，或检查平台权限与网络。';

export function deckStatusText({ status = 'idle', error = '', trial = false, quality = '', remote = false } = {}, provider = '', skipping = false) {
  if (error) return skipping ? `${error} 稍后自动播放下一首…` : error;
  const playing = `${provider === 'ma' ? '服务器播放器正在播放' : provider === 'appleMusic' ? '正在“音乐”App 中播放' : provider === 'local' ? '正在播放本地文件' : '正在播放'}${trial ? ' · 试听片段' : ''}${quality && !remote && provider !== 'local' ? ` · ${quality}` : ''}`;
  return { idle: '待播放', loading: '正在连接音源…', searching: '正在匹配原始曲目…', choose: '请选择对应的曲目版本', playing, paused: '播放已暂停', ended: '本曲播放结束', waiting: provider === 'appleMusic' ? '等待“音乐”App' : '等待服务器播放器', buffering: '正在缓冲音频…' }[status] || '待播放';
}

// What an `album-music-account` / `album-music-settings` event does to the deck.
//   'ignore'  — a cancelled or failed login changes nothing (the song keeps playing)
//   'clear'   — forget cached matches so the next track uses the new login / quality
//   'reload'  — also re-resolve the current track, resuming where it was
// Only a deck that cannot be playing well right now (an error, a trial clip,
// nothing resolved yet) or the Music Assistant server deck is reloaded.
export function accountChangeEffect({ type, detail = null, provider = '', status = 'idle', trial = false, hasRecord = false }) {
  if (type === 'account' && detail && typeof detail === 'object' && (detail.cancelled || detail.error || detail.ok === false)) return 'ignore';
  if (!hasRecord || provider === 'visual' || provider === 'system') return 'clear';
  if (type === 'settings' && provider === 'ma') return 'reload';
  if (status === 'error' || trial) return 'reload';
  return 'clear';
}
