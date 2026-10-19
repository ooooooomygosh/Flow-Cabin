// Sends one chat/completions request. Web: fetch from the page (the endpoint must allow
// CORS). Desktop: the page CSP is connect-src 'self', so the request goes through the
// shell (desktop/ai.cjs), which also keeps the key in safeStorage; the page never holds it.
import { chatUrl, chatBody, chatText, explainError, redact, readAi, isDeepseekEndpoint, aiProvider, TIMEOUT_MS, AI_KEY_KEY } from './ai-model.mjs';
import { desktopCommand } from '../desktop/desktop-command.mjs';

export const AI_RESULT_EVENT = 'cabin:ai-result', AI_KEY_EVENT = 'cabin:ai-key';
export const isDesktopShell = (win = globalThis) => win.document?.documentElement?.dataset?.desktopClient === 'true';
function webCredential(win) {
  try { const value = JSON.parse(win.localStorage?.getItem(AI_KEY_KEY) || 'null'); return value?.v === 2 && chatUrl(value.endpoint) === value.endpoint && typeof value.key === 'string' ? value : null; } catch { return null; }
}
// { stored, secure } — desktop: published by the shell as window.cabinAiKey; web: localStorage.
export function keyState(win = globalThis) {
  if (isDesktopShell(win)) return { stored: win.cabinAiKey?.stored === true, secure: win.cabinAiKey?.secure === true, where: 'desktop', endpoint: win.cabinAiKey?.endpoint || '', revision: win.cabinAiKey?.revision || 0 };
  const credential = webCredential(win);
  return { stored: Boolean(credential?.key), secure: false, where: 'web', endpoint: credential?.endpoint || '', revision: credential?.revision || 0 };
}
export function saveKey(key, { win = globalThis, command = desktopCommand, baseUrl = readAi(win.localStorage).baseUrl } = {}) {
  const value = String(key || '').trim(), endpoint = chatUrl(baseUrl);
  if (value && !endpoint) return false;
  if (isDesktopShell(win)) { command('ai-key', { key: value, endpoint: endpoint || '' }); return true; }
  try { if (value) win.localStorage.setItem(AI_KEY_KEY, JSON.stringify({ v: 2, key: value, endpoint, revision: `${Date.now()}:${++seq}` })); else win.localStorage.removeItem(AI_KEY_KEY); } catch { return false; }
  win.dispatchEvent?.(new CustomEvent(AI_KEY_EVENT));
  return true;
}
export function saveKeyConfirmed(key, { win = globalThis, command = desktopCommand, baseUrl = readAi(win.localStorage).baseUrl, timeoutMs = 5000 } = {}) {
  if (!isDesktopShell(win)) return Promise.resolve(saveKey(key, { win, command, baseUrl }));
  const endpoint = chatUrl(baseUrl), before = keyState(win).revision;
  if (key.trim() && !endpoint) return Promise.resolve(false);
  return new Promise((resolve) => {
    const done = (ok) => { clearTimeout(timer); win.removeEventListener(AI_KEY_EVENT, on); resolve(ok); };
    const on = () => { const current = keyState(win); if (current.revision !== before && current.stored === Boolean(key.trim()) && (!key.trim() || current.endpoint === endpoint)) done(true); };
    const timer = setTimeout(() => done(false), timeoutMs);
    win.addEventListener(AI_KEY_EVENT, on);
    if (!saveKey(key, { win, command, baseUrl })) done(false);
  });
}

