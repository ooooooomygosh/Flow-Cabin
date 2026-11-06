// Drive the visible paths of the home, DEsk's desk (src/desk/DeskHome.jsx, since 3.1): preferences live in
// 设置 (the screwdriver in the drawer), records in the 唱片架 close-up (the 唱片架 plate → the binders), every
// way onto the shelf in 添加到唱片架 (inside 唱片架), the player in 唱机旁 (the 唱机 plate → the panel).
import { providerLabel } from '../src/player/providers.mjs';

// 3.0 merged nine settings sections into six. Scripts may still name an old one;
// it opens the section that holds it now.
export const HUB_TAB = Object.freeze({ '音源': '音乐', '房间与桌宠': '小屋与奶糖', '键鼠陪伴': '小屋与奶糖', '专注工具': '专注', '同步与设备': '实验室', '显示与桌面': '桌面', '数据与备份': '数据', 'AI（Beta）': '实验室', '关于': '实验室' });
export const hubTabName = (section) => HUB_TAB[section] || section;
export const settingsDialog = (page) => page.getByRole('dialog', { name: '设置', exact: true });
// ---- the desk ----
// The saved room (record-library rooms[...]: look, petId). 3.1: the home and the 沉入桌面 wallpaper are the desk, and the
// only picker is the companion one; the stored `look` still picks the lyric skin (src/lyrics/lyric-skins.mjs).
export const savedRoom = (page) => page.evaluate(() => { const key = Object.keys(localStorage).find((k) => k.startsWith('album-circle-library-v1-')); const rooms = key ? JSON.parse(localStorage.getItem(key)).rooms || {} : {}; return Object.values(rooms)[0] || null; });
export async function waitForSavedRoom(page, patch) { await page.waitForFunction((want) => { const key = Object.keys(localStorage).find((k) => k.startsWith('album-circle-library-v1-')); const room = key ? Object.values(JSON.parse(localStorage.getItem(key)).rooms || {})[0] : null; return Boolean(room) && Object.entries(want).every(([k, v]) => room[k] === v); }, patch); }
// A lyric skin needs a stored look: write it to the saved library (local-owner › local-room), as an older install would
// have it, and reload. What was on the deck is not kept across the reload.
export async function storeRoomLook(page, look) {
  await page.evaluate((look) => {
    const key = 'album-circle-library-v1-local-owner', saved = JSON.parse(localStorage.getItem(key) || '{}'), rooms = saved.rooms || {};
    localStorage.setItem(key, JSON.stringify({ ...saved, rooms: { ...rooms, 'local-room': { ...(rooms['local-room'] || {}), look } } }));
  }, look);
  await page.reload(); await page.locator('.desk-home').waitFor();
}
export const deskHome = (page) => page.locator('.desk-home');
// The desk once its lamp is up (the first pictures are in).
export async function deskReady(page, options) { await page.locator('.desk-home.is-lit').waitFor(options); }
// Close every dialog and look back down from the bookcase / console / post box.
export async function backToDesk(page) {
  for (let i = 0; i < 4 && await page.locator('dialog[open]').count(); i++) await page.keyboard.press('Escape');
  for (let i = 0; i < 2 && await page.locator('.desk-look').count(); i++) {
    await page.locator('.desk-look.is-there, .desk-look.is-up').first().waitFor({ timeout: 3000 }).catch(() => {});
    await page.keyboard.press('Escape'); await page.locator('.desk-look').waitFor({ state: 'detached', timeout: 4000 }).catch(() => {});
  }
  // Settled: the desk ignores its keys while any sheet is still open (closing is animated) or a view is up.
  await page.waitForFunction(() => !document.querySelector('dialog[open]') && !document.querySelector('.desk-look'), null, { timeout: 8000 });
}
// Look up (the plate at the back edge, as A / C / N do) and press one thing in the view.
const PLATE = { shelf: /^唱片架 · 抬头看书柜/, console: /^唱机 · 抬头看控制面板/, post: /^信箱/ };
export async function lookUp(page, which) {
  const view = page.locator(`.desk-home[data-look="${which}"] .desk-look.is-there`);
  if (!await view.count()) { await backToDesk(page); await page.locator('.desk-home').getByRole('button', { name: PLATE[which] }).first().click(); }
  await view.waitFor(); return view;
}
export async function pressSpot(page, which, name) { const view = await lookUp(page, which); await view.getByRole('button', { name, exact: true }).click(); }
// The drawer (D, or the pull at the bottom): 唱片日记, 伙伴, 随手记, 窗外与天气, 备份与恢复, 设置, and lab things.
export const drawer = (page) => page.getByRole('group', { name: '抽屉', exact: true });
export async function openDrawerThing(page, name) {
  await backToDesk(page);
  const pull = page.locator('.desk-pull');
  // The pull runs the width of the desk's front edge; take it near its left end (收起工具's clock sits bottom-right).
  if (await pull.getAttribute('aria-expanded') !== 'true') await pull.click({ position: { x: 24, y: 8 } });
  await drawer(page).getByRole('button', { name, exact: true }).click();
}
// 专注: the LED clock. While music plays the clock shows the track (and its face opens 唱机旁), so its 专注 key is
// set first; the face then opens the 专注 dialog.
export const focusDialog = (page) => page.getByRole('dialog', { name: '专注', exact: true });
export async function openFocus(page) {
  if (await focusDialog(page).isVisible()) return focusDialog(page);
  await backToDesk(page);
  const key = page.getByRole('radiogroup', { name: '台钟显示', exact: true }).getByRole('radio', { name: '专注' });
  if (await key.getAttribute('aria-checked') !== 'true') await key.click();
  await page.locator('.desk-clock-face').click();
  await focusDialog(page).waitFor(); return focusDialog(page);
}
export async function openSettingsSection(page, section) {
  if (!await settingsDialog(page).isVisible()) await openDrawerThing(page, '设置');
  await settingsDialog(page).getByRole('tab', { name: hubTabName(section), exact: true }).click();
}
// 设置 is the screwdriver in the drawer (kept for scripts that only press it).
export async function pressSettings(page) { await openDrawerThing(page, '设置'); }
export async function closeSettings(page) {
  await page.getByRole('button', { name: '关闭设置', exact: true }).click(); await settingsDialog(page).waitFor({ state: 'hidden' });
}
export async function openRoomSettings(page) { await openSettingsSection(page, '小屋与奶糖'); }
// 音乐 › 账户与文件夹: logins, local folders, Music Assistant (a page inside Settings).
export const accountsRegion = (page) => page.getByRole('region', { name: '账户与文件夹', exact: true });
export async function openMusicSettings(page) {
  await openSettingsSection(page, '音乐'); await settingsDialog(page).getByRole('button', { name: '账户与文件夹', exact: true }).click(); await accountsRegion(page).waitFor();
}
// The one 唱机音源 picker: a radio per provider, named by the provider table.
export async function chooseSource(page, value) {
  await openSettingsSection(page, '音乐');
  const radio = settingsDialog(page).getByRole('radiogroup', { name: '唱机音源', exact: true }).getByRole('radio', { name: providerLabel(value), exact: true });
  await radio.click();
  // The deck follows the choice (it is saved as the deck's provider) before anything else is asked of it.
  await page.waitForFunction((id) => localStorage.getItem('album-circle-room-player-v1') === id, value).catch(() => {});
  if (await radio.getAttribute('aria-checked') !== 'true') throw new Error(`唱机音源 ${value} was not selected`);
  await closeSettings(page);
}
// The 唱片架 is DEsk's bookcase, looked up at from the desk (the 唱片架 plate, or A; src/desk/ShelfView.jsx): the look
// is a dialog named 唱片架 holding ring binders (唱片活页夹，N 张 / 我喜欢 / 最近播放 / one per 唱片盒), the
// 索引本 · 所有唱片… book and brass plates (添加到唱片架, 专辑墙, 音源与账号, 回到书桌 ↓).
export const libraryDialog = (page) => page.getByRole('dialog', { name: /^唱片(库|架)$/ });
export async function openLibrary(page) {
  if (!await libraryDialog(page).isVisible()) await lookUp(page, 'shelf');
  await libraryDialog(page).waitFor();
  await libraryDialog(page).locator('.shelf-stand').first().waitFor();
  return libraryDialog(page);
}
export const openCabinLibrary = openLibrary;
// 放回 / 回到书桌: Esc puts a binder back, then looks back down at the desk.
export async function closeLibrary(page) {
  // In the index book Esc first clears what was typed, so more presses may be needed.
  for (let i = 0; i < 4 && await libraryDialog(page).isVisible(); i++) { await page.keyboard.press('Escape'); await libraryDialog(page).waitFor({ state: 'hidden', timeout: 1500 }).catch(() => {}); }
  await libraryDialog(page).waitFor({ state: 'hidden' });
  // The look is still up at the bookcase when the binders are put back: look back down at the desk.
  await backToDesk(page);
}
// The sheet a binder (or the index book) becomes once it is carried down to the desk.
export const shelfSheet = (page, name) => page.getByRole('dialog', { name: name === '索引本' ? /^索引本/ : `${name}活页夹`, exact: name !== '索引本' });
// Take one binder or the index book down (names: the box name, 唱片, 我喜欢, 最近播放; 索引本 for the book).
// Returns the sheet on the desk.
export async function takeBinder(page, name) {
  const sheet = shelfSheet(page, name);
  if (await sheet.isVisible()) return sheet;
  const dialog = await openLibrary(page);
  const spine = name === '索引本' ? dialog.getByRole('button', { name: /^索引本/ }) : dialog.getByRole('button', { name: new RegExp(`^${name}活页夹`) });
  if (await spine.getAttribute('aria-expanded') !== 'true') await spine.click();
  await sheet.locator('.shelf-object').waitFor();
  return sheet;
}
// 播放 a record by its title from the 唱片 binder; the shelf is put back afterwards unless `keepOpen`.
export async function playRecord(page, title, { keepOpen = false } = {}) {
  const dialog = await takeBinder(page, '唱片');
  await dialog.getByRole('button', { name: `播放 ${title}`, exact: true }).click();
  await page.waitForFunction((name) => window.__cabinDeckItem?.title === name, title);
  if (!keepOpen) await closeLibrary(page);
}
// 唱片卡片 of a record, opened from the binder's title link.
export async function openRecordCard(page, title) {
  const dialog = await takeBinder(page, '唱片');
  await dialog.locator('.listen-grid-title').filter({ hasText: title }).first().click();
  const card = page.getByRole('dialog', { name: /^唱片卡片/ }); await card.waitFor();
  return card;
}
export async function closeRecordCard(page) {
  const card = page.getByRole('dialog', { name: /^唱片卡片/ });
  if (await card.isVisible()) { await card.getByRole('button', { name: '关闭唱片卡片', exact: true }).click(); await card.waitFor({ state: 'hidden' }); }
}
export const addDialog = (page) => page.getByRole('dialog', { name: '添加到唱片架', exact: true });
export async function openAddToShelf(page, tab = '曲库搜索') {
  const dialog = await openLibrary(page);
  // The brass plate on the desk under the bookcase (an empty shelf also has its letter, 添加第一张专辑).
  const plate = dialog.getByRole('button', { name: '添加到唱片架', exact: true });
  if (await plate.count()) await plate.click();
  else await dialog.locator('.shelf-letter-note').click();
  await addDialog(page).waitFor();
  if (tab !== '曲库搜索') await addDialog(page).getByRole('tab', { name: tab, exact: true }).click();
  return addDialog(page);
}
// 专辑墙: a brass plate on the desk under the bookcase opens the editor.
export async function openAlbumWall(page) {
  const dialog = await openLibrary(page);
  await dialog.getByRole('button', { name: '专辑墙', exact: true }).click();
}
// 唱机: the record player's console is DEsk's Control Panel at the back of the desk (src/desk/views/ConsoleView.jsx),
// looked up at with the 唱机 plate (or C, or commands.open('music')). The look is a dialog named 唱机. It carries the old
// player's controls under the same names (播放音乐 / 暂停音乐播放, 上一首 / 下一首展示曲目, 音乐播放进度, 音乐音量,
// 播放模式：…, 取下唱片, 待播 → the 待播纸带 roll) and `.console-view[data-provider]`; the tube's words are mirrored
// for screen readers as `.console-title/.console-artist/.console-track/.console-status`.
export const consoleDialog = (page) => page.getByRole('dialog', { name: '唱机', exact: true });
export async function openConsole(page) {
  if (!await consoleDialog(page).isVisible()) {
    await backToDesk(page);
    const plate = page.getByRole('button', { name: /^唱机 · 抬头看控制面板/ });
    if (await plate.isVisible().catch(() => false)) await plate.click();
    else await page.evaluate(() => window.dispatchEvent(new CustomEvent('cabin:desk-look', { detail: { which: 'console' } })));
  }
  await consoleDialog(page).locator('.console-view').waitFor();
  return consoleDialog(page);
}
export async function closeConsole(page) {
  for (let i = 0; i < 3 && await consoleDialog(page).isVisible(); i++) { await page.keyboard.press('Escape'); await consoleDialog(page).waitFor({ state: 'detached', timeout: 2500 }).catch(() => {}); }
  await consoleDialog(page).waitFor({ state: 'detached' });
}
// The record on the deck (the home publishes it as window.__cabinDeckItem, docs/events.md).
export const deckRecord = (page) => page.evaluate(() => window.__cabinDeckItem || null);
