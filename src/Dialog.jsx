import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FOCUSABLE, focusables } from './ui/focusables.mjs';
import { playSfx } from './props/sfx.mjs';
import { PACES, readPace } from './props/motion.mjs';
import { reducedMotion } from './motion-preference.mjs';
import SheetCorner from './desk/SheetCorner';
import { takeOpener, foldPacket, dropPacketFor, listPackets } from './desk/packets.mjs';
import { slotXY, maxRect } from './desk/sheet-corner.mjs';
import { tossSheet, foldSheet } from './desk/sheet-ghost.mjs';
import { deskLayout } from './desk/layout.mjs';

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
// - A panel is a sheet of paper on DEsk's desk (https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk
//   authors): its top-right corner is DEsk's turned-down corner (desk/SheetCorner.jsx). The fold is the
//   close button (关闭{title}); turned up it offers 折起 (fold the sheet into a packet on the desk, which
//   opens it again: the action that opened it, or `reopen`), 展开 (open it out below the desk's back
//   edge) and 丢掉 (crumple and throw it away).
export default function Dialog({ title, icon, close, className = '', children, size, label, footer, initialFocus, returnFocus, variant = 'panel', container, onKeyDown, deckKeys = false, closeLabel, reopen }) {
  const dialog = useRef(null), heading = useId(), pressedOutside = useRef(false), full = variant === 'full';
  const closeRef = useRef(close); closeRef.current = close;
  const returnRef = useRef(returnFocus); returnRef.current = returnFocus;
  // What opened this sheet (to open it again from its packet): taken once the sheet is really on the desk
  // (a render that suspends, or StrictMode's second run, takes nothing twice: the note knows its taker).
  const taker = useRef(null); if (!taker.current) taker.current = {};
  const [noted, setNoted] = useState(''), opener = full ? '' : reopen || noted;
  useLayoutEffect(() => { if (!full && !reopen) setNoted(takeOpener(taker.current)); }, []);
  const [max, setMax] = useState(false), before = useRef(null);
  useEffect(() => { if (opener) dropPacketFor(opener); }, [opener]);
  // Opening out (and back): the sheet changes rectangle at once, then is drawn from where it was (0.4 s).
  useLayoutEffect(() => {
    const node = dialog.current, from = before.current; before.current = null;
    if (!node || !from || reducedMotion() || typeof node.animate !== 'function') return;
    const to = node.getBoundingClientRect();
    if (!to.width || !to.height) return;
    node.animate([{ transformOrigin: '0 0', transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})` }, { transformOrigin: '0 0', transform: 'none' }],
      { duration: 400 * (PACES[readPace()] || 1), easing: 'cubic-bezier(.45, 0, .55, 1)' });
  }, [max]);
  const cornerAct = (i) => {
    const node = dialog.current;
    if (i === 1) { before.current = node?.getBoundingClientRect() || null; playSfx('paper-unfold'); setMax((m) => !m); return; }
    if (i === 0 && opener) {
      const k = listPackets().filter((p) => p.action !== opener).length, lay = deskLayout(innerWidth, innerHeight);
      const packet = { title: typeof title === 'string' ? title : label || '', action: opener };
      foldSheet(node, slotXY(k, { width: innerWidth, height: innerHeight, s: lay.phone ? 0.7 : lay.s }), () => foldPacket(packet));
      closeRef.current();
      return;
    }
    if (i === 2) { tossSheet(node); closeRef.current(); }
  };
  const maxed = max && !full ? maxRect(innerWidth, innerHeight, deskLayout(innerWidth, innerHeight).top) : null;
  useLayoutEffect(() => {
    const node = dialog.current, previous = document.activeElement;
    // showModal() throws when the element is already open (a remount in dev
    // StrictMode) or when the browser has no dialog support at all.
    if (!node.open) { if (node.showModal) node.showModal(); else node.setAttribute('open', ''); }
    if (!full) playSfx('sheet-down');
    const target = typeof initialFocus === 'string' ? node.querySelector(initialFocus) : initialFocus?.current;
    (target || node.querySelector('[data-autofocus]') || node.querySelector('[role=tab][aria-selected=true]') || node.querySelector('.cabin-dialog-title') || node).focus({ preventScroll: true });
    // Layout cleanup runs while the node is still modal: close it first, or the opener is still inert.
    // The opener may already be gone (the row it lived on was deleted, or the panel it
    // lived in closed): then the focus would fall to <body> and the Tab order would
    // restart from the top of the page. Fall back to a stable anchor.
    return () => {
      if (node.open) node.close();
      if (!full) playSfx('paper-settle');
      if (previous && previous !== document.body && previous !== document.documentElement && previous.isConnected && !previous.closest('[inert]') && previous.getClientRects().length) { previous.focus?.({ preventScroll: true }); if (document.activeElement === previous) return; }
      const anchor = typeof returnRef.current === 'string' ? document.querySelector(returnRef.current) : returnRef.current?.current;
      (anchor || document.querySelector('.focus-badge'))?.focus?.({ preventScroll: true });
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
  return createPortal(<dialog ref={dialog} tabIndex={-1} className={`${full ? 'cabin-modal' : 'cabin-dialog cabin-modal'} ${tone} ${maxed ? 'is-max' : ''} ${className}`} style={maxed ? { '--sheet-max-top': `${maxed.y}px` } : undefined} aria-label={label || (full ? title : undefined)} aria-labelledby={!label && !full ? heading : undefined} data-deck-keys={deckKeys ? 'true' : undefined}
    onCancel={(event) => { event.preventDefault(); closeRef.current(); }} onKeyDown={keyDown}
    onPointerDown={(event) => { pressedOutside.current = outside(event); }}
    onClick={(event) => { if (pressedOutside.current && outside(event)) closeRef.current(); pressedOutside.current = false; }}>
    {full ? children : <>
      <SheetCorner sheet={dialog} title={typeof title === 'string' ? title : label || ''} closeLabel={closeLabel || `关闭${title}`} canFold={Boolean(opener)} maxed={Boolean(maxed)} onAct={cornerAct}/>
      <header className="cabin-dialog-header"><h2 id={heading} className="cabin-dialog-title" tabIndex={-1}>{icon}{title}</h2></header>
      <div className="cabin-dialog-body">{children}</div>
      {footer && <footer className="cabin-dialog-footer">{footer}</footer>}
    </>}
  </dialog>, container || document.body);
}
