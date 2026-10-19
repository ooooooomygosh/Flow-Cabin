import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const FOCUS_KEY = 'album-circle-focus-v1:local-owner';
const SOUND_KEY = 'album-circle-sound-v1';
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 960, height: 600 }];

// Real pointer/keyboard input is required here: dispatchEvent or force would
// conceal a hotspot inheriting pointer-events:none from the painted canvas.
async function reachable(locator) {
  await locator.waitFor({ state: 'visible' });
  const hit = await locator.evaluate(node => {
    const r = node.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      label: node.getAttribute('aria-label') || node.textContent.trim(),
      pointerEvents: getComputedStyle(node).pointerEvents,
      centerInside: x >= 0 && x < innerWidth && y >= 0 && y < innerHeight,
      receivesPointer: Boolean(top && (top === node || node.contains(top))),
      coveringElement: top ? `${top.tagName.toLowerCase()}.${String(top.className)}` : null,
      bounds: { x: r.x, y: r.y, width: r.width, height: r.height }
    };
  });
  assert.notEqual(hit.pointerEvents, 'none', JSON.stringify(hit));
  assert(hit.centerInside && hit.receivesPointer, JSON.stringify(hit));
  return hit;
}

async function noOverflow(page) {
  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    const selectors = ['.cabin-toolbar', '.cabin-welcome', '.room-cat', '.room-turntable', '.focus-dock', '.cat-panel', 'dialog[open]'];
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
    await context.addInitScript(() => {
      if (location.origin === 'null') return;
      localStorage.setItem('flow-cabin-onboarding-v1', JSON.stringify({ version: 2, status: 'done', step: 'done', seenVersion: '1.21.2' }));
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
        await page.locator('.room-scene[data-room-look="pixel"]').waitFor();
        await page.locator('.room-cat[data-pet-id="cat"]').waitFor();
        await page.waitForFunction(() => {
          const art = document.querySelector('.cabin-scene-art');
          return art?.complete && art.naturalWidth > 0 && document.querySelectorAll('.cabin-object').length === 3;
        });
        // The cat is rendered before its lazy panel listener finishes loading.
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
      await run('hotspots-and-layout', async (page, shot) => {
        const hotspots = [];
        for (const label of ['阅读灯', '窗外天气与时间设置', '壁炉声音']) hotspots.push(await reachable(page.getByRole('button', { name: label, exact: true })));
        const layout = await noOverflow(page);
        await shot('room'); return { hotspots, layout };
      });
      await run('lamp-toggle-and-shade', async (page, shot) => {
        const lamp = page.getByRole('button', { name: '阅读灯', exact: true });
        await lamp.waitFor({ state: 'visible' }); assert.equal(await lamp.getAttribute('aria-pressed'), 'true');
        const initial = await page.locator('.cabin-rest-light').evaluate(node => Number(getComputedStyle(node).opacity));
        assert.equal(initial, 0);
        await lamp.click();
        await page.waitForFunction(() => document.querySelector('.cabin-lamp')?.getAttribute('aria-pressed') === 'false'
          && Number(getComputedStyle(document.querySelector('.cabin-rest-light')).opacity) > .25);
        await noOverflow(page); await shot('dim');
        await lamp.click();
        await page.waitForFunction(() => document.querySelector('.cabin-lamp')?.getAttribute('aria-pressed') === 'true'
          && Number(getComputedStyle(document.querySelector('.cabin-rest-light')).opacity) === 0);
      });
      await run('window-opens-room-settings', async (page, shot) => {
        const windowButton = page.getByRole('button', { name: '窗外天气与时间设置', exact: true });
        await reachable(windowButton); await windowButton.click();
        const settings = page.getByRole('dialog', { name: '设置', exact: true });
        await settings.waitFor();
        assert.equal(await settings.getByRole('tab', { name: '房间与桌宠', exact: true }).getAttribute('aria-selected'), 'true');
        await settings.getByRole('heading', { name: '窗外', exact: true }).waitFor();
        await noOverflow(page); await shot('settings');
        await page.keyboard.press('Escape'); await settings.waitFor({ state: 'hidden' });
        await reachable(windowButton);
      });
      await run('hearth-toggle-and-persistence', async (page, shot) => {
        const hearth = page.getByRole('button', { name: '壁炉声音', exact: true });
        await reachable(hearth); assert.equal(await hearth.getAttribute('aria-pressed'), 'false');
        await hearth.click();
        await page.waitForFunction(() => document.querySelector('.cabin-hearth')?.getAttribute('aria-pressed') === 'true');
        assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).tracks.fire, SOUND_KEY), .3);
        await noOverflow(page); await shot('fire-on');
        await hearth.click();
        await page.waitForFunction(() => document.querySelector('.cabin-hearth')?.getAttribute('aria-pressed') === 'false');
        assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).tracks.fire, SOUND_KEY), 0);
      });
      const compact = viewport.width <= 900 || viewport.height <= 650;
      await run(compact ? 'compact-focus-opens-notes' : 'welcome-opens-notes', async (page, shot) => {
        const openNotes = async () => {
          if (compact) {
            assert.equal(await page.locator('.cabin-welcome').isVisible(), false, 'the compact layout intentionally hides the welcome note');
            await page.locator('.cabin-toolbar .focus-badge').click();
            await page.getByRole('tab', { name: '随手记', exact: true }).click();
          } else {
            const write = page.getByRole('button', { name: '写两句', exact: true });
            await reachable(write); await write.click();
          }
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
      await run('cat-reacts-to-real-input', async (page, shot) => {
        await page.locator('.cabin-toolbar .focus-badge').click();
        await page.getByRole('tab', { name: '随手记', exact: true }).click();
        const notes = page.getByRole('textbox', { name: '随手记内容', exact: true });
        await notes.click();
        await page.waitForFunction(() => {
          const cat = document.querySelector('.room-cat');
          return cat?.dataset.clicking === 'true' && cat.dataset.pose === 'click';
        });
        await page.waitForFunction(() => !document.querySelector('.room-cat')?.dataset.clicking && document.querySelector('.room-cat')?.dataset.pose !== 'click');
        await notes.pressSequentially('The cat is typing with me.', { delay: 35 });
        await page.waitForFunction(() => {
          const cat = document.querySelector('.room-cat');
          return cat?.dataset.typing === 'true' && cat.dataset.pose === 'typing' && cat.querySelector('.pixel-cat')?.dataset.pose === 'typing';
        });
        assert.match(await page.locator('.room-cat').getAttribute('aria-label'), /奶糖/);
        await shot('typing'); await noOverflow(page);
        await page.waitForFunction(() => !document.querySelector('.room-cat')?.dataset.typing && document.querySelector('.room-cat')?.dataset.pose !== 'typing');
      });
      await run('cat-double-click-and-dress', async (page, shot) => {
        const cat = page.locator('.room-cat[data-pet-id="cat"]');
        await reachable(cat); await cat.dblclick();
        const panel = page.locator('.cat-panel');
        await panel.waitFor();
        await panel.getByRole('heading', { name: '小猫', exact: true }).waitFor();
        await panel.getByText('奶糖', { exact: true }).waitFor();
        assert.equal(await cat.getAttribute('aria-expanded'), 'true');
        const headphones = panel.getByRole('button', { name: '小猫耳机', exact: true });
        await headphones.click();
        await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).rewards.equipped.accessory === 'headphones', FOCUS_KEY);
        assert.equal(await headphones.getAttribute('aria-pressed'), 'true');
        assert.equal(await panel.locator('.cat-portrait .pixel-cat').getAttribute('data-accessory'), 'headphones');
        await noOverflow(page); await shot('dressed');
        await page.keyboard.press('Escape'); await panel.waitFor({ state: 'hidden' });
        assert.equal(await cat.locator('.pixel-cat').getAttribute('data-accessory'), 'headphones');
        assert.equal(await cat.getAttribute('aria-expanded'), 'false');
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
