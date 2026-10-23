/** Exercise the shipped chunks under the native no-eval Content Security Policy. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './launch-browser.mjs';
import { onboardingSeed } from './app-version.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'desktop/test-results/room-production');
const origin = 'http://127.0.0.1:4291';
const source = await fs.readFile(path.join(root, 'scripts/android-prepare.mjs'), 'utf8');
const policy = source.match(/const csp = "([^"]+)";/)?.[1];
assert.ok(policy && !policy.includes('unsafe-eval') && policy.includes("worker-src 'self' blob:"));
const report = { checks: [], pageErrors: [], consoleErrors: [], externalRequests: [] };
let server, browser, page;
const pass = name => { report.checks.push(name); console.log('PASS ' + name); };
await fs.mkdir(output, { recursive: true });
try {
  server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '4291', '--strictPort'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; ; i++) {
    if (server.exitCode !== null || i > 100) throw Error('Production preview did not start');
    if (await fetch(origin).then(r => r.ok, () => false)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await launchChromium();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN', reducedMotion: 'reduce' });
  await context.addInitScript(seed => localStorage.setItem('flow-cabin-onboarding-v1', seed), onboardingSeed());
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { report.externalRequests.push(url.origin); return route.abort(); }
    if (route.request().resourceType() === 'document') {
      const response = await route.fetch();
      return route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': policy } });
    }
    return route.continue();
  });
  page = await context.newPage(); page.setDefaultTimeout(20000);
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
  await page.goto(origin);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('tab', { name: '房间与桌宠', exact: true }).click();
  await page.getByRole('button', { name: '走进生活小屋', exact: true }).click();
  await page.locator('.room2-canvas[data-art-ready=true]').waitFor();
  await page.locator('.room2-canvas[data-pet-art=cat]').waitFor();
  assert.equal(await page.locator('.room2-fallback').count(), 0);
  assert.equal(await page.locator('.room2-canvas canvas').count(), 1);
  assert.equal(await page.locator('.room2-header, .room2-experience > .room2-tools').count(), 0);
  await page.screenshot({ path: path.join(output, 'native-csp-desktop.png') });
  pass('production-room-renders-under-native-no-eval-csp');
  await page.setViewportSize({ width: 412, height: 915 });
  await page.getByRole('button', { name: '小屋布置与视角', exact: true }).click();
  await page.getByLabel('房间主题').selectOption('warm');
  await page.getByRole('button', { name: '关闭小屋布置', exact: true }).click();
  await page.locator('.room2-canvas[data-art-theme=warm][data-art-ready=true]').waitFor();
  await page.getByRole('button', { name: '回到宠物', exact: true }).click();
  await page.screenshot({ path: path.join(output, 'native-csp-phone.png') });
  pass('production-phone-room-and-drawer-work-under-native-csp');
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.consoleErrors, []); assert.deepEqual(report.externalRequests, []);
  pass('no-script-eval-worker-or-rendering-errors');
} catch (error) {
  report.error = error.stack; console.error(error); process.exitCode = 1;
  await page?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser?.close(); server?.kill();
}
