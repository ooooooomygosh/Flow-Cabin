'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAi, aiScript, validUrl, validBody, validCliBody } = require('../ai.cjs');
const { createSiteCommands } = require('../main/site-commands.cjs');

const KEY = 'sk-test-SECRET-1234567890';
const fakeSafe = (ok = true) => ({ isEncryptionAvailable: () => ok, encryptString: (s) => Buffer.from(`enc:${Buffer.from(s).toString('base64')}`), decryptString: (b) => Buffer.from(String(b).slice(4), 'base64').toString() });
const body = JSON.stringify({ model: 'deepseek-flash', messages: [{ role: 'user', content: 'hi' }], max_tokens: 8 });
const URL_OK = 'https://api.example.com/v1/chat/completions';
function setup({ fetch, safe = fakeSafe(), timeout, ...options } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-relay-')), out = [], logs = [];
  const ai = createAi({ directory: dir, safeStorage: safe, fetch, publish: (d) => out.push(d), writeLog: (...a) => logs.push(a.join(' ')), timeout, ...options });
  return { dir, out, logs, ai };
}

function guardedSafe(implementation = {}) {
  const calls = [];
  const safe = Object.fromEntries(['isEncryptionAvailable', 'getSelectedStorageBackend', 'encryptString', 'decryptString'].map((name) => [name, (...args) => {
    calls.push(name);
    if (!implementation[name]) throw new Error('Unexpected Keychain access');
    return implementation[name](...args);
  }]));
  return { safe, calls };
}

test('empty profile never probes safeStorage for state, publication, chat or clearing', async () => {
  const { safe, calls } = guardedSafe();
  let fetched = false;
  const { ai, out } = setup({ safe, fetch: async () => { fetched = true; } });
  const empty = { stored: false, secure: false, endpoint: '', revision: 0 };
  assert.deepEqual(ai.state(), empty);
  ai.publishKey();
  assert.deepEqual(out.at(-1), { type: 'key', ...empty });
  for (const [url, text] of [['file:///etc/passwd', body], [URL_OK, '{"model":1}'], [URL_OK, body]]) {
    await ai.chat('empty', url, text);
    assert.equal(out.at(-1).kind, 'config');
    assert.deepEqual(calls, []);
  }
  ai.setKey(KEY, 'invalid endpoint');
  assert.deepEqual(out.at(-1), { type: 'key', ...empty });
  ai.setKey('', URL_OK);
  assert.deepEqual(out.at(-1), { type: 'key', ...empty, revision: 1 });
  ai.publishKey();
  assert.deepEqual(ai.state(), { ...empty, revision: 1 });
  assert.equal(fetched, false);
  assert.deepEqual(calls, []);
});

test('explicit save encrypts and a fresh relay decrypts the persisted bound credential', async () => {
  const { safe, calls } = guardedSafe({ ...fakeSafe(), getSelectedStorageBackend: () => 'keychain' });
  const { ai, dir } = setup({ safe });
  ai.setKey(KEY, URL_OK);
  assert.ok(calls.includes('isEncryptionAvailable'));
  assert.ok(calls.includes('getSelectedStorageBackend'));
  assert.equal(calls.filter((name) => name === 'encryptString').length, 1);
  calls.length = 0;
  const out = [];
  let authorization;
  const restored = createAi({ directory: dir, safeStorage: safe, publish: (d) => out.push(d), fetch: async (_url, options) => {
    authorization = options.headers.Authorization;
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'restored' } }] }) };
  } });
  // Invalid requests must not unlock even an existing credential.
  await restored.chat('url', 'file:///etc/passwd', body);
  await restored.chat('body', URL_OK, 'not json');
  assert.deepEqual(calls, []);
  assert.deepEqual(restored.state(), { stored: true, secure: true, endpoint: URL_OK, revision: 0 });
  assert.ok(calls.includes('decryptString'));
  await restored.chat('restored', URL_OK, body);
  assert.equal(authorization, `Bearer ${KEY}`);
  assert.equal(out.at(-1).text, 'restored');
  calls.length = 0;
  restored.setKey('');
  restored.publishKey();
  assert.equal(restored.state().stored, false);
  assert.deepEqual(calls, []);
});

