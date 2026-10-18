'use strict';
// Reads the display-only room and focus state that the cabin page exposes,
// for the wallpaper and the desktop pet.
const READ_SCRIPT = `(() => {
  const companion = window.albumCompanionSnapshot?.() || null;
  const room = window.albumRoomSnapshot?.() || null;
  return { room: room ? { ...room, focus: companion?.focus || null, focusDisplay: companion?.focusDisplay || null } : null,
    companion: companion ? { petId: companion.petId || room?.petId, focus: companion.focus, playing: companion.playing, track: companion.track, musicPlaying: companion.musicPlaying, energy: companion.energy, energyEstimated: companion.energyEstimated, bpm: companion.bpm, beatAt: companion.beatAt, lofiBpm: companion.lofiBpm, care: companion.care, typingAt: companion.typingAt, reduceMotion: document.documentElement.dataset.desktopReduceMotion === 'true' } : null };
})()`;

async function readCompanion(site) {
  if (!site || site.isDestroyed()) return null;
  return site.executeJavaScript(READ_SCRIPT);
}

// Polls while at least one window listens and calls it only on change.
// `interval` may be a function of the last value, so the pet can follow music
// energy quickly while audio plays and fall back to a slow poll otherwise.
function createCompanionPoller({ getSite, clean, interval = 750, onValue }) {
  let timer = null, busy = false, last = '', lastValue = null, generation = 0;
  const delay = () => Math.max(50, Number(typeof interval === 'function' ? interval(lastValue) : interval) || 750);
  async function poll() {
    if (busy) return; busy = true; const current = generation;
    try {
      const value = clean(await readCompanion(getSite()));
      const json = JSON.stringify(value);
      if (current === generation && value && json !== last) { last = json; lastValue = value; onValue(value); }
    } catch { /* A reload leaves the last valid state in place. */ }
    finally { busy = false; }
  }
  return {
    start() {
      if (timer) return; generation++; last = ''; lastValue = null; const current = generation;
      const loop = async () => { await poll(); if (current === generation) timer = setTimeout(loop, delay()); };
      loop();
    },
    stop() { generation++; clearTimeout(timer); timer = null; last = ''; lastValue = null; },
    poll
  };
}

// Sends a whitelisted command from a companion window to the business page.
const COMMANDS = new Set(['focus-start', 'focus-pause', 'focus-toggle', 'focus-skip', 'sound-toggle', 'cat-feed', 'open-settings', 'open-onboarding', 'open-about']);
function sendCompanionCommand(site, command) {
  if (!COMMANDS.has(command) || !site || site.isDestroyed()) return false;
  site.executeJavaScript(`window.dispatchEvent(new CustomEvent('album-companion-command', { detail: { command: ${JSON.stringify(command)} } }));`).catch(() => {});
  return true;
}
module.exports = { readCompanion, createCompanionPoller, sendCompanionCommand, COMMANDS };
