'use strict';
// Local Codex CLI provider. The app only reads the final assistant message
// written by `codex exec --output-last-message`; intermediate reasoning and
// tool events are intentionally discarded.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const MAX_PROMPT = 32 * 1024;
const DEFAULT_TIMEOUT = 90000;
const pathFor = (platform) => platform === 'win32' ? path.win32 : path.posix;

function childEnvironment(platform = process.platform, env = process.env) {
  const names = platform === 'win32'
    ? ['PATH', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'SystemRoot', 'ComSpec', 'PATHEXT', 'USERNAME', 'LANG', 'TERM', 'NO_COLOR', 'CODEX_HOME']
    : ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'NO_COLOR', 'TMPDIR', 'CODEX_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY'];
  return Object.fromEntries(names.filter((name) => typeof env[name] === 'string').map((name) => [name, env[name]]));
}

// A packaged GUI app does not inherit the login shell's PATH. Codex is often
// a Node script, so prepend its own bin directory (which normally also holds
// node) plus the common user-managed Node locations.
function runtimePath({ platform = process.platform, env = process.env, home = os.homedir(), codexPath = '' } = {}) {
  const platformPath = pathFor(platform);
  const directories = [
    codexPath && platformPath.dirname(codexPath),
    ...String(env.PATH || '').split(platformPath.delimiter),
    ...(platform === 'win32'
      ? [platformPath.join(env.APPDATA || platformPath.join(home, 'AppData', 'Roaming'), 'npm')]
      : [
          '/opt/homebrew/bin',
          '/usr/local/bin',
          platformPath.join(home, '.local', 'bin'),
          platformPath.join(home, '.volta', 'bin'),
          ...nvmCandidates(home, platform).map((candidate) => platformPath.dirname(candidate))
        ])
  ].filter(Boolean);
  return [...new Set(directories)].join(platformPath.delimiter);
}

function executable(file) {
  try { return fs.statSync(file).isFile() && (process.platform === 'win32' || Boolean(fs.accessSync(file, fs.constants.X_OK) ?? true)); }
  catch { return false; }
}

function pathBinaryNames(platform = process.platform) {
  return platform === 'win32' ? ['codex.cmd', 'codex.exe', 'codex.bat', 'codex'] : ['codex'];
}

function nvmCandidates(home, platform = process.platform) {
  const platformPath = pathFor(platform);
  const root = platformPath.join(home, '.nvm', 'versions', 'node');
  try {
    return fs.readdirSync(root)
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
      .map((version) => platformPath.join(root, version, 'bin', 'codex'));
  } catch { return []; }
}

function resolveCodex({ env = process.env, platform = process.platform, home = os.homedir(), isExecutable = executable } = {}) {
  const platformPath = pathFor(platform);
  const explicit = [env.FLOW_CABIN_CODEX_BIN, env.CODEX_BIN].filter(Boolean);
  const pathDirs = String(env.PATH || '').split(platformPath.delimiter).filter(Boolean);
  const pathCandidates = pathDirs.flatMap((dir) => pathBinaryNames(platform).map((name) => platformPath.join(dir, name)));
  const localCandidates = platform === 'win32'
    ? [
        platformPath.join(env.APPDATA || platformPath.join(home, 'AppData', 'Roaming'), 'npm', 'codex.cmd'),
        platformPath.join(home, 'AppData', 'Roaming', 'npm', 'codex.cmd')
      ]
    : [
        platformPath.join(home, '.local', 'bin', 'codex'),
        platformPath.join(home, '.npm-global', 'bin', 'codex'),
        platformPath.join(home, '.volta', 'bin', 'codex'),
        '/opt/homebrew/bin/codex',
        '/usr/local/bin/codex',
        ...nvmCandidates(home, platform)
      ];
  return [...explicit, ...pathCandidates, ...localCandidates].find(isExecutable) || '';
}

function messagesToPrompt(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 8) return null;
  const blocks = [];
  for (const message of messages) {
    if (!message || !['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string') return null;
    const content = message.content.trim();
    if (!content) return null;
    blocks.push(`<${message.role}>\n${content}\n</${message.role}>`);
  }
  const prompt = `${blocks.join('\n\n')}\n\n<flow-cabin-output>\nReturn only the final answer for the user. Do not include analysis, reasoning, tool calls, status messages, or code fences. If the answer is JSON, return only the JSON object.\n</flow-cabin-output>\n`;
  return prompt.length <= MAX_PROMPT ? prompt : null;
}

