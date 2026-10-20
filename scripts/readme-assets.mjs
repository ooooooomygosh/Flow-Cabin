/** README close-ups of the focus tools (Pomodoro ring + presets, todo list)
 * captured from the real renderer in an isolated headless browser. Fixture
 * tasks only; no accounts, no network beyond the local Vite server.
 * Usage: npm run screenshots:readme  (BROWSER_EXECUTABLE may point to Chromium)
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
const port = Number(process.env.README_PORT || 4185), origin = `http://127.0.0.1:${port}`;
const aiOrigin = 'https://api.mock-ai.test';
await fs.mkdir(output, { recursive: true });
const items = await showcaseAlbums(), day = 86400000, now = Date.now();
const task = (id, text, extra = {}) => ({ id, text, done: false, pomodoros: 0, createdAt: now - day, doneAt: 0, ...extra });
const focusFixture = {
  version: 1, notes: '', settings: { notify: false, chime: false, autoSound: false, focusMin: 50, shortMin: 10, longMin: 20 },
  tasks: [task('t1', '润色 README 与截图', { pomodoros: 2 }), task('t2', '整理本周的唱片笔记', { pomodoros: 1 }), task('t3', '读完《Waltz for Debby》乐评', { done: true, doneAt: now - 3600000, pomodoros: 1 }), task('t4', '给专辑墙换一张新封面'), task('t5', '晚上 9 点前收工', { done: true, doneAt: now - 7200000 })],
  sessions: [1, 2, 3, 4, 5, 6].flatMap((d) => Array.from({ length: (d % 3) + 1 }, (_, i) => ({ start: now - d * day - (i + 1) * 3600000, end: now - d * day - (i + 1) * 3600000 + 25 * 60000, taskId: '', completed: true }))),
  timer: { phase: 'idle', round: 0, taskId: 't1' }, rewards: { fish: 14, xp: 330 }
};
let server, browser;
try {
  server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; ; i++) { try { if ((await fetch(origin)).ok) break; } catch {} if (i > 100) throw new Error('Vite did not start'); await new Promise((r) => setTimeout(r, 100)); }
  browser = await launchChromium();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' });
  await context.addInitScript((seed) => { window.__onboardingSeed = seed; }, onboardingSeed());
  await context.addInitScript((fixture) => {
    window.albumDesktopAppearance = { client: true, reduceMotion: true };
    localStorage.setItem('album-circle-focus-v1:local-owner', JSON.stringify(fixture));
    localStorage.setItem('album-circle-focus-dock-v1', JSON.stringify({ open: true, tab: 'timer' }));
    localStorage.setItem('flow-cabin-onboarding-v1', window.__onboardingSeed);
    localStorage.setItem('flow-cabin-ai-v1', JSON.stringify({ v: 1, enabled: true, baseUrl: 'https://api.mock-ai.test/v1', model: 'mock-model', cadence: 'weekly', tone: 'warm', shareNotes: false }));
    localStorage.setItem('flow-cabin-ai-key-v1', JSON.stringify({ v: 2, key: 'sk-readme-demo', endpoint: 'https://api.mock-ai.test/v1/chat/completions', revision: 'readme-demo' }));
  }, focusFixture);
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === aiOrigin) {
      return route.fulfill({
        status: 200,
        headers: { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'POST' },
        json: { choices: [{ message: { role: 'assistant', content: JSON.stringify({
          title: '纸上散步',
          description: '钢琴、氛围和低声爵士，留给阅读与写字一条安静的路。',
          minutes: 50,
          activity: 'study',
          autoplay: true,
          tracks: [
            { title: 'Says', artist: 'Nils Frahm', album: 'Spaces' },
            { title: 'Near Light', artist: 'Ólafur Arnalds', album: 'Living Room Songs' },
            { title: 'A Walk', artist: 'Tycho', album: 'Dive' },
            { title: 'Kerala', artist: 'Bonobo', album: 'Migration' },
            { title: 'Avril 14th', artist: 'Aphex Twin', album: 'Drukqs' },
            { title: 'Aruarian Dance', artist: 'Nujabes', album: 'Departure' }
          ]
        }) } }] }
      });
    }
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/api/items') return route.fulfill({ json: { items } });
    if (url.pathname === '/desktop-music/config') return route.fulfill({ json: { qqLoggedIn: false, neteaseLoggedIn: false } });
    if (url.pathname === '/desktop-music/local/summary') return route.fulfill({ json: { folders: [], albumCount: 0, trackCount: 0 } });
    if (/^\/(api|desktop-music)\//.test(url.pathname)) return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  await page.goto(origin); await page.locator('.focus-dock').waitFor(); await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.querySelectorAll('.pixel-artwork canvas.is-painted').length >= 12).catch(() => {});
  const dock = page.locator('.focus-dock');
  await dock.screenshot({ path: path.join(output, 'focus-timer.png'), animations: 'disabled' });
  await page.getByRole('tab', { name: '待办' }).click(); await page.locator('.focus-task-meter').waitFor();
  await dock.screenshot({ path: path.join(output, 'focus-tasks.png'), animations: 'disabled' });
  await page.getByRole('tab', { name: '统计' }).click(); await page.locator('.focus-stats').waitFor();
  await dock.screenshot({ path: path.join(output, 'focus-stats.png'), animations: 'disabled' });
  await page.getByRole('button', { name: '收起专注工具' }).click();
  await page.getByRole('button', { name: '智能唱片机', exact: true }).click();
  const smart = page.getByRole('dialog', { name: '智能唱片机', exact: true });
  await smart.getByLabel('告诉小屋你的计划').fill('我要学习五十分钟，帮我搭配音乐');
  await smart.getByRole('button', { name: '让小屋推荐歌单', exact: true }).click();
  await smart.locator('.st-result').waitFor();
  await page.screenshot({ path: path.join(output, 'smart-turntable.jpg'), type: 'jpeg', quality: 90, animations: 'disabled' });
  console.log('README focus screenshots written to ' + output);
} finally { await browser?.close(); server?.kill(); }
