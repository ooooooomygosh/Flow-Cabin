/** Interactive smoke test and evidence screenshots for the standalone promo page.
 * Run: node scripts/promo-smoke.mjs
 * Uses the local Vite server and bundled Playwright Chromium only.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './launch-browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.env.PROMO_OUTPUT || path.join(root, 'desktop/test-results/promo'));
const port = Number(process.env.PROMO_PORT || 4217);
const origin = `http://127.0.0.1:${port}`;
const latestReleaseUrl = 'https://api.github.com/repos/ooooooomygosh/album-web/releases/latest';
const latestReleaseTag = 'v9.99.0';
const packageVersion = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version;
const fallbackLatestVersion = `v${packageVersion}`;
await fs.mkdir(output, { recursive: true });

const report = {
  startedAt: new Date().toISOString(),
  fixtureData: true,
  externalNetworkUsed: false,
  checks: [],
  screenshots: [],
  pageErrors: [],
  consoleErrors: [],
  failedRequests: [],
  unexpectedRequests: [],
  latestReleaseRequests: []
};

let server;
let browser;
try {
  server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root,
    env: { ...process.env, FLOW_CABIN_VITE_CACHE_DIR: path.join(output, 'vite-cache') },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverLog = '';
  server.stdout.on('data', (chunk) => { serverLog += chunk; });
  server.stderr.on('data', (chunk) => { serverLog += chunk; });
  for (let index = 0; index < 100; index += 1) {
    if (server.exitCode !== null) throw new Error(serverLog);
    try {
      if ((await fetch(`${origin}/promo.html`)).ok) break;
    } catch {}
    if (index === 99) throw new Error(`Vite startup timed out: ${serverLog}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  browser = await launchChromium();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    reducedMotion: 'no-preference',
    colorScheme: 'dark'
  });

  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (error) => report.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') report.consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    if (request.failure()?.errorText !== 'net::ERR_ABORTED') {
      report.failedRequests.push({ url: request.url(), error: request.failure()?.errorText });
    }
  });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      if (url.href === latestReleaseUrl) {
        report.latestReleaseRequests.push(url.href);
        await new Promise((resolve) => setTimeout(resolve, 350));
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tag_name: latestReleaseTag })
        });
      }
      report.unexpectedRequests.push(url.href);
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });

  const check = (name, details = {}) => {
    report.checks.push({ name, passed: true, ...details });
    console.log(`PASS ${name}`);
  };
  const screenshot = async (name, locator = null) => {
    const target = locator || page;
    await target.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
    report.screenshots.push(`${name}.png`);
  };

  await page.goto(`${origin}/promo.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('.hero h1').waitFor();
  await page.locator('[data-latest-version]').first().waitFor();
  const fallbackLabels = await page.locator('[data-latest-version]').allTextContents();
  assert(fallbackLabels.length >= 3);
  assert(fallbackLabels.every((label) => label.trim() === fallbackLatestVersion), 'the static version must work before GitHub responds');
  check('static-version-fallback-is-available-offline');
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('button', { name: /夜深/ }).click();
  await page.locator('.site[data-time="night"]').waitFor();
  const defaultLetter = await page.locator('#letter-body').innerText();
  assert.match(defaultLetter, /晴天/);
  assert.match(defaultLetter, /晴夜很安静/);
  assert.doesNotMatch(defaultLetter, /雪落在窗外/);
  const initialCats = await page.evaluate(() => [...document.querySelectorAll('[data-cat-action]')].map((sprite) => {
    const style = getComputedStyle(sprite);
    const rect = sprite.getBoundingClientRect();
    return { background: style.backgroundImage, opacity: style.opacity, width: rect.width, height: rect.height };
  }));
  assert.equal(initialCats.length, 2, 'both promo cat sprites must mount');
  assert(initialCats.every((cat) => cat.background !== 'none' && cat.opacity !== '0' && cat.width > 0 && cat.height > 0), 'cat sprites must render before interaction');
  check('promo-mounts-with-brand-and-interactive-scene');
  assert.equal(await page.locator('h1').count(), 1);
  assert.equal(await page.locator('.room-card').count(), 6);
  assert.equal(await page.locator('[data-room-choice]').count(), 6);
  check('all-six-rooms-are-present-in-switcher-and-gallery');
  const downloadLinks = await page.locator('a[href="https://github.com/ooooooomygosh/album-web/releases/latest"]').evaluateAll((links) => links.map((link) => link.href));
  assert(downloadLinks.length >= 3, 'header, hero and bottom download actions must use the latest release URL');
  await page.waitForFunction((version) => [...document.querySelectorAll('[data-latest-version]')].every((node) => node.textContent === version), latestReleaseTag);
  check('download-actions-use-latest-release-and-show-live-version');

  await page.locator('[data-time-choice="day"]').click();
  assert.equal(await page.locator('.site').getAttribute('data-time'), 'day');
  await expectText(page.locator('#hero-time'), '14:40');
  await page.getByRole('button', { name: '雪', exact: true }).click();
  assert.equal(await page.locator('.site').getAttribute('data-weather'), 'snow');
  await page.waitForFunction(() => document.querySelector('#letter-body')?.innerText.includes('雪把外面变得很慢'));
  const snowLetter = await page.locator('#letter-body').innerText();
  assert.match(snowLetter, /14:40/);
  assert.match(snowLetter, /雪天/);
  assert.doesNotMatch(snowLetter, /晴夜很安静/);
  check('time-and-weather-controls-update-the-room');
  check('cabin-letter-uses-current-time-and-weather');

  await page.locator('[data-gallery-room="starlight"]').click();
  await page.locator('.site[data-room="starlight"]').waitFor();
  await expectText(page.locator('[data-room-name]'), '星夜阁楼');
  await expectText(page.locator('#letter-title'), /小屋来信/);
  check('gallery-room-selection-reaches-hero-and-letter');

  const pet = page.locator('#pet-typing');
  await pet.scrollIntoViewIfNeeded();
  await pet.fill('今天也慢慢来');
  await page.waitForFunction(() => document.querySelector('#naitang [data-cat-action]')?.dataset.catAction === 'typing');
  assert.match(await page.locator('#typing-count').innerText(), /[1-9]\d*/);
  assert.match(await page.locator('#keyboard-count').innerText(), /[1-9]\d*/);
  await page.getByRole('button', { name: '点一下鼠标', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#naitang [data-cat-action]')?.dataset.catAction === 'click');
  assert.match(await page.locator('#click-count').innerText(), /^1$/);
  await page.getByRole('button', { name: '一起听歌', exact: true }).click();
  assert.equal(await page.locator('#naitang [data-cat-action]').getAttribute('data-cat-action'), 'groove');
  await page.getByRole('button', { name: '摸摸奶糖', exact: true }).click();
  check('pet-typing-click-groove-and-poke-demos-respond');

  await page.locator('.transport').click();
  await page.locator('.turntable-demo[data-playing="true"]').waitFor();
  await page.locator('.tracklist button[data-track="2"]').click();
  await expectText(page.locator('#track-title'), 'Lovesick');
  check('turntable-play-state-and-track-selection-work');

  await page.locator('[data-smart-request="study"]').click();
  const smartAlbumIds = await page.locator('#smart-picks .smart-pick').evaluateAll((items) => items.map((item) => item.dataset.albumId));
  assert.deepEqual(smartAlbumIds, ['bewitched', 'orange-moon', 'fable']);
  await expectText(page.locator('#smart-count'), '3 张');
  await page.locator('[data-smart-autoplay="false"]').click();
  assert.equal(await page.locator('[data-smart-autoplay="false"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#smart-start-hint').innerText(), '只开始专注，唱片保持暂停');
  await page.locator('[data-smart-start]').click();
  await page.waitForFunction(() => document.querySelector('#smart-status')?.textContent.includes('等待播放'));
  assert.equal(await page.locator('.turntable-demo').getAttribute('data-playing'), 'false');
  assert.equal(await page.locator('#deck-state').innerText(), '播放已暂停');
  assert.equal(await page.locator('#focus-status').innerText(), '专注进行中');
  check('smart-turntable-shows-ordered-picks-and-paused-start');

  await page.locator('[data-smart-autoplay="true"]').click();
  assert.equal(await page.locator('#smart-start-hint').innerText(), '同时开始专注与播放');
  await page.locator('[data-smart-start]').click();
  await page.waitForFunction(() => document.querySelector('.turntable-demo')?.dataset.playing === 'true');
  await expectText(page.locator('#smart-status'), '正在播放');
  check('smart-turntable-autoplay-choice-is-visible');

  await page.locator('[data-focus-preset="25"]').scrollIntoViewIfNeeded();
  await page.locator('[data-focus-preset="25"]').click();
  await page.waitForFunction(() => [...document.querySelectorAll('.flip-digit')].map((digit) => digit.textContent).join('') === '2500');
  await page.getByRole('button', { name: '开始这一轮', exact: true }).click();
  await page.waitForTimeout(1150);
  assert.equal(await page.locator('#focus-status').innerText(), '专注进行中');
  await page.getByRole('button', { name: '暂停这一轮', exact: true }).click();
  await page.getByRole('button', { name: '重置', exact: true }).click();
  await page.locator('[data-card-flip]').click();
  assert.equal(await page.locator('[data-card-flip]').getAttribute('aria-pressed'), 'true');
  check('focus-preset-run-pause-and-word-card-flip-work');

  await page.getByRole('tab', { name: '本周折页' }).click();
  await expectText(page.locator('#letter-title'), /本周折页/);
  await page.locator('#cabin-note').fill('今天有点累，但还是完成了一件小事。');
  await page.getByRole('button', { name: /寄给小屋/ }).click();
  await page.locator('[data-letter-reply]').waitFor({ state: 'visible' });
  assert.match(await page.locator('[data-letter-reply]').innerText(), /星夜阁楼/);
  check('letter-tabs-and-local-note-reply-work');

  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
  assert(await page.evaluate(() => document.images.length >= 18));
  check('every-promo-image-loads');

  await page.evaluate(() => scrollTo(0, 0));
  await page.locator('[data-room-choice="pixel"]').click();
  await page.locator('[data-weather-choice="clear"]').click();
  await page.locator('[data-time-choice="night"]').click();
  await page.evaluate(() => document.querySelector('[data-toast]')?.classList.remove('is-visible'));
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'desktop must not overflow horizontally');
  await screenshot('promo-desktop');
  await screenshot('promo-story-rooms', page.locator('#rooms'));
  await screenshot('promo-story-naitang', page.locator('#naitang'));
  await screenshot('promo-story-focus', page.locator('#focus'));
  await screenshot('promo-story-letters', page.locator('#letters'));
  check('desktop-responsive-and-evidence-screenshots');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile must not overflow horizontally');
  const mobileHero = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
    const bubble = rect('.hero-cat .cat-bubble');
    const actions = rect('.hero-actions');
    const consoleBox = rect('.scene-console');
    return {
      bubbleActionsOverlap: !(bubble.right <= actions.left || bubble.left >= actions.right || bubble.bottom <= actions.top || bubble.top >= actions.bottom),
      bubbleAboveConsole: bubble.bottom <= consoleBox.top
    };
  });
  assert.equal(mobileHero.bubbleActionsOverlap, false, 'mobile cat bubble must not cover hero actions');
  assert.equal(mobileHero.bubbleAboveConsole, true, 'mobile cat bubble must stay above the scene console');
  const mobileNav = page.locator('.site-header nav');
  assert.equal(await mobileNav.isVisible(), true, 'mobile chapter navigation must stay visible');
  assert.equal(await mobileNav.locator('a').count(), 5);
  const navBox = await mobileNav.boundingBox();
  const viewport = page.viewportSize();
  assert(navBox && viewport && navBox.width <= viewport.width && navBox.y >= 0 && navBox.y + navBox.height <= viewport.height);
  assert(navBox.y > viewport.height * 0.8, 'mobile chapter navigation must sit at the bottom of the viewport');
  const consoleBox = await page.locator('.scene-console').boundingBox();
  assert(consoleBox && consoleBox.y + consoleBox.height <= navBox.y, 'mobile scene controls must stay above the bottom navigation');
  await mobileNav.getByRole('link', { name: '来信' }).click();
  await page.waitForFunction(() => location.hash === '#letters');
  check('mobile-chapter-navigation-is-compact-and-reachable');
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(250);
  await screenshot('promo-mobile');
  await page.locator('#naitang').scrollIntoViewIfNeeded();
  await screenshot('promo-mobile-naitang');
  check('mobile-responsive-and-evidence-screenshots');

  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.consoleErrors, []);
  assert.deepEqual(report.failedRequests, []);
  assert.deepEqual(report.unexpectedRequests, []);
  assert.equal(report.latestReleaseRequests.length, 1);
  check('page-errors-console-errors-failed-and-external-requests-are-zero');

  report.finishedAt = new Date().toISOString();
  report.passed = report.checks.length;
  await fs.writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Promo smoke passed ${report.checks.length}/${report.checks.length}; evidence: ${output}`);
} finally {
  await browser?.close();
  server?.kill();
}

async function expectText(locator, expected) {
  if (expected instanceof RegExp) {
    await locator.waitFor();
    assert.match(await locator.innerText(), expected);
    return;
  }
  await locator.filter({ hasText: expected }).waitFor();
}