let seq = 0;
// Resolves { ok: true, text } or { ok: false, error } — never throws, never includes the key.
export async function chat(settings, messages, { win = globalThis, fetchImpl = globalThis.fetch, command = desktopCommand, timeoutMs = TIMEOUT_MS, maxTokens = 600, json = false, temperature, signal } = {}) {
  const provider = aiProvider(settings), desktop = isDesktopShell(win);
  if (provider.mode === 'codex') {
    if (!desktop) return { ok: false, error: explainError({ kind: 'desktop' }) };
    if (signal?.aborted) return { ok: false, error: explainError({ kind: 'cancelled' }), kind: 'cli-cancelled' };
    const cliTimeout = Math.max(timeoutMs, 90000);
    return await new Promise((resolve) => {
      const id = `aicli${Date.now().toString(36)}${++seq}`;
      let timer = null;
      const done = (value) => {
        if (timer) clearTimeout(timer);
        win.removeEventListener(AI_RESULT_EVENT, on);
        signal?.removeEventListener('abort', abort);
        resolve(value);
      };
      const abort = () => {
        try { command('ai-cancel', { id }); } catch { /* the shell may already be closing */ }
        done({ ok: false, error: explainError({ kind: 'cancelled' }), kind: 'cli-cancelled' });
      };
      const on = (event) => {
        if (event.detail?.id !== id) return;
        const detail = event.detail;
        done(detail.ok ? { ok: true, text: detail.text } : { ok: false, error: explainError(detail), status: detail.status, kind: detail.kind });
      };
      timer = setTimeout(() => {
        try { command('ai-cancel', { id }); } catch { /* the shell may already be closing */ }
        done({ ok: false, error: explainError({ kind: 'cli-timeout' }) });
      }, cliTimeout + 3000);
      win.addEventListener(AI_RESULT_EVENT, on);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) return abort();
      command('ai-chat-cli', { id, body: JSON.stringify({ messages, max_tokens: maxTokens, temperature }) });
    });
  }
  const url = chatUrl(settings.baseUrl);
  if (!url || !settings.model) return { ok: false, error: explainError({ kind: 'config' }) };
  const body = chatBody(settings.model, messages, maxTokens, {
    json,
    temperature,
    ...(provider.thinking === 'disabled' || isDeepseekEndpoint(url) ? { thinking: 'disabled' } : {})
  });
  if (desktop) {
    if (signal?.aborted) return { ok: false, error: explainError({ kind: 'cancelled' }), kind: 'cancelled' };
    const send = (payload) => new Promise((resolve) => {
      const id = `ai${Date.now().toString(36)}${++seq}`;
      let timer = null;
      const done = (v) => {
        if (timer) clearTimeout(timer);
        win.removeEventListener(AI_RESULT_EVENT, on);
        signal?.removeEventListener('abort', abort);
        resolve(v);
      };
      const abort = () => {
        try { command('ai-cancel', { id }); } catch { /* the shell may already be closing */ }
        done({ ok: false, error: explainError({ kind: 'cancelled' }), kind: 'cancelled' });
      };
      const on = (e) => {
        if (e.detail?.id !== id) return;
        const d = e.detail;
        done(d.ok ? { ok: true, text: d.text } : { ok: false, error: explainError(d), status: d.status });
      };
      timer = setTimeout(() => {
        try { command('ai-cancel', { id }); } catch { /* the shell may already be closing */ }
        done({ ok: false, error: explainError({ kind: 'timeout' }) });
      }, timeoutMs + 2000);
      win.addEventListener(AI_RESULT_EVENT, on);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) return abort();
      command('ai-chat', { id, url, body: JSON.stringify(payload), ...(provider.requiresKey ? {} : { keyless: true }) });
    });
    let result = await send(body);
    // Some otherwise compatible providers reject response_format. A
    // structured prompt is still validated locally, so retry once without it.
    if (!result.ok && json && [400, 422].includes(result.status)) {
      const retry = { ...body };
      delete retry.response_format;
      result = await send(retry);
    }
    return result;
  }
  const credential = provider.requiresKey ? webCredential(win) : null, key = credential?.key;
  if (provider.requiresKey && (!key || credential.endpoint !== url)) return { ok: false, error: explainError({ kind: 'config' }) };
  const ctrl = new AbortController();
  let timedOut = false;
  const abort = () => ctrl.abort();
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs);
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) ctrl.abort();
  try {
    const send = async (payload) => {
      const headers = { 'Content-Type': 'application/json' };
      if (provider.requiresKey) headers.Authorization = `Bearer ${key}`;
      const res = await fetchImpl(url, { method: 'POST', redirect: 'error', headers, body: JSON.stringify(payload), signal: ctrl.signal });
      let data = null; try { data = await res.json(); } catch { /* not JSON */ }
      return { res, data };
    };
    let { res, data } = await send(body);
    if (!res.ok && json && [400, 422].includes(res.status)) {
      const retry = { ...body };
      delete retry.response_format;
      ({ res, data } = await send(retry));
    }
    if (provider.requiresKey && webCredential(win)?.revision !== credential.revision) return { ok: false, error: explainError({ kind: 'config' }) };
    if (!res.ok) return { ok: false, error: redact(explainError({ status: res.status, body: data }), key), status: res.status };
    const text = chatText(data);
    if (text) return { ok: true, text: redact(text, key) };
    const kind = Array.isArray(data?.choices) && data.choices.length ? 'empty' : 'format';
    return { ok: false, error: explainError({ kind }), status: res.status };
  } catch (error) {
    const kind = signal?.aborted && !timedOut ? 'cancelled' : error?.name === 'AbortError' ? 'timeout' : 'network';
    return { ok: false, error: explainError({ kind }), kind };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
