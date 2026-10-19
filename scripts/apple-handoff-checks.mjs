import assert from 'node:assert/strict';
import path from 'node:path';
import { chooseSource } from './settings-actions.mjs';
import { normalizeItem } from '../desktop/collection-store.cjs';

// Runs the real renderer and polls its HTTP boundary. Music.app is never opened.
export async function verifyAppleHandoff({ browser, origin, output, check }) {
  for (const initial of ['paused', 'playing', 'legacy']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN', reducedMotion: 'reduce' });
    const errors = [], controls = [], resolves = [];
    const selected = { id: 'ABCDEF0123456789', title: '所选歌曲', artist: '演示歌手', album: '原始专辑', duration: 200, elapsed: 12 };
    let current = { ...selected, title: '另一首歌曲', state: initial }, polls = 0, failPoll = false;
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'platform', { value: 'MacIntel' });
      Object.defineProperty(navigator, 'userAgentData', { value: { platform: 'macOS' } });
      localStorage.setItem('flow-cabin-onboarding-v1', JSON.stringify({ version: 2, status: 'done', step: 'done', seenVersion: '1.21.0' }));
      window.albumDesktopAppearance = { client: true, reduceMotion: true };
      const init = () => { document.documentElement.dataset.desktopClient = 'true'; document.documentElement.dataset.desktopReduceMotion = 'true'; };
      if (document.documentElement) init(); else new MutationObserver((_, observer) => { if (document.documentElement) { init(); observer.disconnect(); } }).observe(document, { childList: true });
      window.__desktopCommands = [];
      window.__unexpectedNavigation = [];
      window.open = value => {
        const url = new URL(String(value));
        if (url.protocol !== 'album-desktop:' || url.hostname !== 'action' || url.pathname !== '/tray-pet') {
          window.__unexpectedNavigation.push(String(value)); throw new Error('Unexpected native navigation');
        }
        window.__desktopCommands.push(String(value)); return null;
      };
    });
    await context.route('**/*', route => {
      const u = new URL(route.request().url()), json = value => route.fulfill({ json: value });
      if (u.origin !== origin) { errors.push('external request blocked'); return route.abort(); }
      if (u.pathname === '/api/items') return json({ items: [normalizeItem({ id: 'apple-single', type: 'song', title: selected.title, artist: selected.artist, ...(initial === 'legacy' ? {} : { albumTitle: selected.album, trackTimeMillis: selected.duration * 1000 }), tracks: [selected.title], trackDetails: [], externalIds: { itunesTrackId: '1234567890' }, source: 'iTunes Search', cover: '' })] });
      if (u.pathname === '/desktop-music/config') return json({ appleMusicAvailable: true, qqLoggedIn: false, neteaseLoggedIn: false });
      if (u.pathname === '/desktop-music/apple/permission') return json({ available: true, granted: true });
      if (u.pathname === '/desktop-music/now-playing') return json({ available: false });
      if (u.pathname === '/desktop-music/local/summary') return json({ folders: [], albumCount: 0, trackCount: 0 });
      if (u.pathname === '/desktop-music/search') { assert.equal(u.searchParams.get('scope'), null, 'native imported ID must bypass fuzzy catalogue search'); return json({ candidates: [] }); }
      if (u.pathname === '/desktop-music/resolve') { resolves.push(route.request().postDataJSON()); return json({ remote: true, catalog: true, notice: '已打开所选歌曲，请在音乐 App 播放。' }); }
      if (u.pathname === '/desktop-music/apple/state') { polls++; return failPoll ? route.fulfill({ status: 503, json: { error: 'Fixture state unavailable' } }) : json(current); }
      if (u.pathname === '/desktop-music/apple/control') { controls.push(route.request().postDataJSON()); return json({ ok: true }); }
      if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/desktop-music/')) { errors.push(u.pathname); return json({}); }
      return route.continue();
    });
    const page = await context.newPage(); page.setDefaultTimeout(8000); page.on('pageerror', error => errors.push(error.message));
    const waiting = () => page.getByText('请在「音乐」App 播放所选歌曲', { exact: true }).first().waitFor();
    const progress = page.getByRole('slider', { name: '音乐播放进度', exact: true });
    const pollAgain = async () => { const previous = polls; for (let i = 0; i < 40 && polls <= previous; i++) await page.waitForTimeout(100); assert.ok(polls > previous); await page.waitForTimeout(100); };
    try {
      await page.goto(origin); await page.locator('.room-record').first().waitFor();
      assert.equal(await page.evaluate(() => /mac/i.test(navigator.userAgentData?.platform || navigator.platform)), true, 'settings and player both receive the Mac fixture platform');
      assert.equal(await page.evaluate(() => document.documentElement.dataset.desktopClient), 'true');
      assert.deepEqual(errors, []);
      await chooseSource(page, 'appleMusic');
      await page.locator('.room-record').first().dblclick(); await waiting(); await pollAgain();
      assert.equal(resolves.length, 1); assert.equal(resolves[0].id, '1234567890'); assert.equal(resolves[0].album, initial === 'legacy' ? '' : selected.album);
      assert.equal(await page.getByRole('button', { name: '播放音乐', exact: true }).isDisabled(), true);
      assert.equal(await progress.inputValue(), '0'); assert.equal(await progress.isDisabled(), true);
      await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('Space');
      assert.deepEqual(controls, []); assert.equal(resolves.length, 1);
      if (output) await page.screenshot({ path: path.join(output, `apple-handoff-unrelated-${initial}.png`), animations: 'disabled' });
      check(`apple-catalog-does-not-adopt-or-control-${initial}-unrelated-track`);
      for (const wrong of [{ album: 'Live in Concert', duration: 350 }, { album: selected.album, duration: 350 }]) {
        current = { ...selected, state: 'playing', ...wrong }; await pollAgain(); await waiting();
        assert.equal(await progress.inputValue(), '0'); assert.deepEqual(controls, []);
      }
      current = { ...selected, state: 'playing' }; await pollAgain();
      if (initial === 'legacy') {
        await waiting(); assert.equal(await progress.inputValue(), '0');
        await page.getByRole('button', { name: '取下唱片', exact: true }).click(); await page.waitForTimeout(100);
        assert.deepEqual(controls, []); assert.deepEqual(errors, []); assert.deepEqual(await page.evaluate(() => window.__unexpectedNavigation), []); check('apple-legacy-single-without-recording-metadata-never-takes-control');
        continue;
      }
      const pause = page.getByRole('button', { name: '暂停音乐播放', exact: true }); await pause.waitFor();
      assert.equal(await pause.isEnabled(), true); assert.equal(await progress.inputValue(), '12');
      await pause.click(); assert.deepEqual(controls, [{ action: 'pause', expectedTrack: { id: selected.id, title: selected.title, artist: selected.artist, album: selected.album } }]);
      if (output) await page.screenshot({ path: path.join(output, `apple-handoff-bound-${initial}.png`), animations: 'disabled' });
      current = { ...selected, id: '0123456789ABCDEF', state: 'playing' }; await pollAgain(); await waiting(); await pollAgain(); await waiting();
      assert.equal(await progress.inputValue(), '0'); assert.equal(controls.length, 1, 'polls cannot rebind to a different native id with identical metadata');
      current = { ...selected, title: '另一首歌曲', state: 'playing' }; await pollAgain(); await waiting();
      assert.equal(await progress.inputValue(), '0');
      failPoll = true; await pollAgain(); await waiting();
      assert.equal(resolves.length, 1, 'state errors do not auto-skip or reopen catalogue songs');
      await page.getByRole('button', { name: '取下唱片', exact: true }).click(); await page.waitForTimeout(100);
      assert.equal(controls.length, 1, 'ejecting pending handoff never pauses the unrelated song');
      assert.deepEqual(errors, []);
      assert.deepEqual(await page.evaluate(() => window.__unexpectedNavigation), []);
      check(`apple-catalog-binds-selected-track-revokes-on-change-and-ejects-safely-${initial}`);
    } catch (error) {
      console.error('Apple handoff fixture failure', { initial, errors, body: (await page.locator('body').innerText().catch(() => '')).slice(0, 2000) });
      throw error;
    } finally { await context.close(); }
  }
}
