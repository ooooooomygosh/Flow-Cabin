// Sends one chat/completions request. Web: fetch from the page (the endpoint must allow
// CORS). Desktop: the page CSP is connect-src 'self', so the request goes through the
// shell (desktop/ai.cjs), which also keeps the key in safeStorage; the page never holds it.
import { chatUrl, chatBody, chatText, explainError, redact, readAi, TIMEOUT_MS, AI_KEY_KEY } from './ai-model.mjs';
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
export async function chat(settings, messages, { win = globalThis, fetchImpl = globalThis.fetch, command = desktopCommand, timeoutMs = TIMEOUT_MS, maxTokens = 600, json = false, temperature } = {}) {
  const url = chatUrl(settings.baseUrl);
  if (!url || !settings.model) return { ok: false, error: explainError({ kind: 'config' }) };
  const body = chatBody(settings.model, messages, maxTokens, { json, temperature });
  if (isDesktopShell(win)) {
    const send = (payload) => new Promise((resolve) => {
      const id = `ai${Date.now().toString(36)}${++seq}`;
      const done = (v) => { clearTimeout(timer); win.removeEventListener(AI_RESULT_EVENT, on); resolve(v); };
      const on = (e) => {
        if (e.detail?.id !== id) return;
        const d = e.detail;
        done(d.ok ? { ok: true, text: d.text } : { ok: false, error: explainError(d), status: d.status });
      };
      const timer = setTimeout(() => done({ ok: false, error: explainError({ kind: 'timeout' }) }), timeoutMs + 2000);
      win.addEventListener(AI_RESULT_EVENT, on);
      command('ai-chat', { id, url, body: JSON.stringify(payload) });
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
  const credential = webCredential(win), key = credential?.key;
  if (!key || credential.endpoint !== url) return { ok: false, error: explainError({ kind: 'config' }) };
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const send = async (payload) => {
      const res = await fetchImpl(url, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(payload), signal: ctrl.signal });
      let data = null; try { data = await res.json(); } catch { /* not JSON */ }
      return { res, data };
    };
    let { res, data } = await send(body);
    if (!res.ok && json && [400, 422].includes(res.status)) {
      const retry = { ...body };
      delete retry.response_format;
      ({ res, data } = await send(retry));
    }
    if (webCredential(win)?.revision !== credential.revision) return { ok: false, error: explainError({ kind: 'config' }) };
    if (!res.ok) return { ok: false, error: redact(explainError({ status: res.status, body: data }), key), status: res.status };
    const text = chatText(data);
    return text ? { ok: true, text: redact(text, key) } : { ok: false, error: explainError({ kind: 'format' }) };
  } catch (error) {
    return { ok: false, error: explainError({ kind: error?.name === 'AbortError' ? 'timeout' : 'network' }) };
  } finally { clearTimeout(timer); }
}
