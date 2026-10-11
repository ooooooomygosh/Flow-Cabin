'use strict';
// 沉入桌面: the single "cabin becomes the desktop" mode. It replaces the old
// 桌面模式 (interactive window at desktop level, covering the icons) and
// 动态桌面背景 (non-interactive wallpaper behind the icons) entry points.
//
//   1. The main window collapses to the tray / menu bar.
//   2. The cabin scene is painted behind the desktop icons (Windows WorkerW via
//      DesktopHost.exe, macOS desktop-level window) — icons stay clickable.
//   3. Interactive layers float only where they are needed: the pet (click /
//      drag on its pixels, click-through elsewhere) and a small pixel mini
//      player (hover reveals controls, double-click returns to the window).
//   4. If the desktop layer cannot be attached (another wallpaper app, an
//      unsupported shell), it falls back to the legacy desktop-level window so
//      the click still does something sensible; the reason is reported.
//
// Pure orchestration: every Electron object is injected, so it is unit-tested.
const SUPPORTED = new Set(['win32', 'darwin']);

function createDesktopSink({ platform = process.platform, wallpaper, legacy, pet, mini, hideMain, restoreMain, onChange = () => {}, log = () => {}, setLowPower = () => {} }) {
  let active = false, busy = false, via = '', reason = '', startedPet = false, lowPower = false, generation = 0;
  const supported = SUPPORTED.has(platform);
  const status = () => ({ active, busy, supported, via, lowPower, reason: reason || (supported ? '' : '沉入桌面目前支持 Windows 与 macOS。') });
  const announce = () => onChange(status());

  async function enter() {
    if (active || busy) return status();
    if (!supported) { announce(); return status(); }
    busy = true; reason = ''; const token = ++generation; announce();
    try {
      await wallpaper.start();
      if (token !== generation) return status();
      if (wallpaper.active) { via = 'wallpaper'; hideMain(); }
      else {
        // Behind-icons layer unavailable: keep the cabin interactive at desktop level instead.
        reason = wallpaper.error || '桌面背景层暂时无法挂载，已改用窗口贴在桌面上。';
        log('desktop-sink-fallback', reason);
        legacy.enter(); via = 'window';
      }
      if (!pet.active) { startedPet = true; try { await pet.start(); } catch (error) { if (token === generation) startedPet = false; log('desktop-sink-pet', error.message); } }
      if (token !== generation) return status();
      if (via === 'wallpaper') await mini.show().catch((error) => log('desktop-sink-mini', error.message));
      if (token !== generation) return status();
      active = true;
      setLowPower(lowPower);
      log('desktop-sink-entered', via);
    } finally { if (token === generation) { busy = false; announce(); } }
    return status();
  }

  function exit({ restore = true } = {}) {
    generation++;
    const was = active || busy;
    active = false; busy = false;
    if (!was) return status();
    mini.hide();
    if (wallpaper.active || wallpaper.busy) wallpaper.stop();
    if (legacy.active) legacy.exit({ restore });
    if (startedPet) pet.stop();
    startedPet = false; via = '';
    if (restore) restoreMain();
    log('desktop-sink-exited');
    announce();
    return status();
  }

  return {
    enter, exit, status,
    toggle() { return active || busy ? exit() : enter(); },
    get active() { return active; }, get busy() { return busy; },
    // The wallpaper died on its own (explorer restart, render crash): leave cleanly.
    wallpaperLost(error = '') { if (active && via === 'wallpaper') { reason = error; exit(); } },
    // Battery / fullscreen apps: throttle the scene, never stop it.
    setLowPower(on) { lowPower = Boolean(on); if (active) setLowPower(lowPower); announce(); },
    stop() { exit({ restore: false }); }
  };
}

// Old preferences carried two flags; both now mean "沉入桌面".
function migrateDesktopPreferences(preferences = {}) {
  const { desktopMode, wallpaper, ...rest } = preferences || {};
  const sink = Boolean(preferences?.desktopSink || desktopMode || wallpaper);
  return { ...rest, desktopSink: sink };
}
module.exports = { createDesktopSink, migrateDesktopPreferences };
