import React, { useId, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from './icons';

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled):not([type=hidden]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
const SIZES = new Set(['sm', 'md', 'lg', 'xl']);
export const focusables = (root) => [...root.querySelectorAll(FOCUSABLE)].filter((node) => node.tabIndex >= 0 && !node.closest('[inert]') && node.getClientRects().length);

// THE modal of the app: a native <dialog> opened with showModal(), so the room
// behind is inert and every room shortcut that checks `dialog[open]` stands down.
// - size: sm | md (default) | lg | xl (`wide` = lg); variant 'full' covers the window
//   and renders its own chrome (唱机特写, 专辑墙).
// - First focus: `initialFocus` (ref or selector), else [data-autofocus], else the
//   selected tab, else the heading (the close × never starts with the ring).
// - Tab wraps inside; Escape closes once (a held key never unwinds layers);
//   the backdrop closes only when a press both starts and ends outside the box.
// - Focus returns to whatever opened the dialog.
export default function Dialog({ title, icon, close, className = '', children, size, wide = false, label, footer, initialFocus, variant = 'panel', container, onKeyDown, deckKeys = false, closeLabel }) {
  const dialog = useRef(null), heading = useId(), pressedOutside = useRef(false), full = variant === 'full';
  const closeRef = useRef(close); closeRef.current = close;
  useLayoutEffect(() => {
    const node = dialog.current, previous = document.activeElement;
    node.showModal();
    const target = typeof initialFocus === 'string' ? node.querySelector(initialFocus) : initialFocus?.current;
    (target || node.querySelector('[data-autofocus]') || node.querySelector('[role=tab][aria-selected=true]') || node.querySelector('.cabin-dialog-title') || node).focus({ preventScroll: true });
    return () => previous?.focus?.({ preventScroll: true });
  }, []);
  const outside = (event) => {
    if (event.target !== dialog.current) return false;
    const rect = dialog.current.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  };
  const keyDown = (event) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === 'Escape') { event.preventDefault(); if (!event.repeat) closeRef.current(); return; }
    if (event.key !== 'Tab') return;
    const list = focusables(dialog.current), first = list[0], last = list.at(-1), current = document.activeElement;
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (current === first || !list.includes(current))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (current === last || !list.includes(current))) { event.preventDefault(); first.focus(); }
  };
  const tone = full ? 'is-full' : `is-${SIZES.has(size) ? size : wide ? 'lg is-wide' : 'md'}`; // is-wide: legacy hook for `wide` callers
  return createPortal(<dialog ref={dialog} tabIndex={-1} className={`${full ? 'cabin-modal' : 'cabin-dialog cabin-modal'} ${tone} ${className}`} aria-label={label || (full ? title : undefined)} aria-labelledby={label || full ? undefined : heading} data-deck-keys={deckKeys ? 'true' : undefined}
    onCancel={(event) => { event.preventDefault(); closeRef.current(); }} onKeyDown={keyDown}
    onPointerDown={(event) => { pressedOutside.current = outside(event); }}
    onClick={(event) => { if (pressedOutside.current && outside(event)) closeRef.current(); pressedOutside.current = false; }}>
    {full ? children : <>
      <header className="cabin-dialog-header"><h2 id={heading} className="cabin-dialog-title" tabIndex={-1}>{icon}{title}</h2><button type="button" className="cabin-dialog-close" aria-label={closeLabel || `关闭${title}`} onClick={close}><X/></button></header>
      <div className="cabin-dialog-body">{children}</div>
      {footer && <footer className="cabin-dialog-footer">{footer}</footer>}
    </>}
  </dialog>, container || document.body);
}
