// One pose resolver for the room; skins and accessories stay in the same sprite
// renderer as the desktop companion. A care action always finishes before input.
export function roomPetPose({ base = 'idle', eating = false, full = false, input = false, inputType = 'keyboard', petId = 'cat' } = {}) {
  if (eating) return petId === 'cat' ? 'eat' : 'celebrate';
  if (full) return 'celebrate';
  if (base === 'celebrate') return base;
  if (input && petId === 'cat') return inputType === 'click' ? 'click' : 'typing';
  return base;
}

// No key, pointer coordinates, typed text or target names leave the event handler.
export function watchInputPresence(target, publish, { now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const last = { keyboard: -Infinity, click: -Infinity };
  let latest = { at: 0, type: 'keyboard' }, timer = null;
  const mark = (type) => (event) => {
    if (event.target?.closest?.('.room-cat, .pet-cat')) return;
    const at = now();
    if (at - last[type] < 100) return;
    last[type] = at; latest = { at, type }; clearTimer(timer); publish({ active: true, ...latest });
    timer = setTimer(() => publish({ active: false, ...latest }), 850);
  };
  const keydown = mark('keyboard'), pointerdown = mark('click');
  target.addEventListener('keydown', keydown, { passive: true });
  target.addEventListener('pointerdown', pointerdown, { passive: true });
  return () => { clearTimer(timer); target.removeEventListener('keydown', keydown); target.removeEventListener('pointerdown', pointerdown); };
}
