'use strict';
// AI（Beta）relay (opt-in, off by default). The page's CSP is connect-src 'self', so its one
// chat/completions request goes through here. The API key is kept in userData encrypted with
// Electron safeStorage; when the OS offers no encryption it is kept in memory for this session
// only. The key is never logged, never sent back to the page and never part of an error text.
const fs = require('node:fs');
const path = require('node:path');
const { resolveCodex, messagesToPrompt, runCodex: defaultRunCodex } = require('./codex-cli.cjs');
const TIMEOUT = 30000, MAX_BODY = 32 * 1024;

function validUrl(value) {
  let url; try { url = new URL(String(value)); } catch { return null; }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  return (url.protocol === 'https:' || (url.protocol === 'http:' && loopback)) && !url.username && !url.password && !url.search && !url.hash && /\/chat\/completions$/.test(url.pathname) ? url.href : null;
}
const loopbackUrl = (value) => {
  try { const url = new URL(String(value)); return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname); } catch { return false; }
};
function validBody(text) {
  if (typeof text !== 'string' || text.length > MAX_BODY) return null;
  let body; try { body = JSON.parse(text); } catch { return null; }
  if (!body || typeof body.model !== 'string' || !Array.isArray(body.messages) || body.messages.length > 8) return null;
  if (!body.messages.every((m) => m && ['system', 'user', 'assistant'].includes(m.role) && typeof m.content === 'string')) return null;
  const structured = body.response_format?.type === 'json_object' ? { response_format: { type: 'json_object' } } : {};
  const thinking = ['enabled', 'disabled'].includes(body.thinking?.type) ? { thinking: { type: body.thinking.type } } : {};
  const reasoning = ['none', 'low', 'high', 'max'].includes(body.reasoning_effort) ? { reasoning_effort: body.reasoning_effort } : {};
  return { model: body.model.slice(0, 120), messages: body.messages, temperature: Number(body.temperature) || 0.8, max_tokens: Math.min(1200, Number(body.max_tokens) || 600), stream: false, ...structured, ...thinking, ...reasoning };
}
function validCliBody(text) {
  if (typeof text !== 'string' || text.length > MAX_BODY) return null;
  let body; try { body = JSON.parse(text); } catch { return null; }
  if (!body || !Array.isArray(body.messages) || !body.messages.length || body.messages.length > 8) return null;
  if (!body.messages.every((message) => message && ['system', 'user', 'assistant'].includes(message.role) && typeof message.content === 'string' && message.content.trim())) return null;
  return { messages: body.messages, max_tokens: Math.min(1200, Number(body.max_tokens) || 600), temperature: Number(body.temperature) || 0.8 };
}
const redact = (text, key) => { let s = String(text || ''); if (key && key.length > 6) s = s.split(key).join('••••'); return s.replace(/\b(sk|Bearer)[-_ ][A-Za-z0-9_\-]{8,}/g, '$1-••••'); };

