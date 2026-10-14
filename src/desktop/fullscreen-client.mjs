const pending = new WeakMap();

// Native shell events and the browser Fullscreen API are the only confirmed state.
export function readCabinFullscreen(env = window) {
  const doc = env.document;
  return doc.documentElement.dataset.desktopClient === 'true'
    ? doc.documentElement.dataset.desktopFullscreen === 'true'
    : Boolean(doc.fullscreenElement);
}
export async function requestCabinFullscreen({ exit = false, env = window } = {}) {
  const doc = env.document;
  if (doc.documentElement.dataset.desktopClient === 'true') {
    // Keep toggle intent in the native controller while macOS animates a transition.
    env.open(`album-desktop://action/${exit ? 'fullscreen-exit' : 'fullscreen'}`, '_blank');
    return;
  }
  const running = pending.get(doc);
  if (running) {
    running.desired = exit ? false : !running.desired;
    return running.promise;
  }
  const state = { desired: exit ? false : !doc.fullscreenElement, promise: null };
  pending.set(doc, state);
  state.promise = (async () => {
    while (Boolean(doc.fullscreenElement) !== state.desired) {
      const before = Boolean(doc.fullscreenElement);
      if (before) await doc.exitFullscreen();
      else {
        if (typeof doc.documentElement.requestFullscreen !== 'function') throw new Error('Fullscreen unavailable');
        await doc.documentElement.requestFullscreen();
      }
      if (Boolean(doc.fullscreenElement) === before) throw new Error('Fullscreen transition was not confirmed');
    }
  })().finally(() => pending.delete(doc));
  return state.promise;
}