test('encryption and disk failures report memory-only credentials without further probes', async (t) => {
  for (const failure of ['unavailable', 'probe', 'encrypt', 'write']) {
    await t.test(failure, async () => {
      const implementation = { ...fakeSafe(), getSelectedStorageBackend: () => 'keychain' };
      if (failure === 'unavailable') implementation.isEncryptionAvailable = () => false;
      if (failure === 'probe') delete implementation.isEncryptionAvailable;
      if (failure === 'encrypt') delete implementation.encryptString;
      const { safe, calls } = guardedSafe(implementation);
      let authorization;
      const { ai, dir, out } = setup({ safe, fetch: async (_url, options) => {
        authorization = options.headers.Authorization;
        return { ok: true, json: async () => ({ choices: [{ message: { content: 'memory' } }] }) };
      } });
      if (failure === 'write') {
        fs.rmdirSync(dir);
        fs.writeFileSync(dir, 'Blocks credential directory creation');
      }
      ai.setKey(KEY, URL_OK);
      const saved = { stored: true, secure: false, endpoint: URL_OK, revision: 1 };
      assert.deepEqual(out.at(-1), { type: 'key', ...saved });
      assert.equal(fs.existsSync(path.join(dir, 'ai-key.bin')), false);
      calls.length = 0;
      assert.deepEqual(ai.state(), saved);
      ai.publishKey();
      await ai.chat('memory', URL_OK, body);
      assert.equal(authorization, `Bearer ${KEY}`);
      assert.equal(out.at(-1).text, 'memory');
      ai.setKey('');
      assert.deepEqual(out.at(-1), { type: 'key', stored: false, secure: false, endpoint: '', revision: 2 });
      assert.deepEqual(calls, []);
      fs.rmSync(dir, { recursive: true, force: true });
    });
  }
});

test('key is encrypted with safeStorage, never published or written in clear', () => {
  const { dir, out, ai } = setup();
  ai.setKey(KEY, URL_OK);
  assert.deepEqual(out.at(-1), { type: 'key', stored: true, secure: true, endpoint: URL_OK, revision: 1 });
  const raw = fs.readFileSync(path.join(dir, 'ai-key.bin'), 'utf8');
  assert.ok(!raw.includes(KEY));
  assert.ok(!aiScript(out.at(-1)).includes(KEY));
  ai.setKey('');
  assert.equal(fs.existsSync(path.join(dir, 'ai-key.bin')), false);
  assert.deepEqual(out.at(-1), { type: 'key', stored: false, secure: false, endpoint: '', revision: 2 });
});

test('without OS encryption the key stays in memory only', () => {
  const { dir, out, ai } = setup({ safe: fakeSafe(false) });
  ai.setKey(KEY, URL_OK);
  assert.deepEqual(out.at(-1), { type: 'key', stored: true, secure: false, endpoint: URL_OK, revision: 1 });
  assert.equal(fs.existsSync(path.join(dir, 'ai-key.bin')), false);
});

test('chat relays with Bearer auth and returns only the text', async () => {
  let seen;
  const { out, ai } = setup({ fetch: async (url, opts) => { seen = { url, opts }; return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '好' } }] }) }; } });
  ai.setKey(KEY, URL_OK);
  await ai.chat('a1', URL_OK, body);
  assert.equal(seen.url, URL_OK);
  assert.equal(seen.opts.headers.Authorization, `Bearer ${KEY}`);
  assert.equal('thinking' in JSON.parse(seen.opts.body), false);
  assert.deepEqual(out.at(-1), { type: 'result', id: 'a1', ok: true, text: '好' });
});

test('keyless loopback chat sends no Authorization header', async () => {
  let seen;
  const { out, ai } = setup({ fetch: async (url, opts) => { seen = { url, opts }; return { ok: true, json: async () => ({ choices: [{ message: { content: 'local' } }] }) }; } });
  ai.setKey(KEY, URL_OK);
  const local = JSON.stringify({ model: 'qwen3:8b', messages: [{ role: 'user', content: 'hi' }], max_tokens: 8 });
  await ai.chat('local', 'http://127.0.0.1:11434/v1/chat/completions', local, { keyless: true });
  assert.equal(seen.opts.headers.Authorization, undefined);
  assert.deepEqual(out.at(-1), { type: 'result', id: 'local', ok: true, text: 'local' });
});

