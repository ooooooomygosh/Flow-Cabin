// Sends one chat/completions request. Web: fetch from the page (the endpoint must allow
// CORS). Desktop: the page CSP is connect-src 'self', so the request goes through the
// shell (desktop/ai.cjs), which also keeps the key in safeStorage; the page never holds it.
import { chatUrl, chatBody, chatText, explainError, redact, TIMEOUT_MS, AI_KEY_KEY } from './ai-model.mjs';
import { desktopCommand } from '../desktop/desktop-command.mjs';

export const AI_RESULT_EVENT = 'cabin:ai-result', AI_KEY_EVENT = 'cabin:ai-key';
export const isDesktopShell = (win = globalThis) => win.document?.documentElement?.dataset?.desktopClient === 'true';
// { stored, secure } — desktop: published by the shell as window.cabinAiKey; web: localStorage.
export function keyState(win = globalThis) {
  if (isDesktopShell(win)) return { stored: win.cabinAiKey?.stored === true, secure: win.cabinAiKey?.secure === true, where: 'desktop' };
  let k = ''; try { k = win.localStorage?.getItem(AI_KEY_KEY) || ''; } catch { /* private mode */ }
  return { stored: Boolean(k), secure: false, where: 'web' };
}
export function saveKey(key, { win = globalThis, command = desktopCommand } = {}) {
  const value = String(key || '').trim();
  if (isDesktopShell(win)) { command('ai-key', { key: value }); return; }
  try { if (value) win.localStorage.setItem(AI_KEY_KEY, value); else win.localStorage.removeItem(AI_KEY_KEY); } catch { /* ignore */ }
  win.dispatchEvent?.(new CustomEvent(AI_KEY_EVENT));
}

let seq = 0;
// Resolves { ok: true, text } or { ok: false, error } — never throws, never includes the key.
export async function chat(settings, messages, { win = globalThis, fetchImpl = globalThis.fetch, command = desktopCommand, timeoutMs = TIMEOUT_MS, maxTokens = 600 } = {}) {
  const url = chatUrl(settings.baseUrl);
  if (!url || !settings.model) return { ok: false, error: explainError({ kind: 'config' }) };
  const body = chatBody(settings.model, messages, maxTokens);
  if (isDesktopShell(win)) {
    const id = `ai${Date.now().toString(36)}${++seq}`;
    return new Promise((resolve) => {
      const done = (v) => { clearTimeout(timer); win.removeEventListener(AI_RESULT_EVENT, on); resolve(v); };
      const on = (e) => { if (e.detail?.id !== id) return; const d = e.detail; done(d.ok ? { ok: true, text: d.text } : { ok: false, error: explainError(d) }); };
      const timer = setTimeout(() => done({ ok: false, error: explainError({ kind: 'timeout' }) }), timeoutMs + 2000);
      win.addEventListener(AI_RESULT_EVENT, on);
      command('ai-chat', { id, url, body: JSON.stringify(body) });
    });
  }
  let key = ''; try { key = win.localStorage?.getItem(AI_KEY_KEY) || ''; } catch { /* ignore */ }
  if (!key) return { ok: false, error: explainError({ kind: 'config' }) };
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(body), signal: ctrl.signal });
    let json = null; try { json = await res.json(); } catch { /* not JSON */ }
    if (!res.ok) return { ok: false, error: redact(explainError({ status: res.status, body: json }), key) };
    const text = chatText(json);
    return text ? { ok: true, text: redact(text, key) } : { ok: false, error: explainError({ kind: 'format' }) };
  } catch (error) {
    return { ok: false, error: explainError({ kind: error?.name === 'AbortError' ? 'timeout' : 'network' }) };
  } finally { clearTimeout(timer); }
}
