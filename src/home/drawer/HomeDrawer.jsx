import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import BrassPlate from '../../props/BrassPlate';
import { playSfx } from '../../props/sfx.mjs';
import { moveSeconds } from '../../props/motion.mjs';
import { reducedMotion } from '../../motion-preference.mjs';
import useBackLayer from '../../ui/useBackLayer';
import { focusables } from '../../ui/focusables.mjs';
import { normalizeItems, nextPhase } from './drawer-model.mjs';
import DrawerObject from './DrawerObjects';
import './drawer.css';

// 小屋日常 as the desk's drawer (docs/v3-desk-design.md; after DEsk's dock drawer, 2.4.14,
// https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors): a walnut front that slides up from the
// bottom of the window on the drawer spring, green felt inside, and the everyday things lying on it. Each
// one is a real button named as the old menu's were, with its name engraved on a small brass tag.
//
//   <HomeDrawer open close items onPick/>
//   open   boolean (default true). Turning it false slides the drawer back before it leaves the DOM.
//   close  () => void: Esc, the Android back button, a click on the room outside, the brass handle.
//   items  gearMenu(labs) from shell-model.mjs: { core: [[id, name]…], lab: [[id, name]…] }
//   onPick (id) => void: called with 'themes' | 'decorate' | 'backup' | 'settings' | 'recipes' | 'sleep' | 'postcard'.
//          The drawer does NOT close itself: the host decides what is next (see pickAction in drawer-model.mjs).
export default function HomeDrawer({ open = true, close, items, onPick, label = '小屋日常' }) {
  const [phase, setPhase] = useState(() => nextPhase('out', open ? 'open' : 'close', { reduced: reducedMotion() }));
  useEffect(() => { setPhase((now) => nextPhase(now, open ? 'open' : 'close', { reduced: reducedMotion() })); }, [open]);
  useBackLayer(open && phase !== 'out', () => close?.(), 'drawer');
  if (phase === 'out') return null;
  return <Sheet phase={phase} items={items} close={close} onPick={onPick} label={label} settled={() => setPhase((now) => nextPhase(now, 'settled'))}/>;
}

function Sheet({ phase, items, close, onPick, label, settled }) {
  const dialog = useRef(null), panel = useRef(null), pressedOutside = useRef(false), closeRef = useRef(close);
  closeRef.current = close;
  const phaseRef = useRef(phase); phaseRef.current = phase;
  const list = useMemo(() => normalizeItems(items), [items]);
  // It is a modal <dialog>: the room behind goes inert, every room shortcut that checks `dialog[open]` stands down,
  // and the focus comes back to what opened it.
  useLayoutEffect(() => {
    const node = dialog.current, previous = document.activeElement;
    if (!node.open) { if (node.showModal) node.showModal(); else node.setAttribute('open', ''); }
    (node.querySelector('[data-autofocus]') || node.querySelector('.drawer-object') || node).focus({ preventScroll: true });
    return () => {
      // pushed in without a slide (reduced motion, or the host dropped it): the drawer still closes with its sound
      if (phaseRef.current !== 'closing') playSfx('drawer-stop-in');
      if (node.open) node.close();
      if (previous && previous !== document.body && previous.isConnected && !previous.closest('[inert]') && previous.getClientRects().length) previous.focus?.({ preventScroll: true });
      else document.querySelector('.focus-badge')?.focus?.({ preventScroll: true });
    };
  }, []);
  // Sounds: the drawer running out and stopping, and back in (they play whatever the motion setting).
  useEffect(() => {
    if (phase === 'opening') { playSfx('drawer-out'); return undefined; }
    if (phase === 'open') { playSfx('drawer-stop-out'); return undefined; }
    if (phase === 'closing') { playSfx('drawer-in'); return undefined; }
    return undefined;
  }, [phase]);
  // The slide is over: when its animation ends (or, were it never to run, a moment after it should have).
  const rest = useRef(settled); rest.current = settled;
  useEffect(() => {
    if (phase !== 'opening' && phase !== 'closing') return undefined;
    const timer = setTimeout(() => { if (phase === 'closing') playSfx('drawer-stop-in'); rest.current(); }, (phase === 'opening' ? moveSeconds(0.62) : moveSeconds(0.34)) * 1000 + 160);
    return () => clearTimeout(timer);
  }, [phase]);
  const onKeyDown = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); if (!event.repeat) closeRef.current?.(); return; }
    const objects = [...dialog.current.querySelectorAll('.drawer-object')], index = objects.indexOf(document.activeElement);
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (step && index >= 0 && !event.altKey && !event.ctrlKey && !event.metaKey) { event.preventDefault(); objects[(index + step + objects.length) % objects.length]?.focus(); return; }
    if (event.key !== 'Tab') return;
    const tabbable = focusables(dialog.current), first = tabbable[0], last = tabbable.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (!tabbable.includes(document.activeElement)) { event.preventDefault(); first.focus(); }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const outside = (event) => event.target === dialog.current;
  const pick = (id) => { playSfx('felt-drop'); onPick?.(id); };
  const objects = (group) => group.map((item) => <button type="button" key={item.id} className={`drawer-object is-${item.kind}`} style={{ '--tilt': `${item.tilt}deg`, '--nudge': `${item.nudge}px` }}
    onPointerDown={() => playSfx('felt-pick')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') playSfx('felt-pick'); }} onClick={() => pick(item.id)}>
    <DrawerObject kind={item.kind}/>
    <BrassPlate as="span" className="drawer-tag">{item.name}</BrassPlate>
  </button>);
  return createPortal(<dialog ref={dialog} tabIndex={-1} className="home-drawer" aria-label={label} data-phase={phase} inert={phase === 'closing'}
    onCancel={(event) => { event.preventDefault(); closeRef.current?.(); }} onKeyDown={onKeyDown}
    onPointerDown={(event) => { pressedOutside.current = outside(event); }}
    onClick={(event) => { if (pressedOutside.current && outside(event)) closeRef.current?.(); pressedOutside.current = false; }}>
    <div className="drawer" ref={panel} onAnimationEnd={(event) => { if (event.target === panel.current && (phase === 'opening' || phase === 'closing')) { if (phase === 'closing') playSfx('drawer-stop-in'); settled(); } }}>
      <div className="drawer-felt">
        <nav className="drawer-things" aria-label="小屋功能">{objects(list.core)}</nav>
        {list.lab.length > 0 && <nav className="drawer-things drawer-labs" aria-label="实验室功能"><h3 className="drawer-chalk">实验室</h3>{objects(list.lab)}</nav>}
      </div>
      <div className="drawer-front">
        <BrassPlate as="span" className="drawer-name">{label}</BrassPlate>
        <button type="button" className="drawer-handle" aria-label="放回抽屉" onClick={() => closeRef.current?.()}><span aria-hidden="true"/></button>
      </div>
    </div>
  </dialog>, document.body);
}
