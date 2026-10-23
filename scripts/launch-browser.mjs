import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * One Chromium launcher for every browser script.
 * Chromium on Linux derives its filesystem encoding from LANG/LC_*: under the C/POSIX locale a CJK download name
 * such as 「小屋词书模板.tsv」 cannot be represented and is saved as `download`. Force a UTF-8 locale when the shell has none.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const { chromium } = createRequire(path.join(root, 'desktop/package.json'))('playwright');
export const BROWSER_ARGS = ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required'];

export const isUtf8Locale = (env = process.env) => /utf-?8/i.test(env.LC_ALL || env.LC_CTYPE || env.LANG || '');
export const browserEnv = (env = process.env) => isUtf8Locale(env) ? { ...env } : { ...env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' };
export function browserExecutable(env = process.env, exists = existsSync) {
  if (env.BROWSER_EXECUTABLE) return env.BROWSER_EXECUTABLE;
  if (!env.CI && exists('/usr/bin/chromium')) return '/usr/bin/chromium';
  return chromium.executablePath();
}

// Since 2.2 the life cabin is the default home. Most browser regressions exercise the
// classic shelf, so every context starts there unless a script asks for the real
// default (`defaultHome: null`) or sets 'beta' itself (its own init script runs later).
export const INTERFACE_KEY = 'flow-cabin-interface-v1';
export const pinHome = (mode) => mode ? `if (localStorage.getItem(${JSON.stringify(INTERFACE_KEY)}) === null) localStorage.setItem(${JSON.stringify(INTERFACE_KEY)}, ${JSON.stringify(mode)});` : '';
export async function launchChromium({ defaultHome = 'classic', ...options } = {}) {
  const browser = await chromium.launch({ headless: true, executablePath: browserExecutable(), env: browserEnv(), ...options, args: [...BROWSER_ARGS, ...(options.args || [])] });
  if (!defaultHome) return browser;
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...args) => { const context = await newContext(...args); await context.addInitScript({ content: `try { ${pinHome(defaultHome)} } catch {}` }); return context; };
  return browser;
}
