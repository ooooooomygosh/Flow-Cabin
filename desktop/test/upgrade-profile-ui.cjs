'use strict';
// Replace an installed bundle in an isolated directory, retaining its actual profile.
// No user installation, account, update server, or real collection is modified.
const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { openAddToShelf } = require('./ui-fixture.cjs');

const root = path.resolve(__dirname, '../..');
const output = path.resolve(process.env.ALBUM_QA_EVIDENCE || path.join(root, 'desktop/test-results/upgrade'));
const oldBundle = process.env.ALBUM_QA_OLD_APP;
const newBundle = process.env.ALBUM_QA_NEW_APP;
const origin = 'https://album-circle.vercel.app';
const keys = {
  focus: 'album-circle-focus-v1:local-owner',
  study: 'album-circle-study-v1:local-owner',
  library: 'album-circle-library-v1-local-owner'
};
let application, site;
const report = {
  startedAt: new Date().toISOString(), passed: false, checks: [], runtimes: [], comparisons: [],
  pageErrors: [], syntheticData: true, isolatedInstallation: true, mockKeychain: false,
  automaticUpdaterTested: false, realAccountTested: false,
  limitations: ['Bundle replacement in a temporary installation directory; no OS installer or automatic updater.',
    'Synthetic collection and learning data; no accounts or permission grants.']
};
const check = (name, detail = {}) => { report.checks.push({ name, passed: true, ...detail }); console.log('PASS ' + name); };
const moduleAt = name => import(pathToFileURL(path.join(root, 'src', name)).href);
const sha256 = filename => crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');

