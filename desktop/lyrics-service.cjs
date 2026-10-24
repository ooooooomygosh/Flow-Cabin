'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { scoreCandidate } = require('./lyrics-match.cjs');
// Fixed upstream endpoints. Never accepts a URL or returns platform credentials.
const LRCLIB = 'https://lrclib.net/api';
const HEADERS = { accept: 'application/json', 'user-agent': 'FlowCabin/2.2 (https://github.com/ooooooomygosh/Flow-Cabin)' };
const DAY = 86400000, KEEP = 7 * DAY, MISS = 3600000, MAX_ENTRIES = 300, MAX_TEXT = 1024 * 1024;
const clip = (value, max = MAX_TEXT) => String(value || '').slice(0, max);
const candidateView = (record, track) => ({ id: Number(record.id), title: clip(record.trackName, 300), artist: clip(record.artistName, 300), album: clip(record.albumName, 300), duration: Number(record.duration) || 0, synced: Boolean(record.syncedLyrics), instrumental: record.instrumental === true, score: scoreCandidate(track, record).score });
const fromRecord = (record, extra = {}) => ({ source: 'LRCLIB', format: record.syncedLyrics ? 'lrc' : 'txt', text: clip(record.syncedLyrics || record.plainLyrics), instrumental: record.instrumental === true, lrclibId: Number(record.id) || 0, ...extra });

// A small JSON file keeps found lyrics for a week, so recently played songs work offline.
function createDiskCache(file) {
  let entries = new Map(), timer = null;
  if (file) try { const saved = JSON.parse(fs.readFileSync(file, 'utf8')); if (saved?.version === 1 && Array.isArray(saved.entries)) entries = new Map(saved.entries.filter(e => Array.isArray(e) && typeof e[0] === 'string' && e[1]?.value && Date.now() - e[1].at < KEEP)); } catch { /* A missing or damaged cache starts empty. */ }
  const flush = () => { timer = null; if (!file) return; try { fs.mkdirSync(path.dirname(file), { recursive: true }); const temp = `${file}.tmp`; fs.writeFileSync(temp, JSON.stringify({ version: 1, entries: [...entries].filter(([, e]) => e.persist) })); fs.renameSync(temp, file); } catch { /* Cache only; lyrics still work from the network. */ } };
  return {
    get(key) { const hit = entries.get(key); if (!hit) return null; if (Date.now() - hit.at > (hit.persist ? KEEP : MISS)) { entries.delete(key); return null; } return hit.value; },
    set(key, value, persist) { entries.delete(key); entries.set(key, { at: Date.now(), value, persist }); while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value); if (persist && file && !timer) timer = setTimeout(flush, 1000); },
    clear() { entries.clear(); flush(); },
    flush
  };
}

function createLyricsService({ upstream, cookie, fetch = globalThis.fetch, cacheFile = '' }) {
  const cache = createDiskCache(cacheFile), pending = new Map();
  async function request(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'error', headers: HEADERS });
    if (response.status === 404) return null;
    if (!response.ok) throw Error('公共歌词暂时不可用，请重试或导入本地歌词。');
    const raw = await response.text(); if (Buffer.byteLength(raw) > 2 * 1024 * 1024) throw Error('歌词响应过大。');
    return JSON.parse(raw);
  }
  async function get(input = {}) {
    const track = Object.fromEntries(['provider', 'id', 'title', 'artist', 'album'].map(k => [k, String(input[k] || '').slice(0, 300)]));
    track.duration = Number(input.duration);
    // The person picked one of the listed versions (「换一版歌词」).
    const candidate = Number.isSafeInteger(Number(input.candidate)) && Number(input.candidate) > 0 ? Number(input.candidate) : 0;
    const key = JSON.stringify({ ...track, candidate }), hit = cache.get(key);
    if (hit) return hit;
    if (pending.has(key)) return pending.get(key);
    const task = (candidate ? chosen(candidate, track) : resolve(track)).then(value => { cache.set(key, value, Boolean(value.text)); return value; }).finally(() => pending.delete(key));
    pending.set(key, task); return task;
  }
  async function chosen(id, track) {
    const record = await request(`${LRCLIB}/get/${id}`);
    if (!record || Number(record.id) !== id) return { source: 'none', text: '', reason: '这一版歌词已经找不到了。' };
    return fromRecord(record, { chosen: true, candidates: [candidateView(record, track)] });
  }
  async function resolve(track) {
    if (['qq', 'netease'].includes(track.provider) && /^[a-z\d]{1,64}$/i.test(track.id) && upstream.lyrics) {
      const result = await upstream.lyrics(track.provider, track.id, cookie(track.provider));
      if (result?.text) return { text: clip(result.text), format: result.format, translation: clip(result.translation), romanization: clip(result.romanization), source: track.provider };
    }
    if (!track.title || !track.artist || !Number.isFinite(track.duration) || track.duration <= 0) return { source: 'none', text: '', reason: '需要曲名、歌手和可靠时长才能匹配公共歌词。' };
    // 1. Exact signature lookup; 2. a search scored on title words, artists and length.
    const exact = await request(`${LRCLIB}/get?${new URLSearchParams({ track_name: track.title, artist_name: track.artist, album_name: track.album, duration: String(Math.round(track.duration)) })}`);
    const records = [];
    if (exact && typeof exact === 'object' && !Array.isArray(exact)) records.push(exact);
    if (!records.length || !scoreCandidate(track, records[0]).automatic) {
      const found = await request(`${LRCLIB}/search?${new URLSearchParams({ track_name: track.title, artist_name: track.artist })}`).catch(() => null);
      if (Array.isArray(found)) for (const record of found.slice(0, 40)) if (record && typeof record === 'object' && !records.some(r => r.id === record.id)) records.push(record);
    }
    const ranked = records.map(record => ({ record, ...scoreCandidate(track, record) })).sort((a, b) => b.score - a.score);
    const candidates = ranked.filter(r => r.score >= .5 && (r.record.syncedLyrics || r.record.plainLyrics)).slice(0, 5).map(r => candidateView(r.record, track));
    const best = ranked.find(r => r.automatic && (r.record.syncedLyrics || r.record.plainLyrics || r.record.instrumental));
    if (!best) return { source: 'none', text: '', reason: candidates.length ? '没有找到版本一致的歌词，可以从相近版本里挑一版。' : '没有找到版本一致的歌词。', candidates };
    return fromRecord(best.record, { candidates });
  }
  return { get, clear: () => cache.clear(), flush: () => cache.flush() };
}
module.exports = { createLyricsService, createDiskCache };
