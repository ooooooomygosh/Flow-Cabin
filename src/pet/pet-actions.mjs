// Stable data-only action vocabulary, shared by native packs and built-in art.
export const PET_ACTIONS = Object.freeze(['idle', 'walk', 'sleep', 'focus', 'listen', 'groove', 'typing', 'click', 'eat', 'hop', 'deliver', 'celebrate', 'blink', 'stretch', 'yawn', 'groom', 'wave', 'nod', 'curious', 'shy', 'happy', 'sad', 'drink', 'return']);
export const ACTION_FRAMES = Object.freeze(Object.fromEntries(PET_ACTIONS.map(action => [action, action === 'sleep' ? 2 : 4])));
export const DETAIL_ACTIONS = Object.freeze(['blink', 'stretch', 'groom', 'curious', 'nod']);
export function createPetScheduler() {
  let transient = null, lastDetailAt = -Infinity, cursor = 0;
  const cooldowns = new Map();
  return {
    request(action, now, { quiet = false, cooldown = 5000, duration = 1400 } = {}) {
      if (!PET_ACTIONS.includes(action) || !Number.isFinite(now) || quiet || now < (cooldowns.get(action) ?? -Infinity)) return false;
      transient = { action, endsAt: now + Math.min(2000, Math.max(100, duration)) };
      cooldowns.set(action, now + Math.max(cooldown, duration)); return true;
    },
    resolve({ now = 0, base = 'idle', playing = false, synced = false, quiet = false, reduced = false } = {}) {
      if (transient && (now >= transient.endsAt || (transient.detail && base !== 'idle'))) transient = null;
      if (quiet || reduced) transient = null;
      const music = playing ? (synced ? 'beat' : 'listen') : '';
      if (!quiet && !reduced && base === 'idle' && !transient && now - lastDetailAt >= 30000) {
        lastDetailAt = now; transient = { action: DETAIL_ACTIONS[cursor++ % DETAIL_ACTIONS.length], detail: true, endsAt: now + 1200 };
      }
      return { pose: transient?.action || base, base, music, detail: transient?.action || '' };
    },
  };
}