function install(bundle, destination) {
  assert.ok(fs.statSync(bundle).isDirectory());
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle], { stdio: 'pipe' });
  execFileSync('/usr/bin/ditto', [bundle, destination], { stdio: 'pipe' });
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', destination], { stdio: 'pipe' });
  return sha256(path.join(destination, 'Contents/Resources/app.asar'));
}
async function close() {
  if (application) await application.close();
  application = null; site = null;
}
async function launch(phase) {
  const env = { ...process.env, ALBUM_DESKTOP_TEST_PROFILE: report.profile, PORT: '0', HOST: '127.0.0.1' };
  delete env.ELECTRON_RUN_AS_NODE;
  application = await _electron.launch({ executablePath: report.executable, args: [], env, timeout: 30000 });
  const runtime = await application.evaluate(({ app, powerMonitor }) => ({
    packaged: app.isPackaged, version: app.getVersion(), executable: process.execPath,
    profile: app.getPath('userData'), arch: process.arch, idleState: powerMonitor.getSystemIdleState(60)
  }));
  report.runtimes.push({ phase, ...runtime });
  assert.equal(runtime.packaged, true);
  assert.equal(runtime.profile, report.profile);
  if (runtime.idleState === 'locked') {
    report.blocked = 'mac-locked';
    throw new Error('Unlock the Mac manually before running the native upgrade acceptance.');
  }
  await application.firstWindow();
  await application.evaluate(async ({ webContents }, origin) => {
    for (let attempt = 0; attempt < 300; attempt++) {
      if (webContents.getAllWebContents().some(contents => contents.getURL().startsWith(origin))) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Packaged content window did not open');
  }, origin);
  site = application.windows().find(page => page.url().startsWith(origin));
  assert.ok(site);
  site.on('pageerror', error => report.pageErrors.push({ phase, message: error.message }));
  site.setDefaultTimeout(20000);
  await site.locator('.app-titlebar').waitFor();
  const onboarding = site.getByRole('dialog', { name: '新手引导', exact: true });
  const needsOnboarding = await site.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('flow-cabin-onboarding-v1') || 'null');
    return !state || ['new', 'active'].includes(state.status);
  });
  if (needsOnboarding) await onboarding.waitFor();
  if (await onboarding.isVisible()) await onboarding.getByRole('button', { name: '跳过引导', exact: true }).click();
  await site.locator('.cabin-room').waitFor();
  return runtime;
}
async function snapshot(stage) {
  const data = await site.evaluate(async keys => {
    const response = await fetch('/api/items');
    if (!response.ok) throw new Error('Collection API failed');
    return {
      items: (await response.json()).items,
      stores: Object.fromEntries(Object.entries(keys).map(([name, key]) => [name, JSON.parse(localStorage.getItem(key))]))
    };
  }, keys);
  const diskItems = JSON.parse(fs.readFileSync(path.join(report.profile, 'collection.json'), 'utf8')).items;
  assert.deepEqual(data.items, diskItems, 'Collection API and actual disk data must agree');
  fs.writeFileSync(path.join(output, `${stage}.json`), JSON.stringify(data, null, 2));
  return data;
}
function compare(stage, expected, actual) {
  for (const [name, left, right] of [
    ['collection', expected.items, actual.items],
    ...Object.keys(keys).map(name => [name, expected.stores[name], actual.stores[name]])
  ]) {
    const result = { stage, name, passed: false };
    report.comparisons.push(result);
    assert.deepEqual(right, left, `${stage}: ${name} changed during replacement`);
    result.passed = true;
  }
}
async function main() {
  assert.equal(process.platform, 'darwin', 'This installation replacement test targets macOS');
  assert.ok(oldBundle && newBundle, 'Set ALBUM_QA_OLD_APP and ALBUM_QA_NEW_APP to existing packaged .app directories');
  assert.notEqual(fs.realpathSync(oldBundle), fs.realpathSync(newBundle));
  fs.mkdirSync(output, { recursive: true });
  report.installation = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-cabin-upgrade-'));
  report.profile = path.join(report.installation, 'profile');
  const installed = path.join(report.installation, 'Applications', '心流小屋.app');
  report.executable = path.join(installed, 'Contents/MacOS/心流小屋');
  report.oldArchiveSha256 = install(oldBundle, installed);
  const oldRuntime = await launch('released-old-version');
  const add = await openAddToShelf(site, '手动填写');
  await add.getByLabel('专辑名').fill('Upgrade acceptance album');
  await add.getByLabel('歌手').fill('Offline fixture');
  await add.getByLabel('曲目').fill('A preserved first track\nA preserved second track');
  await add.getByRole('button', { name: /放上唱片架/ }).click();
  await add.locator('.add-notice', { hasText: 'Upgrade acceptance album' }).waitFor();
  await add.getByRole('button', { name: '关闭添加到唱片架' }).click();
  const [focus, study, library] = await Promise.all([
    moduleAt('focus/focus-model.mjs'), moduleAt('study/study-model.mjs'), moduleAt('record-library.mjs')
  ]);
  const at = Date.now() - 60000;
  const studyState = study.review(study.normalizeStudy({
    decks: [{ id: 'upgrade-book', name: 'Preserved wordbook', createdAt: at }],
    cards: [{ id: 'upgrade-card', deckId: 'upgrade-book', front: 'window', back: 'a view outside', createdAt: at }],
    newPerDay: 7
  }), 'upgrade-card', study.RATINGS[2].rating, at, { fuzz: false });
  const data = {
    focus: focus.normalizeFocus({ notes: 'A note from the installed old version.',
      tasks: [{ id: 'upgrade-task', text: 'A preserved task', createdAt: at, done: false }],
      settings: { focusMin: 50, shortMin: 10, notify: false, chime: false, catSkin: 'black' },
      rewards: { xp: 60, fish: 7, equipped: { accessory: 'scarf', weather: 'snow' } } }),
    study: studyState,
    library: library.normalizeLibrary({ rooms: { 'local-room': { look: 'forest', petId: 'bunny' } } })
  };
  await site.evaluate(({ keys, data }) => {
    for (const [domain, key] of Object.entries(keys)) localStorage.setItem(key, JSON.stringify(data[domain]));
  }, { keys, data });
  // The packaged renderer reads its profile at startup. Reopen it so the new
  // focus/study/library values are the ones persisted by the old application.
  await close();
  await launch('released-old-version-after-fixture');
  await site.reload(); await site.locator('.cabin-room').waitFor();
  const before = await snapshot('before-upgrade');
  assert.equal(before.items.length, 1);
  assert.equal(before.stores.focus.notes, data.focus.notes);
  assert.ok(before.stores.study.cards[0].memory.reps > 0);
  await site.screenshot({ path: path.join(output, 'old-version.png') });
  check('released-application-created-real-collection-and-profile', { version: oldRuntime.version });
  await close();

  fs.renameSync(installed, path.join(report.installation, 'previous-version.app'));
  report.newArchiveSha256 = install(newBundle, installed);
  assert.notEqual(report.oldArchiveSha256, report.newArchiveSha256);
  const newRuntime = await launch('replaced-application');
  assert.notEqual(oldRuntime.version, newRuntime.version, 'Supply distinct released and target versions');
  compare('after-replacement', before, await snapshot('after-upgrade'));
  await site.screenshot({ path: path.join(output, 'new-version.png') });
  check('same-installation-path-and-profile-retain-data', { from: oldRuntime.version, to: newRuntime.version });
  await close();
  await launch('target-restart');
  compare('after-target-restart', before, await snapshot('after-restart'));
  check('target-version-restart-retains-data');
  assert.equal(report.pageErrors.length, 0, JSON.stringify(report.pageErrors));
  report.passed = true;
}
if (require.main === module) {
  main().catch(error => { report.error = error.stack; process.exitCode = 1; }).finally(async () => {
    await close().catch(error => { report.passed = false; report.closeError = error.message; process.exitCode = 1; });
    fs.mkdirSync(output, { recursive: true });
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  });
}
