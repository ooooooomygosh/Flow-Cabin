import test from 'node:test';
import assert from 'node:assert/strict';
import { exactTrack, findPlayableSource, localAlbumItem, normalizeLocalAlbum, normalizeLocalLibrary, wantedTrack } from './room-playback.mjs';

const record = { title: '夜航', artist: '甲', tracks: ['第一首'], trackDetails: [{ title: '第一首', source: 'qq', providerId: 'abcdefghijklmn', mediaMid: 'abcdefghijklmn' }] };

// 回归：音源服务用非 Error 拒绝时，catch 里直接读 error.name 会自己再崩一次。
test('a source that rejects with something other than an Error still ends politely', async () => {
  for (const reason of [undefined, null, 'boom', 42, { message: 'boom' }]) {
    const result = await findPlayableSource({
      record, index: 0, provider: 'qq',
      request: async () => { throw reason; },
      play: async () => { throw new Error('must not be reached'); }
    });
    assert.ok(result, 'the matcher answers instead of throwing');
    assert.ok(result.error, 'the listener is told what happened');
    assert.match(result.error, /可播放|失败|没有找到/, result.error);
  }
});

test('a source that refuses a search is reported without hiding the next platform', async () => {
  const seen = [];
  const plain = { title: '夜航', artist: '甲', tracks: ['第一首'] };
  const result = await findPlayableSource({
    record: plain, index: 0, provider: 'auto',
    request: async (path) => {
      seen.push(path);
      if (path.startsWith('/search')) throw 'network down';
      return { remote: true };
    },
    play: async () => {}
  });
  assert.ok(seen.some((path) => path.includes('provider=qq')), 'QQ is tried first');
  assert.ok(result.error, 'the refusal is reported');
  assert.match(result.error, /音频加载失败|暂时不可播放|没有找到/);
});

test('a record with its own platform id plays without searching', async () => {
  const played = [];
  const result = await findPlayableSource({
    record, index: 0, provider: 'auto',
    request: async (path, candidate) => ({ remote: true, path, candidate }),
    play: async (candidate) => { played.push(candidate); }
  });
  assert.equal(played.length, 1);
  assert.equal(played[0].provider, 'qq');
  assert.equal(played[0].id, 'abcdefghijklmn');
  assert.equal(result.remembered, undefined, 'a fresh match is not a remembered one');
});

test('a record without any track cannot be played and says so', async () => {
  const result = await findPlayableSource({ record: { title: '空' }, index: 0, provider: 'auto', request: async () => ({}), play: async () => {} });
  assert.match(result.error, /没有曲目/);
});

test('only the ids a platform really uses are taken as exact matches', () => {
  assert.equal(exactTrack(record, 0, 'qq').id, 'abcdefghijklmn');
  assert.equal(exactTrack(record, 0, 'netease'), null, 'a QQ id is not a NetEase id');
  assert.equal(exactTrack({ trackDetails: [{ source: 'netease', providerId: '12345' }] }, 0, 'netease').id, '12345');
  assert.equal(exactTrack({ trackDetails: [{ source: 'netease', providerId: 'abc' }] }, 0, 'netease'), null);
  assert.equal(exactTrack({ trackDetails: [{ source: 'local', providerId: 'a'.repeat(16) }] }, 0, 'local').id, 'a'.repeat(16));
  assert.equal(exactTrack({ trackDetails: [{ source: 'local', providerId: 'zz' }] }, 0, 'local'), null);
  assert.equal(exactTrack(record, 0, 'appleMusic'), null);
});

test('a wanted track describes what the listener should hear', () => {
  const wanted = wantedTrack({ ...record, trackDetails: [{ ...record.trackDetails[0], lengthMillis: 210000 }] }, 0);
  assert.equal(wanted.title, '第一首');
  assert.equal(wanted.artist, '甲');
  assert.equal(wanted.duration, 210000);
  assert.equal(wantedTrack({ type: 'song', title: '单曲', trackTimeMillis: 180000 }, 0).duration, 180000);
});

test('a scanned local album becomes a shelf record with playable file ids', () => {
  const album = normalizeLocalAlbum({ id: 'a1', title: '本地', artist: '我', tracks: [{ id: 'f1', title: '曲子', duration: 200 }] });
  assert.equal(album.title, '本地');
  assert.equal(album.tracks[0].title, '曲子');
  assert.equal(normalizeLocalAlbum(null), null);
  const library = normalizeLocalLibrary({ albums: [album], albumCount: '5', trackCount: 'x' });
  assert.equal(library.albums.length, 1);
  assert.equal(library.albumCount, 5);
  assert.equal(library.trackCount, 1, 'an unreadable count falls back to the real one');
  assert.deepEqual(normalizeLocalLibrary(null).albums, []);
  const item = localAlbumItem({ id: 'a1', title: '本地', artist: '我', tracks: [{ id: 'f1', title: '曲子', duration: 200 }] });
  assert.equal(item.type, 'album');
  assert.equal(item.externalIds.localAlbum, 'a1');
  assert.equal(item.trackDetails[0].lengthMillis, 200000);
  assert.equal(item.trackDetails[0].source, 'local');
});
