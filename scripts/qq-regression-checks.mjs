/** Offline renderer regression: isolated storage, synthetic responses, no external requests. */
import assert from 'node:assert/strict';
import { onboardingSeed } from './app-version.mjs';
export async function verifyQQRegression({ browser, origin, check }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN', reducedMotion: 'reduce' });
  const errors = []; let mode = 'expired';
  await context.addInitScript((seed) => { window.__onboardingSeed = seed; }, onboardingSeed());
  await context.addInitScript(() => {
    if (location.origin === 'null') return;
    localStorage.setItem('flow-cabin-onboarding-v1', window.__onboardingSeed);
    localStorage.setItem('album-circle-playlist-tab-v1', 'qq');
    window.albumDesktopAppearance = { client: true, reduceMotion: true };
    window.__commands = []; window.open = url => { window.__commands.push(String(url)); return null; };
  });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url()), p = url.pathname;
    if (url.origin !== origin) { errors.push('external request blocked'); return route.abort(); }
    const json = value => route.fulfill({ json: value });
    if (p === '/api/items') return json({ items: [] });
    if (p === '/desktop-music/lyrics') return json({ text: '', source: 'fixture', reason: 'No fixture lyrics' });
    if (p === '/desktop-music/config') return json({ qqLoggedIn: true, neteaseLoggedIn: false });
    if (p === '/desktop-music/playlists') {
      if (mode === 'expired') return json({ loggedIn: false, provider: 'qq', playlists: [] });
      if (mode === 'error') return route.fulfill({ status: 502, json: { error: 'QQ 音乐歌单读取失败，请重试或重新登录。' } });
      return json({ loggedIn: true, provider: 'qq', playlists: mode === 'partial-empty' ? [] : [{ id: 'qq-liked:201', name: '我喜欢的音乐', kind: 'liked', trackCount: 1 }], warning: mode.startsWith('partial') ? '收藏歌单未能读取。已读取的歌单保留，请刷新重试。' : '' });
    }
    if (p === '/desktop-music/now-playing') return json({ available: false });
    if (p === '/desktop-music/local/summary') return json({ folders: [], albumCount: 0, trackCount: 0 });
    if (p === '/desktop-music/apple/permission') return json({ available: false });
    if (p.startsWith('/desktop-music/') || p.startsWith('/api/')) { errors.push('unexpected fixture route '+p); return route.fulfill({ status: 500, json: { error: 'Unexpected fixture route' } }); }
    return route.continue();
  });
  const page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', e => errors.push(e.message));
  const open = async next => { mode = next; await page.goto(origin); await page.getByRole('button', { name: '添加到唱片架', exact: true }).click(); await page.getByRole('tab', { name: '我的歌单', exact: true }).click(); };
  try {
    await open('expired'); await page.getByRole('button', { name: '登录QQ 音乐', exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: '还没有歌单', exact: true }).count(), 0);
    const qqTab = page.getByRole('tab', { name: /QQ 音乐/ }); assert.doesNotMatch(await qqTab.textContent(), /已登录/); assert.equal(await qqTab.locator('.playlist-rail-dot').count(), 0);
    check('qq-expired-response-overrides-stored-cookie-in-renderer');
    await open('error'); await page.getByRole('heading', { name: '歌单暂时读不出来' }).waitFor();
    await page.getByRole('button', { name: '重新登录', exact: true }).waitFor(); check('qq-service-failure-exposes-retry-and-sign-in');
    await open('partial'); await page.locator('.playlist-card', { hasText: '我喜欢的音乐' }).waitFor();
    await page.getByRole('button', { name: '重试未读取的歌单' }).waitFor(); mode = 'complete';
    await page.getByRole('button', { name: '重试未读取的歌单' }).click(); await page.getByRole('button', { name: '重试未读取的歌单' }).waitFor({ state: 'detached' });
    check('qq-partial-list-keeps-liked-and-retry-clears-warning');
    await open('partial-empty'); await page.getByRole('heading', { name: '部分歌单未能读取' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: '还没有歌单', exact: true }).count(), 0); check('qq-unconfirmed-empty-is-not-reported-as-empty-account');
    // 学习 has one entry: the toolbar's 专注 badge opens the dock, 学习 is its tab (设置 holds only preferences).
    await page.keyboard.press('Escape'); await page.getByRole('button', { name: '设置', exact: true }).click(); await page.getByRole('tab', { name: '专注工具', exact: true }).click();
    assert.equal(await page.getByRole('dialog', { name: '设置', exact: true }).getByRole('button', { name: /打开学习|打开番茄钟|查看统计/ }).count(), 0, 'no action rows in 设置');
    await page.getByLabel('专注（分）').waitFor(); await page.keyboard.press('Escape');
    await page.locator('.cabin-toolbar .focus-badge').click(); await page.getByRole('tab', { name: '学习', exact: true }).click();
    assert.equal(await page.getByRole('tab', { name: '学习', exact: true }).getAttribute('aria-selected'), 'true'); await page.locator('.focus-dock').waitFor();
    check('toolbar-focus-badge-opens-study-dock-and-settings-holds-preferences');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
}
