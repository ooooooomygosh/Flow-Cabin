'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAi, aiScript, validUrl, validBody } = require('../ai.cjs');
const { createSiteCommands } = require('../main/site-commands.cjs');

const KEY = 'sk-test-SECRET-1234567890';
const fakeSafe = (ok = true) => ({ isEncryptionAvailable: () => ok, encryptString: (s) => Buffer.from(`enc:${Buffer.from(s).toString('base64')}`), decryptString: (b) => Buffer.from(String(b).slice(4), 'base64').toString() });
const body = JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: 'hi' }], max_tokens: 8 });
const URL_OK = 'https://api.example.com/v1/chat/completions';
function setup({ fetch, safe = fakeSafe(), timeout } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-relay-')), out = [], logs = [];
  const ai = createAi({ directory: dir, safeStorage: safe, fetch, publish: (d) => out.push(d), writeLog: (...a) => logs.push(a.join(' ')), timeout });
  return { dir, out, logs, ai };
}

test('key is encrypted with safeStorage, never published or written in clear', () => {
  const { dir, out, ai } = setup();
  ai.setKey(KEY);
  assert.deepEqual(out.at(-1), { type: 'key', stored: true, secure: true });
  const raw = fs.readFileSync(path.join(dir, 'ai-key.bin'), 'utf8');
  assert.ok(!raw.includes(KEY));
  assert.ok(!aiScript(out.at(-1)).includes(KEY));
  ai.setKey('');
  assert.equal(fs.existsSync(path.join(dir, 'ai-key.bin')), false);
  assert.deepEqual(out.at(-1), { type: 'key', stored: false, secure: true });
});

test('without OS encryption the key stays in memory only', () => {
  const { dir, out, ai } = setup({ safe: fakeSafe(false) });
  ai.setKey(KEY);
  assert.deepEqual(out.at(-1), { type: 'key', stored: true, secure: false });
  assert.equal(fs.existsSync(path.join(dir, 'ai-key.bin')), false);
});

test('chat relays with Bearer auth and returns only the text', async () => {
  let seen;
  const { out, ai } = setup({ fetch: async (url, opts) => { seen = { url, opts }; return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '好' } }] }) }; } });
  ai.setKey(KEY);
  await ai.chat('a1', URL_OK, body);
  assert.equal(seen.url, URL_OK);
  assert.equal(seen.opts.headers.Authorization, `Bearer ${KEY}`);
  assert.deepEqual(out.at(-1), { type: 'result', id: 'a1', ok: true, text: '好' });
});

test('errors carry status and redacted message, never the key', async () => {
  const { out, ai, logs } = setup({ fetch: async () => ({ ok: false, status: 401, json: async () => ({ error: { message: `Incorrect API key provided: ${KEY}` } }) }) });
  ai.setKey(KEY);
  await ai.chat('a2', URL_OK, body);
  const last = out.at(-1);
  assert.equal(last.ok, false); assert.equal(last.status, 401);
  assert.ok(!JSON.stringify(out).includes(KEY)); assert.ok(!logs.join().includes(KEY));
});

test('timeout and network failures', async () => {
  const hang = setup({ timeout: 30, fetch: (_u, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))) });
  hang.ai.setKey(KEY); await hang.ai.chat('t', URL_OK, body);
  assert.equal(hang.out.at(-1).kind, 'timeout');
  const net = setup({ fetch: async () => { throw new TypeError('fetch failed'); } });
  net.ai.setKey(KEY); await net.ai.chat('n', URL_OK, body);
  assert.equal(net.out.at(-1).kind, 'network');
});

test('refuses bad URLs, bodies and missing keys without fetching', async () => {
  let calls = 0;
  const { out, ai } = setup({ fetch: async () => { calls++; return {}; } });
  await ai.chat('k', URL_OK, body);
  assert.equal(out.at(-1).kind, 'config');
  ai.setKey(KEY);
  await ai.chat('u', 'file:///etc/passwd', body);
  await ai.chat('b', URL_OK, '{"model":1}');
  assert.equal(calls, 0);
  assert.equal(validUrl('https://user:pw@x.com/v1/chat/completions'), null);
  assert.equal(validUrl('https://x.com/v1/models'), null);
  assert.ok(validBody(body));
  assert.equal(validBody(JSON.stringify({ model: 'm', messages: [{ role: 'tool', content: 'x' }] })), null);
});

test('site commands route /ai-key and /ai-chat', () => {
  const calls = [];
  const cmds = createSiteCommands({ isSitePage: () => true, ai: { setKey: (k) => calls.push(['key', k]), publishKey: () => calls.push(['publish']), chat: async (...a) => calls.push(['chat', ...a]) } });
  assert.ok(cmds.commands.includes('/ai-key') && cmds.commands.includes('/ai-chat'));
  cmds.handle(`album-desktop://action/ai-key?key=${encodeURIComponent(KEY)}`);
  cmds.handle('album-desktop://action/ai-key');
  cmds.handle(`album-desktop://action/ai-chat?id=x&url=${encodeURIComponent(URL_OK)}&body=${encodeURIComponent(body)}`);
  assert.deepEqual(calls, [['key', KEY], ['publish'], ['chat', 'x', URL_OK, body]]);
});
