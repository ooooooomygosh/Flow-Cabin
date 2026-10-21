import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'desktop/package.json'));
const { build } = require('esbuild');
const out = path.join(root, 'android/app/src/main/assets/cabin-backend');
await fs.mkdir(out, { recursive: true });
await build({ entryPoints: [path.join(root, 'mobile/backend/main.cjs')], outfile: path.join(out, 'main.cjs'), bundle: true, platform: 'node', format: 'cjs', target: 'node24', packages: 'external', drop: ['console'], legalComments: 'eof', plugins: [{ name: 'portable-version', setup(builder) { builder.onResolve({ filter: /^NeteaseCloudMusicApi$/ }, () => ({ path: path.join(root, 'mobile/backend/ncm.cjs') })); builder.onLoad({ filter: /catalog-search\.mjs$/ }, async args => ({ contents: (await fs.readFile(args.path, 'utf8')).replace(/createRequire\(import\.meta\.url\)\('\.\/package\.json'\)/, JSON.stringify(JSON.parse(await fs.readFile(path.join(root, 'desktop/package.json'), 'utf8')))), loader: 'js' })); } }] });
// Preserve the exact Portable dependency versions, including license files.
// Dynamic NCM endpoint loading needs its module directory, so do not pretend
// that copying only its main.js is a complete runtime dependency graph.
const copied = new Set();
async function copyPackage(name, from) {
  const resolver = createRequire(path.join(from, 'package.json'));
  const search = resolver.resolve.paths(name) || [];
  let source;
  for (const directory of search) { try { await fs.access(path.join(directory, name, 'package.json')); source = path.join(directory, name); break; } catch {} }
  if (!source) throw new Error('Missing Portable dependency: ' + name);
  let meta;
  for (;;) { try { meta = JSON.parse(await fs.readFile(path.join(source, 'package.json'), 'utf8')); if (meta.name === name) break; } catch {} const parent = path.dirname(source); if (parent === source) throw new Error('Cannot locate package ' + name); source = parent; }
  const relative = path.relative(path.join(root, 'desktop/node_modules'), source);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Dependency outside the Portable tree: ' + name);
  const destination = path.join(out, 'node_modules', relative);
  if (copied.has(destination)) return; copied.add(destination);
  await fs.cp(source, destination, { recursive: true, dereference: true, filter: value => !path.relative(source, value).split(path.sep).includes('node_modules') });
  for (const dep of Object.keys(meta.dependencies || {})) await copyPackage(dep, source);
}
await copyPackage('NeteaseCloudMusicApi', path.join(root, 'desktop'));
await fs.cp(path.join(root, 'mobile/licenses'), path.join(out, 'licenses'), { recursive: true });
await fs.copyFile(path.join(root, 'LICENSE'), path.join(out, 'licenses/Flow-Cabin-LICENSE.txt'));
await fs.copyFile(path.join(root, 'desktop/vendor/simple-music/LICENSE'), path.join(out, 'licenses/Simple-Music-LICENSE.txt'));
await fs.copyFile(path.join(root, 'mobile/THIRD-PARTY.md'), path.join(out, 'licenses/THIRD-PARTY.md'));
const fingerprint = createHash('sha256').update(await fs.readFile(path.join(out, 'main.cjs'))).update(await fs.readFile(path.join(root, 'desktop/package-lock.json'))).digest('hex').slice(0, 20);
await fs.writeFile(path.join(out, 'runtime-id.txt'), fingerprint);
console.log(`Portable music backend and ${copied.size} dependency locations bundled.`);
