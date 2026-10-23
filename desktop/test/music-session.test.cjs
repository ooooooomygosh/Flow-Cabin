'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { EventEmitter } = require('node:events');
function load(name, deps) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'), { module, exports: module.exports, require: id => { if (id === 'node:crypto') return require(id); if (!(id in deps)) throw new Error('Unexpected dependency ' + id); return deps[id]; }, URL, Date, setInterval, clearInterval, setTimeout, clearTimeout, AbortController, console });
  return module.exports;
}
const tick = () => new Promise(resolve => setImmediate(resolve));
function loginFixture() {
  let cookies = [];
  const windows = [];
  class Window extends EventEmitter {
    constructor() { super(); this.dead = false; this.urls = []; this.webContents = new EventEmitter(); this.webContents.setWindowOpenHandler = fn => { this.popup = fn; }; windows.push(this); }
    isDestroyed() { return this.dead; }
    close() { this.dead = true; this.emit('closed'); }
    show() {}
    async loadURL(url) { this.urls.push(url); }
  }
  const electron = { BrowserWindow: Window, session: { fromPartition: () => ({ cookies: { get: async () => cookies }, clearStorageData: async () => { cookies = []; } }) } };
  return { api: load('music-login.cjs', { electron }), windows, setCookies: values => { cookies = values; } };
}
const qqCookies = key => [{ name: 'uin', value: '123', domain: '.qq.com' }, { name: key, value: 'TEST_ONLY', domain: '.qq.com' }];
test('QQ partial login on close is cancelled, not playable success', async () => {
  const f = loginFixture(), result = f.api.openQQLogin(null); await tick();
  f.setCookies(qqCookies('p_skey')); f.windows[0].close();
  const value = await result; assert.equal(value.ok, false); assert.equal(value.cookie, undefined); assert.match(value.message, /播放凭据/);
});
test('QQ playback ticket succeeds while expired cookie is not reused', async () => {
  const f = loginFixture(); f.setCookies(qqCookies('qm_keyst').map(c => ({ ...c, expirationDate: 1 })));
  const result = f.api.openQQLogin(null); await tick(); assert.equal(f.windows.length, 1);
  f.setCookies(qqCookies('qm_keyst')); f.windows[0].close(); assert.equal((await result).ok, true);
});
test('login navigation and redirects only allow provider HTTPS domains', async () => {
  const f = loginFixture(), pending = f.api.openQQLogin(null); await tick(); const win = f.windows[0];
  for (const url of ['https://evil.test', 'https://qq.com.evil.test', 'http://y.qq.com', 'file:///tmp/x', 'https://u:p@y.qq.com', 'https://y.qq.com:123']) {
    const before = win.urls.length; assert.equal(win.popup({ url }).action, 'deny'); assert.equal(win.urls.length, before);
    for (const event of ['will-navigate', 'will-redirect']) { let blocked = false; win.webContents.emit(event, { preventDefault() { blocked = true; } }, url); assert.equal(blocked, true); }
  }
  win.popup({ url: 'https://open.weixin.qq.com/connect/qrconnect' }); assert.equal(win.urls.at(-1), 'https://open.weixin.qq.com/connect/qrconnect');
  await f.api.clearQQLogin(); assert.equal((await pending).cancelled, true); assert.equal(win.isDestroyed(), true);
});
test('logout cancels login before asynchronous initial cookie read completes', async () => {
  const f = loginFixture(), pending = f.api.openNeteaseLogin(null); await f.api.clearNeteaseLogin();
  assert.equal((await pending).ok, false); assert.equal(f.windows.length, 0);
});
test('NetEase logged-in context requires successful server account evidence', async () => {
  let calls = 0;
  const api = load('music-upstream.cjs', { NeteaseCloudMusicApi: { login_status: async () => { calls++; return { status: 200, body: { data: { code: 200, profile: { userId: 42, nickname: 'Test', vipType: 0 } } } }; } } });
  assert.equal((await api.getNeteaseLoginInfo('')).loggedIn, false); assert.equal(calls, 0);
  const info = await api.getNeteaseLoginInfo('MUSIC_U=TEST_ONLY'); assert.equal(info.loggedIn, true); assert.equal(info.userId, 42); assert.equal(info.isVip, false);
});
test('NetEase failed account verification never invents membership from a cookie', async () => {
  const api = load('music-upstream.cjs', { NeteaseCloudMusicApi: { login_status: async () => ({ status: 401, body: { profile: { userId: 42, vipType: 11 } } }), user_account: async () => { throw new Error('offline'); } } });
  const info = await api.getNeteaseLoginInfo('MUSIC_U=TEST_ONLY'); assert.equal(info.loggedIn, false); assert.notEqual(info.isSvip, true);
});
test('NetEase user_account fallback uses server identity', async () => {
  const api = load('music-upstream.cjs', { NeteaseCloudMusicApi: { login_status: async () => ({ status: 200, body: { data: { profile: null } } }), user_account: async () => ({ status: 200, body: { code: 200, account: { id: 7 }, profile: { userId: 7, vipType: 1 } } }) } });
  const info = await api.getNeteaseLoginInfo('MUSIC_U=TEST_ONLY'); assert.equal(info.loggedIn, true); assert.equal(info.userId, 7); assert.equal(info.isVip, true);
});

test('NetEase offline verification is retryable and never becomes a logout', async () => {
  const api = load('music-upstream.cjs', { NeteaseCloudMusicApi: { login_status: async () => { throw Error('offline'); }, user_account: async () => { throw Error('offline'); } } });
  await assert.rejects(api.getNeteaseLoginInfo('MUSIC_U=TEST_ONLY'), /暂时无法验证/);
});
