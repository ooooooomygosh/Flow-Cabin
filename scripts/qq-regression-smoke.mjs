/** Isolated production-bundle check; no native windows, profile, or external services. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { verifyFullscreenStudy } from './fullscreen-study-checks.mjs';
import { verifyQQRegression } from './qq-regression-checks.mjs';
const require = createRequire(new URL('../desktop/package.json', import.meta.url));
const { chromium } = require('playwright');
const root = path.resolve('dist');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const p = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + (p === '/' ? '/index.html' : p));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const body = await readFile(file); res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
let browser;
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
  await verifyFullscreenStudy({ browser, origin: `http://127.0.0.1:${server.address().port}`, output: process.env.BROWSER_OUTPUT, check: name => console.log('PASS '+name) });
  await verifyQQRegression({ browser, origin: `http://127.0.0.1:${server.address().port}`, check: name => console.log('PASS '+name) });
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
