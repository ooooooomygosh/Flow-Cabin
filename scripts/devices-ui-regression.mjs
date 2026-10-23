import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './launch-browser.mjs';
import { onboardingSeed } from './app-version.mjs';
import { hasViteLocalOrigin } from './vite-readiness.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), port = 4299, origin = `http://127.0.0.1:${port}`;
let browser, server, page, log = ''; const errors = [], external = [], checks = [];
const output = path.join(root, 'desktop/test-results/devices-ui'); await fs.mkdir(output, { recursive: true });
const pass = name => { checks.push(name); console.log('PASS ' + name); };
try {
 server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
 server.stdout.on('data', b => log += b); server.stderr.on('data', b => log += b);
 for (let n = 0; ; n++) { if (server.exitCode !== null || n > 100) throw Error(log); if (hasViteLocalOrigin(log, origin) && await fetch(origin).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
 browser = await launchChromium(); const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
 await context.addInitScript(seed => { localStorage.setItem('flow-cabin-onboarding-v1', seed); window.albumDesktopAppearance = { client: true, reduceMotion: true }; window.albumDesktopCapabilities = { lanSync: true, petPacks: true }; window.open = () => null; }, onboardingSeed());
 let enabled = false;
 const pin = 'a'.repeat(64), token = 'b'.repeat(64);
 await context.route('**/*', route => { const u = new URL(route.request().url()); if (u.origin !== origin) { external.push(u.origin); return route.abort(); } const json = value => route.fulfill({ json: value });
  if (u.pathname === '/api/items') return json({ items: [] });
  if (u.pathname === '/desktop-sync/status') return json({ enabled, peers: [], addresses: ['https://192.168.1.2:48321'], pin });
  if (u.pathname === '/desktop-sync/start') { enabled = true; return json({ enabled }); }
  if (u.pathname === '/desktop-sync/stop') { enabled = false; return json({ enabled }); }
  if (u.pathname === '/desktop-sync/invite') { enabled = true; return json({ version: 1, type: 'flow-cabin-pair', pin, token, addresses: ['https://192.168.1.2:48321'], expiresAt: Date.now() + 120000 }); }
  if (u.pathname === '/desktop-sync/stage') return json(route.request().postDataJSON());
  if (u.pathname === '/desktop-pets/packs') return json({ packs: [] });
  if (u.pathname === '/desktop-weather/search') return json({ results: [{ name: 'Melbourne', lat: -37.81, lng: 144.96, zone: 'Australia/Melbourne', country: 'Australia', admin1: 'Victoria' }] });
  if (u.pathname === '/desktop-music/config') return json({ qqLoggedIn: false, neteaseLoggedIn: false });
  if (u.pathname.startsWith('/desktop-music/')) return json({ available: false, folders: [], albumCount: 0, trackCount: 0 });
  return route.continue();
 });
 page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', e => errors.push(e.stack)); await page.goto(origin);
 await page.getByRole('button', { name: '设置', exact: true }).click(); await page.getByRole('tab', { name: '同步与设备', exact: true }).click();
 await page.getByRole('button', { name: '开启局域网接收', exact: true }).click(); await page.getByRole('button', { name: '生成 2 分钟配对码', exact: true }).click();
 await page.getByAltText('两分钟有效的心流小屋配对二维码').waitFor();
 assert.match(await page.getByAltText('两分钟有效的心流小屋配对二维码').getAttribute('src'), /^data:image\/png;base64,/);
 assert.equal(await page.getByRole('button', { name: '扫描另一台小屋的二维码', exact: true }).count(), 1);
 await page.screenshot({ path: path.join(output, 'local-pairing.png') }); pass('advertised native capability opens explicit LAN pairing and generates QR locally');
 await page.getByRole('button', { name: '关闭接收', exact: true }).click(); assert.equal(enabled, false); pass('receiving remains an explicit reversible setting');
 await page.getByRole('tab', { name: '房间与桌宠', exact: true }).click();
 await page.getByRole('region', { name: '宠物动画包', exact: true }).waitFor();
 assert.equal(await page.locator('input[type=file][accept*=".zip"]').isEnabled(), true); pass('pet-pack JSON and ZIP import is wired into real settings');
 await page.getByRole('button', { name: '走进生活小屋', exact: true }).click(); await page.getByRole('dialog', { name: '生活小屋', exact: true }).waitFor();
 await page.locator('.room2-canvas[data-art-ready=true]').waitFor(); assert.equal(await page.locator('.room2-header').count(), 0); pass('production settings entry opens the immersive scene without the old control bar');
 await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog', { name: '生活小屋', exact: true }).count(), 0);
 assert.deepEqual(errors, []); assert.deepEqual(external, []); pass('no runtime errors or external requests');
 await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ passed: true, fixtureData: true, checks, errors, external }, null, 2));
} catch(error) { console.error('DEVICE SETTINGS FAILURE', errors, await page?.locator('body').innerText()); throw error; } finally { await browser?.close(); server?.kill(); }
