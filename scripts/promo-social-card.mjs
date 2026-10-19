/** Rebuild the 1200×630 social preview from the real promo page.
 * External requests are blocked on purpose so the static v1.21.1 fallback is
 * what appears in the card, rather than a release API fixture.
 */
import { launchChromium } from './launch-browser.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'public/promo/social-card.jpg');
const port = Number(process.env.PROMO_SOCIAL_PORT || 4223), origin = `http://127.0.0.1:${port}`;
let server, browser;

try {
  server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    if (attempt > 120) throw new Error('Vite did not start');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await launchChromium();
  const context = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, locale: 'zh-CN', reducedMotion: 'reduce' });
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.origin === origin ? route.continue() : route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  await page.goto(`${origin}/promo.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.getByText('v1.21.1', { exact: true }).first().waitFor();
  await page.screenshot({ path: output, type: 'jpeg', quality: 92, animations: 'disabled' });
  await fs.access(output);
  console.log(`Social card written to ${output}`);
} finally {
  await browser?.close();
  server?.kill();
}
