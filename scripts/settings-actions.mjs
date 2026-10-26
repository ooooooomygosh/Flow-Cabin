// Drive the visible paths: preferences live in 设置 (titlebar ⚙), every way onto
// the shelf lives in 添加到唱片架 (titlebar ＋), shelf tools in 整理唱片架 (console).
import { providerLabel } from '../src/player/providers.mjs';

// 3.0 merged nine settings sections into six. Scripts may still name an old one;
// it opens the section that holds it now.
export const HUB_TAB = Object.freeze({ '音源': '音乐', '房间与桌宠': '小屋与奶糖', '键鼠陪伴': '小屋与奶糖', '专注工具': '专注', '同步与设备': '实验室', '显示与桌面': '桌面', '数据与备份': '数据', 'AI（Beta）': '实验室', '关于': '实验室' });
export const hubTabName = (section) => HUB_TAB[section] || section;
export const settingsDialog = (page) => page.getByRole('dialog', { name: '设置', exact: true });
export async function openSettingsSection(page, section) {
  if (!await settingsDialog(page).isVisible()) { for(let i=0;i<4 && await page.locator('dialog[open]').count();i++) await page.keyboard.press('Escape'); await page.getByRole('button', { name: '设置', exact: true }).click(); if(await page.getByRole('button', { name: '全部设置', exact: true }).isVisible())await page.getByRole('button', { name: '全部设置', exact: true }).click(); }
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
  await radio.click(); await page.waitForFunction((id) => document.querySelector('.room-turntable')?.dataset.provider === id, value);
  if (await radio.getAttribute('aria-checked') !== 'true') throw new Error(`唱机音源 ${value} was not selected`);
  await closeSettings(page);
}
// The cabin's 唱片架 (top bar) opens the library panel; its dialog was titled 唱片库 before 3.0.
export const libraryDialog = (page) => page.getByRole('dialog', { name: /^唱片(库|架)$/ });
export async function openCabinLibrary(page) {
  if (!await libraryDialog(page).isVisible()) await page.locator('.home-shortcuts').getByRole('button', { name: '唱片架', exact: true }).click();
  await libraryDialog(page).waitFor();
}
export const addDialog = (page) => page.getByRole('dialog', { name: '添加到唱片架', exact: true });
export async function openAddToShelf(page, tab = '曲库搜索') {
  if (await page.locator('.cabin-home').count()) await openCabinLibrary(page);
  await page.getByRole('button', { name: '添加到唱片架', exact: true }).click(); await addDialog(page).waitFor();
  if (tab !== '曲库搜索') await addDialog(page).getByRole('tab', { name: tab, exact: true }).click();
}
export async function openShelfTools(page) {
  const toggle = page.getByRole('button', { name: '整理唱片架', exact: true });
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await page.getByRole('region', { name: '整理唱片架', exact: true }).waitFor();
}
// Classic: the titlebar's 专辑墙. Cabin (3.0): 专辑墙 lives inside 唱片架.
export async function openAlbumWall(page) {
  if (await page.locator('.cabin-home').count()) { await openCabinLibrary(page); await libraryDialog(page).getByRole('button', { name: '专辑墙', exact: true }).click(); return; }
  await page.getByRole('button', { name: '专辑墙', exact: true }).first().click();
}
