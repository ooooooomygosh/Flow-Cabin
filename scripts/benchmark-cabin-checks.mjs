import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { onboardingSeed } from './app-version.mjs';

const FOCUS_KEY = 'album-circle-focus-v1:local-owner';
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 960, height: 600 }];

// Real pointer/keyboard input is required here: dispatchEvent or force would conceal a button on the desk
// (src/desk/DeskHome.jsx) inheriting pointer-events:none from the pictures under it. Things on the desk
// overlap a little (the bookcase plate over the wood, the drawer over the front edge), so a button only has to
// receive the pointer somewhere inside its box: the first of a 5 x 5 grid of points that hits it is returned.
async function reachable(locator) {
  await locator.waitFor({ state: 'visible' });
  const hit = await locator.evaluate(node => {
    const r = node.getBoundingClientRect();
    const probe = (x, y) => { const top = document.elementFromPoint(x, y); return x >= 0 && x < innerWidth && y >= 0 && y < innerHeight && Boolean(top && (top === node || node.contains(top))); };
    const points = [[.5, .5], ...[.5, .25, .75, .1, .9].flatMap(fy => [.5, .25, .75, .1, .9].map(fx => [fx, fy]))];
    const found = points.find(([fx, fy]) => probe(r.left + r.width * fx, r.top + r.height * fy));
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, top = document.elementFromPoint(cx, cy);
    return {
      label: node.getAttribute('aria-label') || node.textContent.trim(),
      pointerEvents: getComputedStyle(node).pointerEvents,
      centerInside: cx >= 0 && cx < innerWidth && cy >= 0 && cy < innerHeight,
      receivesPointer: Boolean(found),
      point: found ? { x: r.width * found[0], y: r.height * found[1] } : null,
      coveringElement: top ? `${top.tagName.toLowerCase()}.${String(top.className)}` : null,
      bounds: { x: r.x, y: r.y, width: r.width, height: r.height }
    };
  });
  assert.notEqual(hit.pointerEvents, 'none', JSON.stringify(hit));
  assert(hit.centerInside && hit.receivesPointer, JSON.stringify(hit));
  return hit;
}
const press = async (locator) => { const hit = await reachable(locator); await locator.click({ position: hit.point }); return hit; };

async function noOverflow(page) {
  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    const selectors = ['.desk-console-plate', '.desk-clock-face', '.desk-post', '.desk-shelf-plate', '.desk-pull', '.desk-window', '.desk-look', '.cat-panel', 'dialog[open]'];
    const outside = selectors.flatMap(selector => [...document.querySelectorAll(selector)].flatMap(node => {
      const style = getComputedStyle(node), r = node.getBoundingClientRect();
      if (!r.width || !r.height || style.display === 'none' || style.visibility === 'hidden') return [];
      return r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1
        ? [{ selector, left: r.left, top: r.top, right: r.right, bottom: r.bottom }] : [];
    }));
    return { width: innerWidth, height: innerHeight, scrollWidth: root.scrollWidth, scrollHeight: root.scrollHeight, outside };
  });
  assert(layout.scrollWidth <= layout.width + 1 && layout.scrollHeight <= layout.height + 1, JSON.stringify(layout));
  assert.deepEqual(layout.outside, [], 'visible controls must stay inside the viewport: ' + JSON.stringify(layout));
  return layout;
}

