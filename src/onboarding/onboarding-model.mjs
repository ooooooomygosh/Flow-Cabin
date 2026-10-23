// First-run onboarding: pure state so the wizard is resumable and testable.
// Nothing here touches audio, login windows or native permissions; the
// wizard calls the adapters in onboarding-adapter.mjs for that.

import { providerLabel } from '../player/providers.mjs';
import { compareVersions, parseVersion, releasesBetween } from './releases.mjs';

export const ONBOARDING_KEY = 'flow-cabin-onboarding-v1';
// v1.9 "入门指南" marker. A cabin that already saw it is not interrupted again.
export const LEGACY_WELCOME_KEY = 'flow-cabin-welcome-v1';
// Cabins created before version-aware updates are treated as having seen the
// last release before the companion work started. The first version-aware
// guide then explains the whole 1.18–1.21 arc, including the earlier hidden
// typing-follow entry that existing users never saw in a guided flow.
export const LEGACY_SEEN_VERSION = '1.17.0';
// 2.2: three short steps. Permissions (键鼠陪伴, 通知, 开机启动) are optional and
// live in 设置; a version update is a dismissible 新功能 sheet, not a walkthrough.
export const STEPS = Object.freeze(['source', 'room', 'test']);
export const STEP_LABELS = Object.freeze({ source: '音源', room: '房间与伙伴', test: '试听' });
// Steps saved by 2.1 and earlier resume at the closest 2.2 step.
const LEGACY_STEPS = Object.freeze({ welcome: 'source', updates: 'source', permissions: 'room', done: 'test' });
const STATUSES = ['new', 'active', 'skipped', 'done'];
const PERMISSION_VALUES = ['', 'granted', 'pending', 'denied', 'skipped', 'unsupported'];
const versionString = (value) => parseVersion(value) ? String(value).trim().replace(/^v/i, '') : '';

export function detectEnv(win = globalThis) {
  const root = win.document?.documentElement?.dataset || {};
  const nav = win.navigator || {};
  const platform = String(nav.userAgentData?.platform || nav.platform || nav.userAgent || '');
  return { desktop: root.desktopClient === 'true', mobile: root.platform === 'android', mac: /mac/i.test(platform), notifications: root.platform !== 'android' && 'Notification' in win };
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
  return SOURCE_TABLE.filter((source) => (!source.macOnly || env.mac) && (!env.mobile || ['local', 'qq', 'netease'].includes(source.id))).map((source) => ({
    ...source,
    ...(source.id === 'local' && !env.desktop ? { hint: env.mobile ? '在「添加到唱片架 › 本地音乐」选择手机歌曲，重新打开仍可播放。' : '在「添加到唱片架 › 本地音乐」里选择音乐文件，本次打开期间可播。' } : {}),
    available: !source.desktopOnly || Boolean(env.desktop) || Boolean(env.mobile && ['qq', 'netease'].includes(source.id)),
    reason: source.desktopOnly && !env.desktop && !(env.mobile && ['qq', 'netease'].includes(source.id)) ? '需要心流小屋桌面版' : ''
  }));
}
export const providerFor = (id) => SOURCE_TABLE.find((source) => source.id === id)?.provider || '';

export function permissionItems(env = {}, source = '') {
  const items = [];
  if (env.desktop && env.mac) items.push({ id: 'typing', label: '跨应用键鼠陪伴', hint: '只需允许「输入监控」，在其他应用里打字、点鼠标时奶糖也会回应。', optional: false });
  if (env.notifications) items.push({ id: 'notifications', label: '系统通知', hint: '专注结束和休息结束时提醒你。', optional: true });
  if (env.desktop && env.mac && (source === 'appleMusic' || source === 'system')) items.push({ id: 'appleMusic', label: '控制「音乐」App', hint: 'macOS 会询问是否允许心流小屋使用自动化控制「音乐」。', optional: false });
  if (env.desktop) items.push({ id: 'autostart', label: '开机时打开小屋', hint: '可选。登录电脑后自动点亮小屋。', optional: true });
  return items;
}

export function initialState() {
  return { version: 2, status: 'new', step: STEPS[0], source: '', quality: '', permissions: {}, tested: '', seenVersion: '', fromVersion: '', updatedAt: 0 };
}

