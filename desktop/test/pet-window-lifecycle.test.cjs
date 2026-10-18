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
  const jobs = new Map(), ipcMain = new EventEmitter(); ipcMain.handle = () => {};
  const primary = { workArea: { x: 0, y: 0, width: 1920, height: 1080 } };
  const builtin = { workArea: { x: 1920, y: 0, width: 1728, height: 1080 } };
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.bounds = { x: options.x, y: options.y, width: options.width, height: options.height }; this.destroyed = false;
      this.webContents = new EventEmitter(); Object.assign(this.webContents, { mainFrame: { url: 'album-desktop://pet/pet.html' }, setWindowOpenHandler() {}, send() {}, session: { protocol: { isProtocolHandled: async () => true }, setPermissionRequestHandler() {}, setPermissionCheckHandler() {} } });
    }
    getBounds() { return { ...this.bounds }; }
    setBounds(value) { this.bounds = { ...value }; }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; this.emit('closed'); }
    setAlwaysOnTop() {} setVisibleOnAllWorkspaces() {} setIgnoreMouseEvents() {} showInactive() {}
    async loadURL() {}
  }
  const fakeElectron = { BrowserWindow: Window, ipcMain, Menu: {}, screen: { getPrimaryDisplay: () => primary, getDisplayMatching: bounds => singleDisplay || bounds.x < 1920 ? primary : builtin } };
  const sandbox = { module: { exports: {} }, __dirname: path.resolve(__dirname, '..'), console,
    setTimeout: (fn, delay) => { const id = ++timerId; jobs.set(id, { fn, delay }); return id; }, clearTimeout: id => jobs.delete(id),
    setInterval: () => ++timerId, clearInterval() {},
    require: name => name === 'electron' ? fakeElectron : name === 'node:fs' ? { readFileSync() { throw new Error('no profile'); }, mkdirSync() {}, writeFileSync() {} } : name === './companion-sync.cjs' ? { createCompanionPoller: ({ onValue }) => { push = onValue; return { start() {}, stop() {} }; }, sendCompanionCommand() {} } : name.startsWith('./') ? require(path.resolve(__dirname, '..', name)) : require(name)
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../pet.cjs'), 'utf8'), sandbox);
  const pet = sandbox.module.exports.createPet({ directory: '/fixture', getSite: () => ({ getBounds: () => ({ x: 2100, y: 40, width: 1000, height: 700 }), isDestroyed: () => false }), status() {}, registerProtocol() {} });
  return { pet, jobs, removeDisplay: () => { singleDisplay = true; }, push: value => push(value), event: (name, ...args) => { const sender = pet.window.webContents; ipcMain.emit(name, { sender, senderFrame: sender.mainFrame }, ...args); } };
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
