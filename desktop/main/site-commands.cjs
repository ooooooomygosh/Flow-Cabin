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
    '/pet-start': () => ctx.pet().start().catch((error) => ctx.writeLog('pet-error', error.message)),
    '/pet-stop': () => ctx.pet().stop(),
    // A 小鱼干 drag in the cabin: the desktop pet accepts the drop while it lasts.
    '/pet-drag': ({ searchParams }) => { const active = flag(searchParams, 'active'); if (active !== null) ctx.pet()?.acceptDrops?.(active); },
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
    '/ai-chat': ({ searchParams }) => { ctx.ai.chat(searchParams.get('id') || '', searchParams.get('url'), searchParams.get('body')).catch(() => {}); },
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