// Codex's JSONL output names the final assistant message differently across
// versions. This is only a fallback; the output file is authoritative.
function finalFromJsonl(stdout) {
  for (const line of String(stdout || '').trim().split('\n').reverse()) {
    let event; try { event = JSON.parse(line); } catch { continue; }
    const item = event?.item || event;
    if (item?.type === 'agent_message' && typeof item.text === 'string' && item.text.trim()) return item.text.trim();
    if (event?.type === 'agent_message' && typeof event.message === 'string' && event.message.trim()) return event.message.trim();
  }
  return '';
}

function runCodex({
  prompt, codexPath = resolveCodex(), timeout = DEFAULT_TIMEOUT,
  spawnImpl = spawn, platform = process.platform, tempRoot = os.tmpdir()
} = {}) {
  if (!codexPath) return Promise.resolve({ ok: false, kind: 'cli-missing' });
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_PROMPT) return Promise.resolve({ ok: false, kind: 'config' });
  let directory;
  try { directory = fs.mkdtempSync(path.join(tempRoot, 'flow-cabin-codex-')); }
  catch { return Promise.resolve({ ok: false, kind: 'cli-failed' }); }
  const output = path.join(directory, 'last-message.txt');
  const args = [
    'exec', '--json', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only', '--color', 'never',
    '-c', 'model_reasoning_effort="none"',
    '-C', directory, '--output-last-message', output, '-'
  ];
  return new Promise((resolve) => {
    let settled = false, timedOut = false, stdout = '', stderr = '', timer = null, child;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { fs.rmSync(directory, { recursive: true, force: true }); } catch { /* best effort */ }
      resolve(result);
    };
    try {
      const env = childEnvironment(platform);
      env.PATH = runtimePath({ platform, codexPath });
      child = spawnImpl(codexPath, args, {
        cwd: directory,
        env: { ...env, NO_COLOR: '1', TERM: 'dumb' },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        detached: platform !== 'win32',
        shell: platform === 'win32' && /\.(cmd|bat)$/i.test(codexPath)
      });
    } catch (error) {
      finish({ ok: false, kind: error?.code === 'ENOENT' ? 'cli-missing' : 'cli-failed' });
      return;
    }
    child.on('error', (error) => finish({ ok: false, kind: error?.code === 'ENOENT' ? 'cli-missing' : 'cli-failed' }));
    child.stdout?.on('data', (chunk) => { stdout = (stdout + chunk).slice(-256 * 1024); });
    child.stderr?.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4096); });
    child.on('close', (code, signal) => {
      let text = '';
      try { text = fs.readFileSync(output, 'utf8').trim(); } catch { /* fallback below */ }
      if (!text) text = finalFromJsonl(stdout);
      if (timedOut) finish({ ok: false, kind: 'cli-timeout' });
      else if (code === 0 && text) finish({ ok: true, text: text.slice(0, 4000) });
      else if (code === 0) finish({ ok: false, kind: 'cli-empty' });
      else if (signal === 'SIGTERM' || signal === 'SIGKILL') finish({ ok: false, kind: 'cli-timeout' });
      else finish({ ok: false, kind: 'cli-failed', exitCode: code });
    });
    timer = setTimeout(() => {
      timedOut = true;
      const signal = (name) => {
        try {
          if (platform !== 'win32' && child.pid) process.kill(-child.pid, name);
          else child.kill(name);
        } catch { /* the close handler still resolves */ }
      };
      signal('SIGINT');
      setTimeout(() => signal('SIGTERM'), 1000).unref?.();
      setTimeout(() => { signal('SIGKILL'); finish({ ok: false, kind: 'cli-timeout' }); }, 1800).unref?.();
    }, Math.max(1000, Number(timeout) || DEFAULT_TIMEOUT));
    timer.unref?.();
    try { child.stdin?.end(prompt); } catch { /* the close handler reports the failure */ }
  });
}

module.exports = {
  DEFAULT_TIMEOUT, MAX_PROMPT, resolveCodex, messagesToPrompt, finalFromJsonl, runtimePath, runCodex
};
