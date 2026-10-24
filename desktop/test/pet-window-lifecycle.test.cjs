'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

// Exercise the real controller against fake OS windows. No screen or profile
// is touched; these assertions do not claim native click-through acceptance.
function fixture() {
  let push, timerId = 0, singleDisplay = false;
  const protocols=new Map(),protocolCalls=[];
  const jobs = new Map(), ipcMain = new EventEmitter(); const handlers = {}; ipcMain.handle = (name, fn) => { handlers[name] = fn; };
  const primary = { workArea: { x: 0, y: 0, width: 1920, height: 1080 } };
  const builtin = { workArea: { x: 1920, y: 0, width: 1728, height: 1080 } };
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.bounds = { x: options.x, y: options.y, width: options.width, height: options.height }; this.destroyed = false;
      this.webContents = new EventEmitter(); Object.assign(this.webContents, { mainFrame: { url: 'album-desktop://pet/pet.html' }, setWindowOpenHandler() {}, send() {}, session: { protocol: { isProtocolHandled: async () => true, unhandle(scheme) {protocolCalls.push(['unhandle',scheme]);}, handle(scheme,route) {protocolCalls.push(['handle',scheme]);protocols.set(scheme,route);} }, setPermissionRequestHandler() {}, setPermissionCheckHandler() {} } });
    }
    getBounds() { return { ...this.bounds }; }
    setBounds(value) { this.bounds = { ...value }; }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; this.emit('closed'); }
    setAlwaysOnTop() {} setVisibleOnAllWorkspaces() {} setIgnoreMouseEvents() {} showInactive() {}
    async loadURL() {}
  }
  const fakeElectron = { BrowserWindow: Window, ipcMain, Menu: {}, screen: { getPrimaryDisplay: () => primary, getDisplayMatching: bounds => singleDisplay || bounds.x < 1920 ? primary : builtin, getCursorScreenPoint: () => ({ x: 2500, y: 900 }) } };
  const sandbox = { module: { exports: {} }, __dirname: path.resolve(__dirname, '..'), console,
    setTimeout: (fn, delay) => { const id = ++timerId; jobs.set(id, { fn, delay }); return id; }, clearTimeout: id => jobs.delete(id),
    setInterval: () => ++timerId, clearInterval() {},
    require: name => name === 'electron' ? fakeElectron : name === 'node:fs' ? { readFileSync() { throw new Error('no profile'); }, mkdirSync() {}, writeFileSync() {} } : name === './companion-sync.cjs' ? { createCompanionPoller: ({ onValue }) => { push = onValue; return { start() {}, stop() {} }; }, sendCompanionCommand() {} } : name.startsWith('./') ? require(path.resolve(__dirname, '..', name)) : require(name)
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../pet.cjs'), 'utf8'), sandbox);
  const pet = sandbox.module.exports.createPet({ directory: '/fixture', getSite: () => ({ getBounds: () => ({ x: 2100, y: 40, width: 1000, height: 700 }), isDestroyed: () => false }), status() {}, registerProtocol() {} });
  return { pet, jobs, handlers, protocols,protocolCalls, removeDisplay: () => { singleDisplay = true; }, push: value => push(value), event: (name, ...args) => { const sender = pet.window.webContents; ipcMain.emit(name, { sender, senderFrame: sender.mainFrame }, ...args); } };
}

test('new desktop pet starts on the main cabin display, not always the primary display', async () => {
  const f = fixture(); await f.pet.start(); assert(f.pet.window.getBounds().x >= 1920); f.pet.stop();
});
test('removing the display cancels the flight before repositioning onto the remaining display', async () => {
  const f = fixture(); await f.pet.start();
  // A throw (quick moves): a slow placement just stays put since v1.18.
  for (let i = 0; i < 3; i++) f.event('pet:move', 30, -200); f.event('pet:drag-end'); assert([...f.jobs.values()].some(job => job.delay === 16));
  f.removeDisplay(); f.pet.reposition(); const bounds = f.pet.window.getBounds(); assert(bounds.x < 1920);
  assert(![...f.jobs.values()].some(job => job.delay === 16), 'no old flight can move the pet back to the unplugged screen');
  f.pet.stop();
});
test('reduced motion drag release never schedules a throw; enabling it cancels a running flight', async () => {
  const f = fixture(); await f.pet.start(); f.push({ reduceMotion: true });
  f.event('pet:move', 30, -200); const placed = f.pet.window.getBounds(); f.event('pet:drag-end');
  assert.deepEqual(f.pet.window.getBounds(), placed); assert(![...f.jobs.values()].some(job => job.delay === 16));
  f.push({ reduceMotion: false }); for (let i = 0; i < 3; i++) f.event('pet:move', 30, -20); f.event('pet:drag-end');
  const frame = [...f.jobs.entries()].find(([, job]) => job.delay === 16); assert(frame);
  f.jobs.delete(frame[0]); f.push({ reduceMotion: true }); frame[1].fn();
  assert(![...f.jobs.values()].some(job => job.delay === 16)); f.pet.stop();
});

test('a freshly shown pet takes the first click (macOS) and can hit-test a pointer already resting on it', async () => {
  const f = fixture(); await f.pet.start();
  assert.equal(f.pet.window.options.acceptFirstMouse, true, 'the inactive pet must not swallow the first click of a double-click');
  const sender = f.pet.window.webContents, b = f.pet.window.getBounds();
  assert.deepEqual({ ...(await f.handlers['pet:cursor']({ sender, senderFrame: sender.mainFrame })) }, { x: 2500 - b.x, y: 900 - b.y });
  await assert.rejects(async () => f.handlers['pet:cursor']({ sender: {}, senderFrame: {} }));
  f.pet.stop();
});

test('2.2: a locked pet ignores drags; with gravity a pet let go mid-air falls; hide for an hour', async () => {
  const f = fixture(); await f.pet.start();
  const before = f.pet.window.getBounds();
  assert.equal(f.pet.setPrefs({ locked: true }).locked, true);
  f.event('pet:move', 50, -50); f.event('pet:drag-end');
  assert.deepEqual(f.pet.window.getBounds(), before, 'locked: the pet stays put');
  f.pet.setPrefs({ locked: false });
  f.event('pet:move', 0, -300); f.event('pet:drag-end');
  assert([...f.jobs.values()].some(job => job.delay === 16), 'a careful placement mid-air still falls');
  f.pet.hideFor(3600000); assert(f.pet.hiddenUntil > Date.now()); f.pet.showNow(); assert.equal(f.pet.hiddenUntil, 0);
  f.pet.stop();
});

test('isolated pet installs a fixed atlas-only HTTPS handler before loading its page',async()=>{const f=fixture();await f.pet.start();assert.deepEqual(f.protocolCalls,[['unhandle','https'],['handle','https']]);assert.equal((await f.protocols.get('https')(new Request('https://untrusted.invalid/atlas.png'))).status,403);f.pet.stop();});