export async function verifyBenchmarkCabin(browser, origin, { output, check = () => {} } = {}) {
  const report = { checks: [], pageErrors: [], consoleErrors: [], unexpectedRequests: [], screenshots: [] };
  if (output) await fs.mkdir(output, { recursive: true });
  for (const viewport of VIEWPORTS) {
    const size = `${viewport.width}x${viewport.height}`;
    const context = await browser.newContext({ viewport, locale: 'zh-CN', reducedMotion: 'reduce' });
    await context.addInitScript((seed) => { window.__onboardingSeed = seed; }, onboardingSeed());
    await context.addInitScript(() => {
      if (location.origin === 'null') return;
      localStorage.setItem('flow-cabin-onboarding-v1', window.__onboardingSeed);
      localStorage.setItem('album-circle-library-v1-local-owner', JSON.stringify({ rooms: { 'local-room': { look: 'pixel', petId: 'cat', boxes: [] } } }));
      localStorage.setItem('album-circle-focus-dock-v1', JSON.stringify({ open: false, tab: 'timer' }));
      localStorage.setItem('album-circle-sound-v1', JSON.stringify({ master: .8, lofiOn: false, tracks: { rain: 0, fire: 0, wind: 0, white: 0, vinyl: 0 } }));
      const key = 'album-circle-focus-v1:local-owner';
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ notes: '', tasks: [], sessions: [],
        settings: { notify: false, chime: false }, rewards: { fish: 4, xp: 100 } }));
      window.albumDesktopAppearance = { client: true, reduceMotion: true };
      window.__benchmarkCommands = [];
      window.open = url => { window.__benchmarkCommands.push(String(url)); return null; };
      const init = () => { document.documentElement.dataset.desktopClient = 'true'; document.documentElement.dataset.desktopReduceMotion = 'true'; };
      if (document.documentElement) init();
      else new MutationObserver((_, observer) => { if (document.documentElement) { init(); observer.disconnect(); } }).observe(document, { childList: true });
    });
    const items = Array.from({ length: 8 }, (_, index) => ({
      id: `benchmark-${index}`, title: `小屋唱片 ${index + 1}`, artist: '离线夹具', type: 'album', cover: '',
      source: 'manual', tracks: ['晨光'], addedAt: '2026-10-18T08:00:00Z'
    }));
    await context.route('**/*', route => {
      const url = new URL(route.request().url()), pathname = url.pathname;
      const json = value => route.fulfill({ json: value });
      if (url.origin !== origin) { report.unexpectedRequests.push({ size, url: url.href }); return route.abort(); }
      if (pathname === '/api/items') return json({ items });
      if (pathname === '/desktop-music/lyrics') return json({ text: '', source: 'fixture', reason: 'No fixture lyrics' });
      if (pathname === '/desktop-music/config') return json({ qqLoggedIn: false, neteaseLoggedIn: false });
      if (['/desktop-music/now-playing', '/desktop-music/apple/permission'].includes(pathname)) return json({ available: false });
      if (pathname === '/desktop-music/local/summary') return json({ folders: [], albumCount: 0, trackCount: 0 });
      if (pathname.startsWith('/api/') || pathname.startsWith('/desktop-music/')) {
        report.unexpectedRequests.push({ size, url: url.href }); return route.fulfill({ status: 500, json: { error: 'Unimplemented benchmark fixture' } });
      }
      return route.continue();
    });
    const run = async (name, verify) => {
      const id = `benchmark-cabin-${size}-${name}`, page = await context.newPage();
      page.setDefaultTimeout(6500);
      page.on('pageerror', error => report.pageErrors.push({ check: id, message: error.message }));
      page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push({ check: id, message: message.text() }); });
      const shot = async suffix => {
        if (!output) return;
        const file = path.join(output, `${id}-${suffix}.png`);
        await page.screenshot({ path: file, animations: 'disabled' }); report.screenshots.push(file);
      };
      try {
        await page.goto(origin, { waitUntil: 'domcontentloaded' });
        await page.locator('.desk-home.is-lit').waitFor();
        // The pet panel's listener is attached before its lazy module finishes loading.
        await page.waitForLoadState('networkidle');
        const details = await verify(page, shot);
        report.checks.push({ name: id, passed: true, ...details });
        check(id, details || {});
      } catch (error) {
        report.checks.push({ name: id, passed: false, error: error.message });
        await shot('failure').catch(() => {});
      } finally { await page.close(); }
    };
    try {
      // The desk's entries: the 唱机 plate (C), the LED clock (专注), the post box (N), the 唱片架 plate (A),
      // the drawer pull (D) and the window controls.
      const entries = (page) => [page.getByRole('button', { name: /^唱机 · 抬头看控制面板/ }), page.locator('.desk-clock-face'), page.locator('.desk-post'), page.getByRole('button', { name: /^唱片架 · / }), page.locator('.desk-pull'), page.getByRole('button', { name: '进入全屏模式', exact: true })];
      await run('desk-entries-and-layout', async (page, shot) => {
        const hits = [];
        for (const entry of entries(page)) hits.push(await reachable(entry));
        const layout = await noOverflow(page);
        await shot('room'); return { hotspots: hits, layout };
      });
      await run('desk-entries-open-their-pillars', async (page, shot) => {
        // 唱机: the plate looks up at the Control Panel (the console view, a look named 唱机).
        await press(page.getByRole('button', { name: /^唱机 · 抬头看控制面板/ }));
        const console = page.getByRole('dialog', { name: '唱机', exact: true }); await console.locator('.console-view').waitFor(); await noOverflow(page);
        await page.keyboard.press('Escape'); await page.locator('.desk-look').waitFor({ state: 'detached' });
        // 专注: the clock.
        await press(page.locator('.desk-clock-face'));
        const focus = page.getByRole('dialog', { name: '专注', exact: true }); await focus.waitFor(); await noOverflow(page); await shot('focus');
        await page.keyboard.press('Escape'); await focus.waitFor({ state: 'hidden' });
        // 唱片日记: the record in the drawer.
        await press(page.locator('.desk-pull'));
        await press(page.getByRole('group', { name: '抽屉', exact: true }).getByRole('button', { name: '唱片日记', exact: true }));
        const journal = page.getByRole('dialog', { name: '唱片日记', exact: true }); await journal.waitFor(); await noOverflow(page);
        await page.keyboard.press('Escape'); await journal.waitFor({ state: 'hidden' });
        for (const entry of entries(page)) await reachable(entry);
      });
      await run('drawer-pull-opens-the-drawer-and-settings', async (page, shot) => {
        const pull = page.locator('.desk-pull');
        await press(pull);
        const drawer = page.getByRole('group', { name: '抽屉', exact: true });
        for (const name of ['唱片日记', '伙伴', '随手记', '窗外与天气', '备份与恢复']) await reachable(drawer.getByRole('button', { name, exact: true }));
        const settingsThing = drawer.getByRole('button', { name: '设置', exact: true }); await reachable(settingsThing);
        await shot('drawer'); await settingsThing.click();
        const settings = page.getByRole('dialog', { name: '设置', exact: true });
        await settings.waitFor();
        assert.equal(await settings.getByRole('tab', { selected: true }).count(), 1);
        await noOverflow(page); await shot('settings');
        await page.keyboard.press('Escape'); await settings.waitFor({ state: 'hidden' });
        await reachable(pull);
      });
      await run('focus-opens-notes-and-keeps-them', async (page, shot) => {
        const openNotes = async () => {
          await page.locator('.focus-badge').click();
          await page.getByRole('tab', { name: '随手记', exact: true }).click();
        };
        await openNotes();
        const notes = page.getByRole('textbox', { name: '随手记内容', exact: true });
        await notes.waitFor();
        assert.equal(await page.getByRole('tab', { name: '随手记', exact: true }).getAttribute('aria-selected'), 'true');
        await notes.pressSequentially('A quiet evening.', { delay: 25 }); await notes.press('Enter');
        await notes.pressSequentially('Two lines for today.', { delay: 25 });
        const text = 'A quiet evening.\nTwo lines for today.';
        await page.waitForFunction(({ key, text }) => JSON.parse(localStorage.getItem(key)).notes === text, { key: FOCUS_KEY, text });
        await noOverflow(page); await shot('notes');
        await page.reload();
        await openNotes();
        assert.equal(await page.getByRole('textbox', { name: '随手记内容', exact: true }).inputValue(), text);
      });
      await run('drawer-companion-opens-the-panel-and-dresses', async (page, shot) => {
        await press(page.locator('.desk-pull'));
        await press(page.getByRole('group', { name: '抽屉', exact: true }).getByRole('button', { name: '伙伴', exact: true }));
        const panel = page.locator('.cat-panel');
        await panel.waitFor();
        await panel.getByRole('heading', { name: '小猫', exact: true }).waitFor();
        await panel.locator('.cat-collar', { hasText: '奶糖' }).waitFor();
        const headphones = panel.getByRole('button', { name: '小猫耳机', exact: true });
        await headphones.click();
        await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).rewards.equipped.accessory === 'headphones', FOCUS_KEY);
        assert.equal(await headphones.getAttribute('aria-pressed'), 'true');
        assert.equal(await panel.locator('.cat-portrait .pixel-cat').getAttribute('data-accessory'), 'headphones');
        await noOverflow(page); await shot('dressed');
        await page.keyboard.press('Escape'); await panel.waitFor({ state: 'hidden' });
        await reachable(page.locator('.desk-pull'));
      });
    } finally { await context.close(); }
  }
  const failed = report.checks.filter(entry => !entry.passed);
  if (failed.length || report.pageErrors.length || report.consoleErrors.length || report.unexpectedRequests.length) {
    const error = new Error(`Benchmark cabin checks failed:\n${failed.map(entry => `${entry.name}: ${entry.error}`).join('\n')}`
      + `\nPage errors: ${report.pageErrors.length}; console errors: ${report.consoleErrors.length}; unexpected requests: ${report.unexpectedRequests.length}`);
    error.report = report;
    throw error;
  }
  return report;
}
