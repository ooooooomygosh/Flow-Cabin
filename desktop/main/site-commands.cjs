'use strict';
// The page's only way to ask the shell for something: a denied new-window request (or navigation) to
// album-desktop://action/<command>. Every accepted command is in this table; anything else is refused,
// and the page itself is never navigated. Old desktop-mode / wallpaper names stay as explicit aliases.
const ACCOUNT_PROVIDERS = ['qq', 'netease'];
const flag = (params, name) => ['true', 'false'].includes(params.get(name)) ? params.get(name) === 'true' : null;

function parseSiteCommand(value) {
  let url; try { url = new URL(value); } catch { return null; }
  return url.protocol === 'album-desktop:' && url.hostname === 'action' && !url.username && !url.password ? url : null;
}

// ctx: the main process's live objects, read through getters because they are created later or replaced.
function createSiteCommands(ctx) {
  const sink = () => ctx.desktopSink(), window = () => ctx.mainWindow();
  const update = ({ pathname, searchParams }) => ctx.handleUpdateCommand(pathname, searchParams);
  const table = {
    '/interface-restart': () => ctx.restartInterface?.(),
    '/lyrics-open': () => ctx.openLyrics?.(),
    '/lyrics-toggle': () => ctx.toggleLyrics?.(),
    '/settings': () => ctx.toggleSettings(true),
    '/update-check': update, '/update-download': update, '/update-install': update, '/update-relaunch': update, '/update-open': update, '/update-auto': update, '/update-state': update,
    '/fullscreen': () => ctx.toggleFullscreen(),
    '/fullscreen-exit': () => ctx.setFullscreen(false),
    // 沉入桌面.
    '/desktop-sink': () => sink().toggle(), '/desktop-mode': () => sink().toggle(),
    '/desktop-sink-enter': () => sink().enter(), '/wallpaper-start': () => sink().enter(),
    '/desktop-sink-exit': () => sink().exit(), '/desktop-mode-exit': () => sink().exit(), '/wallpaper-stop': () => sink().exit(),
    '/tray-pet': ({ searchParams }) => ctx.trayPet.setTrayPet(searchParams.get('id')),
    '/minimize': () => window().minimize(),
    '/maximize': () => { if (sink().active) sink().exit(); else if (ctx.isFullscreen()) ctx.setFullscreen(false); else if (window().isMaximized()) window().unmaximize(); else window().maximize(); },
    '/close': () => window().close(),
    // A system notification from the page (end of a round, 喝水): title, body, silent, actions.
    '/notify': ({ searchParams }) => ctx.notify?.(searchParams),
    '/pet-start': () => ctx.pet().start().catch((error) => ctx.writeLog('pet-error', error.message)),
    '/pet-stop': () => ctx.pet().stop(),
    // 设置 › 房间与桌宠: bubbles, walk, gravity, onTop, locked, clickThrough, autoHide (true/false), opacity (0.3–1).
    '/pet-prefs': ({ searchParams }) => ctx.pet()?.setPrefs?.(ctx.petPrefs ? ctx.petPrefs(searchParams) : {}),
    '/pet-hide': ({ searchParams }) => { const hours = Number(searchParams.get('hours')); if (hours > 0 && hours <= 12) ctx.pet()?.hideFor?.(hours * 3600000); else if (searchParams.get('hours') === '0') ctx.pet()?.showNow?.(); },
    // A 小鱼干 drag in the cabin: the desktop pet accepts the drop while it lasts.
    '/pet-drag': ({ searchParams }) => { const active = flag(searchParams, 'active'); if (active !== null) ctx.pet()?.acceptDrops?.(active); },
    // 键鼠陪伴: setting changes use the same persisted appearance file as the
    // shell settings page. Permission commands only open the system prompt /
    // pane; the page confirms success by watching the local input counters.
    '/typing-follow': ({ searchParams }) => {
      const enabled = flag(searchParams, 'enabled');
      if (enabled !== null) ctx.saveAppearance({ ...ctx.appearance(), typingFollow: enabled }).catch((error) => ctx.writeLog('typing-settings-error', error.message));
    },
    '/typing-check': () => ctx.typing.check(),
    '/typing-permission': () => ctx.typing.permission(),
    '/typing-input-permission': () => ctx.typing.inputMonitoring(),
    '/typing-repair-permission': () => ctx.typing.repair(),
    '/local-music-folder': () => ctx.chooseMusicFolder(),
    '/music-login': ({ searchParams }) => { const provider = searchParams.get('provider'); if (ACCOUNT_PROVIDERS.includes(provider)) ctx.music().login(provider).then((result) => ctx.notifyMusic(result)).catch((error) => ctx.notifyMusic({ error: error.message })); },
    '/music-logout': ({ searchParams }) => { const provider = searchParams.get('provider'); if (ACCOUNT_PROVIDERS.includes(provider)) ctx.music().logout(provider).then(() => ctx.notifyMusic({ ok: true })).catch((error) => ctx.notifyMusic({ error: error.message })); },
    '/appearance': ({ searchParams }) => {
      const reduceMotion = flag(searchParams, 'reduceMotion'), theme = searchParams.get('theme');
      if (reduceMotion !== null) ctx.saveAppearance({ ...ctx.appearance(), reduceMotion, ...(['cover', 'simple'].includes(theme) ? { theme } : {}) }).catch(() => {});
    },
    // 开机时打开小屋 (desktop/main/autostart.cjs).
    '/autostart': ({ searchParams }) => { const enabled = flag(searchParams, 'enabled'); if (enabled !== null) ctx.autostart.set(enabled); else ctx.autostart.publish(); },
    // 跟随真实天气 (desktop/weather.cjs): off by default; the page sends the chosen city's coordinates.
    // AI（Beta）(desktop/ai.cjs): the key goes to safeStorage, chat requests are relayed by main.
    '/ai-key': ({ searchParams }) => { if (searchParams.has('key')) ctx.ai.setKey(searchParams.get('key'), searchParams.get('endpoint')); else ctx.ai.publishKey(); },
    '/ai-chat': ({ searchParams }) => { ctx.ai.chat(searchParams.get('id') || '', searchParams.get('url'), searchParams.get('body'), { keyless: searchParams.get('keyless') === 'true' }).catch(() => {}); },
    '/ai-chat-cli': ({ searchParams }) => { ctx.ai.chatCli(searchParams.get('id') || '', searchParams.get('body')).catch(() => {}); },
    '/ai-cancel': ({ searchParams }) => { ctx.ai.cancel(searchParams.get('id') || ''); },
    // ── M3 player ──
    // 全局媒体快捷键 (desktop/media-keys.cjs): enabled=, action=<id>&accelerator=<Electron accelerator or ''>, reset=true; no params republishes.
    '/media-keys': ({ searchParams }) => {
      const keys = ctx.mediaKeys; if (!keys) return;
      const enabled = flag(searchParams, 'enabled'), action = searchParams.get('action');
      if (searchParams.get('reset') === 'true') keys.set({ reset: true });
      else if (enabled !== null || (action && searchParams.has('accelerator'))) keys.set({ ...(enabled !== null ? { enabled } : {}), ...(action && searchParams.has('accelerator') ? { bindings: { [action]: String(searchParams.get('accelerator')).slice(0, 60) } } : {}) });
      else keys.publish();
    },
    // 迷你唱机 outside 沉入桌面: shown=true|false, top=true|false (always on top).
    '/mini-player': ({ searchParams }) => {
      const mini = ctx.miniPlayer; if (!mini) return;
      const shown = flag(searchParams, 'shown'), top = flag(searchParams, 'top');
      if (top !== null) mini.setAlwaysOnTop(top);
      if (shown === true) mini.show('user').catch((error) => ctx.writeLog('mini-player', error.message)); else if (shown === false) mini.hide('user');
    },
    // ── end M3 player ──
    '/weather': ({ searchParams }) => { const enabled = flag(searchParams, 'enabled'); if (enabled === null) ctx.weather.publish(); else ctx.weather.set({ enabled, lat: searchParams.get('lat'), lng: searchParams.get('lng') }).catch(() => {}); }
  };
  return {
    commands: Object.freeze(Object.keys(table)),
    // true when the value was a shell command from the cabin page (handled or refused as malformed).
    handle(value) {
      const url = parseSiteCommand(value);
      if (!url || !ctx.isSitePage() || !Object.prototype.hasOwnProperty.call(table, url.pathname)) return false;
      table[url.pathname](url);
      return true;
    }
  };
}
module.exports = { createSiteCommands, parseSiteCommand };
