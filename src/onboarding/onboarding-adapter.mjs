// Thin adapters between onboarding / the settings hub and the player and desktop modules.
//
// Player (src/player/sources.mjs, docs/player.md 「音源接口」):
//   listSources({ mac? }) -> [{ id, label, kind, login, platform?, supported }]
//   connectSource(id) -> Promise<{ ok, cancelled, error }>   (resolves when login / folder pick ends)
//   getSourceStatus(id) -> Promise<{ id, supported, connected, detail, needsPermission?, app? }>
//   requestPermission('appleMusic') -> Promise<{ granted, needsPermission, available, error }>
//   testPlayback({ provider, seconds }) -> Promise<{ ok, provider, quality, title } | { ok:false, error }>
//   Audio quality: GET /desktop-music/config { quality, qualities }, POST /desktop-music/quality { quality }.
// Desktop (src/desktop/desktop-sink-client.mjs, docs/desktop.md): 沉入桌面 status / enter / exit,
//   and src/desktop/autostart-client.mjs for 开机时打开小屋.
// Every call is wrapped so a failure never pretends a login or permission succeeded.
import * as playerSources from '../player/sources.mjs';
import * as desktopSink from '../desktop/desktop-sink-client.mjs';
import { setAutostart } from '../desktop/autostart-client.mjs';
import { sourceOptions } from './onboarding-model.mjs';

export const DESKTOP_MODE_EVENT = desktopSink.DESKTOP_MODE_EVENT;
const call = async (api, name, ...args) => {
  if (typeof api?.[name] !== 'function') return { missing: true };
  try { return { value: await api[name](...args) }; } catch (error) { return { error: error?.message || String(error) }; }
};

export function createPlayerAdapter({ api = playerSources, env = {}, request, win = globalThis, autostart = setAutostart } = {}) {
  const options = request ? { request } : {};
  return {
    async listSources() {
      const local = sourceOptions(env);
      const result = await call(api, 'listSources', { mac: Boolean(env.mac) });
      if (!Array.isArray(result.value)) return local;
      const known = new Map(local.map((item) => [item.id, item]));
      return result.value.filter((item) => item && typeof item.id === 'string' && item.supported !== false && item.id !== 'ma').map((item) => {
        const base = known.get(item.id) || { id: item.id, hint: '', provider: item.id };
        const needsDesktop = base.desktopOnly ?? item.id !== 'local';
        return { ...base, label: base.label || item.label, kind: item.kind, login: Boolean(item.login), provider: base.provider || item.id, available: !needsDesktop || Boolean(env.desktop), reason: needsDesktop && !env.desktop ? '需要心流小屋桌面版' : '' };
      });
    },
    async connectSource(id) {
      if (!env.desktop) {
        if (id === 'local') return { ok: false, fallback: 'add-album', error: '网页版请在「添加专辑 › 本地音乐」里直接选择音乐文件。' };
        return { ok: false, error: '需要在心流小屋桌面版中连接。' };
      }
      if (id === 'system' || id === 'appleMusic') return { ok: true };
      const result = await call(api, 'connectSource', id);
      if (result.missing) return { ok: false, error: '未知音源' };
      return result.error ? { ok: false, error: result.error } : { ok: Boolean(result.value?.ok), cancelled: Boolean(result.value?.cancelled), error: result.value?.cancelled && !result.value?.error ? '已取消。' : result.value?.error || '' };
    },
    async getSourceStatus(id) {
      const result = await call(api, 'getSourceStatus', id, options);
      if (result.value) return { connected: Boolean(result.value.connected), detail: String(result.value.detail || ''), needsPermission: Boolean(result.value.needsPermission) };
      return { connected: false, detail: env.desktop ? '暂时读不到状态' : '' };
    },
    // Returns 'granted' | 'denied' | 'skipped' | 'unsupported'.
    async requestPermission(id) {
      if (id === 'notifications') {
        const N = win.Notification;
        if (!N) return 'unsupported';
        if (N.permission === 'granted' || N.permission === 'denied') return N.permission;
        try { const value = await N.requestPermission(); return value === 'default' ? 'skipped' : value; } catch { return 'denied'; }
      }
      if (id === 'autostart') {
        if (!env.desktop) return 'unsupported';
        const state = await autostart(true, { win });
        return !state.supported ? 'unsupported' : state.enabled ? 'granted' : 'denied';
      }
      if (id !== 'appleMusic') return 'unsupported';
      const result = await call(api, 'requestPermission', id, options);
      if (result.error) return 'denied';
      const value = result.value;
      if (!value) return 'unsupported';
      if (typeof value === 'string') return ['granted', 'denied', 'unsupported', 'skipped'].includes(value) ? value : 'denied';
      return value.granted ? 'granted' : value.available === false ? 'unsupported' : 'denied';
    },
    async testPlayback(provider = 'auto') {
      const result = await call(api, 'testPlayback', { provider, ...options });
      if (result.missing) return { ok: false, error: '这个版本还不能试听。' };
      return result.error ? { ok: false, error: result.error } : { kind: 'track', ...(result.value || {}), ok: Boolean(result.value?.ok) };
    },
    async qualities() {
      if (!env.desktop || !request) return null;
      try {
        const c = await request('/config');
        if (!Array.isArray(c.qualities) || !c.qualities.length) return null;
        return { options: c.qualities.map((q) => typeof q === 'string' ? { id: q, label: q } : { id: q.id ?? q.value, label: q.label ?? q.id }), current: c.quality || '' };
      } catch { return null; }
    },
    async setQuality(id) { try { await request('/quality', { quality: id }); return true; } catch { return false; } }
  };
}

// 沉入桌面 for the settings hub: the same desktop-sink module the toolbar uses.
export function createDesktopAdapter({ api = desktopSink } = {}) {
  return {
    async status() {
      const result = await call(api, 'getDesktopModeStatus');
      const value = result.value || {};
      return { active: Boolean(value.active), busy: Boolean(value.busy), supported: value.supported !== false && !result.error, via: String(value.via || ''), reason: String(value.reason || result.error || '') };
    },
    async enter() { return !(await call(api, 'enterDesktopMode')).error; },
    async exit() { return !(await call(api, 'exitDesktopMode')).error; },
    subscribe(listener) {
      if (typeof api?.onDesktopModeChange !== 'function') return () => {};
      const off = api.onDesktopModeChange((detail) => listener(detail || {}));
      return typeof off === 'function' ? off : () => {};
    }
  };
}
