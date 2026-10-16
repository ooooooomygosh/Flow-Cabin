// First-run onboarding: pure state so the wizard is resumable and testable.
// Nothing here touches audio, login windows or native permissions; the
// wizard calls the adapters in onboarding-adapter.mjs for that.

import { providerLabel } from '../player/providers.mjs';

export const ONBOARDING_KEY = 'flow-cabin-onboarding-v1';
// v1.9 "入门指南" marker. A cabin that already saw it is not interrupted again.
export const LEGACY_WELCOME_KEY = 'flow-cabin-welcome-v1';
export const STEPS = Object.freeze(['welcome', 'source', 'permissions', 'room', 'test', 'done']);
export const STEP_LABELS = Object.freeze({ welcome: '欢迎', source: '音源', permissions: '权限', room: '房间', test: '试听', done: '完成' });
const STATUSES = ['new', 'active', 'skipped', 'done'];
const PERMISSION_VALUES = ['', 'granted', 'denied', 'skipped', 'unsupported'];

export function detectEnv(win = globalThis) {
  const root = win.document?.documentElement?.dataset || {};
  const nav = win.navigator || {};
  const platform = String(nav.userAgentData?.platform || nav.platform || nav.userAgent || '');
  return { desktop: root.desktopClient === 'true', mac: /mac/i.test(platform), notifications: 'Notification' in win };
}

// Sources the first-run step offers, in this order; names come from the one provider table.
// `provider` is the deck provider the choice switches to.
const SOURCE_TABLE = [
  { id: 'local', hint: '选一个音乐文件夹，歌曲留在原位置播放。', provider: 'local' },
  { id: 'qq', hint: '在官方登录页登录，凭据加密保存在本机。', provider: 'qq', desktopOnly: true },
  { id: 'netease', hint: '在官方登录页登录，凭据加密保存在本机。', provider: 'netease', desktopOnly: true },
  { id: 'appleMusic', hint: '控制 Mac 上的「音乐」App，需要自动化权限。', provider: 'appleMusic', desktopOnly: true, macOnly: true },
  { id: 'system', hint: '显示并控制正在放歌的其他播放器。', provider: 'system', desktopOnly: true }
].map((source) => ({ ...source, label: providerLabel(source.id) }));

export function sourceOptions(env = {}) {
  return SOURCE_TABLE.filter((source) => !source.macOnly || env.mac).map((source) => ({
    ...source,
    available: !source.desktopOnly || Boolean(env.desktop),
    reason: source.desktopOnly && !env.desktop ? '需要心流小屋桌面版' : ''
  }));
}
export const providerFor = (id) => SOURCE_TABLE.find((source) => source.id === id)?.provider || '';

export function permissionItems(env = {}, source = '') {
  const items = [];
  if (env.notifications) items.push({ id: 'notifications', label: '系统通知', hint: '专注结束和休息结束时提醒你。', optional: true });
  if (env.desktop && env.mac && (source === 'appleMusic' || source === 'system')) items.push({ id: 'appleMusic', label: '控制「音乐」App', hint: 'macOS 会询问是否允许心流小屋使用自动化控制「音乐」。', optional: false });
  if (env.desktop) items.push({ id: 'autostart', label: '开机时打开小屋', hint: '可选。登录电脑后自动点亮小屋。', optional: true });
  return items;
}

export function initialState() {
  return { version: 1, status: 'new', step: 'welcome', source: '', quality: '', permissions: {}, tested: '', updatedAt: 0 };
}

export function normalizeState(value) {
  const base = initialState();
  if (!value || typeof value !== 'object') return base;
  const permissions = {};
  for (const [key, result] of Object.entries(value.permissions || {})) if (typeof key === 'string' && key.length < 40 && PERMISSION_VALUES.includes(result)) permissions[key] = result;
  return {
    ...base,
    status: STATUSES.includes(value.status) ? value.status : base.status,
    step: STEPS.includes(value.step) ? value.step : base.step,
    source: SOURCE_TABLE.some((source) => source.id === value.source) ? value.source : '',
    quality: typeof value.quality === 'string' ? value.quality.slice(0, 24) : '',
    permissions,
    tested: ['ok', 'silent', 'skipped', 'failed'].includes(value.tested) ? value.tested : '',
    updatedAt: Number.isFinite(value.updatedAt) ? value.updatedAt : 0
  };
}

function legacyOrEmpty(storage) {
  try { return { legacy: Boolean(storage.getItem(LEGACY_WELCOME_KEY)), raw: storage.getItem(ONBOARDING_KEY) }; }
  catch { return { legacy: false, raw: null, failed: true }; }
}

export function readOnboarding(storage) {
  const { legacy, raw, failed } = legacyOrEmpty(storage);
  if (failed) return { ...initialState(), status: 'skipped' };
  if (raw) { try { return normalizeState(JSON.parse(raw)); } catch { /* corrupt: fall through */ } }
  return legacy ? { ...initialState(), status: 'done', step: 'done' } : initialState();
}

export function writeOnboarding(storage, state, now = Date.now()) {
  const next = { ...normalizeState(state), updatedAt: now };
  storage.setItem(ONBOARDING_KEY, JSON.stringify(next));
  return next;
}

// A brand-new cabin has no saved preferences from any earlier release.
export function isNewCabin(storage) {
  try {
    return !storage.getItem(ONBOARDING_KEY) && !storage.getItem(LEGACY_WELCOME_KEY) && !Object.keys(storage).some((key) => key.startsWith('album-circle-'));
  } catch { return false; }
}

// Auto-open on a brand-new cabin, and resume a wizard closed half-way
// (window closed, app quit). Skipped or finished never auto-opens.
export function shouldAutoOpen(state, { isNew = false } = {}) {
  return state.status === 'active' || (state.status === 'new' && isNew);
}

export const stepIndex = (step) => Math.max(0, STEPS.indexOf(step));
export function goTo(state, step) { return STEPS.includes(step) ? { ...state, status: step === 'done' ? state.status : 'active', step } : state; }
export function next(state) { return goTo(state, STEPS[Math.min(STEPS.length - 1, stepIndex(state.step) + 1)]); }
export function back(state) { return goTo(state, STEPS[Math.max(0, stepIndex(state.step) - 1)]); }
export function start(state) { return { ...state, status: 'active' }; }
export function skip(state) { return { ...state, status: 'skipped' }; }
export function complete(state) { return { ...state, status: 'done', step: 'done' }; }
// 重新引导 always starts from the top but keeps what was chosen last time.
export function reopen(state) { return { ...state, status: 'active', step: 'welcome' }; }
export function chooseSource(state, id) { return SOURCE_TABLE.some((source) => source.id === id) ? { ...state, source: id } : state; }
export function setPermission(state, id, result) { return PERMISSION_VALUES.includes(result) ? { ...state, permissions: { ...state.permissions, [id]: result } } : state; }
export function setTested(state, result) { return { ...state, tested: result }; }

// Short summary for the 完成 step and the settings hub.
export function summary(state, env = {}) {
  const source = sourceOptions({ ...env, mac: true, desktop: true }).find((item) => item.id === state.source);
  return {
    source: source ? source.label : '还没有选',
    permissions: Object.entries(state.permissions).filter(([, value]) => value === 'granted').map(([key]) => key),
    tested: state.tested === 'ok' ? '听到了声音' : state.tested === 'silent' ? '没有听到声音' : state.tested === 'failed' ? '试听失败' : '跳过了试听'
  };
}