test('CLI relay returns only the final text and never reasoning', async () => {
  const prompts = [];
  const { out, ai } = setup({ runCodex: async ({ prompt }) => { prompts.push(prompt); return { ok: true, text: '最终回答', reasoning: '不该出现' }; }, resolveCodexPath: () => '/fake/codex' });
  await ai.chatCli('cli1', JSON.stringify({ messages: [{ role: 'system', content: '只输出 JSON' }, { role: 'user', content: '排歌' }], max_tokens: 1200 }));
  assert.match(prompts[0], /<system>/);
  assert.match(prompts[0], /Return only the final answer/);
  assert.deepEqual(out.at(-1), { type: 'result', id: 'cli1', ok: true, text: '最终回答' });
  assert.ok(!JSON.stringify(out).includes('不该出现'));
  assert.equal(validCliBody(JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })).messages.length, 1);
  assert.equal(validCliBody(JSON.stringify({ messages: [] })), null);
});

test('CLI relay reports missing/timeout/failure without exposing process output', async () => {
  const missing = setup({ resolveCodexPath: () => '' });
  await missing.ai.chatCli('m', JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }));
  assert.deepEqual(missing.out.at(-1), { type: 'result', id: 'm', ok: false, kind: 'cli-missing' });
  const failure = setup({ runCodex: async () => ({ ok: false, kind: 'cli-failed' }), resolveCodexPath: () => '/fake/codex' });
  await failure.ai.chatCli('f', JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }));
  assert.deepEqual(failure.out.at(-1), { type: 'result', id: 'f', ok: false, kind: 'cli-failed' });
});

test('thinking controls are allowlisted and empty OpenAI-shaped replies are distinguished', async () => {
  let seen;
  const { out, ai } = setup({ fetch: async (_url, opts) => {
    seen = JSON.parse(opts.body);
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '', reasoning_content: '思考占满输出' } }] }) };
  } });
  ai.setKey(KEY, URL_OK);
  await ai.chat('empty', URL_OK, JSON.stringify({
    model: 'deepseek-flash',
    messages: [{ role: 'user', content: 'hi' }],
    max_tokens: 1200,
    thinking: { type: 'disabled' },
    reasoning_effort: 'low'
  }));
  assert.deepEqual(seen.thinking, { type: 'disabled' });
  assert.equal(seen.reasoning_effort, 'low');
  assert.deepEqual(out.at(-1), { type: 'result', id: 'empty', ok: false, kind: 'empty' });
});

test('errors carry status and redacted message, never the key', async () => {
  const { out, ai, logs } = setup({ fetch: async () => ({ ok: false, status: 401, json: async () => ({ error: { message: `Incorrect API key provided: ${KEY}` } }) }) });
  ai.setKey(KEY, URL_OK);
  await ai.chat('a2', URL_OK, body);
  const last = out.at(-1);
  assert.equal(last.ok, false); assert.equal(last.status, 401);
  assert.ok(!JSON.stringify(out).includes(KEY)); assert.ok(!logs.join().includes(KEY));
});

test('timeout and network failures', async () => {
  const hang = setup({ timeout: 30, fetch: (_u, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))) });
  hang.ai.setKey(KEY, URL_OK); await hang.ai.chat('t', URL_OK, body);
  assert.equal(hang.out.at(-1).kind, 'timeout');
  const net = setup({ fetch: async () => { throw new TypeError('fetch failed'); } });
  net.ai.setKey(KEY, URL_OK); await net.ai.chat('n', URL_OK, body);
  assert.equal(net.out.at(-1).kind, 'network');
});

