'use strict';
// Focus support in the desktop shell (2.2): system notifications with the next step as buttons,
// lock / sleep relayed to the page, closing the window while a round runs, and the global
// focus shortcuts. Pure helpers plus small factories that take Electron objects as arguments.
const { COMMANDS } = require('./companion-sync.cjs');

// Global shortcuts (also listed in src/shortcuts.mjs as focusToggle / focusSkip).
const FOCUS_HOTKEYS = Object.freeze({ toggle: 'CommandOrControl+Alt+F', skip: 'CommandOrControl+Alt+G' });

const clean = (value, max) => typeof value === 'string' ? value.replace(/[\x00-\x09\x0b-\x1f\x7f]/g, '').slice(0, max) : '';
// `actions` arrives as "command:label|command:label" from the page (src/focus/focus-notice.mjs);
// only companion commands survive, at most two (what macOS shows without a dropdown).
function parseNotice(params) {
  const get = (name) => typeof params?.get === 'function' ? params.get(name) : params?.[name];
  const title = clean(get('title'), 60);
  if (!title) return null;
  const actions = String(get('actions') || '').split('|').map((part) => { const at = part.indexOf(':'); return { command: part.slice(0, at), label: clean(part.slice(at + 1), 12) }; })
    .filter((item) => COMMANDS.has(item.command) && item.label).slice(0, 2);
  return { title, body: clean(get('body'), 200), silent: get('silent') === 'true' || get('silent') === true, actions };
}

// Shows one notification at a time (a new one replaces the last). A click brings the cabin
// back; buttons (macOS) send their command to the page. Windows and Linux show no buttons:
// the window's own end-of-round card offers the same choices after the click.
function createNotifier({ Notification, platform = process.platform, restore, command, log = () => {} }) {
  let current = null;
  return {
    show(notice) {
      if (!notice || !Notification?.isSupported?.()) return false;
      try {
        current?.close?.();
        const options = { title: notice.title, body: notice.body, silent: Boolean(notice.silent) };
        if (platform === 'darwin' && notice.actions.length) options.actions = notice.actions.map((item) => ({ type: 'button', text: item.label }));
        const shown = new Notification(options);
        shown.on('click', () => restore());
        shown.on('action', (_event, index) => { const item = notice.actions[index]; if (item) command(item.command); });
        shown.on('close', () => { if (current === shown) current = null; });
        shown.show(); current = shown;
        return true;
      } catch (error) { log('notify-error', error.message); return false; }
    },
    dispose() { current?.close?.(); current = null; }
  };
}

// Closing the window while a round runs (or is paused) keeps the page alive in the tray /
// menu bar, so the timer, the tray countdown and the end notification carry on.
const keepAliveOnClose = ({ phase = 'idle', quitting = false } = {}) => !quitting && phase !== 'idle';

// 锁屏 / 休眠 → the page. 'away' is sent at once; 'back' repeats when the user left, because a
// suspend can freeze the page before it reads the first message.
function createPowerRelay({ powerMonitor, send, now = Date.now }) {
  let awayAt = 0;
  const leave = () => { if (!awayAt) awayAt = now(); send({ state: 'away', at: awayAt }); };
  const arrive = () => { const from = awayAt; awayAt = 0; if (from) send({ state: 'back', at: now(), from }); };
  const events = [['lock-screen', leave], ['suspend', leave], ['unlock-screen', arrive], ['resume', arrive]];
  for (const [name, fn] of events) powerMonitor.on(name, fn);
  return { get awayAt() { return awayAt; }, leave, arrive, dispose() { for (const [name, fn] of events) powerMonitor.removeListener?.(name, fn); } };
}
const powerScript = (detail) => `window.dispatchEvent(new CustomEvent('album-power', { detail: ${JSON.stringify({ state: detail.state === 'back' ? 'back' : 'away', at: Number(detail.at) || 0, ...(detail.from ? { from: Number(detail.from) } : {}) })} }));`;

module.exports = { FOCUS_HOTKEYS, parseNotice, createNotifier, keepAliveOnClose, createPowerRelay, powerScript };
