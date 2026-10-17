'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createCollectionStore, normalizeItem } = require('../collection-store.cjs');
const { createSiteRouter } = require('../site-router.cjs');
const temp = (t) => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cabin-collection-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true })); return directory; };

test('single recording metadata survives save/reload without rewriting old collections on read', t => {
  const directory = temp(t), store = createCollectionStore({ directory });
  const { item } = store.add({ type: 'song', title: 'Song', artist: 'Artist', albumTitle: 'Original album', trackTimeMillis: 200000, tracks: ['Song'], externalIds: { itunesTrackId: '1234567890' } });
  const reloaded = createCollectionStore({ directory }).list()[0];
  assert.equal(reloaded.albumTitle, 'Original album'); assert.equal(reloaded.trackTimeMillis, 200000); assert.deepEqual(reloaded.externalIds, item.externalIds);
  const old = { ...item }; delete old.albumTitle; delete old.trackTimeMillis;
  const file = path.join(directory, 'collection.json'), contents = JSON.stringify({ version: 2, items: [old] }); fs.writeFileSync(file, contents);
  const restored = createCollectionStore({ directory }).list()[0];
  assert.equal(restored.albumTitle, ''); assert.equal(restored.trackTimeMillis, 0);
  assert.equal(fs.readFileSync(file, 'utf8'), contents, 'no migration or data rewrite');
});

test('albums saved by earlier releases are migrated once and keep their ids', (t) => {
  const directory = temp(t), legacy = path.join(directory, 'local', 'collection.json');
  fs.mkdirSync(path.dirname(legacy), { recursive: true });
  fs.writeFileSync(legacy, JSON.stringify({ collections: {
    'albumCircleUsers': [['local-owner', { name: '我的收藏', sessionHashes: ['secret'] }]],
    'albumCircleRooms/local-room/items': [['old-1', { title: '叶惠美', artist: '周杰伦', type: 'album', cover: 'https://y.gtimg.cn/a.jpg', tracks: ['以父之名', '晴天'], collectionId: '', externalIds: { qqAlbumMid: '002XyZ' }, createdAt: 1000, aiProfile: { overview: 'x' } }], ['old-2', { title: 'Blonde', artist: 'Frank Ocean', createdAt: 2000 }], ['broken', { artist: 'no title' }]]
  } }));
  const store = createCollectionStore({ directory });
  assert.deepEqual(store.list().map((item) => item.id), ['old-2', 'old-1']);
  const jay = store.list()[1];
  assert.equal(jay.externalIds.qqAlbumMid, '002XyZ'); assert.deepEqual(jay.tracks, ['以父之名', '晴天']); assert.equal('aiProfile' in jay, false);
  assert.equal(JSON.stringify(store.list()).includes('secret'), false);
  fs.writeFileSync(legacy, JSON.stringify({ collections: {} })); // Later edits to the old file are ignored.
  assert.equal(createCollectionStore({ directory }).list().length, 2);
});

test('adding, de-duplicating, editing notes and removing albums persist to disk', (t) => {
  const directory = temp(t), store = createCollectionStore({ directory });
  const first = store.add({ title: 'Blonde', artist: 'Frank Ocean', collectionId: '1146195596', year: '2016', cover: 'https://is1-ssl.mzstatic.com/x.jpg' });
  assert.equal(first.duplicate, undefined); assert.match(first.item.id, /^album-[a-f\d]{16}$/);
  assert.equal(store.add({ title: 'Blonde (Deluxe)', artist: 'Frank Ocean', collectionId: '1146195596' }).duplicate, true);
  store.update(first.item.id, { notes: '夏天的夜里', id: 'hijack', addedAt: 'x' });
  const reloaded = createCollectionStore({ directory }).list();
  assert.equal(reloaded.length, 1); assert.equal(reloaded[0].notes, '夏天的夜里'); assert.equal(reloaded[0].id, first.item.id); assert.notEqual(reloaded[0].addedAt, 'x');
  store.remove(first.item.id); assert.equal(createCollectionStore({ directory }).list().length, 0);
  assert.throws(() => store.remove('missing')); assert.throws(() => store.add({ title: '', artist: 'x' }));
  assert.deepEqual(store.importItems([{ title: 'A', artist: 'B' }, { title: '', artist: '' }, { title: 'C', artist: 'D', externalIds: { localAlbum: '0123456789abcdef' } }]), { added: 2, total: 2, ids: {} });
});

