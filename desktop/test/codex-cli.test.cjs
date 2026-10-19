'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { resolveCodex, messagesToPrompt, finalFromJsonl, runtimePath, runCodex } = require('../codex-cli.cjs');

const messages = [
  { role: 'system', content: '只返回 JSON。' },
  { role: 'user', content: '帮我排一张歌单。' }
];

test('Codex prompt keeps roles and explicitly asks for final output only', () => {
  const prompt = messagesToPrompt(messages);
  assert.match(prompt, /<system>\n只返回 JSON。/);
  assert.match(prompt, /<user>\n帮我排一张歌单。/);
  assert.match(prompt, /Return only the final answer/);
  assert.doesNotMatch(prompt, /reasoning_content/);
  assert.equal(messagesToPrompt([{ role: 'tool', content: 'x' }]), null);
  assert.equal(messagesToPrompt([]), null);
});

test('JSONL fallback ignores reasoning and reads the final agent message', () => {
  const stdout = [
    JSON.stringify({ type: 'item.completed', item: { type: 'reasoning', text: '不要泄露的思考' } }),
    JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: '最终歌单' } })
  ].join('\n');
  assert.equal(finalFromJsonl(stdout), '最终歌单');
  assert.equal(finalFromJsonl(stdout).includes('思考'), false);
});

test('Codex binary resolution prefers explicit paths and finds PATH binaries', () => {
  const found = new Set(['/custom/codex', '/path/bin/codex']);
  assert.equal(resolveCodex({
    env: { FLOW_CABIN_CODEX_BIN: '/custom/codex', PATH: '/path/bin' },
    platform: 'darwin',
    home: '/home/me',
    isExecutable: (file) => found.has(file)
  }), '/custom/codex');
  assert.equal(resolveCodex({
    env: { PATH: '/path/bin' },
    platform: 'darwin',
    home: '/home/me',
    isExecutable: (file) => found.has(file)
  }), '/path/bin/codex');
  assert.equal(resolveCodex({ env: {}, platform: 'darwin', home: '/home/me', isExecutable: () => false }), '');
});

test('runtime PATH keeps a GUI-launched Node-based Codex executable working', () => {
  const value = runtimePath({
    platform: 'darwin',
    env: { PATH: '/usr/bin:/bin' },
    home: '/Users/me',
    codexPath: '/Users/me/.nvm/versions/node/v24.14.0/bin/codex'
  });
  const entries = value.split(path.posix.delimiter);
  assert.equal(entries[0], '/Users/me/.nvm/versions/node/v24.14.0/bin');
  assert.ok(entries.includes('/opt/homebrew/bin'));
  assert.ok(entries.includes('/usr/bin'));
});

test('Windows resolution keeps the npm shim and semicolon-delimited PATH', () => {
  const appData = 'C:\\Users\\me\\AppData\\Roaming';
  const shim = `${appData}\\npm\\codex.cmd`;
  assert.equal(resolveCodex({
    env: { APPDATA: appData },
    platform: 'win32',
    home: 'C:\\Users\\me',
    isExecutable: (file) => file === shim
  }), shim);
  const value = runtimePath({
    platform: 'win32',
    env: { PATH: 'C:\\Windows\\System32;C:\\Tools' },
    home: 'C:\\Users\\me',
    codexPath: shim
  });
  assert.deepEqual(value.split(path.win32.delimiter).slice(0, 2), [`${appData}\\npm`, 'C:\\Windows\\System32']);
});

test('runCodex writes and returns only the final message file', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cli-test-'));
  let seenArgs = null;
  let seenEnv = null;
  const spawnImpl = (_command, args, options) => {
    seenArgs = args;
    seenEnv = options.env;
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = () => {};
    let input = '';
    child.stdin.on('data', (chunk) => { input += chunk; });
    child.stdin.on('end', () => {
      assert.match(input, /帮我排一张歌单/);
      const output = args[args.indexOf('--output-last-message') + 1];
      fs.writeFileSync(output, '只给最终回答\n');
      child.stdout.write(`${JSON.stringify({ type: 'item.completed', item: { type: 'reasoning', text: '中间思考' } })}\n`);
      child.stdout.end();
      setImmediate(() => child.emit('close', 0, null));
    });
    return child;
  };
  try {
    const result = await runCodex({ prompt: messagesToPrompt(messages), codexPath: '/fake/codex', spawnImpl, tempRoot, timeout: 1000 });
    assert.deepEqual(result, { ok: true, text: '只给最终回答' });
    assert.ok(seenArgs.includes('--ephemeral'));
    assert.ok(seenArgs.includes('--json'));
    assert.ok(seenArgs.includes('--skip-git-repo-check'));
    assert.ok(seenArgs.includes('--sandbox'));
    assert.ok(seenArgs.includes('model_reasoning_effort="none"'));
    assert.ok(!seenArgs.includes('--dangerously-bypass-approvals-and-sandbox'));
    assert.match(seenEnv.PATH.split(path.delimiter)[0], /\/fake$/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('runCodex reports missing and empty final output', async () => {
  assert.deepEqual(await runCodex({ prompt: 'x', codexPath: '' }), { ok: false, kind: 'cli-missing' });
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cli-test-'));
  const spawnImpl = () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = () => {};
    child.stdin.resume();
    child.stdin.on('end', () => setImmediate(() => child.emit('close', 0, null)));
    return child;
  };
  try {
    assert.deepEqual(await runCodex({ prompt: 'x', codexPath: '/fake/codex', spawnImpl, tempRoot, timeout: 1000 }), { ok: false, kind: 'cli-empty' });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
