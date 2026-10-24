'use strict';
// Windows: hide the desktop pet while a fullscreen app (a video, a game, a presentation) is in
// front. Electron cannot see other apps' windows, so DesktopHost.exe fullscreen-watch asks the
// shell (SHQueryUserNotificationState) and compares the foreground window with its monitor,
// printing {"fullscreen":true|false} lines when that changes. macOS needs none of this: the pet
// window is created with visibleOnFullScreen: false.
const { spawn } = require('node:child_process');
const readline = require('node:readline');

function parseFullscreenLine(line) {
  try { const value = JSON.parse(line); return typeof value?.fullscreen === 'boolean' ? value.fullscreen : null; } catch { return null; }
}

function createFullscreenWatch({ platform = process.platform, helperPath, spawnProcess = spawn, onChange = () => {}, log = () => {}, restartDelay = 5000, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let child = null, wanted = false, state = false, restarts = 0, timer = null, target = '';
  const report = (value) => { if (value !== state) { state = value; onChange(value); } };
  function launch() {
    if (!wanted || child || platform !== 'win32' || !helperPath || !target) return;
    try {
      const current = spawnProcess(helperPath, ['fullscreen-watch', target, String(process.pid)], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
      child = current;
      readline.createInterface({ input: current.stdout }).on('line', (line) => { const value = parseFullscreenLine(line); if (child === current && value !== null) { restarts = 0; report(value); } });
      current.on('error', (error) => { log('pet-fullscreen-error', error.message); });
      current.on('exit', () => {
        if (child !== current) return;
        child = null; report(false);
        // The helper stops when the pet window closes; otherwise try again a few times.
        if (wanted && restarts++ < 3) timer = setTimer(launch, restartDelay);
      });
    } catch (error) { child = null; log('pet-fullscreen-error', error.message); }
  }
  return {
    get fullscreen() { return state; },
    get supported() { return platform === 'win32' && Boolean(helperPath); },
    start(handle) { wanted = true; target = String(handle || ''); restarts = 0; launch(); },
    stop() { wanted = false; clearTimer(timer); timer = null; const old = child; child = null; report(false); try { old?.stdin?.end(); old?.kill(); } catch {} }
  };
}
module.exports = { createFullscreenWatch, parseFullscreenLine };
