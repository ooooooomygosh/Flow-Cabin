/** Exercise the shipped chunks under the native no-eval Content Security Policy. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './launch-browser.mjs';
import { onboardingSeed } from './app-version.mjs';
import { lookUp, backToDesk, drawer } from './settings-actions.mjs';
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
  await page.locator('.desk-home.is-lit').waitFor();
  assert.equal(await page.locator('.app-error, .app-startup-error').count(), 0);
  // Every piece of the desk decoded (they are <img>s; the clock's glass is a canvas).
  assert.equal(await page.locator('.desk-home img').evaluateAll(images => images.filter(image => !image.complete || !image.naturalWidth).map(image => image.src)).then(bad => bad.length), 0);
  await page.screenshot({path:path.join(output,'native-csp-desktop.png')});pass('production-home-renders-under-native-no-eval-csp');
  // DEsk's films (a canvas over the desk) and views, up and back down, many times over.
  for(let i=0;i<30;i++){
    await lookUp(page,['shelf','console','post'][i%3]);
    assert.equal(await page.locator('.desk-film').count(),1);
    await backToDesk(page);
  }
  assert.equal(await page.locator('.desk-film, .desk-look').count(),0);pass('30-production-looks-up-and-back-leave-no-film-or-view-behind');
  await page.addStyleTag({content:await fs.readFile(path.join(root,'src/mobile/mobile.css'),'utf8')});
  await page.setViewportSize({width:412,height:915});
  await page.evaluate(()=>{document.documentElement.dataset.platform='android';document.documentElement.style.setProperty('--safe-area-inset-top','48px');document.documentElement.style.setProperty('--mobile-bottom','24px');document.documentElement.style.setProperty('--safe-area-inset-bottom','24px');window.dispatchEvent(new Event('resize'));});
  // The desk keeps clear of the status bar (48) and the gesture bar (24): the back edge starts under one, the pull ends above the other.
  await page.waitForFunction(()=>document.querySelector('.desk-pull').getBoundingClientRect().bottom<=891.5);
  for(const selector of ['.desk-clock-face','.desk-console-plate','.desk-post, .desk-post-plate','.desk-shelf-plate']){const box=await page.locator(selector).boundingBox();assert.ok(box.y>=48,`${selector} ${JSON.stringify(box)}`);}
  { const pull=await page.locator('.desk-pull').boundingBox();assert.ok(pull.y+pull.height<=891.5&&pull.y>=48,JSON.stringify(pull)); }
  // The phone reaches 随手记 the way a user does: the LED clock opens the 专注 panel, 这一段 holds the memo pad.
  await page.locator('.focus-badge').click();await page.getByRole('tab',{name:'这一段',exact:true}).click();await page.getByRole('textbox',{name:'随手记内容',exact:true}).waitFor();
  const sheet=page.getByRole('dialog',{name:'专注',exact:true}),inner=sheet.locator('.focus-dock');assert.equal(await inner.evaluate(n=>getComputedStyle(n).position),'static');
  const heading=await sheet.locator('.cabin-dialog-header').boundingBox(),innerRect=await inner.boundingBox();assert.ok(innerRect.y>=heading.y+heading.height-1);
  { const box=await sheet.boundingBox();assert.ok(box.y>=48&&box.y+box.height<=892,JSON.stringify(box)); }
  await sheet.locator('.cabin-dialog-close').click();
  // The drawer opens above the gesture bar.
  await page.locator('.desk-pull').click();await drawer(page).waitFor();
  for(const name of ['唱片日记','设置']){const box=await drawer(page).getByRole('button',{name,exact:true}).boundingBox();assert.ok(box.y>=48&&box.y+box.height<=891.5,`${name} ${JSON.stringify(box)}`);}
  await page.keyboard.press('Escape');
  await page.screenshot({path:path.join(output,'native-csp-phone.png')});pass('phone-desk-and-panels-respect-native-safe-areas');
  await page.setViewportSize({width:915,height:412});await page.locator('.desk-home.is-lit').waitFor();
  await page.screenshot({path:path.join(output,'native-csp-landscape.png')});
  for(const selector of ['.desk-clock-face','.desk-console-plate','.desk-post, .desk-post-plate','.desk-shelf-plate','.desk-pull']){const box=await page.locator(selector).boundingBox();assert.ok(box.x>=0&&box.y>=48&&box.x+box.width<=915&&box.y+box.height<=388.5,`${selector} ${JSON.stringify(box)}`);}
  pass('landscape-keeps-the-desk-reachable');
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.consoleErrors, []); assert.deepEqual(report.externalRequests, []);
  pass('no-script-eval-worker-or-rendering-errors');
} catch (error) {
  report.error = error.stack; console.error(error); process.exitCode = 1;
  await page?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser?.close(); server?.kill();
}
