// Drive the visible paths of the life cabin (the only home since 3.1): preferences live in 设置
// (the brass knob → 全部设置), records in the 唱片架 close-up (top-bar plate), every way onto the
// shelf in 添加到唱片架 (inside 唱片架).
import { providerLabel } from '../src/player/providers.mjs';

// 3.0 merged nine settings sections into six. Scripts may still name an old one;
// it opens the section that holds it now.
export const HUB_TAB = Object.freeze({ '音源': '音乐', '房间与桌宠': '小屋与奶糖', '键鼠陪伴': '小屋与奶糖', '专注工具': '专注', '同步与设备': '实验室', '显示与桌面': '桌面', '数据与备份': '数据', 'AI（Beta）': '实验室', '关于': '实验室' });
export const hubTabName = (section) => HUB_TAB[section] || section;
export const settingsDialog = (page) => page.getByRole('dialog', { name: '设置', exact: true });
// On the desk (3.1) 设置 is the screwdriver in the drawer: pull the drawer out (D) first. A home with a visible
// 设置 button (the brass knob of the older homes) uses that.
export async function pressSettings(page) {
  const button = page.getByRole('button', { name: '设置', exact: true });
  if (!await button.isVisible().catch(() => false)) { const pull = page.getByRole('button', { name: /^拉开抽屉/ }); if (await pull.count()) await pull.click(); }
  await button.click();
}
export async function openSettingsSection(page, section) {
  if (!await settingsDialog(page).isVisible()) {
    for (let i = 0; i < 4 && await page.locator('dialog[open]').count(); i++) await page.keyboard.press('Escape');
    await pressSettings(page);
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
  await page.waitForFunction((id) => document.querySelector('.listen-bar')?.dataset.provider === id || !document.querySelector('.listen-bar:not(.is-empty)'), value);
  if (await radio.getAttribute('aria-checked') !== 'true') throw new Error(`唱机音源 ${value} was not selected`);
  await closeSettings(page);
}
// The cabin's 唱片架 (top-bar plate) is a bookcase close-up (Dialog variant=full, aria-label 唱片架): ring binders
// 唱片 / 我喜欢 / 最近播放 / one per 唱片盒, an A–Z 索引本 and the 专辑墙 frame. The 唱片 binder is taken down first.
// A <dialog> (the desk's own look up at the bookcase is a role=dialog named 唱片架 too, behind it).
export const libraryDialog = (page) => page.locator('dialog').and(page.getByRole('dialog', { name: /^唱片(库|架)$/ }));
export async function openLibrary(page) {
  if (!await libraryDialog(page).isVisible()) {
    // The desk (3.1): look up at the bookcase (its brass plate, A), then take the binders down.
    const plate = page.getByRole('button', { name: /^唱片架 · 抬头看书柜/ });
    if (await plate.count()) { await plate.click(); await page.getByRole('button', { name: '唱片盒（活页夹）', exact: true }).click(); }
    else await page.locator('.home-shortcuts').getByRole('button', { name: '唱片架', exact: true }).click();
  }
  await libraryDialog(page).waitFor();
  return libraryDialog(page);
}
export const openCabinLibrary = openLibrary;
// 放回: Esc puts the shelf back (also the corner plate and a press on the bare wall).
export async function closeLibrary(page) {
  // In the index book Esc first clears what was typed, so a second press may be needed.
  for (let i = 0; i < 3 && await libraryDialog(page).isVisible(); i++) { await page.keyboard.press('Escape'); await libraryDialog(page).waitFor({ state: 'hidden', timeout: 1500 }).catch(() => {}); }
  await libraryDialog(page).waitFor({ state: 'hidden' });
  // On the desk the camera is still up at the bookcase: look back down.
  if (await page.locator('.desk-look').count()) { await page.keyboard.press('Escape'); await page.locator('.desk-look').waitFor({ state: 'detached' }); }
}
// Take one binder or the index book down (names: the box name, 唱片, 我喜欢, 最近播放; 索引本 for the book).
export async function takeBinder(page, name) {
  const dialog = await openLibrary(page);
  const spine = name === '索引本' ? dialog.getByRole('button', { name: /^索引本/ }) : dialog.getByRole('button', { name: new RegExp(`^${name}活页夹`) });
  if (await spine.getAttribute('aria-expanded') !== 'true') await spine.click();
  await dialog.locator('.shelf-object').waitFor();
  return dialog;
}
// 播放 a record by its title from the 唱片 binder; the shelf is put back afterwards unless `keepOpen`.
export async function playRecord(page, title, { keepOpen = false } = {}) {
  const dialog = await takeBinder(page, '唱片');
  await dialog.getByRole('button', { name: `播放 ${title}`, exact: true }).click();
  await page.locator('.listen-bar:not(.is-empty)').waitFor();
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
  // An empty 唱片架 shows its own 手动添加 / 搜索添加; otherwise the plate in the cornice.
  const plate = dialog.getByRole('button', { name: '添加到唱片架', exact: true });
  if (await plate.count()) await plate.click();
  else await dialog.locator('.listen-empty-shelf .listen-primary').click();
  await addDialog(page).waitFor();
  if (tab !== '曲库搜索') await addDialog(page).getByRole('tab', { name: tab, exact: true }).click();
  return addDialog(page);
}
// 专辑墙 hangs on the shelf as a framed poster (the frame opens the editor).
export async function openAlbumWall(page) {
  const dialog = await openLibrary(page);
  await dialog.getByRole('button', { name: '专辑墙', exact: true }).click();
}
// 唱机旁: the console close-up (Dialog variant=full, "唱机旁"). It carries the old pocket player's controls under the
// same names (播放 / 暂停音乐播放, 下一首展示曲目, 音乐播放进度, 取下唱片…) and `.console[data-provider]`,
// `.console-title/.console-track/.console-status`. It opens from the 正在播放 strip's title (needs a loaded record).
export const consoleDialog = (page) => page.getByRole('dialog', { name: '唱机旁', exact: true });
export async function openConsole(page) {
  if (!await consoleDialog(page).isVisible()) await page.locator('.listen-meta').click();
  await consoleDialog(page).waitFor();
  return consoleDialog(page);
}
export async function closeConsole(page) {
  if (!await consoleDialog(page).isVisible()) return;
  await page.keyboard.press('Escape'); await consoleDialog(page).waitFor({ state: 'hidden' });
}
// The record on the deck (the home publishes it as window.__cabinDeckItem, docs/events.md).
export const deckRecord = (page) => page.evaluate(() => window.__cabinDeckItem || null);
