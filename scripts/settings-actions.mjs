// Drive the visible paths of the life cabin (the only home since 3.1): preferences live in 设置
// (the brass knob → 全部设置), records in the 唱片架 close-up (top-bar plate), every way onto the
// shelf in 添加到唱片架 (inside 唱片架).
import { providerLabel } from '../src/player/providers.mjs';

// 3.0 merged nine settings sections into six. Scripts may still name an old one;
// it opens the section that holds it now.
export const HUB_TAB = Object.freeze({ '音源': '音乐', '房间与桌宠': '小屋与奶糖', '键鼠陪伴': '小屋与奶糖', '专注工具': '专注', '同步与设备': '实验室', '显示与桌面': '桌面', '数据与备份': '数据', 'AI（Beta）': '实验室', '关于': '实验室' });
export const hubTabName = (section) => HUB_TAB[section] || section;
export const settingsDialog = (page) => page.getByRole('dialog', { name: '设置', exact: true });
export async function openSettingsSection(page, section) {
  if (!await settingsDialog(page).isVisible()) {
    for (let i = 0; i < 4 && await page.locator('dialog[open]').count(); i++) await page.keyboard.press('Escape');
    // 3.1: on the desk, 设置 (the screwdriver) lies in the drawer: pull it out first.
    const pull = page.getByRole('button', { name: '拉开抽屉（D）', exact: true });
    const knob = page.getByRole('button', { name: '设置', exact: true });
    await pull.or(knob).first().waitFor();
    if (await pull.count()) await pull.click();
    await knob.click();
    // The brass knob pulls the 小屋日常 drawer out (全部设置 is the last object in it); the drawer loads on first use.
    const all = page.getByRole('button', { name: '全部设置', exact: true });
    await all.or(settingsDialog(page)).first().waitFor();
    if (await all.isVisible()) await all.click();
  }
  await settingsDialog(page).getByRole('tab', { name: hubTabName(section), exact: true }).click();
}
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
  await page.waitForFunction((id) => localStorage.getItem('album-circle-room-player-v1') === id, value);
  if (await radio.getAttribute('aria-checked') !== 'true') throw new Error(`唱机音源 ${value} was not selected`);
  await closeSettings(page);
}
// The cabin's 唱片架 (top-bar plate) is a bookcase close-up (Dialog variant=full, aria-label 唱片架): ring binders
// 唱片 / 我喜欢 / 最近播放 / one per 唱片盒, an A–Z 索引本 and the 专辑墙 frame. The 唱片 binder is taken down first.
export const libraryDialog = (page) => page.getByRole('dialog', { name: /^唱片(库|架)$/ });
// 唱片架 is DEsk's bookcase, looked up at from the desk (the brass plate on the wall, or A).
export async function openLibrary(page) {
  if (!await libraryDialog(page).isVisible()) await page.getByRole('button', { name: /^唱片架 ·/ }).click();
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
  await page.waitForFunction(() => Boolean(window.__cabinDeckItem));
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
