'use strict';
// Renders the README screenshots with original, generated album art (no real
// covers), a few days of focus history and the cat in its scarf.
// Run: npm --prefix desktop run screenshots   (writes docs/images/*.jpg)
const { _electron } = require('playwright'), fs = require('node:fs'), path = require('node:path');
const { mountFixture, chooseRoomScene, openAddToShelf } = require('./ui-fixture.cjs');
const desktop = path.resolve(__dirname, '..'), output = path.join(desktop, '..', 'docs', 'images'); fs.mkdirSync(output, { recursive: true });
const env = { ...process.env, ALBUM_DESKTOP_TEST_PROFILE: path.join(desktop, 'test-results', `screenshots-profile-${Date.now()}`) }; delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.ALBUM_QA_EXE || require(path.join(desktop, 'node_modules/electron'));

const ALBUMS = [
  ['Snowfall Tapes', 'Hazel Lane', '#24324f', '#f2d7a6', 'moon'], ['Ember & Oak', 'The Kindling', '#5a2a17', '#f4a259', 'fire'],
  ['Midnight Kettle', 'Mori Mori', '#1d2b2a', '#9fd8b8', 'steam'], ['Rainy Window', 'Juno Park', '#2f3e57', '#a8c5e6', 'rain'],
  ['Paper Moon Radio', 'Lumen Kid', '#3b2a4a', '#f7c6d9', 'moon'], ['Slow Sunday', 'Café Nap', '#6b4a2b', '#ffe3a3', 'sun'],
  ['Moss Garden', 'Green Room', '#203a2b', '#b8e09b', 'leaf'], ['Cassette Dreams', 'Tape Deck Hero', '#40243a', '#ff9fb2', 'tape'],
  ['Lantern Light', 'Night Market', '#2b1d12', '#ffc96b', 'lantern'], ['Winter Radio', 'North Static', '#1f2a36', '#d8e6f2', 'wave'],
  ['Tea for Two Cats', 'Whisker Club', '#4a2f22', '#f6cf9f', 'cat'], ['Northern Hum', 'Aurora Ave', '#14233a', '#7fe3c4', 'aurora'],
  ['Vinyl Afternoon', 'Dust & Groove', '#3a2a1f', '#e8b07a', 'disc'], ['Starlit Desk', 'Study Club', '#1a1f3d', '#ffe9a8', 'star']
];
function art(title, background, accent, motif) {
  const shapes = {
    moon: `<circle cx="210" cy="110" r="52" fill="${accent}"/><circle cx="232" cy="96" r="48" fill="${background}"/>`,
    fire: `<path d="M150 250c-60-40-30-110 10-150 0 40 40 50 40 90 20-20 20-50 10-80 50 40 60 110 10 140z" fill="${accent}"/>`,
    steam: `<rect x="90" y="170" width="120" height="70" rx="10" fill="${accent}"/><path d="M120 150c-20-30 20-40 0-70M160 150c-20-30 20-40 0-70" stroke="${accent}" stroke-width="8" fill="none"/>`,
    rain: [...Array(18)].map((_, i) => `<rect x="${20 + i * 16}" y="${(i * 37) % 200 + 20}" width="4" height="34" fill="${accent}" opacity=".8"/>`).join(''),
    sun: `<circle cx="150" cy="150" r="64" fill="${accent}"/>` + [...Array(12)].map((_, i) => `<rect x="146" y="30" width="8" height="34" fill="${accent}" transform="rotate(${i * 30} 150 150)"/>`).join(''),
    leaf: `<path d="M70 230C70 120 160 60 240 60c0 90-60 170-170 170z" fill="${accent}"/><path d="M80 220 220 80" stroke="${background}" stroke-width="6"/>`,
    tape: `<rect x="50" y="90" width="200" height="120" rx="12" fill="${accent}"/><circle cx="110" cy="150" r="22" fill="${background}"/><circle cx="190" cy="150" r="22" fill="${background}"/>`,
    lantern: `<rect x="115" y="80" width="70" height="120" rx="30" fill="${accent}"/><rect x="140" y="50" width="20" height="30" fill="${accent}"/>`,
    wave: [...Array(5)].map((_, i) => `<path d="M30 ${100 + i * 30}q30-24 60 0t60 0 60 0 60 0" stroke="${accent}" stroke-width="6" fill="none"/>`).join(''),
    cat: `<path d="M90 230V140l30-50 20 40h20l20-40 30 50v90z" fill="${accent}"/><circle cx="130" cy="160" r="7" fill="${background}"/><circle cx="170" cy="160" r="7" fill="${background}"/>`,
    aurora: `<path d="M0 170C60 90 120 210 180 120S300 90 300 90v40c-60 0-80 80-140 80S40 160 0 210z" fill="${accent}" opacity=".85"/>`,
    disc: `<circle cx="150" cy="150" r="90" fill="#111"/><circle cx="150" cy="150" r="30" fill="${accent}"/><circle cx="150" cy="150" r="5" fill="#111"/>`,
    star: [...Array(14)].map((_, i) => `<rect x="${(i * 53) % 260 + 20}" y="${(i * 71) % 180 + 20}" width="${i % 3 ? 6 : 12}" height="${i % 3 ? 6 : 12}" fill="${accent}"/>`).join('')
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="${background}"/>${shapes[motif]}<text x="20" y="282" font-family="Georgia,serif" font-size="22" fill="${accent}">${title.replace(/&/g, '&amp;')}</text></svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}
const items = ALBUMS.map(([title, artist, background, accent, motif], index) => ({ id: `shot-${index}`, type: 'album', title, artist, year: String(2016 + (index % 9)), cover: art(title, background, accent, motif), tracks: ['Intro', 'First Light', 'Warm Coffee', 'Window Seat', 'Slow Walk Home', 'Snow Globe', 'Late Bus', 'Outro'].map((name, n) => `${name}${n ? '' : ` · ${title}`}`), genre: 'Lo-fi', label: 'Cabin Records', addedAt: new Date(Date.UTC(2026, 8, 30) - index * 86400000).toISOString(), externalIds: {} }));

(async () => {
  const app = await _electron.launch({ executablePath, args: process.env.ALBUM_QA_EXE ? [] : [desktop], env }); app.context().setDefaultTimeout(20000); await app.firstWindow();
  let site; for (let i = 0; i < 100; i++) { site = app.context().pages().find((p) => p.url().startsWith('https://album-circle.vercel.app')); if (site) break; await new Promise((r) => setTimeout(r, 100)); }
  await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().startsWith('album-desktop://shell')); win.unmaximize(); win.setContentSize(1600, 900); });
  await mountFixture(app, site, { items, searchResults: items.slice(3, 8).map((item) => ({ ...item, id: 'result-' + item.id, platforms: ['Apple Music / iTunes CN'] })) });
  // A week of focus, enough experience for the scarf and the rainy window.
  await site.evaluate(() => {
    const day = 86400000, now = Date.now(), sessions = [];
    [40, 75, 25, 100, 50, 125, 60].forEach((minutes, index) => { const end = now - (6 - index) * day - 3600000; for (let m = minutes; m > 0; m -= 25) sessions.push({ start: end - Math.min(25, m) * 60000, end, completed: true }); });
    localStorage.setItem('album-circle-focus-v1:local-owner', JSON.stringify({ version: 1, tasks: [{ id: 'a', text: '写周报', pomodoros: 2, createdAt: now }, { id: 'b', text: '整理唱片架', pomodoros: 1, createdAt: now }, { id: 'c', text: '给小猫拍照', done: true, doneAt: now, createdAt: now }], sessions, rewards: { fish: sessions.length, xp: 160, equipped: { accessory: 'scarf', weather: 'rain' } }, timer: { phase: 'idle', round: 3, taskId: 'a' } }));
    localStorage.setItem('album-circle-focus-dock-v1', JSON.stringify({ open: false, tab: 'timer' }));
  });
  await site.reload(); await site.locator('.cabin-room').waitFor();
  await site.waitForFunction(() => document.querySelectorAll('.pixel-artwork canvas.is-painted').length >= 12);
  const shot = async (name) => { await site.waitForTimeout(400); await site.screenshot({ path: path.join(output, name), type: 'jpeg', quality: 84 }); console.log('wrote ' + name); };
  await site.locator('.room-record').nth(5).dblclick(); await shot('cabin-pixel.jpg');
  await site.locator('.focus-badge').click(); await site.getByRole('button', { name: '开始专注' }).click(); await shot('cabin-focus.jpg');
  await site.getByRole('tab', { name: '统计' }).click(); await shot('cabin-stats.jpg');
  await site.locator('.focus-dock-close').click(); await site.keyboard.press('h'); await shot('cabin-zen.jpg'); await site.keyboard.press('Escape');
  await chooseRoomScene(site, 'warm'); await site.waitForTimeout(600); await shot('cabin-warm.jpg');
  await chooseRoomScene(site, 'pixel');
  await site.locator('.room-record').nth(2).click(); await site.getByRole('button', { name: /唱片卡片/ }).click(); await site.locator('.record-card').waitFor(); await shot('record-card.jpg');
  await site.getByRole('button', { name: '关闭唱片卡片' }).click();
  const add = await openAddToShelf(site);
  await add.getByRole('searchbox').fill('lofi winter'); await add.getByRole('button', { name: '搜索' }).click(); await add.locator('.add-results li').first().waitFor(); await shot('add-album.jpg');
  await app.close();
})().catch((error) => { console.error(error); process.exitCode = 1; });
