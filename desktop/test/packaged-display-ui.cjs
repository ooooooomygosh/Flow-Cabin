'use strict';
// Run only after the native-test focus slot is available. Importing this file does not launch.
const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { openAddToShelf } = require('./ui-fixture.cjs');

const root = path.resolve(__dirname, '../..');
const DEFAULT_EXECUTABLE = path.join(root, 'desktop/release/mac-arm64/心流小屋.app/Contents/MacOS/心流小屋');
const DEFAULT_OUTPUT = path.join(root, 'desktop/test-results/physical-displays');
const SITE_ORIGIN = 'https://album-circle.vercel.app';

// Optional JSON array of { width, height, scaleFactor? }, in Electron display DIPs.
function parseExpectedDisplays(value) {
  if (!value) return [];
  let displays;
  try { displays = JSON.parse(value); }
  catch { throw new Error('ALBUM_QA_DISPLAYS must be a JSON array of { width, height, scaleFactor? }'); }
  assert.ok(Array.isArray(displays), 'ALBUM_QA_DISPLAYS must be an array');
  return displays.map((display, index) => {
    assert.ok(display && Number.isInteger(display.width) && display.width > 0
      && Number.isInteger(display.height) && display.height > 0,
    `ALBUM_QA_DISPLAYS[${index}] must have positive integer width and height`);
    assert.ok(display.scaleFactor === undefined || (Number.isFinite(display.scaleFactor) && display.scaleFactor > 0),
      `ALBUM_QA_DISPLAYS[${index}].scaleFactor must be a positive number when supplied`);
    return { width: display.width, height: display.height,
      ...(display.scaleFactor === undefined ? {} : { scaleFactor: display.scaleFactor }) };
  });
}
function boundsForDisplay(workArea, minimum = [0, 0]) {
  const bounds = { x: workArea.x + 24, y: workArea.y + 24, width: workArea.width - 48, height: workArea.height - 48 };
  assert.ok(bounds.width >= Math.max(1, minimum[0]) && bounds.height >= Math.max(1, minimum[1]),
    'Display work area must fit the real window minimum size with margins');
  return bounds;
}
function assertContained(bounds, area) {
  assert.ok(bounds.width > 0 && bounds.height > 0, 'Window must have positive dimensions');
  assert.ok(bounds.x >= area.x && bounds.y >= area.y
    && bounds.x + bounds.width <= area.x + area.width
    && bounds.y + bounds.height <= area.y + area.height,
  `Window ${JSON.stringify(bounds)} must be entirely inside ${JSON.stringify(area)}`);
}
function assertLayout(layout, scaleFactor) {
  assert.equal(layout.devicePixelRatio, scaleFactor, 'Fresh-profile renderer DPR must match the physical display scale');
  assert.ok(layout.clientWidth > 0 && layout.innerHeight > 0, 'Renderer must have a visible viewport');
  assert.ok(layout.documentWidth <= layout.clientWidth, `Document horizontally overflows: ${JSON.stringify(layout)}`);
  assert.ok(layout.bodyWidth <= layout.clientWidth, `Body horizontally overflows: ${JSON.stringify(layout)}`);
  if (layout.panel) {
    assert.ok(layout.panel.scrollWidth <= layout.panel.clientWidth, 'Cat panel must not scroll horizontally');
    assert.ok(layout.panel.left >= 0 && layout.panel.right <= layout.clientWidth
      && layout.panel.top >= 0 && layout.panel.bottom <= layout.innerHeight, 'Cat panel must remain inside the viewport');
  }
}
function pngSize(buffer) {
  assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}
