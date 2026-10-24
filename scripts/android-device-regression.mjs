// Real Android WebView regression. Requires Node 24 and an already booted,
// dedicated flow-cabin-qa AVD with the DEBUG APK installed. No account login.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { onboardingSeed } from './app-version.mjs';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'mobile-test-results');
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!sdk) throw Error('Set ANDROID_HOME to your Android SDK.');
const serial = process.env.ANDROID_SERIAL || 'emulator-5554';
const adb = (...args) => execFileSync(path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb'), ['-s', serial, ...args], { encoding: 'utf8', windowsHide: true }).trim();
assert.match(adb('emu', 'avd', 'name'), /^flow-cabin-qa[\r\n]+OK$/, 'Use the dedicated test AVD, never a personal device.');
if (!process.argv.includes('--fixture')) throw Error('Pass --fixture to replace this dedicated AVD\'s collection with labeled test albums.');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
await fs.mkdir(output, { recursive: true });
const report = { nativeDeviceTested: true, api: adb('shell', 'getprop', 'ro.build.version.sdk'), webview: adb('shell', 'dumpsys', 'webviewupdate').match(/Current WebView package.*\)/)?.[0], checks: [], layouts: [] };
let socket, sequence = 0;
const pending = new Map();
async function openSocket(target) {
  const current = new WebSocket(target.webSocketDebuggerUrl); socket = current;
  await new Promise((resolve, reject) => { current.onopen = resolve; current.onerror = reject; });
  current.onmessage = event => { const value = JSON.parse(event.data); if (value.id) { const callback = pending.get(value.id); pending.delete(value.id); value.error ? callback?.reject(value.error) : callback?.resolve(value.result); } };
  current.onclose = () => { for (const [id, callback] of pending) if (callback.socket === current) { pending.delete(id); callback.reject(Error('Android WebView debugging connection closed')); } };
}
async function connect() {
  socket?.close();
  for (let retry = 0; retry < 30; retry++) {
    const name = adb('shell', 'cat', '/proc/net/unix').match(/@webview_devtools_remote_\d+/)?.[0];
    if (name) {
      adb('forward', 'tcp:9223', 'localabstract:' + name.slice(1));
      const targets = await fetch('http://127.0.0.1:9223/json').then(r => r.json());
      const target = targets.find(t => t.url === 'https://localhost/');
      if (target) { await openSocket(target); break; }
    }
    await pause(300);
  }
  if (!socket) throw Error('Install and launch the debug APK first.');
  await until('Boolean(window.albumMobile && document.querySelector(".room-record"))');
}
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timed out: ' + method)); }, 20000);
    pending.set(id, { socket, resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function until(expression) {
  for (let retry = 0; retry < 60; retry++) { if (await evaluate(expression)) return; await pause(200); }
  throw Error('Timed out: ' + expression);
}
async function screenshot(name) {
  // Capture Android's composed display, including the actual IME and system
  // bars. WebView's CDP screenshot can retain an earlier compositor frame.
  const png = execFileSync(path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb'), ['-s', serial, 'exec-out', 'screencap', '-p'], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  await fs.writeFile(path.join(output, name + '.png'), png);
}
const check = name => { report.checks.push(name); console.log('PASS ' + name); };
async function layout(name) {
  await pause(650);
  const value = await evaluate(`(() => {
    const rect=s=>document.querySelector(s)?.getBoundingClientRect().toJSON(),css=getComputedStyle(document.documentElement);
    const safe=Object.fromEntries(['left','right','top','bottom'].map(s=>[s,parseFloat(css.getPropertyValue('--safe-area-inset-'+s))||0]));
    return {name:${JSON.stringify(name)},viewport:[innerWidth,innerHeight],screen:[screen.width,screen.height],safe,
      stage:rect('.cabin-scene'),art:rect('.cabin-scene-canvas'),keyboard:document.documentElement.dataset.mobileKeyboard,
      controls:['.app-titlebar','.cabin-toolbar','.room-turntable','.room-now-playing','.room-shelf-navigation'].map(s=>({selector:s,rect:rect(s)})),
      records:[...document.querySelectorAll('.room-record')].map(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {label:e.getAttribute('aria-label'),rect:r.toJSON(),hit:hit===e||e.contains(hit)};})};})()`);
  const { art, stage, safe, viewport: [width, height] } = value;
  report.layouts.push(value);
  assert.ok(Math.abs(width - value.screen[0]) <= 2 && Math.abs(height - value.screen[1]) <= 2, name + ': WebView does not fill display');
  assert.ok(art.left <= stage.left + 1 && art.top <= stage.top + 1 && art.right >= stage.right - 1 && art.bottom >= stage.bottom - 1, name + ': artwork leaves a solid gutter');
  assert.ok(Math.abs(art.width / art.height - 4 / 3) < .01, name + ': distorted scene');
  assert.ok(value.records.length > 0, name + ': no reachable records');
  for (const item of value.records) assert.ok(item.hit && item.rect.left >= safe.left - 1 && item.rect.right <= width - safe.right + 1 && item.rect.top >= safe.top - 1 && item.rect.bottom <= height - safe.bottom + 1, name + ': covered or clipped sleeve ' + item.label);
  for (const { selector, rect } of value.controls) if (rect?.width && rect?.height) assert.ok(rect.left >= -1 && rect.top >= -1 && rect.right <= width + 1 && rect.bottom <= height + 1, name + ': control out of screen ' + selector);
  assert.equal(value.keyboard, 'false', name + ': rotation incorrectly detected as keyboard');
  await screenshot('emulator-' + name); check(name);
}

const overlay = 'com.android.internal.display.cutout.emulation.tall';
try {
  adb('shell', 'cmd', 'overlay', 'disable', '--user', '0', overlay);
  adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
  adb('shell', 'settings', 'put', 'system', 'user_rotation', '0');
  adb('shell', 'am', 'start', '-n', 'cn.flowcabin.app/.MainActivity');
  // Seed via the actual native SQLite-backed storage, not a bridge mock.
  for (let retry = 0; retry < 40; retry++) { if (/webview_devtools/.test(adb('shell', 'cat', '/proc/net/unix'))) break; await pause(200); }
  const name = adb('shell', 'cat', '/proc/net/unix').match(/@webview_devtools_remote_\d+/)?.[0];
  adb('forward', 'tcp:9223', 'localabstract:' + name.slice(1));
  const target = (await fetch('http://127.0.0.1:9223/json').then(r => r.json())).find(t => t.url === 'https://localhost/');
  await openSocket(target);
  await until('Boolean(window.albumMobile)');
  await evaluate(`(async()=>{const items=Array.from({length:29},(_,i)=>({id:'android-qa-'+i,type:'album',title:'全面屏测试 '+(i+1),artist:'模拟器测试',tracks:['测试曲目'],addedAt:new Date(2026,0,1,i).toISOString()}));localStorage.setItem('flow-cabin-web-collection-v1',JSON.stringify({version:1,items}));localStorage.setItem('flow-cabin-onboarding-v1',${JSON.stringify(onboardingSeed())});await window.albumMobile.flushStorage();return true;})()`);
  await send('Page.reload'); await until('document.querySelectorAll(".room-record").length > 0');
  await layout('portrait');
  const service = await evaluate(`window.albumMobile.musicRequest('/config').then(v=>({ready:true,qqLoggedIn:v.qqLoggedIn,neteaseLoggedIn:v.neteaseLoggedIn}))`);
  assert.equal(service.ready, true); check('android-embedded-music-engine-starts');
  const visited = new Set();
  for (let page = 0; page < 29; page++) {
    const labels = await evaluate(`[...document.querySelectorAll('.room-record')].map(e=>e.getAttribute('aria-label'))`); labels.forEach(label => visited.add(label));
    const next = await evaluate(`(()=>{const b=document.querySelector('button[aria-label="下一页唱片"]');if(!b||b.disabled)return false;b.click();return true;})()`);
    if (!next) break; await pause(350);
  }
  assert.equal(visited.size, 29); check('all-29-albums-reachable-through-native-webview-pages');
  for (const rotation of [1, 3]) { adb('shell', 'settings', 'put', 'system', 'user_rotation', String(rotation)); await until('innerWidth > innerHeight'); await layout(rotation === 1 ? 'landscape' : 'reverse-landscape'); }
  adb('shell', 'cmd', 'overlay', 'enable', '--user', '0', overlay);
  // Changing a developer cutout overlay can recreate the Android WebView.
  await pause(1800); await connect();
  for (const rotation of [0, 1, 3]) {
    adb('shell', 'settings', 'put', 'system', 'user_rotation', String(rotation));
    await until(rotation ? 'innerWidth > innerHeight' : 'innerHeight > innerWidth'); await layout('cutout-' + rotation);
  }
  for (const rotation of [0, 1]) {
    adb('shell', 'settings', 'put', 'system', 'user_rotation', String(rotation)); await until(rotation ? 'innerWidth > innerHeight' : 'innerHeight > innerWidth');
    await evaluate('window.albumMobile.setFullscreen(true)'); await layout('immersive-' + rotation);
    await evaluate('window.albumMobile.setFullscreen(false)');
  }
  adb('shell', 'settings', 'put', 'system', 'user_rotation', '0'); await until('innerHeight > innerWidth');
  await evaluate(`document.querySelector('button[aria-label="唱片卡片"]')?.click()`);
  await until('Boolean(document.querySelector(".record-card-notes textarea"))');
  for (const rotation of [0, 1]) {
    adb('shell', 'settings', 'put', 'system', 'user_rotation', String(rotation));
    await until(rotation ? 'innerWidth > innerHeight' : 'innerHeight > innerWidth');
    await evaluate(`document.querySelector('.record-card-notes textarea').scrollIntoView({block:'center'})`); await pause(350);
    const field = await evaluate(`(()=>{const r=document.querySelector('.record-card-notes textarea').getBoundingClientRect();return {x:(r.x+r.width/2)*devicePixelRatio,y:(r.y+r.height/2)*devicePixelRatio};})()`);
    adb('shell', 'input', 'tap', String(Math.round(field.x)), String(Math.round(field.y)));
    await until('document.documentElement.dataset.nativeKeyboard === "true"');
    await send('Input.insertText', { text: 'Android SQLite restart check' });
    await pause(500);
    assert.equal(await evaluate('document.documentElement.dataset.mobileKeyboard'), 'true');
    const reachable = await evaluate(`(()=>{const r=document.querySelector('.record-card-notes textarea').getBoundingClientRect();return r.top>=-1&&r.bottom<=innerHeight+1;})()`);
    assert.ok(reachable, 'Keyboard hides the note input');
    await screenshot('emulator-keyboard-' + rotation);
    adb('shell', 'input', 'keyevent', '4');
    await until('document.documentElement.dataset.nativeKeyboard === "false"');
  }
  await evaluate(`document.querySelector('.record-card-notes textarea')?.blur()`);
  await pause(500); await evaluate('window.albumMobile.flushStorage()');
  check('native-keyboard-resizes-dialog-and-restores');
  adb('shell', 'am', 'force-stop', 'cn.flowcabin.app'); adb('shell', 'am', 'start', '-n', 'cn.flowcabin.app/.MainActivity');
  await connect();
  const saved = await evaluate('JSON.parse(localStorage.getItem("flow-cabin-web-collection-v1")).items');
  assert.equal(saved.length, 29); assert.ok(saved.some(item => item.notes?.includes('Android SQLite restart check'))); check('sqlite-collection-and-note-survive-real-process-restart');
  report.passed = true;
} catch (error) {
  report.passed = false; report.error = error.stack; process.exitCode = 1; console.error(error);
  await screenshot('emulator-failure').catch(() => {});
} finally {
  socket?.close();
  adb('shell', 'cmd', 'overlay', 'disable', '--user', '0', overlay);
  adb('shell', 'settings', 'put', 'system', 'user_rotation', '0');
  await fs.writeFile(path.join(output, 'android-device-report.json'), JSON.stringify(report, null, 2));
}
