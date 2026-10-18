'use strict';
// Real Electron profiles and the production backup UI; only source data is seeded.
const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { openAddToShelf } = require('./ui-fixture.cjs');
const desktop = path.resolve(process.env.ALBUM_QA_DESKTOP || path.join(__dirname, '..'));
const output = path.resolve(process.env.ALBUM_QA_EVIDENCE || path.join(desktop, 'test-results/backup-profile-ui'));
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(path.join(desktop, 'test-results'), { recursive: true });
const profiles = fs.mkdtempSync(path.join(desktop, 'test-results/backup-profiles-'));
const sourceProfile = path.join(profiles, 'source'), targetProfile = path.join(profiles, 'target');
const packagedExecutable = process.env.ALBUM_QA_EXE ? path.resolve(process.env.ALBUM_QA_EXE) : '';
const mockKeychain = process.env.ALBUM_QA_MOCK_KEYCHAIN === '1';
const report = { startedAt: new Date().toISOString(), desktop, sourceProfile, targetProfile,
  packagedExecutable: packagedExecutable || null, launchMode: packagedExecutable ? 'packaged' : 'electron-entry',
  mockKeychain, credentialsTested: false,
  syntheticSourceData: true, realBackupUI: true, realCollectionStore: true, checks: [], comparisons: [], pageErrors: [] };