test('refuses bad URLs, bodies and missing keys without fetching', async () => {
  let calls = 0;
  const { out, ai } = setup({ fetch: async () => { calls++; return {}; } });
  await ai.chat('k', URL_OK, body);
  assert.equal(out.at(-1).kind, 'config');
  ai.setKey(KEY, URL_OK);
  await ai.chat('u', 'file:///etc/passwd', body);
  await ai.chat('b', URL_OK, '{"model":1}');
  assert.equal(calls, 0);
  assert.equal(validUrl('https://user:pw@x.com/v1/chat/completions'), null);
  assert.equal(validUrl('https://x.com/v1/models'), null);
  assert.ok(validBody(body));
  const structured = validBody(JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'json' }], response_format: { type: 'json_object' }, temperature: 0.2 }));
  assert.deepEqual(structured.response_format, { type: 'json_object' });
  assert.equal(structured.temperature, 0.2);
  const thinking = validBody(JSON.stringify({
    model: 'deepseek-flash',
    messages: [{ role: 'user', content: 'json' }],
    thinking: { type: 'disabled' },
    reasoning_effort: 'max'
  }));
  assert.deepEqual(thinking.thinking, { type: 'disabled' });
  assert.equal(thinking.reasoning_effort, 'max');
  const unsupported = validBody(JSON.stringify({
    model: 'deepseek-flash',
    messages: [{ role: 'user', content: 'json' }],
    thinking: { type: 'automatic' },
    reasoning_effort: 'ultra'
  }));
  assert.equal('thinking' in unsupported, false);
  assert.equal('reasoning_effort' in unsupported, false);
  assert.equal(validBody(JSON.stringify({ model: 'm', messages: [{ role: 'tool', content: 'x' }] })), null);
});

test('site commands route /ai-key and /ai-chat', () => {
  const calls = [];
  const cmds = createSiteCommands({ isSitePage: () => true, ai: { setKey: (k, endpoint) => calls.push(['key', k, endpoint]), publishKey: () => calls.push(['publish']), chat: async (...a) => calls.push(['chat', ...a]), chatCli: async (...a) => calls.push(['cli', ...a]) } });
  assert.ok(cmds.commands.includes('/ai-key') && cmds.commands.includes('/ai-chat') && cmds.commands.includes('/ai-chat-cli'));
  cmds.handle(`album-desktop://action/ai-key?key=${encodeURIComponent(KEY)}&endpoint=${encodeURIComponent(URL_OK)}`);
  cmds.handle('album-desktop://action/ai-key');
  cmds.handle(`album-desktop://action/ai-chat?id=x&url=${encodeURIComponent(URL_OK)}&body=${encodeURIComponent(body)}&keyless=true`);
  cmds.handle(`album-desktop://action/ai-chat-cli?id=y&body=${encodeURIComponent(body)}`);
  assert.deepEqual(calls, [['key', KEY, URL_OK], ['publish'], ['chat', 'x', URL_OK, body, { keyless: true }], ['cli', 'y', body]]);
});


test('a saved key is bound to the exact endpoint and never follows redirects', async () => {
  const calls = [];
  const { ai, out } = setup({ fetch: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) }; } });
  ai.setKey(KEY, URL_OK);
  for (const url of ['https://evil.example/v1/chat/completions', 'https://api.example.com/other/chat/completions', 'http://api.example.com/v1/chat/completions', URL_OK + '?forward=evil']) {
    await ai.chat('rejected', url, body); assert.equal(out.at(-1).kind, 'config');
  }
  assert.equal(calls.length, 0);
  await ai.chat('allowed', URL_OK, body);
  assert.equal(calls[0].options.redirect, 'error');
  assert.ok(validUrl('http://127.0.0.1:1234/v1/chat/completions'));
  assert.ok(validUrl('http://[::1]:1234/v1/chat/completions'));
  assert.equal(validUrl('http://localhost.evil.test/v1/chat/completions'), null);
});

test('Linux basic_text is not encryption; legacy unbound keys cannot be sent', async () => {
  const { ai, dir } = setup({ safe: { ...fakeSafe(), getSelectedStorageBackend: () => 'basic_text' } });
  ai.setKey(KEY, URL_OK);
  assert.equal(ai.state().secure, false);
  assert.equal(fs.existsSync(path.join(dir, 'ai-key.bin')), false);
  const legacy = setup();
  fs.writeFileSync(path.join(legacy.dir, 'ai-key.bin'), fakeSafe().encryptString(KEY));
  assert.equal(legacy.ai.state().stored, false);
});

test('clearing a key suppresses an outstanding successful response', async () => {
  let respond;
  const { ai, out } = setup({ fetch: () => new Promise((resolve) => { respond = resolve; }) });
  ai.setKey(KEY, URL_OK);
  const pending = ai.chat('late', URL_OK, body);
  ai.setKey('');
  respond({ ok: true, json: async () => ({ choices: [{ message: { content: 'obsolete' } }] }) });
  await pending;
  assert.equal(out.at(-1).ok, false);
  assert.ok(!JSON.stringify(out).includes('obsolete'));
});
