// Live QQ 音乐 matching check: real network, the desktop app's own code.
// For songs QQ is known to carry it reports (1) which search request forms
// answer, and (2) whether the deck's matcher picks the right recording from
// the real results through the real music service (/search → ranking).
// It also asks, without an account, for a play address of the pick: guests
// only get free songs, so that column is information, not a failure.
//
//   npm --prefix desktop run build:music && node scripts/qq-live-check.mjs
//
// Exit code 1 when a song is not matched. Needs network access to *.qq.com.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findPlayableSource } from '../src/room-playback.mjs';

const require = createRequire(new URL('../desktop/package.json', import.meta.url));
const upstream = require('./music-upstream.cjs');
const { createMusicService } = require('./music-service.cjs');

// title as a shelf record may carry it (Traditional, decorated), artist, album.
const SONGS = [
  ['月亮代表誰的心', '陶喆', '黑色柳丁'],
  ['愛很簡單', '陶喆', '陶喆'],
  ['晴天', '周杰伦', '叶惠美'],
  ['月亮代表我的心', '邓丽君', '岛国之情歌第四集 香港之恋'],
  ['十年', '陈奕迅', '黑白灰'],
  ['江南', '林俊杰', '第二天堂'],
  ['倔強', '五月天', '神的孩子都在跳舞'],
  ['小幸运', '田馥甄', '小幸运'],
  ['Love Story', 'Taylor Swift', 'Fearless'],
  ['后来', '刘若英', '我等你']
];
const simple = (value) => String(value || '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
const { toSimplified } = await import('../src/player/hanzi.mjs');
const same = (a, b) => simple(toSimplified(a)) === simple(toSimplified(b));
const report = { shapes: {}, songs: [] };
let failures = 0;

// 1. Each request form on its own.
for (const shape of upstream.qqSearchShapes()) {
  const answers = [];
  for (const [title, artist] of SONGS.slice(0, 4)) {
    try {
      const raw = await shape.run(`${artist} ${toSimplified(title)}`, 20);
      const songs = raw.map(upstream.mapQQSearchSong);
      answers.push({ query: `${artist} ${title}`, count: songs.length, found: songs.some((song) => same(song.name, title) && song.artist.includes(artist)) });
    } catch (error) { answers.push({ query: `${artist} ${title}`, error: error.message }); }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  report.shapes[shape.name] = answers;
  console.log(`form ${shape.name}: ${answers.map((a) => a.error ? `✗ ${a.error}` : `${a.found ? '✓' : '·'} ${a.count}`).join(' | ')}`);
}

// The raw shape of one answer, so mapping changes can be checked against it.
try {
  const [desktop] = upstream.qqSearchShapes();
  const raw = (await desktop.run('陶喆 月亮代表谁的心', 3))[0] || {};
  const pick = (value) => value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v !== 'object' || v === null).slice(0, 14)) : value;
  console.log('raw song:', JSON.stringify({ keys: Object.keys(raw), album: pick(raw.album), file: pick(raw.file), singer: (raw.singer || []).map(pick), interval: raw.interval, pay: pick(raw.pay), name: raw.name, title: raw.title }));
  console.log('mapped:', JSON.stringify(upstream.mapQQSearchSong(raw)));
} catch (error) { console.log('raw song: unavailable', error.message); }

// 2. The deck's matcher on the real service.
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-live-'));
const service = createMusicService({ directory, safeStorage: { isEncryptionAvailable: () => false, encryptString: (v) => Buffer.from(v), decryptString: (b) => b.toString() }, login: async () => ({ ok: false }), logout: async () => {} });
const call = async (url, value) => {
  const response = await service.proxy(new Request('https://local/desktop-music' + url, value === undefined ? {} : { method: 'POST', body: JSON.stringify(value) }), url, fetch);
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
};
try {
  for (const [title, artist, album] of SONGS) {
    const record = { id: `live-${title}`, type: 'album', title: album, artist, tracks: [title] };
    let picked = null, address = '';
    const request = async (url, value) => {
      if (url !== '/resolve') return call(url, value);
      picked = value;
      try { const result = await call('/resolve', value); address = result.audioPath ? 'ok' : 'none'; } catch (error) { address = error.message.slice(0, 60); }
      return { audioPath: '/checked' }; // the match is what is under test
    };
    const result = await findPlayableSource({ record, index: 0, provider: 'qq', request, play: async () => {} });
    const ok = Boolean(picked && picked.provider === 'qq' && same(picked.title, title) && String(picked.artist).includes(artist));
    if (!ok) failures++;
    report.songs.push({ title, artist, ok, picked: picked && { id: picked.id, title: picked.title, artist: picked.artist, album: picked.album }, address, error: result?.error || '' });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${artist} · ${title} → ${picked ? `${picked.title} / ${picked.artist} / ${picked.album} (${picked.id})` : result?.error || 'nothing'}${picked ? ` · guest play address: ${address}` : ''}`);
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
} finally { service.stop(); fs.rmSync(directory, { recursive: true, force: true }); }

if (process.env.QQ_LIVE_REPORT) fs.writeFileSync(process.env.QQ_LIVE_REPORT, JSON.stringify(report, null, 2));
console.log(failures ? `${failures} of ${SONGS.length} songs not matched` : `all ${SONGS.length} songs matched`);
process.exitCode = failures ? 1 : 0;
