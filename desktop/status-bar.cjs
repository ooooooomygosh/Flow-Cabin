'use strict';
// macOS menu bar / Windows tray status + Dock / taskbar focus progress (v1.18).
// Pure model (statusFrom) + a small controller that applies it to the native objects.
//
// Art (beauty, PR #59, desktop/assets/tray/):
//   macOS  trayTemplate-{play,pause,focus,cat}.png + @2x — template images, the menu bar tints them;
//   Windows tray-{play,pause,focus,cat}.ico (tray) and tray-focus-16.png (taskbar overlay).
const path = require('node:path');
const { trayIconPath } = require('./tray-icons.cjs');
const ICONS = ['play', 'pause', 'focus', 'cat'];
const pad = (n) => String(n).padStart(2, '0');
// 1499000 → "24:59"; an hour or more → "1:02:03".
function clockText(ms) {
  const total = Math.max(0, Math.ceil((Number(ms) || 0) / 1000)), h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = total % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
const PHASE_NAMES = { focus: '专注', shortBreak: '短休息', longBreak: '长休息' };

// companion: cleanCompanion() output (wallpaper-model.cjs). Returns everything the tray, Dock and
// taskbar show; nothing here touches Electron.
function statusFrom(companion, now = Date.now()) {
  const focus = companion?.focus || null, phase = focus?.phase || 'idle', active = phase !== 'idle';
  const remaining = !active ? 0 : focus.paused ? focus.remaining || 0 : focus.endsAt ? Math.max(0, focus.endsAt - now) : focus.remaining || 0;
  const duration = focus?.duration || 0, playing = Boolean(companion?.musicPlaying || companion?.playing), track = companion?.track || '';
  // 到点后继续计时: past the planned end the title counts up (+mm:ss).
  const overtime = phase === 'focus' && focus?.due === true, over = overtime ? (focus.paused ? focus.over || 0 : focus.endsAt ? Math.max(0, now - focus.endsAt) : focus.over || 0) : 0;
  const icon = active && !focus.paused ? 'focus' : active ? 'pause' : playing ? 'play' : 'cat';
  const timer = !active ? '' : overtime ? `+${clockText(over)}` : clockText(remaining);
  const lines = [];
  if (active) lines.push(overtime ? `专注${focus.paused ? '（已暂停）' : ''} · 已超出 ${clockText(over)}` : `${PHASE_NAMES[phase] || '专注'}${focus.paused ? '（已暂停）' : ''} · 还剩 ${timer}`);
  if (active && focus.task) lines.push(`当前任务：${focus.task}`);
  if (playing) lines.push(track ? `正在播放：${track}` : '正在播放');
  return {
    icon, playing, phase, paused: Boolean(focus?.paused), overtime, focusRunning: phase === 'focus' && !focus.paused,
    // macOS: text next to the menu-bar icon while a round runs: a pause mark when paused, 休 during a break.
    title: !active ? '' : ` ${focus.paused ? '‖ ' : phase === 'focus' ? '' : '休 '}${timer}`,
    tooltip: ['心流小屋', ...lines].join('\n'),
    statusLine: lines[0] || (playing ? '正在播放' : '小屋很安静'),
    // Dock / taskbar: progress through the current round, breaks included (-1 hides it); badge = focus minutes left.
    progress: active && duration > 0 ? (overtime ? 1 : Math.max(0, Math.min(1, 1 - remaining / duration))) : -1,
    badge: phase === 'focus' && !overtime ? String(Math.max(1, Math.ceil(remaining / 60000))) : ''
  };
}
// A focus round just ended (focus → break / idle): bounce the Dock, flash the taskbar.
const focusEnded = (before, after) => before?.phase === 'focus' && after.phase !== 'focus';

function statusIconPath(icon, platform = process.platform, base = path.join(__dirname, 'assets', 'tray')) {
  const id = ICONS.includes(icon) ? icon : 'cat';
  if (platform === 'darwin') return path.join(base, `trayTemplate-${id}.png`);
  if (platform === 'win32') return path.join(base, `tray-${id}.ico`);
  return path.join(base, `tray-${id}.png`);
}

// Applies a status to the tray, the Dock (macOS) and the main window's taskbar button.
// deps: { getTray, getWindow, app, nativeImage, platform }
function createStatusApplier({ getTray, getWindow, app, nativeImage, getPetId = () => 'cat', applyPetIcon, platform = process.platform }) {
  let last = null, lastIcon = '';
  const image = (file) => { const img = nativeImage.createFromPath(file); if (platform === 'darwin') img.setTemplateImage?.(false); return img; };
  return {
    get last() { return last; },
    apply(status) {
      const petId = getPetId();
      const tray = getTray(), win = getWindow(), ended = focusEnded(last, status);
      if (tray) {
        if (!applyPetIcon && (petId !== lastIcon || tray.__petId !== petId)) { const img = image(trayIconPath(petId, platform)); if (!img.isEmpty()) { tray.setImage(img); tray.__petId = petId; lastIcon = petId; } }
        if (platform === 'darwin') tray.setTitle(status.title, { fontType: 'monospacedDigit' });
        tray.setToolTip(status.tooltip);
      }
      if (win && !win.isDestroyed()) {
        if (status.paused && status.progress >= 0) win.setProgressBar(status.progress, { mode: 'paused' });
        else win.setProgressBar(status.progress >= 0 ? status.progress : -1);
        if (platform === 'win32') win.setOverlayIcon(status.focusRunning ? nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray', 'tray-focus-16.png')) : null, status.focusRunning ? '专注中' : '');
        if (ended && platform === 'win32' && !win.isFocused()) win.flashFrame(true);
      }
      if (platform === 'darwin' && app.dock) { app.dock.setBadge(status.badge); if (ended) app.dock.bounce('informational'); }
      last = status;
      return { ended };
    }
  };
}
module.exports = { statusFrom, statusIconPath, createStatusApplier, clockText, focusEnded, ICONS };
