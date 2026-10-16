/** Immersive mode hides the turntable console completely; bring it back while
 * the pointer is within REACH px of where it sits (html[data-console-near]).
 * The pointer is only watched while html.room-zen is set, and the console's
 * rectangle is cached (refreshed on resize, on entering zen and every 300 ms),
 * so ordinary pointer movement over the room costs no frames and no layout reads. */
const REACH = 72, RECT_TTL = 300;
export const nearConsole = (rect, x, y, reach = REACH) => Boolean(rect) && x >= rect.left - reach && x <= rect.right + reach && y >= rect.top - reach && y <= rect.bottom + reach;
export function installZenConsoleReveal(win = window) {
  const doc = win.document, root = doc.documentElement;
  let frame = 0, x = -1, y = -1, rect = null, rectAt = -Infinity, listening = false;
  const panelRect = () => {
    const now = win.performance.now();
    if (now - rectAt > RECT_TTL) { rect = doc.querySelector('.room-turntable')?.getBoundingClientRect() || null; rectAt = now; }
    return rect;
  };
  const set = (near) => { if ((root.dataset.consoleNear === 'true') !== near) { if (near) root.dataset.consoleNear = 'true'; else delete root.dataset.consoleNear; } };
  const check = () => { frame = 0; set(root.classList.contains('room-zen') && nearConsole(panelRect(), x, y)); };
  const schedule = () => { if (!frame) frame = win.requestAnimationFrame(check); };
  const move = (event) => { x = event.clientX; y = event.clientY; schedule(); };
  const leave = () => { x = y = -1; schedule(); };
  const resize = () => { rectAt = -Infinity; };
  const sync = () => {
    const zen = root.classList.contains('room-zen');
    if (zen === listening) return;
    listening = zen; rectAt = -Infinity;
    if (zen) { win.addEventListener('pointermove', move, { passive: true }); doc.addEventListener('pointerleave', leave); win.addEventListener('resize', resize); }
    else {
      win.removeEventListener('pointermove', move); doc.removeEventListener('pointerleave', leave); win.removeEventListener('resize', resize);
      if (frame) { win.cancelAnimationFrame(frame); frame = 0; }
      set(false);
    }
  };
  const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(sync);
  observer?.observe(root, { attributes: true, attributeFilter: ['class'] });
  sync();
  return () => { observer?.disconnect(); if (listening) { listening = false; win.removeEventListener('pointermove', move); doc.removeEventListener('pointerleave', leave); win.removeEventListener('resize', resize); } if (frame) win.cancelAnimationFrame(frame); };
}
