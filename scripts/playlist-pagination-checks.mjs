/** Offline large-playlist integration. Isolated context; no account or external traffic. */
import assert from 'node:assert/strict';
export async function verifyPlaylistPagination({ browser, origin, check }) {
  const context = await browser.newContext({ viewport: { width: 960, height: 600 }, reducedMotion: 'reduce', locale: 'zh-CN' });
  let mode = 'fail', revision = 3, pending, listPending, detailPending, delayDetail = false, delayList = true, items = [{ id: 'fixture-page-record', type: 'album', title: 'Fixture', artist: 'Test', tracks: [] }];
  const errors = [], tracks = Array.from({ length: 620 }, (_, i) => ({ title: 'Page Song ' + (i + 1), artist: 'Fixture Artist', album: 'Fixture Album', source: 'netease', providerId: String(i + 1), playlistIndex: i }));
  const playlist = { id: '88001', name: '620 首离线歌单', trackCount: 620, kind: 'created' };
  const detail = offset => ({ provider: 'netease', revision, playlist, tracks: offset ? mode === 'duplicate' ? tracks.slice(0, 500) : tracks.slice(499, mode === 'short' ? 619 : 620) : tracks.slice(0, 500), truncated: true, page: { offset, nextOffset: offset ? null : 500, snapshot: 'fixture-stable', missingPages: offset && mode === 'short' ? [{ offset, ids: ['620'] }] : [] } });
  await context.addInitScript(() => { window.albumDesktopAppearance = { client: true, reduceMotion: true }; });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), p = url.pathname;
    if (url.origin !== origin) { errors.push('External request: ' + url.origin); return route.abort(); }
    const json = value => route.fulfill({ json: value });
    if (p === '/api/items') {
      if (request.method() === 'GET') return json({ items });
      const body = request.postDataJSON();
      if (request.method() === 'POST') {
        const duplicate = items.find(i => i.externalIds?.playlist === body.externalIds?.playlist && body.externalIds?.playlist);
        if (duplicate) return json({ item: duplicate, duplicate: true });
        const item = { ...body, id: 'large-saved' }; items.push(item); return json({ item });
      }
      if (request.method() === 'PATCH') { const item = items.find(i => i.id === url.searchParams.get('id')); Object.assign(item, body); return json({ item }); }
    }
    if (p === '/desktop-music/lyrics') return json({ text: '', source: 'fixture', reason: 'No fixture lyrics' });
    if (p === '/desktop-music/config') return json({ neteaseLoggedIn: true, qqLoggedIn: false });
    if (p === '/desktop-music/playlists') { if (delayList) { delayList = false; await new Promise(resolve => { listPending = resolve; }); } return json({ loggedIn: true, playlists: [playlist] }); }
    if (p === '/desktop-music/playlist') {
      const offset = Number(url.searchParams.get('offset') || 0), payload = detail(offset);
      if (offset) {
        assert.equal(url.searchParams.get('revision'), String(revision));
        if (mode === 'fail') return route.fulfill({ status: 502, json: { error: '离线模拟：本批读取失败，请重试。' } });
        if (mode === 'delay') await new Promise(resolve => { pending = resolve; });
      } else if (delayDetail) { delayDetail = false; await new Promise(resolve => { detailPending = resolve; }); }
      return json(payload).catch(() => {}); // A deliberately cancelled fetch need not accept its late response.
    }
    if (p === '/desktop-music/now-playing') return json({ available: false });
    if (p === '/desktop-music/local/summary') return json({ folders: [], albumCount: 0, trackCount: 0 });
    if (p.startsWith('/api/') || p.startsWith('/desktop-music/')) { errors.push(p); return route.fulfill({ status: 500, json: { error: 'Unknown fixture' } }); }
    return route.continue();
  });
  const page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', e => errors.push(e.message));
  const open = async () => { await page.locator('.playlist-card', { hasText: playlist.name }).click(); await page.locator('.playlist-hero h3', { hasText: playlist.name }).waitFor(); };
  const more = () => page.getByRole('button', { name: '继续读取下一批' });
  const count = n => page.waitForFunction(expected => document.querySelector('.playlist-facts b')?.textContent === String(expected), n);
  const waitPending = async () => { for (let i = 0; i < 100 && !pending; i++) await new Promise(resolve => setTimeout(resolve, 20)); assert(pending, 'next page request started'); };
  try {
    await page.goto(origin); await page.locator('.room-record').first().waitFor();
    await page.getByRole('button', { name: '添加到唱片架', exact: true }).click(); await page.getByRole('tab', { name: '我的歌单', exact: true }).click();
    await page.getByLabel('正在读取歌单').waitFor();
    for (let i = 0; i < 100 && !listPending; i++) await new Promise(resolve => setTimeout(resolve, 20)); assert(listPending);
    await page.getByRole('tab', { name: /网易云音乐/ }).click(); listPending(); listPending = null;
    await open(); await count(500); check('active-playlist-tab-does-not-invalidate-pending-list');
    assert.equal(await page.locator('.playlist-track').count(), 100);
    const next = page.getByRole('button', { name: '下一页曲目' }); await next.focus(); await page.keyboard.press('Enter');
    await page.getByText('第 2 / 5 页 · 每页 100 首', { exact: true }).waitFor();
    assert.match(await page.locator('.playlist-track').first().innerText(), /Page Song 101/);
    await page.getByLabel('在歌单中查找').fill('Page Song 500'); await page.getByLabel('从第 500 首《Page Song 500》开始播放').waitFor(); await page.getByLabel('在歌单中查找').fill('');
    check('large-playlist-100-row-pages-keyboard-and-full-loaded-search');
    await more().click(); await page.getByRole('alert').filter({ hasText: '本批读取失败' }).waitFor(); await count(500);
    mode = 'duplicate'; await more().click(); await page.getByRole('alert').filter({ hasText: '重复页或空页' }).waitFor(); await count(500);
    mode = 'ok'; await more().click(); await count(620); assert.equal(await more().count(), 0);
    await page.getByRole('button', { name: '放上唱片架', exact: true }).click(); await page.locator('.playlist-notice').waitFor();
    assert.equal(items.at(-1).tracks.length, 620); assert.deepEqual(items.at(-1).trackDetails.map(t => t.providerId), tracks.map(t => t.providerId));
    check('large-playlist-failure-duplicate-page-retry-dedup-and-save-620');
    await page.getByRole('button', { name: '全部歌单' }).click(); await open();
    await page.getByRole('button', { name: '已在唱片架 · 同步', exact: true }).click(); await page.getByRole('alert').filter({ hasText: '不能覆盖' }).waitFor(); assert.equal(items.at(-1).tracks.length, 620);
    check('partial-reopen-cannot-overwrite-saved-longer-playlist');
    mode = 'delay'; await more().click(); await waitPending(); await page.getByRole('button', { name: '取消读取' }).click(); pending(); pending = null;
    await more().waitFor(); await count(500);
    mode = 'ok'; await more().click(); await count(620);
    check('large-playlist-cancel-late-response-and-retry');
    await page.getByRole('button', { name: '全部歌单' }).click(); await open();
    mode = 'delay'; await more().click(); await waitPending(); revision++;
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('album-music-account', { detail: { provider: 'netease' } })));
    await page.locator('.playlist-card', { hasText: playlist.name }).waitFor(); pending(); pending = null;
    mode = 'ok'; await open(); await count(500); await more().click(); await count(620);
    assert.equal(await page.locator('.add-album-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true);
    check('large-playlist-account-switch-discards-late-page-and-can-reopen');
    await page.getByRole('button', { name: '全部歌单' }).click(); await open(); mode = 'short'; await more().click(); await count(619);
    const retryMissing = page.getByRole('button', { name: '重试未返回曲目' }); await retryMissing.waitFor(); assert.equal(await more().count(), 0);
    await retryMissing.click(); await page.locator('.playlist-notice', { hasText: '本次仍未返回' }).waitFor(); await count(619);
    mode = 'ok'; await retryMissing.click(); await count(620); assert.equal(await retryMissing.count(), 0);
    check('short-successful-last-page-keeps-missing-id-retry-until-recovered');
    await page.getByRole('button', { name: '全部歌单' }).click(); delayDetail = true;
    await page.locator('.playlist-card', { hasText: playlist.name }).click();
    for (let i = 0; i < 100 && !detailPending; i++) await new Promise(resolve => setTimeout(resolve, 20)); assert(detailPending, 'playlist detail request started');
    await page.getByRole('button', { name: '刷新', exact: true }).click(); detailPending(); detailPending = null;
    await page.locator('.playlist-hero h3', { hasText: playlist.name }).waitFor();
    await page.getByRole('button', { name: '全部歌单' }).click(); await open(); assert.equal(await page.locator('.playlist-card[aria-busy="true"]').count(), 0);
    check('refreshing-the-list-does-not-orphan-an-opening-playlist');
    assert.deepEqual(errors, []);
  } finally { listPending?.(); pending?.(); detailPending?.(); await context.close(); }
}
