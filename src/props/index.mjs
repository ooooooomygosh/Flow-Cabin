// Starts what the desk needs before the first paint of anything made of paper or brass.
import { installMotion } from './motion.mjs';
import { installLamp } from './lamp.mjs';
import { installPaper } from './paper.mjs';

let started = false;
export function installProps() {
  if (started || typeof document === 'undefined') return;
  started = true;
  // --curl is the size of a sheet's turned-down corner; registered so it can animate.
  try { globalThis.CSS?.registerProperty?.({ name: '--curl', syntax: '<length>', inherits: true, initialValue: '20px' }); } catch { /* already registered */ }
  installMotion();
  installLamp();
  installPaper();
  globalThis.addEventListener?.('resize', () => installLamp(), { passive: true });
}
