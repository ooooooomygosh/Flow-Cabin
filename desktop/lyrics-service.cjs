'use strict';
// Fixed upstream endpoint. Never accepts a URL or returns platform credentials.
function createLyricsService({ upstream, cookie, fetch = globalThis.fetch }) {
  const cache = new Map(), pending = new Map();
  async function get(input = {}) {
    const track = Object.fromEntries(['provider', 'id', 'title', 'artist', 'album'].map(k => [k, String(input[k] || '').slice(0, 300)]));
    track.duration = Number(input.duration);
    const key = JSON.stringify(track), hit = cache.get(key);
    if (hit && Date.now() - hit.at < 86400000) return hit.value;
    if (pending.has(key)) return pending.get(key);
    const task = resolve(track).then(value => { cache.set(key, { at: Date.now(), value }); if (cache.size > 200) cache.delete(cache.keys().next().value); return value; }).finally(() => pending.delete(key));
    pending.set(key, task); return task;
  }
  async function resolve(track) {
    if (['qq', 'netease'].includes(track.provider) && /^[a-z\d]{1,64}$/i.test(track.id) && upstream.lyrics) {
      const result = await upstream.lyrics(track.provider, track.id, cookie(track.provider));
      if (result?.text) return { ...result, source: track.provider };
    }
    if (!track.title || !track.artist || !Number.isFinite(track.duration) || track.duration <= 0) return { source: 'none', text: '', reason: '需要曲名、歌手和可靠时长才能匹配公共歌词。' };
    const query = new URLSearchParams({ track_name: track.title, artist_name: track.artist, album_name: track.album, duration: String(track.duration) });
    const response = await fetch(`https://lrclib.net/api/get?${query}`, { signal: AbortSignal.timeout(10000), redirect: 'error', headers: { accept: 'application/json', 'user-agent': 'FlowCabin/2.0 (https://github.com/ooooooomygosh/Flow-Cabin)' } });
    if (response.status === 404) return { source: 'none', text: '' };
    if (!response.ok) throw Error('公共歌词暂时不可用，请重试或导入本地歌词。');
    const raw = await response.text(); if (Buffer.byteLength(raw) > 2 * 1024 * 1024) throw Error('歌词响应过大。');
    const value = JSON.parse(raw);
    const norm = s => String(s || '').normalize('NFKC').trim().toLocaleLowerCase();
    const matchedDuration = Number(value.duration);
    if (!Number.isFinite(matchedDuration) || matchedDuration <= 0 || Math.abs(matchedDuration - track.duration) > 2 || norm(value.trackName) !== norm(track.title) || norm(value.artistName) !== norm(track.artist) || (track.album && norm(value.albumName) !== norm(track.album))) return { source: 'none', text: '', reason: '没有找到版本一致的歌词。' };
    return { source: 'LRCLIB', format: value.syncedLyrics ? 'lrc' : 'txt', text: String(value.syncedLyrics || value.plainLyrics || '').slice(0, 1024 * 1024), instrumental: value.instrumental === true };
  }
  return { get, clear: () => cache.clear() };
}
module.exports = { createLyricsService };
