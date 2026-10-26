import { openRoomSettings, closeSettings } from './settings-actions.mjs';
/** Hidden Electron QA: real webContents zoom, no OS inputs/accounts/bridges. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { verifyCabinLayout, verifyCabinToolActions, verifyFocusLayout } from './cabin-layout-checks.mjs';
import { pinHome } from './launch-browser.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'desktop/package.json'));
const { _electron } = require('playwright');
const executablePath = process.env.ELECTRON_EXECUTABLE || require('electron');
const output = path.resolve(process.env.LAYOUT_OUTPUT || path.join(root, 'desktop/test-results/cabin-layout'));
const port = Number(process.env.LAYOUT_PORT || 4190), origin = `http://127.0.0.1:${port}`;
await fs.mkdir(output, { recursive:true });
const report = { windowShown:false, realElectronZoom:true, fixturesOnly:true, cases:[], errors:[] };
const server = spawn(process.execPath, [path.join(root,'node_modules/vite/bin/vite.js'), '--host','127.0.0.1','--port',String(port),'--strictPort'], { cwd:root, windowsHide:true, stdio:['ignore','pipe','pipe'] });
let serverLog = '';
for (const stream of [server.stdout,server.stderr]) stream.on('data', chunk => { serverLog = (serverLog + chunk).slice(-4000); });
let electron, page;
// capturePage uses the complete native content bounds at non-100% zoom.
// Playwright's viewport screenshot can crop an offscreen Electron surface.
const screenshot = async name => {
  const png = await electron.evaluate(async ({BrowserWindow}) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
  await fs.writeFile(path.join(output,name),Buffer.from(png,'base64'));
};
try {
  let ready = false;
  for (let i=0;i<100;i++) { if (serverLog.includes(origin) && server.exitCode === null) { ready=true; break; } await new Promise(r=>setTimeout(r,100)); }
  assert(ready, `isolated fixture server must start: ${serverLog}`);
  electron = await _electron.launch({ executablePath, args:[path.join(root,'scripts/cabin-layout-main.cjs')] });
  page = await electron.firstWindow();
  // This checks the classic shelf's cabin; the life cabin is the default home since 2.2 (as launchChromium pins it).
  await page.addInitScript({ content:`try { ${pinHome('classic')} } catch {}` });
  await page.addInitScript({ path:path.join(root,'scripts/preview-fixture.js') });
  await page.route('**/*', r => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
  page.on('pageerror', e => report.errors.push(e.message));
  await page.goto(origin); await page.locator('.room-record').first().waitFor();
  await verifyCabinToolActions({page});
  for (const [width,height] of [[1440,900],[960,600],[1920,1080],[2560,1440]]) for (const zoom of [.75,1,1.25,1.5]) {
    await electron.evaluate(({BrowserWindow},size) => { const w=BrowserWindow.getAllWindows()[0]; w.setContentSize(size.width,size.height); w.webContents.setZoomFactor(size.zoom); }, {width,height,zoom});
    await page.waitForTimeout(400);
    const card = await verifyCabinLayout({page}); await verifyFocusLayout({page});
    const name = `${width}x${height}-${zoom}`;
    await screenshot(`${name}-closed.png`);
    await page.locator('.focus-badge').click();
    const tabs = [];
    // 3.0 focus panel: 这一段 (timer + 便签) / 待办 / 声音; 统计 lives in 唱片日记.
    for (const tab of ['这一段','待办','声音']) {
      await page.getByRole('tab',{name:tab,exact:true}).click(); await page.waitForTimeout(200);
      await verifyCabinLayout({page}); tabs.push({tab,...await verifyFocusLayout({page})});
      if (tab==='这一段'||tab==='待办') await screenshot(`${name}-${tab}.png`);
    }
    await page.keyboard.press('Escape'); assert.equal(await page.locator('.focus-dock').count(),0);
    assert.equal(await page.locator('.focus-badge').getAttribute('aria-expanded'),'false');
    report.cases.push({width,height,zoom,card,tabs}); console.log(`PASS hidden Electron ${name}: three tabs and collapse`);
  }
  await electron.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(1440,900);w.webContents.setZoomFactor(1);});
  await openRoomSettings(page); await page.getByRole('button',{name:'选择场景 月夜书桌',exact:true}).click(); await closeSettings(page);
  await page.waitForTimeout(400); await verifyCabinLayout({page});
  await screenshot('night-study-1440x900.png');
  await page.keyboard.press('h'); await page.locator('.focus-badge').click(); await page.waitForTimeout(400); await verifyFocusLayout({page});
  await page.keyboard.press('Escape'); await page.keyboard.press('h');
  assert.deepEqual(report.errors,[]); report.passed=true;
} catch (error) {
  report.passed=false; report.error=error.stack; process.exitCode=1; console.error(error);
  if (page) await screenshot('failure.png').catch(()=>{});
} finally {
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  await electron?.close(); server.kill();
}
