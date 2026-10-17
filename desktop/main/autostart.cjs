'use strict';
// 开机时打开小屋: the OS login item. Only a packaged macOS / Windows app can register itself
// (a dev build would register the bare Electron binary). The page sees { supported, enabled } as
// window.cabinAutostart and the 'cabin:autostart' event (src/desktop/autostart-client.mjs).
function createAutostart({ app, platform = process.platform, publish }) {
  const supported = () => Boolean(app.isPackaged) && (platform === 'darwin' || platform === 'win32');
  const state = () => {
    if (!supported()) return { supported: false, enabled: false };
    try { return { supported: true, enabled: Boolean(app.getLoginItemSettings().openAtLogin) }; } catch { return { supported: true, enabled: false }; }
  };
  return {
    state,
    set(enabled) {
      if (supported()) { try { app.setLoginItemSettings({ openAtLogin: Boolean(enabled) }); } catch { /* reported through state() */ } }
      const value = state(); publish(value); return value;
    },
    publish() { const value = state(); publish(value); return value; }
  };
}
const autostartScript = (value) => `window.cabinAutostart = ${JSON.stringify({ supported: value.supported === true, enabled: value.enabled === true })}; window.dispatchEvent(new CustomEvent('cabin:autostart', { detail: window.cabinAutostart }));`;
module.exports = { createAutostart, autostartScript };
