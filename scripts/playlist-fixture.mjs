// Offline fixtures for the 我的歌单 dialog (browser smoke + screenshots).
// Covers are served from docs/assets/covers through a fake https origin so the
// page looks real without any network access. No platform is contacted.
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const COVER_ORIGIN = 'https://covers.fixture.test';
const COVERS = ['1690607869', '1440763349', '1078898175', '1507014129', '1624173298', '1440942198', '617154241', '966489223', '313404785', '1461046017', '1443374875', '1443147411'];
const cover = (index) => `${COVER_ORIGIN}/${COVERS[index % COVERS.length]}.jpg`;
const SONGS = [
  ['From The Start', 'Laufey', 'Bewitched', 169000], ['First Love', '宇多田ヒカル', 'First Love', 256000], ['Aruarian Dance', 'Nujabes', 'Metaphorical Music', 266000],
  ['andata', '坂本龍一', 'async', 278000], ["Don't Know Why", 'Norah Jones', 'Come Away with Me', 186000], ['Waltz for Debby (Take 2)', 'Bill Evans Trio', 'Waltz for Debby', 416000],
  ['Instant Crush', 'Daft Punk', 'Random Access Memories', 337000], ['寓言', '王菲', '寓言', 300000], ['橙月', '方大同', '橙月', 252000], ['小宇宙', '苏打绿', '小宇宙', 271000],
  ['葡萄成熟时', '陈奕迅', 'U 87', 282000], ['克卜勒', '孙燕姿', '克卜勒', 245000]
];
export const neteasePlaylists = [
  { id: '9001', name: '我喜欢的音乐', cover: cover(0), trackCount: 128, creator: '小屋住客', kind: 'liked' },
  { id: '9002', name: '深夜写作 · 不说话的歌', cover: cover(2), trackCount: 46, creator: '小屋住客', kind: 'created' },
  { id: '9003', name: '雨天爵士', cover: cover(5), trackCount: 32, creator: '小屋住客', kind: 'created' },
  { id: '9004', name: '专注 90 分钟', cover: cover(3), trackCount: 24, creator: '小屋住客', kind: 'created' },
  { id: '9005', name: '华语慢歌', cover: cover(7), trackCount: 58, creator: '小屋住客', kind: 'created' },
  { id: '9006', name: 'City Pop 夜行', cover: cover(6), trackCount: 40, creator: '某位乐评人', kind: 'collect' },
  { id: '9007', name: 'Lo-fi 小屋电台', cover: cover(1), trackCount: 75, creator: '网易云音乐', kind: 'collect' },
  { id: '9008', name: '没有封面的歌单', cover: '', trackCount: 3, creator: '小屋住客', kind: 'created' }
];
export function playlistDetail(id, provider = 'netease') {
  const summary = neteasePlaylists.find((entry) => entry.id === id) || neteasePlaylists[1];
  const tracks = SONGS.map(([title, artist, album, duration], index) => ({ title, artist, album, duration, source: provider === 'qq' ? 'qq' : 'netease', providerId: provider === 'qq' ? `00${index}abcdefghijk`.slice(0, 14) : String(186000 + index), mediaMid: '', cover: cover(COVERS.indexOf(String(index)) >= 0 ? index : index), playable: true }));
  return { provider, playlist: { ...summary, trackCount: tracks.length, description: '写到一半抬头看窗外，雪还在下。' }, tracks, truncated: false };
}
export async function serveCover(route) {
  const name = new URL(route.request().url()).pathname.slice(1);
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '../docs/assets/covers', path.basename(name));
  try { return route.fulfill({ contentType: 'image/jpeg', body: await fs.readFile(file) }); } catch { return route.fulfill({ status: 404, body: '' }); }
}