export function normalizeState(value) {
  const base = initialState();
  if (!value || typeof value !== 'object') return base;
  const permissions = {};
  for (const [key, result] of Object.entries(value.permissions || {})) if (typeof key === 'string' && key.length < 40 && PERMISSION_VALUES.includes(result)) permissions[key] = result;
  const status = STATUSES.includes(value.status) ? value.status : base.status;
  const seenVersion = versionString(value.seenVersion)
    || (status === 'done' || status === 'skipped' ? LEGACY_SEEN_VERSION : '');
  return {
    ...base,
    status,
    step: STEPS.includes(value.step) ? value.step : LEGACY_STEPS[value.step] || base.step,
    source: SOURCE_TABLE.some((source) => source.id === value.source) ? value.source : '',
    quality: typeof value.quality === 'string' ? value.quality.slice(0, 24) : '',
    permissions,
    tested: ['ok', 'silent', 'skipped', 'failed'].includes(value.tested) ? value.tested : '',
    seenVersion,
    fromVersion: versionString(value.fromVersion),
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
  return legacy ? { ...initialState(), status: 'done', step: 'test', seenVersion: LEGACY_SEEN_VERSION } : initialState();
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

// Decide what the launch guide should do. A first run (or one closed half-way)
// opens the three-step guide; a version gap on a cabin that already finished or
// skipped it opens the 新功能 sheet once. A 2.1 update walkthrough that was
// closed half-way (status 'active' with a fromVersion) becomes that sheet too.
export function launchPlan(state, { isNew = false, currentVersion = '' } = {}) {
  if (state.status === 'active') return { open: true, mode: state.fromVersion ? 'update' : 'resume' };
  if (state.status === 'new' && isNew) return { open: true, mode: 'first-run' };
  if (state.status === 'new') return { open: false, mode: '' };
  if (parseVersion(currentVersion) && parseVersion(state.seenVersion) && compareVersions(state.seenVersion, currentVersion) < 0) return { open: true, mode: 'update' };
  return { open: false, mode: '' };
}
export function shouldAutoOpen(state, options = {}) { return launchPlan(state, options).open; }

// Apply a launch plan without restarting a guide that was closed half-way.
export function applyLaunchPlan(state, plan, currentVersion = '') {
  if (!plan?.open) return state;
  if (plan.mode === 'first-run') return start(state);
  if (plan.mode === 'update') return startUpdate(state, currentVersion);
  return state;
}

export const stepIndex = (step) => Math.max(0, STEPS.indexOf(step));
export function goTo(state, step) { return STEPS.includes(step) ? { ...state, status: 'active', step } : state; }
export function next(state) { return goTo(state, STEPS[Math.min(STEPS.length - 1, stepIndex(state.step) + 1)]); }
export function back(state) { return goTo(state, STEPS[Math.max(0, stepIndex(state.step) - 1)]); }
export const isLastStep = (step) => step === STEPS.at(-1);
export function start(state) { return { ...state, status: 'active', step: STEPS[0], fromVersion: '' }; }
// The 新功能 sheet remembers which version it compares against, so an app quit
// before 知道了 shows the same list next time. The guide itself is not reopened:
// an interrupted 2.1 walkthrough counts as finished.
export function startUpdate(state, currentVersion, fallbackFrom = LEGACY_SEEN_VERSION) {
  const fromVersion = versionString(state.fromVersion) || versionString(state.seenVersion) || versionString(fallbackFrom) || LEGACY_SEEN_VERSION;
  return { ...state, status: state.status === 'skipped' ? 'skipped' : 'done', fromVersion, seenVersion: fromVersion };
}
// 知道了 (or closing the sheet any other way): this version has been seen.
export function dismissUpdate(state, currentVersion = '') {
  return { ...state, status: state.status === 'skipped' ? 'skipped' : 'done', fromVersion: '', seenVersion: versionString(currentVersion) || versionString(state.seenVersion) || LEGACY_SEEN_VERSION };
}
export function skip(state, currentVersion = '') {
  return { ...state, status: 'skipped', fromVersion: '', seenVersion: versionString(currentVersion) || versionString(state.seenVersion) || LEGACY_SEEN_VERSION };
}
export function complete(state, currentVersion = '') {
  return { ...state, status: 'done', step: STEPS.at(-1), fromVersion: '', seenVersion: versionString(currentVersion) || versionString(state.seenVersion) || LEGACY_SEEN_VERSION };
}
// 重新引导 always starts from the top but keeps what was chosen last time.
export function reopen(state) { return { ...state, status: 'active', step: STEPS[0], fromVersion: '' }; }
export function chooseSource(state, id) { return SOURCE_TABLE.some((source) => source.id === id) ? { ...state, source: id } : state; }
export function setPermission(state, id, result) { return PERMISSION_VALUES.includes(result) ? { ...state, permissions: { ...state.permissions, [id]: result } } : state; }
export function setTested(state, result) { return { ...state, tested: result }; }
export function updateContext(state, currentVersion) {
  const toVersion = versionString(currentVersion);
  const fromVersion = versionString(state.fromVersion) || versionString(state.seenVersion) || LEGACY_SEEN_VERSION;
  return { fromVersion, toVersion, releases: releasesBetween(fromVersion, toVersion) };
}

// Short summary for the last step and the settings hub.
export function summary(state, env = {}) {
  const source = sourceOptions({ ...env, mac: true, desktop: true }).find((item) => item.id === state.source);
  return {
    source: source ? source.label : '还没有选',
    permissions: Object.entries(state.permissions).filter(([, value]) => value === 'granted').map(([key]) => key),
    pending: Object.entries(state.permissions).filter(([, value]) => value === 'pending').map(([key]) => key),
    tested: state.tested === 'ok' ? '听到了声音' : state.tested === 'silent' ? '没有听到声音' : state.tested === 'failed' ? '试听失败' : '跳过了试听'
  };
}