function createAi({ directory, safeStorage, fetch, publish, writeLog = () => {}, timeout = TIMEOUT, resolveCodexPath = resolveCodex, runCodex = defaultRunCodex }) {
  const file = path.join(directory, 'ai-key.bin');
  let memory = null, revision = 0;
  const requests = new Set();
  const secure = () => { try { return Boolean(safeStorage?.isEncryptionAvailable()) && safeStorage.getSelectedStorageBackend?.() !== 'basic_text'; } catch { return false; } };
  const readCredential = () => {
    if (memory) return { credential: memory, secure: false };
    try {
      // Read first: an empty profile must never probe the OS keychain.
      const encrypted = fs.readFileSync(file);
      const value = secure() ? JSON.parse(safeStorage.decryptString(encrypted)) : null;
      if (value?.v === 2 && typeof value.key === 'string' && value.key && validUrl(value.endpoint)) return { credential: value, secure: true };
    } catch { /* Legacy unbound keys must be saved again with their intended endpoint. */ }
    return { credential: null, secure: false };
  };
  const state = () => { const { credential, secure } = readCredential(); return { stored: Boolean(credential?.key), secure, endpoint: credential?.endpoint || '', revision }; };
  return {
    state,
    publishKey() { publish({ type: 'key', ...state() }); },
    setKey(value, endpoint) {
      const key = String(value || '').trim().slice(0, 400);
      if (key && !validUrl(endpoint)) { publish({ type: 'key', ...state() }); return; }
      revision++;
      for (const controller of requests) controller.abort();
      memory = null;
      try { fs.rmSync(file, { force: true }); } catch { /* ignore */ }
      if (key) {
        const credential = { v: 2, key, endpoint: validUrl(endpoint) };
        if (secure()) { try { fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(file, safeStorage.encryptString(JSON.stringify(credential)), { mode: 0o600 }); } catch { memory = credential; } }
        else memory = credential;
      }
      publish({ type: 'key', ...state() });
    },
    async chat(id, urlValue, bodyText, options = {}) {
      const reply = (detail) => publish({ type: 'result', id: String(id).slice(0, 40), ...detail });
      const url = validUrl(urlValue), body = validBody(bodyText);
      if (!url || !body) return reply({ ok: false, kind: 'config' });
      const { credential } = readCredential(), key = credential?.key, started = revision;
      const keyless = options?.keyless === true;
      if (keyless ? !loopbackUrl(url) : (!key || url !== credential.endpoint)) return reply({ ok: false, kind: 'config' });
      const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), timeout);
      requests.add(ctrl);
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (!keyless) headers.Authorization = `Bearer ${key}`;
        const res = await fetch(url, { method: 'POST', redirect: 'error', headers, body: JSON.stringify(body), signal: ctrl.signal });
        let json = null; try { json = await res.json(); } catch { /* not JSON */ }
        if (started !== revision) return reply({ ok: false, kind: 'config' });
        if (!res.ok) {
          const message = typeof json?.error?.message === 'string' ? redact(json.error.message, key).slice(0, 160) : '';
          return reply({ ok: false, status: res.status, body: { error: { message } } });
        }
        const text = json?.choices?.[0]?.message?.content;
        if (typeof text !== 'string' || !text.trim()) {
          return reply({ ok: false, kind: Array.isArray(json?.choices) && json.choices.length ? 'empty' : 'format' });
        }
        reply({ ok: true, text: redact(text, key).slice(0, 4000) });
      } catch (error) {
        writeLog('ai-error', error?.name === 'AbortError' ? 'timeout' : 'network');
        reply({ ok: false, kind: error?.name === 'AbortError' ? 'timeout' : 'network' });
      } finally { clearTimeout(timer); requests.delete(ctrl); }
    },
    async chatCli(id, bodyText) {
      const reply = (detail) => publish({ type: 'result', id: String(id).slice(0, 40), ...detail });
      const body = validCliBody(bodyText), prompt = body && messagesToPrompt(body.messages);
      if (!body || !prompt) return reply({ ok: false, kind: 'config' });
      const codexPath = resolveCodexPath();
      if (!codexPath) return reply({ ok: false, kind: 'cli-missing' });
      const result = await runCodex({ prompt, codexPath, timeout: Math.max(timeout, 90000) });
      if (result.ok) return reply({ ok: true, text: redact(result.text, '').slice(0, 4000) });
      reply({ ok: false, kind: result.kind || 'cli-failed' });
    }
  };
}
const aiScript = (detail) => detail.type === 'key'
  ? `window.cabinAiKey = ${JSON.stringify({ stored: detail.stored === true, secure: detail.secure === true, endpoint: detail.endpoint || '', revision: detail.revision || 0 })}; window.dispatchEvent(new CustomEvent('cabin:ai-key', { detail: window.cabinAiKey }));`
  : `window.dispatchEvent(new CustomEvent('cabin:ai-result', { detail: ${JSON.stringify(detail)} }));`;
module.exports = { createAi, aiScript, validUrl, validBody, validCliBody };
