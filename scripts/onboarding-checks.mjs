import { openRoomSettings, closeSettings } from './settings-actions.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { getRoomScene } from '../src/scene-catalog.mjs';
import { releasesBetween } from '../src/onboarding/releases.mjs';
import { LEGACY_SEEN_VERSION } from '../src/onboarding/onboarding-model.mjs';
import { onboardingSeed, APP_VERSION } from './app-version.mjs';

// First-run wizard + settings hub checks, sharing the screenshot suite's
// isolated, offline routes. The web build has no desktop shell, so every
// native action must stay untouched (window.open throws).
export async function verifyOnboarding({ browser, origin, routeHandler, evidence, output, check }) {
  const fresh = async (init) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN', reducedMotion: 'reduce' });
    await context.route('**/*', routeHandler);
    await context.addInitScript(() => { window.open = () => { throw new Error('Onboarding must not invoke native actions on the web'); }; });
    await context.addInitScript((seed) => { window.__onboardingSeed = seed; }, onboardingSeed());
    if (init) await context.addInitScript(init);
    const page = await context.newPage(); page.setDefaultTimeout(8000);
    const failures = []; page.on('pageerror', (error) => failures.push(error.message));
    return { context, page, failures };
  };
  const button = (page, name) => page.getByRole('button', { name, exact: true });
  const wizardOf = (page, title = '新手引导') => page.getByRole('dialog', { name: title, exact: true });
  const hubOf = (page) => page.getByRole('dialog', { name: '设置', exact: true });
  const heading = (page) => page.locator('#onboarding-heading');
  const inViewport = async (page, locator) => {
    const box = await locator.boundingBox(), view = page.viewportSize();
    assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= view.width + 1 && box.y + box.height <= view.height + 1, 'control must be inside the viewport');
  };

  // 1. Full happy path on a brand-new cabin.
  let { context, page, failures } = await fresh();
  try {
    await page.goto(origin); const wizard = wizardOf(page); await wizard.waitFor();
    await page.evaluate(() => document.fonts.ready);
    await heading(page).filter({ hasText: '欢迎来到心流小屋' }).waitFor();
    for (const viewport of [{ width: 1440, height: 900 }, { width: 960, height: 600 }, { width: 640, height: 600 }]) {
      await page.setViewportSize(viewport);
      for (const name of ['开始设置', '跳过引导']) await inViewport(page, button(page, name));
      assert(await wizard.evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth));
      await page.screenshot({ path: path.join(evidence, `onboarding-${viewport.width}.png`), animations: 'disabled' });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await button(page, '开始设置').click();
    await heading(page).filter({ hasText: '想从哪里听歌？' }).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'onboarding-heading');
    assert.equal(await page.getByRole('radio', { name: '音源 QQ 音乐' }).isDisabled(), true, 'platform login is desktop-only');
    await page.getByRole('radio', { name: '音源 本地音乐' }).click();
    assert.equal(await page.getByRole('radio', { name: '音源 本地音乐' }).getAttribute('aria-checked'), 'true');
    await button(page, '选择音乐文件').waitFor();
    await wizard.locator('.onboarding-scene img').evaluate((image) => image.decode());
    await page.screenshot({ path: path.join(output, 'onboarding.png'), animations: 'disabled' });
    check('wizard-auto-opens-three-sizes-web-sources-and-heading-focus');
    await button(page, '下一步').click();
    await heading(page).filter({ hasText: '只开需要的权限' }).waitFor();
    await button(page, '跳过 系统通知').click(); await wizard.getByText('已跳过').waitFor();
    await button(page, '下一步').click();
    // The compact 房间 picker uses the current Pixel Cabin artwork from the catalog.
    assert.equal(await wizard.locator('.room-pickers.is-compact').getByRole('button', { name: '选择场景 像素小屋', exact: true }).locator('img').getAttribute('src'), getRoomScene('pixel').view);
    await button(page, '选择场景 林间书屋').click(); await button(page, '选择桌宠 枫糖').click();
    assert.equal(await button(page, '选择场景 林间书屋').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.cabin-scene').getAttribute('data-room-look'), 'forest');
    await button(page, '下一步').click();
    assert.equal(await page.locator('audio[src]').count(), 0, 'no sound before 播放测试');
    await button(page, '播放测试').click(); await button(page, '听到了').click();
    await wizard.getByText('声音正常，可以开始听歌了。').waitFor();
    await button(page, '下一步').click();
    await wizard.locator('.onboarding-summary').getByText('本地音乐').waitFor();
    await button(page, '进入小屋').click(); await wizard.waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.focus-badge.is-running').count(), 0);
    await page.reload(); await page.getByRole('button', { name: '添加第一张专辑' }).waitFor();
    assert.equal(await wizardOf(page).count(), 0);
    assert.equal(await page.locator('.cabin-scene').getAttribute('data-room-look'), 'forest');
    assert.equal(await page.locator('.room-cat .pixel-cat').getAttribute('data-pet-id'), 'fox');
    assert.equal(await page.evaluate(() => localStorage.getItem('album-circle-room-player-v1')), 'local');
    check('wizard-full-flow-persists-source-room-companion-and-does-not-reopen');

    // 2. 重新引导 from the hub, motion preferences.
    await button(page, '设置').click(); await hubOf(page).waitFor();
    assert.deepEqual(await hubOf(page).getByRole('tab').allInnerTexts(), ['音源', '房间与桌宠', '键鼠陪伴', '专注工具', '同步与设备', '显示与桌面', '数据与备份', 'AI（Beta）', '小屋 Beta', '关于']);
    await page.getByRole('tab', { name: '关于' }).click(); await button(page, '重新引导').click();
    await wizardOf(page).waitFor(); await heading(page).filter({ hasText: '欢迎来到心流小屋' }).waitFor();
    assert.equal(await hubOf(page).count(), 0);
    assert.equal(await page.locator('.onboarding-step').evaluate((el) => getComputedStyle(el).animationName), 'none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    assert.equal(await page.locator('.onboarding-step').evaluate((el) => getComputedStyle(el).animationName), 'onboarding-in');
    await page.evaluate(() => { document.documentElement.dataset.desktopReduceMotion = 'true'; });
    assert.equal(await page.locator('.onboarding-step').evaluate((el) => getComputedStyle(el).animationName), 'none');
    await page.evaluate(() => { delete document.documentElement.dataset.desktopReduceMotion; }); await page.emulateMedia({ reducedMotion: 'reduce' });
    check('reopen-from-settings-and-motion-obeys-os-and-app-preferences');

    // 3. Closing half-way resumes on the next launch; Escape restores focus.
    await button(page, '开始设置').click(); await heading(page).filter({ hasText: '想从哪里听歌？' }).waitFor();
    await page.keyboard.press('Escape'); await wizardOf(page).waitFor({ state: 'hidden' });
    await page.reload(); await wizardOf(page).waitFor();
    await heading(page).filter({ hasText: '想从哪里听歌？' }).waitFor();
    assert.equal(await page.getByRole('radio', { name: '音源 本地音乐' }).getAttribute('aria-checked'), 'true', 'earlier choices survive');
    // 4. 跳过引导 is final until 重新引导.
    await button(page, '跳过引导').click(); await page.reload(); await page.getByRole('button', { name: '添加第一张专辑' }).waitFor();
    assert.equal(await wizardOf(page).count(), 0);
    check('wizard-resumes-after-close-and-skip-is-remembered');

    // 5. Settings hub: shortcuts route to their section.
    await openRoomSettings(page); await hubOf(page).waitFor();
    assert.equal(await page.getByRole('tab', { name: '房间与桌宠' }).getAttribute('aria-selected'), 'true');
    await button(page, '选择场景 海边慢屋').click();
    assert.equal(await page.locator('.cabin-scene').getAttribute('data-room-look'), 'seaside');
    await page.screenshot({ path: path.join(evidence, 'settings-hub-room.png'), animations: 'disabled' });
    await closeSettings(page);
    // The deck's 音源设置 event opens 设置 › 音源 (web: only 仅动画展示 and 本地音乐 can be chosen).
    await page.evaluate(() => window.dispatchEvent(new Event('cabin-open-music-settings'))); await hubOf(page).waitFor();
    assert.equal(await page.getByRole('tab', { name: '音源' }).getAttribute('aria-selected'), 'true');
    const sources = hubOf(page).getByRole('radiogroup', { name: '唱机音源', exact: true });
    assert.equal(await sources.getByRole('radio', { name: '本地音乐', exact: true }).getAttribute('aria-checked'), 'true', 'the guide\'s choice is the deck\'s source');
    assert.equal(await sources.getByRole('radio', { checked: true }).count(), 1);
    assert.equal(await sources.getByRole('radio', { name: 'QQ 音乐', exact: true }).isDisabled(), true, 'platform sources are desktop-only');
    assert.equal(await hubOf(page).getByRole('button', { name: '账户与文件夹' }).count(), 0, 'web has no accounts page');
    assert.equal(await hubOf(page).getByLabel('音质').count(), 0, 'web has no quality choice');
    await page.screenshot({ path: path.join(evidence, 'settings-hub-music.png'), animations: 'disabled' });
    await hubOf(page).getByRole('tab', { name: '键鼠陪伴' }).click();
    await hubOf(page).getByText('跨应用键鼠陪伴需要心流小屋桌面版。网页版仍会在小屋窗口内回应键盘和鼠标。', { exact: true }).waitFor();
    await page.getByRole('tab', { name: '显示与桌面' }).click();
    await hubOf(page).getByRole('checkbox', { name: '沉入桌面' }).waitFor();
    assert.equal(await hubOf(page).getByRole('checkbox', { name: '沉入桌面' }).isDisabled(), true, 'browser preview: #14 reports 沉入桌面 as desktop-client only');
    await page.getByRole('tab', { name: '数据与备份' }).click(); await button(page, '收藏与备份').click();
    await page.getByRole('dialog', { name: '收藏与备份' }).waitFor(); await page.keyboard.press('Escape');
    check('settings-hub-sections-and-old-shortcuts-route-to-it');
    assert.deepEqual(failures, []);
  } finally { await context.close(); }

  // 6. 沉入桌面 API says unsupported: toggle disabled, reason shown.
  ({ context, page, failures } = await fresh(() => {
    if (location.origin === 'null') return;
    window.cabinDesktop = { getDesktopModeStatus: () => ({ active: false, supported: false, reason: '当前系统不支持沉入桌面' }), enterDesktopMode() {}, exitDesktopMode() {} };
    localStorage.setItem('flow-cabin-welcome-v1', 'seen');
    localStorage.setItem('flow-cabin-onboarding-v1', JSON.stringify({ ...JSON.parse(window.__onboardingSeed), source: 'local', permissions: {}, tested: 'skipped' }));
  }));
  try {
    await page.goto(origin); await button(page, '设置').click(); await page.getByRole('tab', { name: '显示与桌面' }).click();
    await hubOf(page).getByText(/当前系统不支持沉入桌面|沉入桌面需要在心流小屋桌面客户端里使用/).first().waitFor(); // #14's installDesktopApi owns window.cabinDesktop in the page
    assert.equal(await hubOf(page).getByRole('checkbox', { name: '沉入桌面' }).isDisabled(), true);
    check('desktop-mode-unsupported-reason-disables-toggle');
    assert.deepEqual(failures, []);
  } finally { await context.close(); }

  // 7. A cabin that only saw the old welcome marker gets the v1.21 update guide.
  ({ context, page, failures } = await fresh(() => {
    if (location.origin === 'null') return;
    localStorage.setItem('flow-cabin-welcome-v1', 'seen');
  }));
  try {
    await page.goto(origin);
    const updateWizard = wizardOf(page, '版本更新'); await updateWizard.waitFor();
    const updates = releasesBetween(LEGACY_SEEN_VERSION, APP_VERSION);
    await heading(page).filter({ hasText: `你离开的这段时间，小屋更新了 ${updates.length} 个版本` }).waitFor();
    assert.deepEqual(await updateWizard.locator('.onboarding-progress li').allInnerTexts(), ['1\n更新', '2\n音源', '3\n权限', '4\n房间', '5\n试听', '6\n完成']);
    assert.deepEqual(await updateWizard.locator('.onboarding-release header span').allInnerTexts(), updates.map(release => `v${release.version}`));
    await updateWizard.getByText('「键鼠陪伴」进入「设置」一级入口', { exact: false }).waitFor();
    await button(page, '稍后继续').waitFor();
    assert.equal(await button(page, '开始设置').count(), 0);
    await button(page, '开始检查设置').click();
    await heading(page).filter({ hasText: '想从哪里听歌？' }).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'onboarding-heading');
    await page.getByRole('radio', { name: '音源 本地音乐' }).click();
    await button(page, '下一步').click(); await heading(page).filter({ hasText: '只开需要的权限' }).waitFor();
    await button(page, '跳过 系统通知').click();
    await button(page, '下一步').click(); await heading(page).filter({ hasText: '选一个房间，再挑个伙伴' }).waitFor();
    await button(page, '下一步').click(); await heading(page).filter({ hasText: '放一段声音试试' }).waitFor();
    await button(page, '播放测试').click(); await button(page, '听到了').click();
    await button(page, '下一步').click(); await heading(page).filter({ hasText: '这次更新已经逐项确认' }).waitFor();
    await button(page, '进入小屋').click(); await updateWizard.waitFor({ state: 'hidden' });
    await page.reload(); await page.getByRole('button', { name: '添加第一张专辑' }).waitFor();
    assert.equal(await wizardOf(page, '版本更新').count(), 0);
    check('legacy-welcome-cabin-sees-and-completes-v1.21-update-guide');
    assert.deepEqual(failures, []);
  } finally { await context.close(); }

  // 8. Storage failure keeps the choice visible and still allows exit.
  ({ context, page, failures } = await fresh());
  try {
    await page.goto(origin); await wizardOf(page).waitFor();
    await button(page, '开始设置').click(); await button(page, '下一步').click(); await button(page, '下一步').click();
    await page.evaluate(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) { if (key.startsWith('album-circle-library')) throw new DOMException('Storage full', 'QuotaExceededError'); return set.call(this, key, value); }; });
    await button(page, '选择场景 海边慢屋').click();
    await wizardOf(page).getByRole('alert').waitFor();
    await button(page, '跳过引导').click(); await wizardOf(page).waitFor({ state: 'hidden' });
    check('wizard-storage-failure-is-shown-and-allows-exit');
  } finally { await context.close(); }

  // 9. A returning cabin (any earlier data) is never interrupted.
  const returning = await browser.newContext();
  try {
    await returning.route('**/*', routeHandler);
    await returning.addInitScript(() => { if (location.origin === 'null') return; localStorage.setItem('album-circle-focus-dock-v1', JSON.stringify({ open: false, tab: 'timer' })); });
    const page = await returning.newPage(); await page.goto(origin); await page.getByRole('button', { name: '添加第一张专辑' }).waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0);
    check('returning-empty-collection-is-not-interrupted');
  } finally { await returning.close(); }
}
