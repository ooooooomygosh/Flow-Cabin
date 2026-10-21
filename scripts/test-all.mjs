// Run both suites even when one fails, with a truthful combined exit status.
import { spawnSync } from 'node:child_process';
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run this script with npm test.');
let failed = false;
for (const args of [['--prefix', 'desktop', 'test'], ['run', 'test:unit'], ['run', 'test:mobile']]) {
  const result = spawnSync(process.execPath, [npm, ...args], { stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
