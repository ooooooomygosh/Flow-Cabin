// An AudioContext keeps the audio render thread awake for as long as it runs,
// even when nothing is connected. Each of the cabin's contexts (ambience, deck
// analyser, deck sounds, Tone) is suspended once it has been idle for `ms` and
// resumed on the next use. `busy()` vetoes a suspend that comes due (e.g. the
// <audio> routed through the analyser is still playing).
export function createIdleSuspend(context, { ms = 2000, busy = () => false, schedule = setTimeout, cancel = clearTimeout } = {}) {
  let timer = null;
  const stop = () => { if (timer !== null) cancel(timer); timer = null; };
  return {
    // Something is about to play: wake the context and forget any pending suspend.
    wake() {
      stop();
      if (context.state === 'suspended') context.resume?.().catch(() => {});
    },
    // Nothing will use it for now: suspend after the grace period.
    idle() {
      stop();
      timer = schedule(() => {
        timer = null;
        if (context.state === 'running' && !busy()) context.suspend?.().catch(() => {});
      }, ms);
    },
    cancel: stop
  };
}
