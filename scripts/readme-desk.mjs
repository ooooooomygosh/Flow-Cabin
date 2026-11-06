/** README pictures of the 3.1 desk, captured from the real renderer in an isolated headless browser:
 * the desk with records spread on it and one on the player, the bookcase, the Control Panel, the drawer,
 * the focus close-up, and the phone. Showcase albums only (scripts/showcase-albums.mjs, covers committed
 * under docs/assets/covers); no accounts, no network beyond the local Vite server.
 * Usage: npm run screenshots:desk  (BROWSER_EXECUTABLE may point to Chromium)
 */
import { launchChromium } from './launch-browser.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { showcaseAlbums } from './showcase-albums.mjs';
import { onboardingSeed } from './app-version.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.env.README_ASSETS || path.join(root, 'docs/assets/screenshots'));
const port = Number(process.env.README_PORT || 4186), origin = `http://127.0.0.1:${port}`;
await fs.mkdir(output, { recursive: true });
const items = await showcaseAlbums(), day = 86400000, now = Date.now();
const task = (id, text, extra = {}) => ({ id, text, done: false, pomodoros: 0, createdAt: now - day, doneAt: 0, ...extra });
const focus = {
  version: 1, notes: '', settings: { notify: false, chime: false, autoSound: false, focusMin: 50, shortMin: 10, longMin: 20 },
  tasks: [task('t1', '润色 README 与截图', { pomodoros: 2 }), task('t2', '整理本周的唱片笔记', { pomodoros: 1 }), task('t3', '读完一篇乐评', { done: true, doneAt: now - 3600000, pomodoros: 1 })],
  sessions: [1, 2, 3, 4, 5, 6].flatMap((d) => Array.from({ length: (d % 3) + 1 }, (_, i) => ({ start: now - d * day - (i + 1) * 3600000, end: now - d * day - (i + 1) * 3600000 + 25 * 60000, taskId: '', completed: true }))),
  timer: { phase: 'idle', round: 0, taskId: 't1' }, rewards: { fish: 14, xp: 330 }
};
const shot = (page, name) => page.screenshot({ path: path.join(output, name), type: 'jpeg', quality: 86, animations: 'disabled' });
const settle = (page, ms = 1200) => page.waitForTimeout(ms);

let server, browser;
try {
  server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; ; i++) { try { if ((await fetch(origin)).ok) break; } catch {} if (i > 100) throw new Error('Vite did not start'); await new Promise((r) => setTimeout(r, 100)); }
  browser = await launchChromium();
  const open = async (viewport, scale = 2) => {
    const context = await browser.newContext({ viewport, deviceScaleFactor: scale, locale: 'zh-CN', reducedMotion: 'reduce' });
    await context.addInitScript(({ fixture, seed }) => {
      window.albumDesktopAppearance = { client: true, reduceMotion: true };
      localStorage.setItem('album-circle-focus-v1:local-owner', JSON.stringify(fixture));
      localStorage.setItem('flow-cabin-labs-v1', JSON.stringify({ study: true, postcard: true, scenes: true }));
      localStorage.setItem('flow-cabin-onboarding-v1', seed);
    }, { fixture: focus, seed: onboardingSeed() });
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/api/items') return route.fulfill({ json: { items } });
      if (url.pathname === '/desktop-music/config') return route.fulfill({ json: { qqLoggedIn: false, neteaseLoggedIn: false } });
      if (url.pathname === '/desktop-music/local/summary') return route.fulfill({ json: { folders: [], albumCount: 0, trackCount: 0 } });
      if (/^\/(api|desktop-music)\//.test(url.pathname)) return route.abort();
      return route.continue();
    });
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    await page.goto(origin); await page.locator('.desk-home.is-lit').waitFor(); await page.evaluate(() => document.fonts.ready);
    for (const name of ['知道了', '跳过引导']) { const b = page.getByRole('button', { name, exact: true }); if (await b.isVisible().catch(() => false)) await b.click(); }
    await page.keyboard.press('Escape'); await settle(page, 600);
    return page;
  };
  const back = async (page) => { for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape'); await settle(page, 400); } await settle(page, 600); };

  // the desk: a record on the player, the next one chosen
  const page = await open({ width: 1440, height: 900 });
  await page.locator('.desk-sleeve').nth(2).dblclick(); await settle(page, 1500);
  await page.locator('.desk-sleeve').nth(5).click(); await page.mouse.move(1, 1); await settle(page);
  await shot(page, 'desk-home.jpg');
  await page.keyboard.press('a'); await page.locator('.desk-look.is-there').waitFor(); await settle(page);
  await shot(page, 'desk-shelf.jpg'); await back(page);
  await page.keyboard.press('c'); await page.locator('.desk-look.is-there').waitFor(); await settle(page, 1800);
  await shot(page, 'desk-console.jpg'); await back(page);
  await page.keyboard.press('d'); await settle(page, 1400);
  await shot(page, 'desk-drawer.jpg'); await page.keyboard.press('d'); await settle(page);
  // the clock opens focus while it shows the time
  await page.locator('.desk-clock').hover(); await page.getByRole('radio', { name: '时钟' }).click(); await settle(page, 400);
  await page.locator('.desk-clock-face').click(); await settle(page, 1800);
  await shot(page, 'desk-focus.jpg'); await back(page);
  await page.context().close();

  // the phone
  const phone = await open({ width: 390, height: 844 }, 3);
  await phone.locator('.desk-sleeve').nth(2).dblclick(); await settle(phone, 1500);
  await shot(phone, 'desk-phone.jpg');
  await phone.context().close();
  console.log('README desk screenshots written to ' + output);
} finally {
  await browser?.close(); server?.kill();
}
