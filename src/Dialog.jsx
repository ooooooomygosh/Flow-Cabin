import React, { useId, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from './icons';
import { FOCUSABLE, focusables } from './ui/focusables.mjs';

const SIZES = new Set(['sm', 'md', 'lg', 'xl']);
export { FOCUSABLE, focusables };

// THE modal of the app: a native <dialog> opened with showModal(), so the room
// behind is inert and every room shortcut that checks `dialog[open]` stands down.
// - size: sm | md (default) | lg | xl; variant 'full' covers the window
//   and renders its own chrome (唱机特写, 专辑墙).
// - First focus: `initialFocus` (ref or selector), else [data-autofocus], else the
//   selected tab, else the heading (the close × never starts with the ring).
// - Tab wraps inside; Escape closes once (a held key never unwinds layers);
//   the backdrop closes only when a press both starts and ends outside the box.
// - Focus returns to whatever opened the dialog. When that opener is gone
//   (the row it lived on was deleted, or the panel it lived in closed), the
//   focus would fall to <body> and the Tab order would restart from the top
//   of the page — `returnFocus` is the stable anchor to fall back to.
export default function Dialog({ title, icon, close, className = '', children, size, label, footer, initialFocus, returnFocus, variant = 'panel', container, onKeyDown, deckKeys = false, closeLabel }) {
  const dialog = useRef(null), heading = useId(), pressedOutside = useRef(false), full = variant === 'full';
  const closeRef = useRef(close); closeRef.current = close;
  const returnRef = useRef(returnFocus); returnRef.current = returnFocus;
  useLayoutEffect(() => {
    const node = dialog.current, previous = document.activeElement;
    // showModal() throws when the element is already open (a remount in dev
    // StrictMode) or when the browser has no dialog support at all.
    if (!node.open) { if (node.showModal) node.showModal(); else node.setAttribute('open', ''); }
    const target = typeof initialFocus === 'string' ? node.querySelector(initialFocus) : initialFocus?.current;
    (target || node.querySelector('[data-autofocus]') || node.querySelector('[role=tab][aria-selected=true]') || node.querySelector('.cabin-dialog-title') || node).focus({ preventScroll: true });
    // Layout cleanup runs while the node is still modal: close it first, or the opener is still inert.
    // The opener may already be gone (the row it lived on was deleted, or the panel it
    // lived in closed): then the focus would fall to <body> and the Tab order would
    // restart from the top of the page. Fall back to a stable anchor.
    return () => {
      if (node.open) node.close();
      if (previous && previous.isConnected !== false) { previous.focus?.({ preventScroll: true }); return; }
      const anchor = typeof returnRef.current === 'string' ? document.querySelector(returnRef.current) : returnRef.current?.current;
      anchor?.focus?.({ preventScroll: true });
    };
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
    // The focus sits on something the list does not know (the dialog itself, a
    // heading): let the browser walk the dialog's own order instead of
    // snapping back to the first control.
    if (!list.includes(current)) { if (current && dialog.current.contains(current)) return; event.preventDefault(); first.focus(); return; }
    if (event.shiftKey && current === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && current === last) { event.preventDefault(); first.focus(); }
  };
  const tone = full ? 'is-full' : `is-${SIZES.has(size) ? size : 'md'}`;
  return createPortal(<dialog ref={dialog} tabIndex={-1} className={`${full ? 'cabin-modal' : 'cabin-dialog cabin-modal'} ${tone} ${className}`} aria-label={label || (full ? title : undefined)} aria-labelledby={!label && !full ? heading : undefined} data-deck-keys={deckKeys ? 'true' : undefined}
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
