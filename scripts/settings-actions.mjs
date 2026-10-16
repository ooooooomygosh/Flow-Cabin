// Drive the visible paths: preferences live in 设置 (titlebar ⚙), every way onto
// the shelf lives in 添加到唱片架 (titlebar ＋), shelf tools in 整理唱片架 (console).
import { providerLabel } from '../src/player/providers.mjs';

export const settingsDialog = (page) => page.getByRole('dialog', { name: '设置', exact: true });
export async function openSettingsSection(page, section) {
  if (!await settingsDialog(page).isVisible()) await page.getByRole('button', { name: '设置', exact: true }).click();
  await settingsDialog(page).getByRole('tab', { name: section, exact: true }).click();
}
export async function closeSettings(page) {
  await page.getByRole('button', { name: '关闭设置', exact: true }).click(); await settingsDialog(page).waitFor({ state: 'hidden' });
}
export async function openRoomSettings(page) { await openSettingsSection(page, '房间与桌宠'); }
// 音源 › 账户与文件夹: logins, local folders, Music Assistant (a page inside Settings).
export const accountsRegion = (page) => page.getByRole('region', { name: '账户与文件夹', exact: true });
export async function openMusicSettings(page) {
  await openSettingsSection(page, '音源'); await settingsDialog(page).getByRole('button', { name: '账户与文件夹', exact: true }).click(); await accountsRegion(page).waitFor();
}
// The one 唱机音源 picker: a radio per provider, named by the provider table.
export async function chooseSource(page, value) {
  await openSettingsSection(page, '音源');
  const radio = settingsDialog(page).getByRole('radiogroup', { name: '唱机音源', exact: true }).getByRole('radio', { name: providerLabel(value), exact: true });
  await radio.click(); await page.waitForFunction((id) => document.querySelector('.room-turntable')?.dataset.provider === id, value);
  if (await radio.getAttribute('aria-checked') !== 'true') throw new Error(`唱机音源 ${value} was not selected`);
  await closeSettings(page);
}
export const addDialog = (page) => page.getByRole('dialog', { name: '添加到唱片架', exact: true });
export async function openAddToShelf(page, tab = '曲库搜索') {
  await page.getByRole('button', { name: '添加到唱片架', exact: true }).click(); await addDialog(page).waitFor();
  if (tab !== '曲库搜索') await addDialog(page).getByRole('tab', { name: tab, exact: true }).click();
}
export async function openShelfTools(page) {
  const toggle = page.getByRole('button', { name: '整理唱片架', exact: true });
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await page.getByRole('region', { name: '整理唱片架', exact: true }).waitFor();
}
export async function openAlbumWall(page) {
  await openShelfTools(page); await page.getByRole('region', { name: '整理唱片架', exact: true }).getByRole('button', { name: '专辑墙', exact: true }).click();
}
