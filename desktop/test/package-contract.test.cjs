const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const desktop = path.resolve(__dirname, '..');
const { build } = require('../package.json');
test('explicitly packaged runtime modules include their static relative imports', () => {
  const packaged = new Set(build.files.filter(name => !name.includes('*')));
  for (const name of packaged) {
    assert(fs.existsSync(path.join(desktop, name)), `Missing packaged file: ${name}`);
    if (!/\.(cjs|mjs)$/.test(name)) continue;
    const source = fs.readFileSync(path.join(desktop, name), 'utf8');
    const imports = [...source.matchAll(/(?:require\(\s*|from\s+|import\(\s*)['"](\.\.?\/[^'"]+\.(?:cjs|mjs|json))['"]/g)];
    for (const match of imports) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(name), match[1]));
      assert(packaged.has(target), `${name} imports ${target}, which is missing from Electron build.files`);
    }
  }
});
test('disposable preview scripts are not desktop release inputs', () => {
  assert(build.files.every(name => !name.startsWith('../scripts/') && !name.includes('preview-fixture') && !name.includes('preview-self-test')));
  const index = fs.readFileSync(path.join(desktop, '../index.html'), 'utf8');
  assert(!index.includes('qa-preview') && !index.includes('qa-self-test'));
});
test('the narrowed node-forge adapter is included in packaged apps', () => {
  assert(build.files.includes('vendor/node-forge-encrypt-only/**/*'));
  const pkg = require('../package.json');
  assert.equal(pkg.dependencies['node-forge'], 'file:./vendor/node-forge-encrypt-only');
  assert.equal(pkg.overrides['node-forge'], '$node-forge');
  assert(fs.realpathSync(require.resolve('node-forge')).startsWith(path.join(desktop, 'vendor/node-forge-encrypt-only') + path.sep));
  assert(fs.existsSync(path.join(desktop, 'vendor/node-forge-encrypt-only/index.cjs')));
});
