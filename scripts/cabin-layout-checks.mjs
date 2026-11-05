import { openLibrary, closeLibrary, openSettingsSection, closeSettings, settingsDialog, openMusicSettings, accountsRegion } from './settings-actions.mjs';
import assert from 'node:assert/strict';

// User-visible layout contracts of the life cabin's desk (docs/v3-desk-design.md), shared by browser smoke and hidden Electron QA.
// The top rail, left to right: pet portrait, room plate, [唱片架 plate · LED 台钟 (专注) · 日记 plate], then the brass knobs
// 设置 and 进入全屏模式. The footer holds the 正在播放 console strip and the 房间区域 plates.
export async function verifyCabinLayout({ page, check = () => {} }) {
  const measure = await page.evaluate(() => {
    const box = (element) => { const r = element?.getBoundingClientRect(); return r && { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
    const rail = [...document.querySelectorAll('.home-header > .home-pet-portrait, .home-header .home-room-name, .home-header .home-shortcuts > *, .home-header .desktop-controls button')].filter(e => e.getBoundingClientRect().width);
    const bar = document.querySelector('.listen-bar'), zones = document.querySelector('nav.home-zones');
    const opacity = (element) => { let value = 1; for (; element; element = element.parentElement) value *= Number(getComputedStyle(element).opacity); return value; };
    return {
      rail: rail.map(e => ({ name: e.getAttribute('aria-label') || e.textContent.trim(), cls: e.className.toString(), ...box(e) })),
      shortcuts: box(document.querySelector('nav.home-shortcuts')), bar: box(bar), zones: box(zones),
      barOpacity: bar ? [...bar.querySelectorAll('button,strong,small')].map(opacity) : [],
      barButtonOverflow: bar ? [...bar.querySelectorAll('button')].some(b => { const r = b.getBoundingClientRect(), p = bar.getBoundingClientRect(); return r.width && (r.left < p.left - 1 || r.right > p.right + 1 || r.bottom > p.bottom + 1 || r.top < p.top - 1); }) : false,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth, width: innerWidth, height: innerHeight
    };
  });
  assert.equal(measure.horizontalOverflow, false, 'no page horizontal overflow');
  // One row, in a fixed order, every plate inside the window.
  const names = measure.rail.map(entry => /^伙伴与装扮/.test(entry.name) ? '伙伴' : /选择或布置小屋/.test(entry.name) ? '房间' : /^专注/.test(entry.name) ? '专注' : /^唱片架/.test(entry.name) ? '唱片架' : /^日记/.test(entry.name) ? '日记' : /^设置$/.test(entry.name) ? '设置' : /全屏模式/.test(entry.name) ? '全屏' : entry.name);
  assert.deepEqual(names.slice(0, 7), ['伙伴', '房间', '唱片架', '专注', '日记', '设置', '全屏'].slice(0, 7), `top rail order: ${names}`);
  const centres = measure.rail.map(entry => (entry.top + entry.bottom) / 2);
  assert(Math.max(...centres) - Math.min(...centres) < 30, `the top rail is one row: ${centres.map(Math.round)}`);
  for (let i = 1; i < measure.rail.length; i++) assert(measure.rail[i].left >= measure.rail[i - 1].left, `rail items run left to right: ${names[i]}`);
  for (const entry of measure.rail) assert(entry.left >= 0 && entry.right <= measure.width && entry.top >= 0 && entry.bottom <= measure.height, `${entry.name} stays inside the window`);
  assert(measure.bar && measure.bar.left >= 0 && measure.bar.right <= measure.width && measure.bar.bottom <= measure.height, '正在播放 stays inside the window');
  assert(measure.barOpacity.every(value => value === 1), 'the 正在播放 title, line and keys stay opaque');
  assert.equal(measure.barButtonOverflow, false, 'the keys stay inside the 正在播放 strip');
  assert(!(measure.zones.left < measure.bar.right && measure.zones.right > measure.bar.left && measure.zones.top < measure.bar.bottom && measure.zones.bottom > measure.bar.top), '房间区域 does not overlap 正在播放');
  // The desk keeps its three entries and the two knobs; nothing of the old toolbar comes back.
  assert.equal(await page.locator('nav.home-shortcuts').getByRole('button').count(), 3, 'three entries: 唱片架 · 专注 · 日记');
  for (const name of ['整理唱片架', '布置小屋', '音源设置', '筛选与唱片盒', '沉入桌面']) assert.equal(await page.locator('.home-header, .home-footer').getByRole('button', { name, exact: true }).count(), 0, `${name} is not a loose button on the desk`);
  assert.equal(await page.locator('nav.home-zones').getByRole('button').count(), 4, '房间区域 has 全屋 / 听歌角 / 工作角 / 生活角');
  check('desk-rail-order-bar-and-zone-plates-fit-the-window');
  return measure;
}

export async function verifyCabinToolActions({ page, check = () => {} }) {
  // 唱片架 › 唱片 › 筛选: a filter that matches nothing says so, shows its count and can be reset.
  const dialog = await openLibrary(page);
  await dialog.getByRole('button', { name: '筛选' }).click();
  const filter = dialog.getByRole('button', { name: /^筛选/ });
  assert.equal(await filter.getAttribute('aria-expanded'), 'true');
  await dialog.getByLabel('筛选类型', { exact: true }).selectOption('song');
  await dialog.getByText('没有找到相符的唱片。').waitFor();
  assert.match(await filter.getAttribute('aria-label'), /已调整 1 项/); assert.match(await filter.getAttribute('class'), /is-active/);
  await dialog.getByLabel('筛选类型', { exact: true }).selectOption('all');
  await dialog.locator('.listen-grid li').first().waitFor();
  assert.equal(await dialog.getByRole('button', { name: '专辑墙', exact: true }).count(), 1, '专辑墙 hangs on the shelf');
  await dialog.getByRole('button', { name: '好了', exact: true }).click();
  await closeLibrary(page);
  // 设置 is a drawer object (the brass knob → 全部设置); × and Esc close it, there is no 回到小屋 button.
  await openSettingsSection(page, '小屋与奶糖'); await settingsDialog(page).waitFor();
  assert.equal(await settingsDialog(page).getByRole('button', { name: '回到小屋', exact: true }).count(), 0, 'the header × and Esc close 设置');
  await closeSettings(page);
  await openMusicSettings(page); assert.equal(await page.getByRole('dialog').count(), 1, '账户与文件夹 stays inside 设置');
  await accountsRegion(page).getByRole('button', { name: '音乐', exact: true }).click(); await accountsRegion(page).waitFor({ state: 'detached' });
  await page.keyboard.press('Escape'); await settingsDialog(page).waitFor({ state: 'hidden' });
  check('relocated-tools-filter-state-and-dialog-actions');
}

// The focus panel (专注 dialog) stays inside the window and never hides the LED clock that opens it.
export async function verifyFocusLayout({ page }) {
  const measured = await page.evaluate(() => {
    const dialog = [...document.querySelectorAll('dialog[open]')].find(d => /专注/.test(d.getAttribute('aria-label') || d.querySelector('h2')?.textContent || ''));
    const p = dialog?.getBoundingClientRect();
    return { panel: p && { top: p.top, bottom: p.bottom, left: p.left, right: p.right }, height: innerHeight, width: innerWidth, badgeVisible: document.querySelector('.focus-badge').getBoundingClientRect().width > 0 };
  });
  assert(measured.badgeVisible, 'the LED clock stays reachable');
  if (measured.panel) {
    assert(measured.panel.top >= -1 && measured.panel.bottom <= measured.height + 1, 'focus panel stays within the window');
    assert(measured.panel.left >= -1 && measured.panel.right <= measured.width + 1, 'focus panel stays within the window width');
  }
  return measured;
}
