'use strict';
// Cabin productivity flow: focus dock, tasks, a full pomodoro with a fake
// clock, rewards, the room cat, the sound mixer and Zen mode.
const { _electron } = require('playwright'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { mountFixture } = require('./ui-fixture.cjs');
const desktop = path.resolve(__dirname, '..'), output = path.join(desktop, 'test-results'); fs.mkdirSync(output, { recursive: true });
const env = { ...process.env, ALBUM_DESKTOP_TEST_PROFILE: path.join(output, `focus-ui-profile-${Date.now()}`) }; delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.ALBUM_QA_EXE || require(path.join(desktop, 'node_modules/electron'));
const report = { executablePath, startedAt: new Date().toISOString(), fixtureData: true, checks: [], pageErrors: [] };
const check = (name, detail = {}) => { report.checks.push({ name, passed: true, ...detail }); console.log('PASS ' + name); };
let app, site, host;
(async () => {
  app = await _electron.launch({ executablePath, args: process.env.ALBUM_QA_EXE ? [] : [desktop], env }); app.context().setDefaultTimeout(18000); await app.firstWindow();
  for (let i = 0; i < 100; i++) { site = app.context().pages().find((p) => p.url().startsWith('https://album-circle.vercel.app')); host = app.context().pages().find((p) => p.url() === 'album-desktop://shell/index.html'); if (site && host) break; await new Promise((r) => setTimeout(r, 100)); }
  site.on('pageerror', (error) => report.pageErrors.push(error.message));
  await site.clock.install();
  await mountFixture(app, site);
  await host.evaluate(() => window.albumDesktop.settings('apply', { showroom: 'room' })); await site.locator('.room-record').first().waitFor();
  assert.equal(await site.locator('.cabin-scene').getAttribute('data-room-look'), 'pixel');
  await site.locator('.room-cat .pixel-cat').waitFor(); check('pixel-cabin-and-cat-are-default');
  await site.screenshot({ path: path.join(output, 'focus-room.png') });

  await site.locator('.room-cat').click(); await site.locator('.room-cat-bubble').waitFor(); check('cat-responds-to-a-poke');

  await site.locator('.focus-badge').click(); await site.getByRole('tablist', { name: '专注工具' }).waitFor();
  await site.getByRole('tab', { name: '待办' }).click();
  for (const text of ['写周报', '整理唱片']) { await site.getByLabel('新的待办').fill(text); await site.getByRole('button', { name: '添加待办' }).click(); }
  assert.equal(await site.locator('.focus-task-list li').count(), 2);
  await site.getByRole('checkbox', { name: '完成：整理唱片' }).click(); assert.equal(await site.locator('.focus-task-list li.is-done').count(), 1);
  await site.getByRole('button', { name: /写周报/ }).first().click(); assert.equal(await site.locator('.focus-task-list li.is-current').count(), 1);
  check('tasks-add-complete-and-select');

  // 3.0: 这一段 holds the timer, the 「这一段做什么？」 line with its 待办 picker, and the 便签 (old 随手记).
  await site.getByRole('tab', { name: '这一段' }).click();
  await site.getByLabel('从待办里选').selectOption('');
  assert.equal(await site.getByLabel('从待办里选').inputValue(), '');
  check('free-focus-clears-task-selection');
  await site.getByLabel('随手记内容').fill('稍后整理笔记\n<script>window.__noteExecuted = true</script>');
  await site.getByRole('tab', { name: '待办' }).click();
  await site.getByRole('tab', { name: '这一段' }).click();
  assert.match(await site.getByLabel('随手记内容').inputValue(), /稍后整理笔记/);
  assert.equal(await site.evaluate(() => window.__noteExecuted), undefined);
  const persistedNote = await site.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('album-circle-focus-v1:')).some((key) => JSON.parse(localStorage.getItem(key)).notes?.includes('稍后整理笔记')));
  assert.equal(persistedNote, true);
  await site.getByRole('button', { name: '清空', exact: true }).click();
  await site.getByRole('group', { name: '清空随手记？清空后无法找回。' }).getByRole('button', { name: '取消', exact: true }).click();
  assert.match(await site.getByLabel('随手记内容').inputValue(), /稍后整理笔记/);
  await site.getByRole('button', { name: '清空', exact: true }).click();
  await site.getByRole('button', { name: '确认清空', exact: true }).click();
  assert.equal(await site.getByLabel('随手记内容').inputValue(), '');
  check('quick-notes-persist-as-plain-text-and-clear-needs-confirmation');
  await site.getByRole('button', { name: '计时设置' }).click(); await site.getByLabel('专注（分）').fill('2');
  await site.getByRole('button', { name: '开始专注' }).click(); assert.equal(await site.locator('.focus-display').count(), 0); // 自动进入沉浸 is off by default (2.2), so 开始专注 stays in the room
  await site.waitForFunction(() => document.querySelector('.focus-badge')?.textContent.includes('02:00') || document.querySelector('.focus-badge')?.textContent.includes('01:5'));
  // During focus the cat does one of its quiet-work poses (PetLife), not only 'focus'.
  await site.locator(['focus', 'read', 'write', 'type', 'think'].map((pose) => `.room-cat .pixel-cat[data-pose="${pose}"]`).join(',')).first().waitFor(); check('focus-starts-and-cat-keeps-company');
  await site.screenshot({ path: path.join(output, 'focus-running.png') });
  await site.evaluate(() => { window.__phase = null; window.addEventListener('album-focus-phase', (event) => { window.__phase = event.detail; }); });
  await site.clock.fastForward('02:01');
  await site.waitForFunction(() => window.__phase?.phase === 'focus');
  assert.equal(await site.evaluate(() => window.__phase.completed), true);
  await site.locator('.focus-phase', { hasText: '短休息' }).waitFor(); check('pomodoro-completes-and-break-starts');
  // 3.0: 统计 moved from the focus panel into 唱片日记 › 统计.
  await site.evaluate(() => window.dispatchEvent(new CustomEvent('cabin:open-journal', { detail: { tab: 'stats' } })));
  const journal = site.getByRole('dialog', { name: '唱片日记' }); await journal.waitFor();
  assert.match(await journal.locator('.rd-cat-link').innerText(), /1 小鱼干/); assert.match(await journal.locator('.fs-today-num').first().innerText(), /2 分钟/);
  assert.equal(await journal.locator('.focus-task-list').count(), 0); check('stats-and-reward-update');
  await site.screenshot({ path: path.join(output, 'focus-stats.png') });
  await site.keyboard.press('Escape'); await journal.waitFor({ state: 'hidden' });
  if (!await site.getByRole('tab', { name: '声音' }).isVisible()) await site.locator('.focus-badge').click();

  await site.getByRole('tab', { name: '声音' }).click();
  await site.getByLabel('雨声音量').fill('0.7'); await site.getByLabel('壁炉音量').fill('0.3');
  const mix = await site.evaluate(() => JSON.parse(localStorage.getItem('album-circle-sound-v1')));
  assert.equal(mix.tracks.rain, .7); assert.equal(mix.tracks.fire, .3); check('mixer-volumes-are-saved');

  const snapshot = await site.evaluate(() => window.albumCompanionSnapshot());
  assert.equal(snapshot.focus.fish, 1); assert.ok(snapshot.room.items.length > 0); assert.equal(JSON.stringify(snapshot).includes('desktop-qa-invalid-token'), false); check('companion-snapshot-has-no-session');

  await site.locator('.focus-dock-close').click(); await site.keyboard.press('h');
  assert.equal(await site.evaluate(() => document.documentElement.classList.contains('room-zen')), true);
  assert.equal(await site.locator('.app .topbar').isVisible(), false);
  assert.equal(await site.locator('.focus-badge').isVisible(), true); assert.equal(await site.getByRole('button', { name: '恢复工具', exact: true }).isVisible(), true); assert.equal(await site.locator('.app-titlebar').isVisible(), false);
  await site.screenshot({ path: path.join(output, 'focus-zen.png') });
  await site.keyboard.press('Escape'); assert.equal(await site.evaluate(() => document.documentElement.classList.contains('room-zen')), false); check('zen-mode-toggles');
  assert.deepEqual(report.pageErrors, []);
  report.passed = true;
})().catch((error) => { report.error = error.stack || error.message; report.passed = false; process.exitCode = 1; }).finally(async () => {
  report.finishedAt = new Date().toISOString(); fs.writeFileSync(path.join(output, 'focus-ui-report.json'), JSON.stringify(report, null, 2));
  if (!report.passed) console.error(report.error); await app?.close().catch(() => {});
});