test('backup restore keeps ids and shelf order, and importing twice adds nothing', t => {
  const directory = temp(t), store = createCollectionStore({ directory });
  const taken = store.add({ title: 'Already here', artist: 'Someone' }).item;
  const backup = [
    { id: 'album-newest', title: 'Manual B', artist: 'Artist', addedAt: '2024-03-01T00:00:00.000Z' },
    { id: 'album-older', title: 'Manual A', artist: 'Artist', addedAt: '2023-01-01T00:00:00.000Z' },
    { id: taken.id, title: 'Clash', artist: 'Other', addedAt: '2022-01-01T00:00:00.000Z' },
    { id: 'album-qq', title: 'QQ', artist: 'Q', externalIds: { qqAlbumMid: '001abc' }, addedAt: 'not a date' },
    { id: '../bad id', title: 'Odd id', artist: 'Z', addedAt: '2021-01-01T00:00:00.000Z' }
  ];
  const first = store.importItems(backup);
  assert.equal(first.added, 5); assert.equal(first.total, 6);
  const list = createCollectionStore({ directory }).list(), byTitle = Object.fromEntries(list.map((item) => [item.title, item]));
  assert.equal(byTitle['Manual B'].id, 'album-newest'); assert.equal(byTitle['Manual A'].addedAt, '2023-01-01T00:00:00.000Z');
  assert.notEqual(byTitle.Clash.id, taken.id); assert.deepEqual(first.ids, { [taken.id]: byTitle.Clash.id }, 'a clashing id is reported so styles can follow it');
  assert.match(byTitle['Odd id'].id, /^album-[a-f\d]{16}$/);
  // 'QQ' (invalid date → now) and 'Already here' (added now) may share a millisecond, so only their pair is fixed.
  const titles = list.map((item) => item.title);
  assert.deepEqual(titles.slice(0, 2).sort(), ['Already here', 'QQ']); assert.deepEqual(titles.slice(2), ['Manual B', 'Manual A', 'Clash', 'Odd id'], 'newest addedAt first');
  assert.ok(Date.parse(byTitle.QQ.addedAt) >= Date.parse(byTitle['Already here'].addedAt), 'an undated backup item counts as added now');
  const again = store.importItems([...backup, { id: 'album-copy', title: 'manual b', artist: 'ARTIST' }]);
  assert.equal(again.added, 0); assert.equal(again.total, 6); assert.equal(again.ids['album-copy'], 'album-newest');
});

test('item fields are bounded and unsafe artwork is dropped', () => {
  const item = normalizeItem({ title: 'x'.repeat(500), artist: '歌手', cover: 'javascript:alert(1)', year: 'nineteen', tracks: Array(500).fill('t'), collectionViewUrl: 'file:///etc/passwd', notes: 'n'.repeat(9000) });
  assert.equal(item.title.length, 160); assert.equal(item.cover, ''); assert.equal(item.year, ''); assert.equal(item.tracks.length, 100); assert.equal(item.collectionViewUrl, ''); assert.equal(item.notes.length, 4000);
  assert.equal(normalizeItem({ title: 'a', artist: 'b', cover: '/desktop-music/local/cover/0123456789abcdef' }).cover, '/desktop-music/local/cover/0123456789abcdef');
  assert.equal(normalizeItem({ title: 'a', artist: 'b', cover: '/desktop-music/local/cover/../../x' }).cover, '');
});

