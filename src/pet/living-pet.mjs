import { artAction } from './pet-art-v21.mjs';

// Shared semantic lifecycle for the Pixi room and native companion. Each pose
// names a separately drawn clip; work always takes priority over music motion.
export function createLivingPet() {
  let previous = {}, transient = null, idleSlot = -1, lastPose = '', origin = 0;
  const request = (action, now, duration = 1600) => { transient = { action: artAction(action), start: now, until: now + duration }; };
  return {
    request,
    resolve(c = {}) {
      const now = c.now || 0, work = c.focus === true, resting = c.resting === true || c.base === 'sleep';
      if (transient && now >= transient.until) {
        if (transient.action === 'eat') request('satisfied', now, 1600); else transient = null;
      }
      if (previous.resting && !resting) request('wake', now, 1800);
      if (previous.walking && !c.walking && !resting) request('land', now, 700);
      if (previous.facing !== undefined && c.facing !== undefined && previous.facing !== c.facing && c.walking) request('turn', now, 600);
      if (previous.dragging && !c.dragging) request('land', now, 800);
      if (previous.focus !== undefined && previous.focus && !work && c.completed) request('celebrate', now, 1800);
      let pose;
      if (c.dragging) pose = 'dragged';
      else if (c.landing) pose = 'land';
      else if (c.reduced || c.quiet) { transient = null; pose = resting ? 'sleep' : work ? 'read' : c.playing ? 'listen' : 'idle'; }
      else if (transient && (!work || ['eat','satisfied','petresponse','celebrate','deliver'].includes(transient.action))) pose = transient.action;
      else if (c.base === 'celebrate') pose = 'celebrate';
      else if (c.walking) pose = 'walk';
      else if (resting) pose = 'sleep';
      else if (c.input === 'keyboard') pose = 'type';
      else if (c.input === 'click') pose = 'petresponse';
      else if (work) pose = ['read','read','write','read','think'][Math.floor(now / 14000) % 5];
      else if (c.playing) pose = c.synced ? ['listen','nod','sway','dance'][Math.floor(now / 8000) % 4] : 'listen';
      else {
        const slot = Math.floor(now / 30000);
        if (slot !== idleSlot) { idleSlot = slot; request(['observe','stretch','yawn','greet'][slot % 4], now, 1800); }
        pose = transient?.action || 'idle';
      }
      if (pose !== lastPose) { lastPose = pose; origin = now; }
      previous = { resting, walking:c.walking, dragging:c.dragging, facing:c.facing, focus:work };
      return { pose, origin, elapsed:Math.max(0,now-origin), music:work && c.playing && c.synced && !c.reduced && !c.quiet };
    }
  };
}
export function bindPetLife(machine, target = globalThis.window, now = Date.now) {
  const bindings = [['cabin:cat-fed','eat',2400],['cabin:cat-petted','petresponse',1500],['cabin:pet-deliver','deliver',1800],['cabin:pet-celebrate','celebrate',1800]];
  const off = bindings.map(([event, action, duration]) => { const cb = () => machine.request(action, now(), duration); target?.addEventListener(event, cb); return () => target?.removeEventListener(event, cb); });
  return () => off.forEach(fn => fn());
}
