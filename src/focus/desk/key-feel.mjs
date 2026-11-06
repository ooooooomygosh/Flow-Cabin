// The click of a bakelite key: down when it goes in, up when it comes back. Pointer and keyboard
// both. Attach the handlers to the container of the keys; they find the button under the pointer.
import { playSfx } from '../../props/sfx.mjs';

export function createKeyFeel(play = playSfx) {
  let held = false;
  const target = (event) => event.target?.closest?.('button:not(:disabled), [role=button]:not([aria-disabled=true])');
  const down = () => { if (held) return; held = true; play('key-press'); };
  const up = () => { if (!held) return; held = false; play('key-release'); };
  return {
    onPointerDown: (event) => { if ((event.pointerType === 'mouse' && event.button !== 0) || !target(event)) return; down(); },
    onPointerUp: up, onPointerCancel: up, onPointerLeave: up,
    onKeyDown: (event) => { if ((event.key === ' ' || event.key === 'Enter') && !event.repeat && target(event)) down(); },
    onKeyUp: (event) => { if (event.key === ' ' || event.key === 'Enter') up(); },
    onBlur: up
  };
}