test('the cabin page reaches the collection and catalog search through the site router', async (t) => {
  const directory = temp(t), collection = createCollectionStore({ directory }), searched = [];
  const router = createSiteRouter({ webRoot: path.join(__dirname, 'fixtures/web'), qq: {}, collection, catalog: async (params) => { searched.push(params.get('term')); return Response.json({ candidates: [] }); }, forward: async () => { throw new Error('no network in this test'); } });
  const call = (pathname, init) => router(new Request('https://album-circle.vercel.app' + pathname, init));
  const created = await (await call('/api/items', { method: 'POST', body: JSON.stringify({ title: '范特西', artist: '周杰伦' }) })).json();
  assert.equal(created.item.title, '范特西');
  assert.equal((await (await call('/api/items')).json()).items.length, 1);
  assert.equal((await (await call('/api/items?id=' + created.item.id, { method: 'PATCH', body: JSON.stringify({ notes: '开车听' }) })).json()).item.notes, '开车听');
  assert.equal((await call('/api/items?id=nope', { method: 'DELETE' })).status, 400);
  assert.equal((await call('/api/items?id=' + created.item.id, { method: 'DELETE' })).status, 200);
  await call('/api/search?term=' + encodeURIComponent('周杰伦 叶惠美') + '&type=album'); assert.deepEqual(searched, ['周杰伦 叶惠美']);
  const page = await call('/'); assert.match(await page.text(), /desktop-bootstrap\.js/); assert.match(page.headers.get('content-security-policy'), /connect-src 'self';/);
});

test('picked-file albums de-duplicate and keep the original cover beside a pixel cover', (t) => {
  const store = createCollectionStore({ directory: temp(t) }), png = 'data:image/png;base64,iVBORw0KGgo=';
  const first = store.add({ title: '叶惠美', artist: '周杰伦', cover: png, externalIds: { fileAlbum: 'f1234abcd' } });
  assert.equal(store.add({ title: '叶惠美', artist: '周杰伦', externalIds: { fileAlbum: 'f1234abcd' } }).duplicate, true);
  const updated = store.update(first.item.id, { cover: png, originalCover: 'https://is1-ssl.mzstatic.com/a.jpg' }).item;
  assert.equal(updated.cover, png); assert.equal(updated.originalCover, 'https://is1-ssl.mzstatic.com/a.jpg');
  assert.equal(store.update(first.item.id, { originalCover: 'javascript:alert(1)' }).item.originalCover, '');
});

test('large playlists persist track identities through update and restart with a 5000 cap', t => {
  const directory = temp(t), store = createCollectionStore({ directory });
  const tracks = Array.from({ length: 620 }, (_, i) => 'Song ' + i), trackDetails = tracks.map((title, i) => ({ title, artist: 'Artist', source: 'netease', providerId: String(i + 1) }));
  const added = store.add({ type: 'playlist', title: 'Large', artist: 'Me', tracks, trackDetails, externalIds: { playlist: 'netease:42' } }).item;
  store.update(added.id, { notes: 'keep' });
  const [saved] = createCollectionStore({ directory }).list();
  assert.deepEqual(saved.tracks, tracks); assert.equal(saved.trackDetails[619].providerId, '620'); assert.equal(saved.notes, 'keep');
  assert.equal(normalizeItem({ ...saved, tracks: Array(5001).fill('song') }).tracks.length, 5000);
});
test('playlist songs keep their own cover; unsafe covers are dropped', () => {
  const item = normalizeItem({ type: 'playlist', title: '歌单', artist: '我', tracks: ['a', 'b'], trackDetails: [{ title: 'a', cover: 'https://y.gtimg.cn/a.jpg' }, { title: 'b', cover: 'javascript:alert(1)' }] });
  assert.equal(item.trackDetails[0].cover, 'https://y.gtimg.cn/a.jpg'); assert.equal('cover' in item.trackDetails[1], false);
});
