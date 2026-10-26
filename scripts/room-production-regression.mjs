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
  await context.addInitScript(()=>localStorage.setItem('flow-cabin-interface-v1','beta'));
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
  await page.locator('.home-canvas[data-art-ready=true]').waitFor();
  assert.equal(await page.locator('.home-canvas>canvas').count(),1); assert.equal(await page.locator('.home-scene-error').count(),0);
  await page.getByRole('button',{name:'知道了',exact:true}).click();
  await page.screenshot({path:path.join(output,'native-csp-desktop.png')});pass('production-home-renders-under-native-no-eval-csp');
  const {THEMES}=await import('../src/home/spatial-layout.mjs');
  for(let i=0;i<50;i++){
    const theme=THEMES[i%THEMES.length];
    await page.locator('.home-room-name').click();await page.getByRole('menuitem',{name:/^选择小屋/}).click(); // 3.0: the room name opens a small menu
    await page.getByRole('dialog',{name:'选择小屋',exact:true}).getByRole('button',{name:theme.name,exact:true}).click();
    await page.locator(`.home-canvas[data-art-theme="${theme.id}"][data-art-ready=true]`).waitFor();
  }
  assert.equal(await page.locator('.home-canvas>canvas').count(),1);pass('50-production-theme-switches-retain-one-Pixi-canvas-without-resource-errors');
  await page.addStyleTag({content:await fs.readFile(path.join(root,'src/mobile/mobile.css'),'utf8')});
  await page.setViewportSize({width:412,height:915});
  await page.evaluate(()=>{document.documentElement.dataset.platform='android';document.documentElement.style.setProperty('--safe-area-inset-top','48px');document.documentElement.style.setProperty('--mobile-bottom','24px');document.documentElement.style.setProperty('--safe-area-inset-bottom','24px');});
  const header=await page.locator('.home-header').boundingBox();assert.ok(header.y>=48);
  await page.locator('.home-room-name').click();await page.getByRole('menuitem',{name:/^布置小屋/}).click();
  const drawer=await page.getByRole('dialog',{name:'布置小屋',exact:true}).boundingBox();assert.ok(drawer.y>=48&&drawer.y+drawer.height<=892,JSON.stringify(drawer));
  await page.getByRole('dialog').getByRole('button',{name:'完成布置',exact:true}).click();
  await page.getByRole('navigation',{name:'房间区域'}).getByRole('button',{name:'工作角',exact:true}).click();await page.locator('.corner-clock').waitFor();
  await page.getByRole('button',{name:'随手记',exact:true}).first().click();
  const sheet=page.getByRole('dialog'),inner=sheet.locator('.focus-dock');assert.equal(await inner.evaluate(n=>getComputedStyle(n).position),'static');
  const heading=await sheet.locator('.cabin-dialog-header').boundingBox(),innerRect=await inner.boundingBox();assert.ok(innerRect.y>=heading.y+heading.height-1);
  await sheet.locator('.cabin-dialog-close').click();
  await page.screenshot({path:path.join(output,'native-csp-phone.png')});pass('phone-home-and-editor-respect-native-safe-areas');
  await page.setViewportSize({width:915,height:412});await page.getByRole('navigation',{name:'房间区域'}).getByRole('button',{name:'工作角',exact:true}).click();await page.locator('.corner-clock').waitFor();
  await page.screenshot({path:path.join(output,'native-csp-landscape.png')});
  const primary=await page.locator('.corner-primary').boundingBox();assert.ok(primary.x>=0&&primary.y>=0&&primary.x+primary.width<=915&&primary.y+primary.height<=388);
  pass('landscape-keeps-full-screen-corner-and-primary-controls-reachable');
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.consoleErrors, []); assert.deepEqual(report.externalRequests, []);
  pass('no-script-eval-worker-or-rendering-errors');
} catch (error) {
  report.error = error.stack; console.error(error); process.exitCode = 1;
  await page?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser?.close(); server?.kill();
}
