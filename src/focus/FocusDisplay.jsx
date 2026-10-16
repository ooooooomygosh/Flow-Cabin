import React, { useEffect, useRef, useState } from 'react';
import FocusFace, { faceFocus } from './FocusFace';
import { useFocusDisplay, useSceneLook } from './useFocusDisplay';
import { FACE_IDS, FACE_LABELS, FACE_HINTS, SHOW_MODES, cycleFace, faceFor } from './focus-display.mjs';
import { PHASE_LABELS } from './focus-model.mjs';
import { useFocusState } from './useFocus';
import { Segmented } from '../ui/Roving';
import { ChevronLeft, ChevronRight, Expand, Contract, Play, Pause, X } from '../icons';
import { readCabinFullscreen, requestCabinFullscreen } from '../desktop/fullscreen-client.mjs';
import { useDesktopFullscreen } from '../desktop-client';
import { roomCovered } from '../room/useRoomChrome';
import { getRoomScene } from '../scene-catalog.mjs';

// 专注画面: one face, chosen by the user (or the scene's own until they pick),
// shown in the focus dock, the zen clock, the desktop clock widget and — with
// 整窗 or F — filling the window while the room dims to a lamp-lit vignette.
export const OPEN_EVENT = 'cabin-focus-display';
export const openFocusDisplay = (open = true) => window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { open } }));
const typing = (target) => target?.closest?.('input,textarea,select,[contenteditable="true"]');

// Settings › 专注工具: a grid of still faces in the current scene's palette.
export function FacePicker() {
  const look = useSceneLook(), [display, setDisplay] = useFocusDisplay(), current = faceFor(display, look);
  return <section className="face-picker" aria-label="专注画面">
    <header><strong>专注画面</strong><small>{display.mode ? '计时和时钟都用这个画面，按 F 让窗口变成时钟。' : `正在跟随「${getRoomScene(look).label}」的默认画面，选一个就固定下来。`}</small>
      {display.mode && <button type="button" className="face-picker-reset" onClick={() => setDisplay({ mode: '' })}>跟随场景</button>}</header>
    <Segmented className="face-grid" label="专注画面" value={current} onChange={(mode) => setDisplay({ mode })}
      items={FACE_IDS.map((id) => ({ id, title: FACE_HINTS[id], label: <><FocusFace face={id} look={look} still variant="thumb"/><span>{FACE_LABELS[id]}</span></> }))}/>
    <div className="face-picker-options">
      <span className="face-picker-label">显示</span>
      <Segmented className="face-show" label="画面显示" value={display.show} onChange={(show) => setDisplay({ show })} items={SHOW_MODES.map(([id, label]) => ({ id, label, title: id === 'auto' ? '专注或休息时显示倒计时，其余时间显示时钟' : undefined }))}/>
      <label className="focus-check"><input type="checkbox" checked={display.seconds} onChange={(event) => setDisplay({ seconds: event.target.checked })}/>时钟显示秒</label>
    </div>
  </section>;
}

// The dock header's quick switch: ‹ face › and 整窗.
export function FaceSwitch() {
  const look = useSceneLook(), [display, setDisplay] = useFocusDisplay(), id = faceFor(display, look);
  return <div className="face-switch" role="group" aria-label="专注画面">
    <span className="face-switch-title">画面</span>
    <button type="button" aria-label="上一个专注画面" title="上一个画面" onClick={() => setDisplay({ mode: cycleFace(id, -1) })}><ChevronLeft size={16}/></button>
    <strong aria-live="polite" title={FACE_HINTS[id]}>{FACE_LABELS[id]}</strong>
    <button type="button" aria-label="下一个专注画面" title="下一个画面" onClick={() => setDisplay({ mode: cycleFace(id, 1) })}><ChevronRight size={16}/></button>
    <button type="button" className="face-switch-full" aria-keyshortcuts="F" title="窗口变成时钟 · F" onClick={() => openFocusDisplay()}><Expand size={16}/><span>整窗</span></button>
  </div>;
}

