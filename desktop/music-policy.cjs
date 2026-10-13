'use strict';
function safeAudioURL(value) {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password && !u.port && ['qqmusic.qq.com', 'music.tc.qq.com', 'music.126.net', 'music.163.com'].some((host) => u.hostname === host || u.hostname.endsWith('.' + host)); } catch { return false; }
}
function serverURL(value) {
  const u = new URL(value);
  const privateHost = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(u.hostname) || u.hostname.endsWith('.local');
  if ((u.protocol !== 'https:' && !(u.protocol === 'http:' && privateHost)) || u.username || u.password || u.search || u.hash || !['', '/'].includes(u.pathname)) throw new Error('服务器地址应为 HTTPS 地址，或局域网中的 HTTP 地址，例如 http://192.168.1.8:8095。');
  return u.origin;
}
// Album art of the matched recording (https only): a playlist shows each song's own cover.
function coverURL(value) {
  try { const u = new URL(String(value || '').replace(/^http:\/\//, 'https://')); return u.protocol === 'https:' && !u.username && !u.password && u.href.length <= 700 ? u.href : ''; } catch { return ''; }
}
function candidate(value, provider) {
  const artists = value.artists || value.singer || [], album = value.album || {};
  return { cover: coverURL(value.cover || value.artwork || value.image), id: String(value.mid || value.id || value.item_id || ''), provider, title: String(value.name || value.title || '').slice(0, 300), artist: String(value.artist || artists.map((a) => a.name || '').join(' / ')).slice(0, 300), album: String(value.albumName || (typeof value.album === 'string' ? value.album : album.name) || '').slice(0, 300), duration: Number(value.duration) || 0, mediaMid: String(value.mediaMid || value.media_mid || value.file?.media_mid || ''), fee: Boolean(value.fee), uri: String(value.uri || '').slice(0, 1000) };
}
module.exports = { safeAudioURL, serverURL, candidate };
