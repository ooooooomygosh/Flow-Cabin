'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isSiteUrl, isShellUrl, isExternalUrl, safeSavedWindow } = require('../policy.cjs');

test('original host allows room links and refuses origin lookalikes and credentials', () => {
  assert.ok(isSiteUrl('https://album-circle.vercel.app/?room=abc&item=xyz'));
  for (const url of ['http://album-circle.vercel.app', 'https://album-circle.vercel.app.evil.test', 'https://evil.test/?host=album-circle.vercel.app', 'https://user:password@album-circle.vercel.app', 'file:///C:/secret', 'javascript:alert(1)']) assert.equal(isSiteUrl(url), false, url);
});
test('only the local shell document can invoke native commands', () => {
  assert.ok(isShellUrl('album-desktop://shell/index.html'));
  for (const url of ['album-desktop://shell/app.js', 'album-desktop://shell:123/index.html', 'album-desktop://evil/index.html', 'https://album-circle.vercel.app/', 'album-desktop://user:pass@shell/index.html']) assert.equal(isShellUrl(url), false, url);
});
test('external opening is limited to credential-free HTTPS', () => {
  assert.ok(isExternalUrl('https://music.apple.com/album/123'));
  for (const url of ['file:///C:/Windows', 'javascript:alert(1)', 'data:text/html,test', 'powershell:command', 'http://insecure.test', 'https://user:pass@example.com', 'invalid']) assert.equal(isExternalUrl(url), false, url);
});
test('saved offscreen geometry does not strand the window on a disconnected monitor', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1080 };
  const recovered = safeSavedWindow({ x: 99999, y: 99999, width: 99999, height: 99999 }, area);
  assert.equal(recovered.x, undefined); assert.equal(recovered.y, undefined);
  assert.equal(recovered.width, 1920); assert.equal(recovered.height, 1080);
});

const { localDownloadType, saveDialog, SITE_ORIGIN } = require('../policy.cjs');
test('study template download permits only the small named TSV from a local blob', () => {
  const value = { url:`blob:${SITE_ORIGIN}/id`, filename:'小屋词书模板.tsv', bytes:32, mimeType:'text/tab-separated-values' };
  assert.equal(localDownloadType(value),'tsv');
  for (const change of [{url:'data:text/tab-separated-values,word'}, {url:'blob:https://evil.test/id'}, {url:`${SITE_ORIGIN}/template.tsv`}, {filename:'other.tsv'}, {filename:'小屋词书模板.tsv.exe'}, {bytes:4097}, {bytes:-1}, {mimeType:'text/html'}]) assert.equal(localDownloadType({...value,...change}),null);
  for (const filename of ['wall.png','project.json']) assert(localDownloadType({...value,filename,bytes:6000000}));
  assert.equal(localDownloadType({...value,filename:'wall.png',bytes:64*1024*1024+1}),null);
  assert.equal(localDownloadType({...value,filename:'FlowCabin-backup-20261016.json',bytes:9000}),'backup');
  assert.equal(localDownloadType({...value,filename:'FlowCabin-backup-2026.json',bytes:9000}),'json');
  assert.equal(saveDialog('backup').title,'保存备份'); assert.equal(saveDialog('json').title,'保存专辑墙工程'); assert.equal(saveDialog('png').extension,'png'); assert.equal(saveDialog('exe'),null);
});
