// One "step back" for Esc and the Android back button.
// Native <dialog>s close themselves on Esc and are unwound first by the Android
// handler; every other layer (a home corner, furniture editing, the fullscreen
// lyrics stage, an armed confirm…) registers how to leave it here. The most
// recently opened layer closes first, one per press.
export function createBackStack() {
  const layers = [];
  const listeners = new Set();
  const changed = () => { for (const fn of listeners) fn(layers.length); };
  return {
    push(close, label = '') {
      if (typeof close !== 'function') throw TypeError('close must be a function');
      const layer = { close, label };
      layers.push(layer); changed();
      return () => { const index = layers.indexOf(layer); if (index >= 0) { layers.splice(index, 1); changed(); } };
    },
    // Close the top layer. Returns false when nothing was open, so the caller can
    // let the platform handle the press (minimize, system back-to-home).
    back() {
      const layer = layers.at(-1);
      if (!layer) return false;
      layer.close();
      return true;
    },
    get depth() { return layers.length; },
    top: () => layers.at(-1)?.label || '',
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
}

export const backStack = createBackStack();

// Esc closes the top layer unless a modal dialog owns the key, or the person is typing.
export function installEscapeBack({ target = globalThis.document, stack = backStack } = {}) {
  if (!target) return () => {};
  const key = event => {
    if (event.key !== 'Escape' || event.defaultPrevented || event.repeat) return;
    if (target.querySelector?.('dialog[open]')) return;
    const active = target.activeElement;
    if (active?.matches?.('input:not([type=range]):not([type=checkbox]):not([type=radio]),textarea,select,[contenteditable="true"]')) return;
    if (stack.back()) event.preventDefault();
  };
  target.addEventListener('keydown', key);
  return () => target.removeEventListener('keydown', key);
}