let app, site;
const save = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2));
const check = name => { report.checks.push({ name, passed: true }); console.log('PASS ' + name); };
const moduleAt = name => import(pathToFileURL(path.join(desktop, '../src', name)).href);
let keys;
async function launch(profile) {
  const env = { ...process.env, ALBUM_DESKTOP_TEST_PROFILE: profile, PORT: '0', HOST: '127.0.0.1' };
  delete env.ELECTRON_RUN_AS_NODE; delete env.ALBUM_QA_EXE;
  const fixtureArgs = mockKeychain ? ['--use-mock-keychain'] : [];
  console.log(`Launching ${packagedExecutable ? 'packaged app' : 'Electron entry'} with isolated profile: ${path.basename(profile)}`);
  app = packagedExecutable
    ? await _electron.launch({ executablePath: packagedExecutable, args: fixtureArgs, env, timeout: 30000 })
    : await _electron.launch({ executablePath: require('electron'), args: [desktop, ...fixtureArgs], env, timeout: 30000 });
  app.context().setDefaultTimeout(20000);
  await app.firstWindow();
  report.runtime = await app.evaluate(({ app, screen }) => ({
    packaged: app.isPackaged, version: app.getVersion(), arch: process.arch, electron: process.versions.electron,
    displays: screen.getAllDisplays().map(({ size, workAreaSize, scaleFactor }) => ({ size, workAreaSize, scaleFactor }))
  }));
  if (packagedExecutable) assert.equal(report.runtime.packaged, true, 'package acceptance must run the packaged application');
  await app.evaluate(async ({ webContents }) => {
    for (let i = 0; i < 300; i++) {
      if (webContents.getAllWebContents().some(c => c.getURL().startsWith('https://album-circle.vercel.app'))) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Content window did not open');
  });
  site = app.windows().find(p => p.url().startsWith('https://album-circle.vercel.app'));
  assert.ok(site);
  site.on('pageerror', error => report.pageErrors.push(error.message));
  assert.equal(await app.evaluate(({ app }) => app.getPath('userData')), profile);
  await site.locator('.app-titlebar').waitFor();
  const onboarding = site.getByRole('dialog', { name: '新手引导', exact: true });
  const needsOnboarding = await site.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('flow-cabin-onboarding-v1') || 'null');
    return !state || ['new', 'active'].includes(state.status);
  });
  if (needsOnboarding) await onboarding.waitFor();
  if (await onboarding.isVisible()) {
    await onboarding.getByRole('button', { name: '跳过引导', exact: true }).click();
    await onboarding.waitFor({ state: 'hidden' });
  }
  await site.locator('.cabin-room').waitFor();
}
async function close() { await app.close(); app = null; site = null; }
async function snapshot(name, profile) {
  const result = await site.evaluate(async keys => {
    const response = await fetch('/api/items'); if (!response.ok) throw new Error('Cannot read collection');
    const stores = Object.fromEntries(Object.entries(keys).map(([domain, key]) => [domain, JSON.parse(localStorage.getItem(key))]));
    return { items: (await response.json()).items, stores };
  }, keys);
  const file = path.join(profile, 'collection.json');
  result.diskItems = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).items : [];
  assert.deepEqual(result.items, result.diskItems, 'Collection API must reflect real disk data');
  save(name + '.json', result); return result;
}
async function openBackup() {
  await site.getByRole('button', { name: '设置', exact: true }).click();
  await site.getByRole('tab', { name: '数据与备份', exact: true }).click();
  await site.getByRole('button', { name: '收藏与备份', exact: true }).click();
  const dialog = site.getByRole('dialog', { name: '收藏与备份', exact: true });
  await dialog.waitFor(); return dialog;
}
async function exportBackup(name) {
  const destination = path.join(output, name);
  await app.evaluate(({ webContents }, destination) => {
    const contents = webContents.getAllWebContents().find(c => c.getURL().startsWith('https://album-circle.vercel.app'));
    globalThis.__backupDownload = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Backup download timeout')), 20000);
      contents.session.once('will-download', (_event, item) => {
        const filename = item.getFilename();
        item.setSavePath(destination);
        item.once('done', (_event, state) => { clearTimeout(timeout); resolve({ state, filename }); });
      });
    });
  }, destination);
  await site.getByRole('button', { name: '导出备份', exact: true }).click();
  const download = await app.evaluate(() => globalThis.__backupDownload);
  assert.equal(download.state, 'completed'); assert.match(download.filename, /^FlowCabin-backup-\d{8}\.json$/);
  return JSON.parse(fs.readFileSync(destination, 'utf8'));
}
function compare(name, expected, actual) {
  const row = { name, passed: false }; report.comparisons.push(row);
  try { assert.deepEqual(actual, expected); row.passed = true; }
  catch (error) { row.error = error.message; }
}
function compareStores(stage, expected, actual) {
  compare(stage + ':collection-api', expected.items, actual.items);
  compare(stage + ':collection-disk', expected.diskItems, actual.diskItems);
  for (const domain of Object.keys(keys)) {
    // Active timers are intentionally not backed up. All persistent focus fields are.
    if (domain === 'focus') {
      const persistent = value => Object.fromEntries(['tasks', 'sessions', 'settings', 'rewards', 'notes'].map(key => [key, value?.[key]]));
      compare(stage + ':' + domain, persistent(expected.stores[domain]), persistent(actual.stores[domain]));
      compare(stage + ':timer-stays-idle', 'idle', actual.stores.focus?.timer?.phase);
    } else compare(stage + ':' + domain, expected.stores[domain], actual.stores[domain]);
  }
}
(async () => {
  const [focus, study, care, letters, sessions, journal, library, playback, souvenirs] = await Promise.all([
    moduleAt('focus/focus-model.mjs'), moduleAt('study/study-model.mjs'), moduleAt('cat/cat-care.mjs'),
    moduleAt('ai/ai-model.mjs'), moduleAt('focus/session-log.mjs'), moduleAt('focus/journal-entries.mjs'),
    moduleAt('record-library.mjs'), moduleAt('player/playback-log.mjs'), moduleAt('focus/souvenirs.mjs')
  ]);
  const souvenirDomains = Object.fromEntries(souvenirs.SOUVENIRS.map(({ id }) =>
    ['souvenir:' + id, souvenirs.SOUVENIR_PREFIX + id]));
  keys = { focus: focus.FOCUS_PREFIX + 'local-owner', study: study.STUDY_PREFIX + 'local-owner',
    library: library.LIBRARY_PREFIX + 'local-owner', focusSessions: sessions.SESSION_LOG_KEY,
    catMood: care.MOOD_KEY, catCare: care.META_KEY, letters: letters.LETTERS_KEY,
    journalEntries: journal.JOURNAL_KEY, playbackSessions: playback.PLAYBACK_LOG_KEY, ...souvenirDomains };
  assert.equal(Object.keys(souvenirDomains).length, 4);
  assert.equal(new Set(Object.values(souvenirDomains)).size, 4);
  assert.equal(fs.existsSync(sourceProfile), false); assert.equal(fs.existsSync(targetProfile), false);
  await launch(sourceProfile);
  const add = await openAddToShelf(site, '手动填写');
  await add.getByLabel('专辑名').fill('QA profile transfer');
  await add.getByLabel('歌手').fill('Offline artist');
  await add.getByLabel('曲目').fill('First song\nSecond song');
  await add.getByRole('button', { name: /放上唱片架/ }).click();
  await add.locator('.add-notice', { hasText: 'QA profile transfer' }).waitFor();
  await add.getByRole('button', { name: '关闭添加到唱片架' }).click();
  const items = await site.evaluate(async () => (await (await fetch('/api/items')).json()).items);
  assert.equal(items.length, 1);
  const at = Date.now() - 60000, album = items[0];
  const state = focus.normalizeFocus({ notes: 'QA notes survive a new profile', tasks: [
    { id: 'qa-task', text: 'QA completed task', createdAt: at - 1800000, done: true, doneAt: at, pomodoros: 1 }],
    sessions: [{ start: at - 1500000, end: at, completed: true, taskId: 'qa-task' }],
    rewards: { xp: 60, fish: 7, equipped: { accessory: 'bow', weather: 'snow' } },
    settings: { notify: false, chime: false, catSkin: 'black', hideSeconds: true } });
  let studyState = study.normalizeStudy({ decks: [{ id: 'qa-deck', name: 'QA retained words', source: 'Original QA teaching fixture', createdAt: at }],
    cards: [{ id: 'qa-card', deckId: 'qa-deck', front: 'window', back: 'a view outside', source: 'QA word attribution', createdAt: at }],
    countdowns: [{ id: 'qa-exam', title: 'QA exam', date: '2026-11-30' }], newPerDay: 9 });
  studyState = study.review(studyState, 'qa-card', study.RATINGS[2].rating, at, { fuzz: false });
  const record = sessions.sessionRecord({ start: at - 1500000, end: at, completed: true,
    todo: { id: 'qa-task', text: 'QA completed task' }, album, track: { title: 'First song', artist: album.artist, album: album.title } });
  const sourceLetters = [
    { id: 'qa-draft', direction: 'out', status: 'draft', at: at + 20, lines: ['QA draft stays private'], shareContext: false },
    { id: 'qa-reply', direction: 'in', status: 'delivered', at: at + 10, lines: ['QA offline reply'], replyTo: 'qa-sent', read: true, readAt: at + 11, organizedAt: at + 30, favorite: true, trashed: true },
    { id: 'qa-sent', direction: 'out', status: 'sent', at, lines: ['QA sent letter'], shareContext: false, organizedAt: at + 30, favorite: true, trashed: true }
  ].map(letters.normalizeLetter);
  const day = 24 * 60 * 60 * 1000;
  const rawJournalRows = [
    { id: 'qa-first-page', version: 'page-v2', body: 'QA first writing day', tags: ['memory'],
      createdAt: at - 2 * day, updatedAt: at - 2 * day, revisions: [] },
    { id: 'qa-second-page', version: 'page-v2', body: 'QA second writing day', tags: ['memory'],
      createdAt: at - day, updatedAt: at - day, revisions: [] },
    { id: 'qa-trash', version: 'trash-v2', body: 'QA recycled page', tags: ['trash'], createdAt: at - 100, updatedAt: at + 30, deletedAt: at + 30, revisions: [] },
    { id: 'qa-page', version: 'page-v2', body: 'QA revised page', tags: ['test', 'memory'], createdAt: at - 100, updatedAt: at + 10,
      revisions: [{ version: 'page-v1', body: 'QA first draft', tags: ['test'], at: at - 100 }] }
  ];
  const journalRows = journal.readJournalRecords({ getItem: () => JSON.stringify(rawJournalRows) });
  assert.equal(journalRows.length, rawJournalRows.length, 'Journal fixture must not lose records');
  assert.deepEqual(journalRows.map(({ id }) => id), ['qa-trash', 'qa-page', 'qa-second-page', 'qa-first-page']);
  const writingDays = [...new Set(journalRows.map(({ createdAt }) => care.dayKey(createdAt)))].sort();
  assert.equal(writingDays.length, 3, 'Journal fixture must represent three distinct local writing days');
  const rawPlaybackRows = [
    { id: 'qa-listen-a', start: at - 700000, end: at - 370000, durationMs: 330000, reason: 'pause',
      album: { id: album.id, title: album.title, artist: album.artist }, track: { index: 0, title: 'First song', artist: album.artist, album: album.title } },
    { id: 'qa-listen-b', start: at - 360000, end: at - 30000, durationMs: 330000, reason: 'pause',
      album: { id: album.id, title: album.title, artist: album.artist }, track: { index: 0, title: 'First song', artist: album.artist, album: album.title } },
    { id: 'qa-listen', start: at - 10000, end: at, durationMs: 9000, reason: 'pause',
      album: { id: album.id, title: album.title, artist: album.artist }, track: { index: 0, title: 'First song', artist: album.artist } }
  ];
  const playbackRows = playback.readPlaybackSessions({ getItem: () => JSON.stringify(rawPlaybackRows) });
  assert.equal(playbackRows.length, rawPlaybackRows.length, 'Playback fixture must not lose records');
  assert.deepEqual(playbackRows.map(({ id }) => id), ['qa-listen-a', 'qa-listen-b', 'qa-listen']);
  assert.ok(playbackRows.every(({ track }) => !Object.hasOwn(track, 'album')), 'Track metadata must match the stored playback contract');
  assert.equal(playbackRows.reduce((total, row) => total + row.durationMs, 0), 669000);
  // Generate all four awards from the same legal logs that the app will export.
  // This checks the evidence shape instead of hand-writing decorative records.
  const souvenirState = souvenirs.eligibleSouvenirs({ focus: [record], playback: playbackRows, letters: sourceLetters, journal: journalRows }, Date.now());
  assert.deepEqual(souvenirState.records.map(({ id }) => id).sort(), souvenirs.SOUVENIRS.map(({ id }) => id).sort());
  assert.deepEqual(souvenirs.normalizeSouvenirs(souvenirState), souvenirState);
  const souvenirSeed = Object.fromEntries(souvenirState.records.map((record) => ['souvenir:' + record.id, record]));
  assert.deepEqual(Object.keys(souvenirSeed).sort(), Object.keys(souvenirDomains).sort());
  assert.deepEqual(souvenirSeed['souvenir:first-focus'].evidence, { sessionId: record.id, durationMs: record.durationMs });
  assert.deepEqual(souvenirSeed['souvenir:listening-ten'].evidence, { verifiedMs: 660000, segments: 2 });
  assert.equal(souvenirSeed['souvenir:first-letter'].evidence.letterId, 'qa-sent');
  assert.deepEqual(souvenirSeed['souvenir:journal-three-days'].evidence.days, writingDays);
  assert.equal(souvenirSeed['souvenir:journal-three-days'].earnedOn, writingDays.at(-1));
  const seed = { focus: state, study: studyState,
    library: library.normalizeLibrary({ styles: { ['item:' + album.id]: { base: '#aabbcc' } },
      genres: { ['item:' + album.id]: ['Jazz'] }, rooms: { 'local-room': { look: 'warm', petId: 'cat',
        boxes: [{ id: 'qa-box', name: 'QA shelf box', keys: ['item:' + album.id] }] } } }),
    focusSessions: [record], catMood: care.storedCare(care.normalizeCare({ v: 1, mood: 82, updatedAt: at,
      feeds: [{ at: at - 100, fishLeft: 7 }], totalFeeds: 3 }, at)),
    catCare: { pets: { day: care.dayKey(at), count: 2 }, rewarded: [record.id] }, letters: sourceLetters,
    journalEntries: journalRows,
    playbackSessions: playbackRows, ...souvenirSeed };
  assert.equal(studyState.cards[0].memory.reps, 1);
  await site.evaluate(({ keys, seed }) => {
    for (const [domain, value] of Object.entries(seed)) localStorage.setItem(keys[domain], JSON.stringify(value));
  }, { keys, seed });
  save('source-seed.json', seed);
  save('souvenir-fixture.json', { keys: souvenirDomains, records: souvenirState.records,
    sourceEvidence: { focusSession: record.id, playbackSessions: playbackRows.map(({ id }) => id),
      sentLetter: 'qa-sent', journalEntries: journalRows.map(({ id }) => id) } });
  await site.reload(); await site.locator('.room-record').first().waitFor();
  const before = await snapshot('source-before-export', sourceProfile);
  for (const domain of Object.keys(seed)) compare('seed-loaded:' + domain, seed[domain], before.stores[domain]);
  const sourceSouvenirs = souvenirs.normalizeSouvenirs({ version: 1,
    records: Object.keys(souvenirDomains).map((domain) => before.stores[domain]) });
  compare('seed:souvenirs', souvenirState, sourceSouvenirs);
  await openBackup();
  const exported = await exportBackup('source-export.json');
  assert.equal(exported.version, 3);
  compare('export:collection', before.items, exported.items);
  for (const domain of ['library', 'study']) compare('export:' + domain, before.stores[domain], exported[domain]);
  for (const domain of ['focusSessions', 'catMood', 'catCare', 'letters', 'journalEntries', 'playbackSessions'])
    compare('export:' + domain, before.stores[domain], exported.memory?.[domain]);
  compare('export:souvenirs', sourceSouvenirs, exported.memory?.souvenirs);
  for (const record of souvenirState.records) {
    compare('export:souvenir:' + record.id, record,
      exported.memory?.souvenirs?.records?.find(({ id }) => id === record.id));
  }
  assert.equal(exported.focus.timer, undefined);
  await site.screenshot({ path: path.join(output, 'source-export.png') });
  check('source-profile-exports-through-real-electron-download');
  await close();
  await launch(targetProfile);
  const fresh = await snapshot('target-before-import', targetProfile);
  assert.deepEqual(fresh.items, []);
  for (const domain of ['focusSessions', 'catMood', 'catCare', 'letters', 'journalEntries', 'playbackSessions'])
    assert.ok(fresh.stores[domain] == null || (Array.isArray(fresh.stores[domain]) && fresh.stores[domain].length === 0), domain + ' must start empty');
  for (const domain of Object.keys(souvenirDomains))
    assert.equal(fresh.stores[domain], null, domain + ' must start empty');
  assert.equal(fresh.stores.study?.cards?.length || 0, 0);
  assert.equal(fresh.stores.focus?.sessions?.length || 0, 0);
  check('target-profile-is-new-and-domains-start-empty');
  const dialog = await openBackup();
  await dialog.getByLabel('导入备份文件', { exact: true }).setInputFiles(path.join(output, 'source-export.json'));
  await dialog.getByRole('button', { name: '恢复这些内容', exact: true }).waitFor();
  await site.screenshot({ path: path.join(output, 'target-confirm-restore.png') });
  await dialog.getByRole('button', { name: '恢复这些内容', exact: true }).click();
  await dialog.getByRole('status').filter({ hasText: '已合并' }).waitFor();
  assert.equal(await dialog.getByRole('alert').count(), 0);
  await site.screenshot({ path: path.join(output, 'target-restored.png') });
  compareStores('after-import', before, await snapshot('target-after-import', targetProfile));
  const restoredExport = await exportBackup('target-reexport.json');
  for (const domain of ['items', 'library', 'focus', 'study', 'sound', 'memory'])
    compare('reexport:' + domain, exported[domain], restoredExport[domain]);
  compare('reexport:souvenirs', exported.memory?.souvenirs, restoredExport.memory?.souvenirs);
  for (const record of souvenirState.records) {
    compare('reexport:souvenir:' + record.id, record,
      restoredExport.memory?.souvenirs?.records?.find(({ id }) => id === record.id));
  }
  check('target-profile-imports-and-reexports-through-backup-ui');
  await close(); await launch(targetProfile);
  const restarted = await snapshot('target-after-restart', targetProfile);
  compareStores('after-restart', before, restarted);
  compare('after-restart:souvenirs', sourceSouvenirs, souvenirs.normalizeSouvenirs({ version: 1,
    records: Object.keys(souvenirDomains).map((domain) => restarted.stores[domain]) }));
  await site.locator('.room-record').first().waitFor();
  assert.match(await site.locator('.app-brand small').innerText(), /1 张唱片/);
  await site.screenshot({ path: path.join(output, 'target-restarted-room.png') });
  check('target-profile-persists-after-real-electron-restart');
  assert.deepEqual(report.pageErrors, []);
  const failures = report.comparisons.filter(row => !row.passed);
  assert.deepEqual(failures, [], 'All domains must compare exactly');
  report.passed = true;
})().catch(error => { report.passed = false; report.error = error.stack; process.exitCode = 1; })
  .finally(async () => {
    if (!report.passed && site && !site.isClosed()) await site.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
    if (app) await close().catch(() => {});
    report.finishedAt = new Date().toISOString(); save('report.json', report); console.log(JSON.stringify(report, null, 2));
  });