// The whole-window display. Esc or a click on the dimmed room returns; ←/→ turn
// through the faces; Space still plays / pauses the deck behind it.
export default function FocusDisplayStage() {
  const [open, setOpen] = useState(false), [flash, setFlash] = useState(''), [idle, setIdle] = useState(false);
  const focus = useFocusState(), look = useSceneLook(), [display, setDisplay] = useFocusDisplay(), id = faceFor(display, look);
  const fullscreen = useDesktopFullscreen(), ownFullscreen = useRef(false), stage = useRef(null), returnTo = useRef(null), live = useRef(id); live.current = id;
  const close = () => setOpen(false);
  const cycle = (step) => { const next = cycleFace(live.current, step); setDisplay({ mode: next }); setFlash(FACE_LABELS[next]); };
  useEffect(() => { const on = (event) => setOpen(event.detail?.open !== false); window.addEventListener(OPEN_EVENT, on); return () => window.removeEventListener(OPEN_EVENT, on); }, []);
  // F (room scope; 唱机特写 and dialogs keep their own keys).
  useEffect(() => {
    const key = (event) => {
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || typing(event.target) || roomCovered()) return;
      if ((event.key === 'f' || event.key === 'F') && !document.documentElement.classList.contains('room-corner-open')) { event.preventDefault(); setOpen((value) => !value); }
    };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, []);
  useEffect(() => { if (!flash) return undefined; const timer = setTimeout(() => setFlash(''), 1500); return () => clearTimeout(timer); }, [flash]);
  useEffect(() => {
    if (!open) return undefined;
    const root = document.documentElement;
    returnTo.current = document.activeElement; root.classList.add('room-focus-display'); stage.current?.focus({ preventScroll: true });
    // Capture phase: these keys belong to the display, not the deck (←/→ would seek).
    const key = (event) => {
      if (roomCovered() || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); setOpen(false); }
      else if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !typing(event.target) && !event.target?.closest?.('[role=radiogroup]')) { event.preventDefault(); event.stopImmediatePropagation(); if (!event.repeat) cycle(event.key === 'ArrowRight' ? 1 : -1); }
      else if (/^[zZtT]$/.test(event.key)) event.preventDefault();
    };
    window.addEventListener('keydown', key, true);
    let timer = 0;
    const wake = () => { setIdle(false); clearTimeout(timer); timer = setTimeout(() => setIdle(true), 2600); };
    window.addEventListener('pointermove', wake); wake();
    return () => {
      root.classList.remove('room-focus-display'); window.removeEventListener('keydown', key, true); window.removeEventListener('pointermove', wake); clearTimeout(timer);
      if (ownFullscreen.current && readCabinFullscreen()) requestCabinFullscreen({ exit: true }).catch(() => {});
      ownFullscreen.current = false;
      const back = returnTo.current; (back?.isConnected ? back : document.querySelector('.focus-badge'))?.focus?.({ preventScroll: true });
    };
  }, [open]);
  if (!open) return null;
  const state = focus?.state, timer = state?.timer, running = timer && timer.phase !== 'idle';
  const clockShown = display.show === 'clock' || (display.show === 'auto' && !running);
  const task = state?.tasks.find((item) => item.id === timer.taskId)?.text;
  const note = clockShown ? (running ? `${PHASE_LABELS[timer.phase]}中` : '') : [task, timer && running ? `第 ${timer.round % state.settings.longEvery + (timer.phase === 'focus' ? 1 : 0)} / ${state.settings.longEvery} 轮` : ''].filter(Boolean).join(' · ');
  const toggleFullscreen = () => { const exit = readCabinFullscreen(); ownFullscreen.current = !exit; requestCabinFullscreen({ exit }).catch(() => {}); };
  return <div ref={stage} className={`focus-display${idle ? ' is-idle' : ''}`} data-face={id} role="dialog" aria-label="专注画面" tabIndex={-1} onClick={(event) => { if (!event.target.closest('.focus-display-bar')) close(); }}>
    <div className="focus-display-stage">
      <FocusFace face={id} look={look} focus={faceFocus(state)} show={display.show} seconds={display.seconds} variant="full" maxScale={8} caption/>
      {note && <p className="focus-display-note">{note}</p>}
    </div>
    {flash && <p className="focus-display-flash" role="status">{flash}</p>}
    <nav className="focus-display-bar" aria-label="专注画面工具">
      <button type="button" aria-label="上一个专注画面" onClick={() => cycle(-1)}><ChevronLeft size={16}/></button>
      <strong className="focus-display-name">{FACE_LABELS[id]}</strong>
      <button type="button" aria-label="下一个专注画面" onClick={() => cycle(1)}><ChevronRight size={16}/></button>
      <Segmented className="face-show" label="画面显示" value={display.show} onChange={(show) => setDisplay({ show })} items={SHOW_MODES.map(([value, label]) => ({ id: value, label }))}/>
      {focus && <button type="button" onClick={focus.toggle}>{!running ? <><Play size={16}/>开始专注</> : timer.paused ? <><Play size={16}/>继续</> : <><Pause size={16}/>暂停</>}</button>}
      <button type="button" onClick={toggleFullscreen}>{fullscreen ? <><Contract size={16}/>退出全屏</> : <><Expand size={16}/>全屏</>}</button>
      <button type="button" aria-keyshortcuts="Escape" onClick={close}><X size={16}/>返回小屋</button>
    </nav>
  </div>;
}
