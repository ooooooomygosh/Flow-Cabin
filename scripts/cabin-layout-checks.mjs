import { openLibrary, closeLibrary, takeBinder, libraryDialog, openSettingsSection, closeSettings, settingsDialog, openMusicSettings, accountsRegion } from './settings-actions.mjs';
import assert from 'node:assert/strict';

// User-visible layout contracts of the home, DEsk's desk (src/desk/DeskHome.jsx, src/desk/layout.mjs), shared by browser
// smoke and hidden Electron QA. At the back edge, left to right: the 唱机 plate (C), the LED 台钟 (专注) and the 信箱 (N);
// the 唱片架 plate (A) hangs top-right; the drawer's pull (D) sits on the front edge. Everything else is in the drawer.
export async function verifyCabinLayout({ page, check = () => {} }) {
  await page.locator('.desk-home.is-lit').waitFor();
  const measure = await page.evaluate(() => {
    const box = (selector) => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r && { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
    return {
      console: box('.desk-console-plate'), clock: box('.desk-clock-face'), post: box('.desk-post'), shelf: box('.desk-shelf-plate'), pull: box('.desk-pull'), window: box('.desk-window'),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth, width: innerWidth, height: innerHeight
    };
  });
  assert.equal(measure.horizontalOverflow, false, 'no page horizontal overflow');
  for (const name of ['console', 'clock', 'post', 'shelf', 'pull', 'window']) {
    const entry = measure[name];
    assert(entry && entry.width > 0 && entry.left >= 0 && entry.right <= measure.width + 0.5 && entry.top >= 0 && entry.bottom <= measure.height + 0.5, `${name} stays inside the window: ${JSON.stringify(entry)}`);
  }
  // The back edge is one row along the top, in DEsk's order; the bookcase plate is in the top-right corner.
  assert(measure.console.right <= measure.clock.left && measure.clock.right <= measure.post.left, 'back edge runs 唱机 · 台钟 · 信箱, left to right');
  for (const name of ['console', 'clock', 'post', 'shelf']) assert(measure[name].bottom <= measure.height * 0.2, `${name} sits at the back of the desk`);
  assert(measure.shelf.left > measure.post.right && measure.width - measure.shelf.right < 40, '唱片架 plate hangs top-right');
  assert(Math.abs(measure.pull.bottom - measure.height) < 2, 'the drawer pull is on the front edge');
  // The window controls (full screen; minimise and close in the frameless desktop window) cover nothing at the back edge.
  const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  for (const name of ['console', 'clock', 'post', 'shelf']) assert(!overlaps(measure.window, measure[name]), `the window controls do not cover the ${name}`);
  await page.locator('.desk-window').getByRole('button', { name: /^(进入|退出)全屏模式$/ }).waitFor();
  // Nothing of the old toolbar is a loose button on the desk (设置 and the rest are things in the shut drawer).
  for (const name of ['整理唱片架', '布置小屋', '选择小屋', '音源设置', '筛选与唱片盒', '沉入桌面', '设置', '日记']) assert.equal(await page.locator('.desk-home').getByRole('button', { name, exact: true }).count(), 0, `${name} is not a loose button on the desk`);
  check('desk-back-edge-shelf-plate-and-drawer-pull-fit-the-window');
  return measure;
}

export async function verifyCabinToolActions({ page, check = () => {} }) {
  // 唱片架 › 唱片 › 筛选: a filter that matches nothing says so, shows its count and can be reset.
  const dialog = await takeBinder(page, '唱片');
  await dialog.getByRole('button', { name: '筛选' }).click();
  const filter = dialog.getByRole('button', { name: /^筛选/ });
  assert.equal(await filter.getAttribute('aria-expanded'), 'true');
  await dialog.getByLabel('筛选类型', { exact: true }).selectOption('song');
  await dialog.getByText('没有找到相符的唱片。').waitFor();
  assert.match(await filter.getAttribute('aria-label'), /已调整 1 项/); assert.match(await filter.getAttribute('class'), /is-active/);
  await dialog.getByLabel('筛选类型', { exact: true }).selectOption('all');
  await dialog.locator('.listen-grid li').first().waitFor();
  assert.equal(await libraryDialog(page).getByRole('button', { name: '专辑墙', exact: true }).count(), 1, '专辑墙 hangs on the shelf');
  await dialog.getByRole('button', { name: '好了', exact: true }).click();
  await closeLibrary(page);
  // 设置 is a thing in the desk's drawer (the screwdriver); × and Esc close it, there is no 回到小屋 button.
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
