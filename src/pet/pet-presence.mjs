// One pose resolver for the room; skins and accessories stay in the same sprite
// renderer as the desktop companion. A care action always finishes before input.
export function roomPetPose({ base = 'idle', eating = false, full = false, input = false, petId = 'cat' } = {}) {
  if (eating) return petId === 'cat' ? 'eat' : 'celebrate';
  if (full) return 'celebrate';
  if (base === 'celebrate') return base;
  if (input && petId === 'cat') return 'typing';
  return base;
}

// No key, pointer coordinates, typed text or target names leave the event handler.
export function watchInputPresence(target, publish, { now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let last = -Infinity, timer = null;
  const mark = (event) => {
    if (event.target?.closest?.('.room-cat, .pet-cat')) return;
    const at = now();
    if (at - last < 100) return;
    last = at; clearTimer(timer); publish({ active: true, at });
    timer = setTimer(() => publish({ active: false, at: last }), 850);
  };
  target.addEventListener('keydown', mark, { passive: true });
  target.addEventListener('pointerdown', mark, { passive: true });
  return () => { clearTimer(timer); target.removeEventListener('keydown', mark); target.removeEventListener('pointerdown', mark); };
}
