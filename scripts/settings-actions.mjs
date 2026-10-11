// Drive the visible settings paths after removing duplicate console shortcuts.
export async function openSettingsSection(page, section) {
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('tab', { name: section, exact: true }).click();
}
export async function openRoomSettings(page) { await openSettingsSection(page, '房间与桌宠'); }
export async function openMusicSettings(page) { await openSettingsSection(page, '音源'); await page.getByRole('button', { name: '音源与账户', exact: true }).click(); }
export async function chooseSource(page, value) {
  await openSettingsSection(page, '音源');
  await page.getByLabel('唱机音源', { exact: true }).selectOption(value);
  await page.getByRole('button', { name: '回到小屋', exact: true }).click();
}