async function until(read, accepts, description, timeout = 15000) {
  const deadline = Date.now() + timeout;
  let value;
  do {
    value = await read();
    if (accepts(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  throw new Error(`${description}: ${JSON.stringify(value)}`);
}

async function main() {
  const executablePath = path.resolve(process.env.ALBUM_QA_EXE || DEFAULT_EXECUTABLE);
  const output = path.resolve(process.env.ALBUM_QA_EVIDENCE || DEFAULT_OUTPUT);
  const expectedDisplays = parseExpectedDisplays(process.env.ALBUM_QA_DISPLAYS);
  const mockKeychain = process.env.ALBUM_QA_MOCK_KEYCHAIN === '1';
  const focusDiagnosticOnly = process.env.ALBUM_QA_FOCUS_DIAGNOSTIC === '1';
  const args = mockKeychain ? ['--use-mock-keychain'] : [];
  fs.mkdirSync(output, { recursive: true });
  const evidence = fs.mkdtempSync(path.join(output, 'run-'));
  const report = {
    startedAt: new Date().toISOString(), executablePath, output: evidence, launchMode: 'packaged',
    args, mockKeychain, credentialsTested: false, focusDiagnosticOnly,
    focusRequired: true, blockedBySystemLock: false, realInputAcceptance: 'not-tested', systemStates: [],
    syntheticSourceData: true, screenEmulation: false, systemSettingsChanged: false, permissionsGranted: false,
    captureMethod: 'renderer PNG at device scale; no desktop capture or screen-recording permission',
    expectedDisplays, checks: [], displays: [], pageErrors: [], passed: false,
    limitations: ['Only the connected displays and their observed scales are tested.',
      'No account, keychain credential, permission, HDR/color, unplug/replug, or other-platform acceptance.']
  };
  let application, site, mainWindowId, activeDisplay;
  const save = () => fs.writeFileSync(path.join(evidence, 'report.json'), JSON.stringify(report, null, 2));
  const check = (name, detail = {}) => { report.checks.push({ name, passed: true, ...detail }); console.log('PASS ' + name); };
  const systemState = async phase => {
    const state = await application.evaluate(({ app, powerMonitor, BrowserWindow, webContents }) => ({
      queriedAt: new Date().toISOString(), idleThresholdSeconds: 60,
      idleState: powerMonitor.getSystemIdleState(60), idleSeconds: powerMonitor.getSystemIdleTime(),
      appHidden: app.isHidden(), focusedWindowId: BrowserWindow.getFocusedWindow()?.id ?? null,
      focusedWebContentsId: webContents.getFocusedWebContents()?.id ?? null,
      windows: BrowserWindow.getAllWindows().map(window => ({
        id: window.id, bounds: window.getBounds(), contentBounds: window.getContentBounds(),
        visible: window.isVisible(), minimized: window.isMinimized(), maximized: window.isMaximized(),
        fullscreen: window.isFullScreen(), focusable: window.isFocusable(), focused: window.isFocused(),
        shellFocused: window.webContents.isFocused()
      })),
      contents: webContents.getAllWebContents().map(contents => ({
        id: contents.id, type: contents.getType(), url: contents.getURL(), focused: contents.isFocused()
      }))
    }));
    report.systemStates.push({ phase, ...state });
    if (state.idleState === 'locked') {
      report.blockedBySystemLock = true;
      report.realInputAcceptance = 'blocked';
      report.passed = false;
      report.blockedReason = 'System reports locked; actual geometry recorded, real focus/input acceptance unavailable. No unlock attempted.';
    }
    save();
    return state;
  };
  const nativeState = () => application.evaluate(({ BrowserWindow, screen, webContents }, id) => {
    const window = BrowserWindow.fromId(id);
    if (!window || window.isDestroyed()) throw new Error('Test main window disappeared');
    const contents = webContents.getAllWebContents().find(c => c.getURL().startsWith('https://album-circle.vercel.app'));
    return {
      id, bounds: window.getBounds(), contentBounds: window.getContentBounds(),
      displayId: screen.getDisplayMatching(window.getBounds()).id,
      visible: window.isVisible(), minimized: window.isMinimized(), maximized: window.isMaximized(), fullscreen: window.isFullScreen(),
      focused: window.isFocused(), contentFocused: Boolean(contents && webContents.getFocusedWebContents()?.id === contents.id),
      zoomFactor: contents?.getZoomFactor()
    };
  }, mainWindowId);
  const layout = () => site.evaluate(() => {
    const panel = document.querySelector('.cat-panel[open]'), rect = panel?.getBoundingClientRect();
    return {
      devicePixelRatio, innerWidth, innerHeight, clientWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth,
      screen: { width: screen.width, height: screen.height, availWidth: screen.availWidth, availHeight: screen.availHeight },
      panel: rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
        clientWidth: panel.clientWidth, scrollWidth: panel.scrollWidth } : null
    };
  });
  async function screenshot(row, name) {
    const renderer = await layout();
    assertLayout(renderer, row.display.scaleFactor);
    const file = path.join(evidence, `display-${row.display.id}-${name}.png`);
    const pixels = pngSize(await site.screenshot({ path: file, scale: 'device', fullPage: false }));
    assert.equal(pixels.width, Math.round(renderer.innerWidth * renderer.devicePixelRatio), 'PNG width must preserve device pixels');
    assert.equal(pixels.height, Math.round(renderer.innerHeight * renderer.devicePixelRatio), 'PNG height must preserve device pixels');
    row.screenshots.push({ file, pixels, renderer });
  }
  try {
    assert.equal(process.platform, 'darwin', 'This acceptance targets the actual Mac displays');
    fs.accessSync(executablePath, fs.constants.X_OK);
    const archive = path.resolve(path.dirname(executablePath), '../Resources/app.asar');
    report.packageArchive = { path: archive, sha256: crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex') };
    report.profile = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'flow-cabin-physical-displays-')));
    const env = { ...process.env, ALBUM_DESKTOP_TEST_PROFILE: report.profile, PORT: '0', HOST: '127.0.0.1' };
    delete env.ELECTRON_RUN_AS_NODE; delete env.ALBUM_QA_EXE;
    application = await _electron.launch({ executablePath, args, env, timeout: 30000 });
    application.context().setDefaultTimeout(20000);
    const observed = new WeakSet();
    const observe = page => {
      if (observed.has(page)) return;
      observed.add(page);
      page.on('pageerror', error => report.pageErrors.push({ displayId: activeDisplay ?? null, message: error.message }));
      page.on('crash', () => report.pageErrors.push({ displayId: activeDisplay ?? null, message: 'Renderer crashed' }));
    };
    application.on('window', observe); application.windows().forEach(observe);
    await application.firstWindow();
    await systemState('before-test-activation');
    report.runtime = await application.evaluate(({ app, screen }) => ({
      packaged: app.isPackaged, version: app.getVersion(), executable: process.execPath, appPath: app.getAppPath(),
      userData: app.getPath('userData'), arch: process.arch, electron: process.versions.electron,
      displays: screen.getAllDisplays().map(({ id, label, bounds, workArea, size, workAreaSize, scaleFactor, internal, rotation }) =>
        ({ id, label, bounds, workArea, size, workAreaSize, scaleFactor, internal, rotation }))
    }));
    assert.equal(report.runtime.packaged, true);
    assert.equal(fs.realpathSync(report.runtime.executable), fs.realpathSync(executablePath));
    assert.equal(fs.realpathSync(report.runtime.userData), report.profile, 'Packaged app must use only the new test profile');
    check('packaged-application-and-isolated-profile');
    if (report.blockedBySystemLock) return;
    report.testActivationPolicy = await application.evaluate(({ app }) => {
      // Match client-ui: direct launches need regular activation before native focus.
      app.setActivationPolicy('regular');
      app.focus({ steal: true });
      return { policy: 'regular', appliedByTest: true, scope: 'isolated test application process' };
    });
    assert.ok(new Set(report.runtime.displays.map(display => display.id)).size >= 2, 'At least two distinct displays are required');
    check('at-least-two-physical-displays-present');
    const unmatched = [...report.runtime.displays];
    for (const expected of expectedDisplays) {
      const index = unmatched.findIndex(display => display.size.width === expected.width
        && display.size.height === expected.height
        && (expected.scaleFactor === undefined || display.scaleFactor === expected.scaleFactor));
      assert.ok(index >= 0, `Expected physical display missing: ${JSON.stringify(expected)}`);
      unmatched.splice(index, 1);
    }
    if (expectedDisplays.length) check('configured-physical-displays-present');
    site = await until(() => application.windows().find(page => page.url().startsWith(SITE_ORIGIN)),
      Boolean, 'Packaged content window did not open', 30000);
    observe(site);
    mainWindowId = await application.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('album-desktop://shell'));
      if (!window) throw new Error('Packaged main shell window missing');
      return window.id;
    });
    report.mainWindowId = mainWindowId;
    await systemState('before-content-input');
    if (report.blockedBySystemLock) return;
    if (focusDiagnosticOnly) {
      report.focusDiagnostic = { before: await nativeState(), inputAttempted: false };
      await application.evaluate(({ app, BrowserWindow, webContents }, id) => {
        const window = BrowserWindow.fromId(id);
        app.focus({ steal: true });
        window.show(); window.focus();
        webContents.getAllWebContents().find(c => c.getURL().startsWith('https://album-circle.vercel.app'))?.focus();
      }, mainWindowId);
      try {
        report.focusDiagnostic.after = await until(nativeState,
          state => state.visible && state.focused && state.contentFocused, 'Native/content focus unavailable', 2000);
      } catch (error) {
        report.focusDiagnostic.error = error.message;
        report.focusDiagnostic.after = await nativeState();
      }
      await systemState('after-single-focus-diagnostic');
      report.focusDiagnostic.documentHasFocus = await site.evaluate(() => document.hasFocus());
      report.focusDiagnostic.focusRequirementMet = report.focusDiagnostic.after.focused
        && report.focusDiagnostic.after.contentFocused;
      report.focusDiagnostic.conclusion = report.blockedBySystemLock ? 'blocked-by-system-lock'
        : report.focusDiagnostic.focusRequirementMet ? 'focus-observed-input-not-tested'
          : 'focus-unavailable-system-did-not-report-locked';
      report.limitations.push('Diagnostic only: no UI input or per-display interaction acceptance was performed.');
      return;
    }
    await site.locator('.app-titlebar').waitFor();
    const onboarding = site.getByRole('dialog', { name: '新手引导', exact: true });
    if (await site.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('flow-cabin-onboarding-v1') || 'null');
      return !state || ['new', 'active'].includes(state.status);
    })) {
      await onboarding.waitFor();
      await onboarding.getByRole('button', { name: '跳过引导', exact: true }).click();
      await onboarding.waitFor({ state: 'hidden' });
    }
    await site.locator('.cabin-room').waitFor();
    const emptyItems = await site.evaluate(async () => {
      const response = await fetch('/api/items');
      if (!response.ok) throw new Error('Cannot inspect the isolated collection');
      return (await response.json()).items;
    });
    assert.deepEqual(emptyItems, [], 'The profile must start with an empty collection');
    const add = await openAddToShelf(site, '手动填写');
    await add.getByLabel('专辑名').fill('QA physical displays');
    await add.getByLabel('歌手').fill('Offline fixture');
    await add.getByLabel('曲目').fill('Synthetic display check');
    await add.getByRole('button', { name: /放上唱片架/ }).click();
    await add.locator('.add-notice', { hasText: 'QA physical displays' }).waitFor();
    await add.getByRole('button', { name: '关闭添加到唱片架', exact: true }).click();
    await add.waitFor({ state: 'hidden' });
    check('only-synthetic-local-album-created-without-login');

    for (const display of report.runtime.displays) {
      await systemState(`before-display-${display.id}`);
      if (report.blockedBySystemLock) return;
      activeDisplay = display.id;
      const row = { display, passed: false, screenshots: [] };
      report.displays.push(row);
      try {
        await application.evaluate(({ BrowserWindow }, id) => {
          const window = BrowserWindow.fromId(id);
          if (window.isMinimized()) window.restore();
          if (window.isMaximized()) window.unmaximize();
          window.show();
        }, mainWindowId);
        await until(nativeState, state => !state.minimized && !state.maximized && !state.fullscreen,
          'Main window did not leave its initial maximized state');
        const minimum = await application.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id).getMinimumSize(), mainWindowId);
        row.requestedBounds = boundsForDisplay(display.workArea, minimum);
        await application.evaluate(({ app, BrowserWindow, webContents }, { id, bounds }) => {
          const window = BrowserWindow.fromId(id);
          window.setBounds(bounds, false);
          app.focus({ steal: true });
          window.show(); window.focus();
          webContents.getAllWebContents().find(c => c.getURL().startsWith('https://album-circle.vercel.app'))?.focus();
        }, { id: mainWindowId, bounds: row.requestedBounds });
        row.native = await until(nativeState, state => state.displayId === display.id
          && Object.entries(row.requestedBounds).every(([key, value]) => state.bounds[key] === value)
          && state.visible && state.focused && state.contentFocused, 'Main window did not move/focus on the target display');
        assertContained(row.native.bounds, display.workArea);
        assertContained(row.native.bounds, display.bounds);
        assert.equal(row.native.zoomFactor, 1, 'Fresh profile must retain native 100% zoom');
        await site.waitForFunction(({ width, height, scale }) =>
          innerWidth === width && innerHeight === height && devicePixelRatio === scale,
        { width: row.native.contentBounds.width, height: row.native.contentBounds.height, scale: display.scaleFactor });
        await site.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await screenshot(row, 'room');
        const cat = site.locator('button.room-cat'), panel = site.locator('.cat-panel[open]');
        await cat.dblclick();
        await panel.waitFor();
        assert.equal(await cat.getAttribute('aria-expanded'), 'true');
        await screenshot(row, 'cat-open');
        await panel.getByRole('button', { name: '关闭小猫', exact: true }).click();
        await panel.waitFor({ state: 'detached' });
        assert.equal(await cat.getAttribute('aria-expanded'), 'false');
        await screenshot(row, 'cat-closed');
        row.afterInteraction = await nativeState();
        assert.equal(row.afterInteraction.displayId, display.id, 'Interactions must stay on the target display');
        assertContained(row.afterInteraction.bounds, display.workArea);
        row.passed = true;
        check(`physical-display-${display.id}-bounds-dpr-layout-cat-and-screenshots`);
      } catch (error) {
        row.error = error.stack;
        row.native = await nativeState();
        await systemState(`display-${display.id}-failure`);
        if (report.blockedBySystemLock) return;
        if (!site.isClosed()) {
          const failure = path.join(evidence, `display-${display.id}-failure.png`);
          await site.screenshot({ path: failure, scale: 'device' }).then(() => { row.failureScreenshot = failure; }).catch(() => {});
          if (await site.locator('.cat-panel[open]').count()) await site.keyboard.press('Escape').catch(() => {});
        }
      }
      save();
    }
    assert.ok(report.displays.every(display => display.passed), 'One or more physical displays failed; see per-display evidence');
    assert.deepEqual(report.pageErrors, []);
    report.realInputAcceptance = 'passed';
    report.passed = true;
  } catch (error) {
    report.error = error.stack;
    console.error(error.message);
  } finally {
    if (application) {
      try { await application.close(); report.applicationClosed = true; }
      catch (error) { report.closeError = error.message; report.passed = false; }
    }
    report.finishedAt = new Date().toISOString();
    report.profileRetained = Boolean(report.profile);
    save();
    console.log(`OUTPUT ${path.join(evidence, 'report.json')}`);
    if (!report.passed) process.exitCode = 1;
  }
}

module.exports = { parseExpectedDisplays, boundsForDisplay, assertContained, assertLayout, pngSize };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
