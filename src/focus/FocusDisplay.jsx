import Dialog from '../Dialog';
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
import RecordNowPlaying, { useNowPlaying, playerCommand } from './RecordNowPlaying';

// 专注画面: one face, chosen by the user (or the scene's own until they pick),
// shown in the focus dock, the zen clock, the desktop clock widget and — with
// 沉浸 (Z / F), or on its own when a pomodoro starts — filling the window while the room dims to a lamp-lit vignette.
export const OPEN_EVENT = 'cabin-focus-display';
export const openFocusDisplay = (open = true) => window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { open } }));
const typing = (target) => target?.closest?.('input,textarea,select,[contenteditable="true"]');

// Settings › 专注工具: a grid of still faces in the current scene's palette.
export function FacePicker() {
  const look = useSceneLook(), [display, setDisplay] = useFocusDisplay(), current = faceFor(display, look);
  return <section className="face-picker" aria-label="专注画面">
    <header><strong>专注画面</strong><small>{display.mode ? '计时和时钟都用这个画面。按 Z 进入沉浸，或在下方开启自动进入。' : `正在跟随「${getRoomScene(look).label}」的默认画面，选一个就固定下来。`}</small>
      {display.mode && <button type="button" className="face-picker-reset" onClick={() => setDisplay({ mode: '' })}>跟随场景</button>}</header>
    <Segmented className="face-grid" label="专注画面" value={current} onChange={(mode) => setDisplay({ mode })}
      items={FACE_IDS.map((id) => ({ id, title: FACE_HINTS[id], label: <><FocusFace face={id} look={look} still variant="thumb"/><span>{FACE_LABELS[id]}</span></> }))}/>
    <div className="face-picker-options">
      <span className="face-picker-label">显示</span>
      <Segmented className="face-show" label="画面显示" value={display.show} onChange={(show) => setDisplay({ show })} items={SHOW_MODES.map(([id, label]) => ({ id, label, title: id === 'auto' ? '专注或休息时显示倒计时，其余时间显示时钟' : undefined }))}/>
      <label className="focus-check"><input type="checkbox" checked={display.seconds} onChange={(event) => setDisplay({ seconds: event.target.checked })}/>时钟显示秒</label>
      <label className="focus-check"><input type="checkbox" checked={display.autoEnter} onChange={(event) => setDisplay({ autoEnter: event.target.checked })}/>开始专注时自动进入沉浸</label>
    </div>
  </section>;
}

// The dock header's quick switch: ‹ face › and 沉浸.
export function FaceSwitch() {
  const look = useSceneLook(), [display, setDisplay] = useFocusDisplay(), id = faceFor(display, look);
  return <div className="face-switch" role="group" aria-label="专注画面">
    <span className="face-switch-title">画面</span>
    <button type="button" aria-label="上一个专注画面" title="上一个画面" onClick={() => setDisplay({ mode: cycleFace(id, -1) })}><ChevronLeft size={16}/></button>
    <strong aria-live="polite" title={FACE_HINTS[id]}>{FACE_LABELS[id]}</strong>
    <button type="button" aria-label="下一个专注画面" title="下一个画面" onClick={() => setDisplay({ mode: cycleFace(id, 1) })}><ChevronRight size={16}/></button>
    <button type="button" className="face-switch-full" aria-keyshortcuts="F" title="沉浸：窗口变成专注画面 · Z / F" onClick={() => openFocusDisplay()}><Expand size={16}/><span>沉浸</span></button>
  </div>;
}

// The whole-window display (沉浸). Esc or a click on the dimmed room returns; ←/→ skip
// tracks; the bar's tabs change the face; Space still plays / pauses the deck behind it.
// Who opens and closes it, and what it excludes: docs/entry-map.md.
export default function FocusDisplayStage() {
  const [open, setOpen] = useState(false), [flash, setFlash] = useState(''), [idle, setIdle] = useState(false), [offer, setOffer] = useState('');
  const now = useNowPlaying();
  const focus = useFocusState(), look = useSceneLook(), [display, setDisplay] = useFocusDisplay(), id = faceFor(display, look);
  const fullscreen = useDesktopFullscreen(), ownFullscreen = useRef(false), stage = useRef(null), live = useRef(id); live.current = id;
  const close = () => { setOpen(false); setOffer(''); };
  const autoEnter = useRef(display.autoEnter); autoEnter.current = display.autoEnter;
  // Starting a pomodoro (button, shortcut, tray or the next round) enters 沉浸.
  useEffect(() => { const on = () => { if (autoEnter.current && !roomCovered() && !document.documentElement.classList.contains('room-desktop')) { setOffer(''); setOpen(true); } }; window.addEventListener('album-focus-start', on); return () => window.removeEventListener('album-focus-start', on); }, []);
  // Pausing or finishing a focus round offers the way back instead of throwing the user out.
  const phase = focus?.state?.timer?.phase, paused = Boolean(focus?.state?.timer?.paused), seen = useRef({ phase, paused });
  useEffect(() => {
    const before = seen.current; seen.current = { phase, paused };
    if (!open) return;
    if (paused && !before.paused && phase !== 'idle') setOffer('pause');
    else if (before.phase === 'focus' && phase !== 'focus') setOffer('done');
    else if (!paused && phase === 'focus') setOffer('');
  }, [open, phase, paused]);
  useEffect(() => { const on = (event) => setOpen(event.detail?.open !== false); window.addEventListener(OPEN_EVENT, on); return () => window.removeEventListener(OPEN_EVENT, on); }, []);
  // Anything that opens 小屋日记 (cabin:open-journal, from any entry) closes 沉浸 first.
  useEffect(() => { const on = () => { setOpen(false); setOffer(''); }; window.addEventListener('cabin:open-journal', on, true); return () => window.removeEventListener('cabin:open-journal', on, true); }, []);
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
    root.classList.add('room-focus-display'); stage.current?.focus({ preventScroll: true });
    // Capture phase: these keys belong to the display, not the deck (←/→ would seek).
    const key = (event) => {
      if (document.querySelector('dialog[open]:not(.focus-display-shell)') || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); setOpen(false); }
      // ←/→ skip tracks here (one meaning); the face itself changes with the tabs in the bar.
      else if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !typing(event.target) && !event.target?.closest?.('[role=radiogroup],[role=tablist]')) { event.preventDefault(); event.stopImmediatePropagation(); if (!event.repeat) playerCommand(event.key === 'ArrowRight' ? 'next' : 'previous'); }
      // 小屋日记 (L) sits above the room, not above 沉浸: leave 沉浸 first, then open it.
      else if ((event.key === 'l' || event.key === 'L') && !typing(event.target)) { event.preventDefault(); event.stopImmediatePropagation(); setOpen(false); setTimeout(() => window.dispatchEvent(new CustomEvent('cabin:open-journal', { detail: {} })), 0); }
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
    };
  }, [open]);
  if (!open) return null;
  const state = focus?.state, timer = state?.timer, running = timer && timer.phase !== 'idle';
  const clockShown = display.show === 'clock' || (display.show === 'auto' && !running);
  const task = state?.tasks.find((item) => item.id === timer.taskId)?.text;
  const note = clockShown ? (running ? `${PHASE_LABELS[timer.phase]}中` : '') : [task, timer && running ? `第 ${timer.round % state.settings.longEvery + (timer.phase === 'focus' ? 1 : 0)} / ${state.settings.longEvery} 轮` : ''].filter(Boolean).join(' · ');
  const toggleFullscreen = () => { const exit = readCabinFullscreen(); ownFullscreen.current = !exit; requestCabinFullscreen({ exit }).catch(() => {}); };
  return <Dialog variant="full" title="专注画面" close={close} initialFocus={stage} returnFocus=".focus-badge" className="focus-display-shell" deckKeys><div ref={stage} className={`focus-display${idle ? ' is-idle' : ''}`} data-face={id} tabIndex={-1} onClick={(event) => { if (!event.target.closest('.focus-display-bar, .focus-display-offer')) close(); }}>
    <div className="focus-display-stage">
      <FocusFace face={id} look={look} focus={faceFocus(state)} show={display.show} seconds={display.seconds} variant="full" maxScale={8} caption={id !== 'record'} music={id === 'record' ? { playing: now.playing } : null}>{id === 'record' ? <RecordNowPlaying now={now}/> : null}</FocusFace>
      {note && <p className="focus-display-note">{note}</p>}
    </div>
    {flash && <p className="focus-display-flash" role="status">{flash}</p>}
    {offer && <div className="focus-display-offer" role="group" aria-label={offer === 'pause' ? '专注已暂停' : '这一轮专注结束了'} onClick={(event) => event.stopPropagation()}>
      <strong>{offer === 'pause' ? '专注已暂停' : '这一轮专注结束了'}</strong>
      <button type="button" onClick={close}><X size={16}/>返回小屋</button>
      <button type="button" onClick={() => setOffer('')}>留在这里</button>
    </div>}
    <nav className="focus-display-bar" aria-label="专注画面工具">
      <Segmented className="face-tabs" label="画面样式" value={id} onChange={(mode) => { setDisplay({ mode }); setFlash(FACE_LABELS[mode]); }} items={FACE_IDS.map((value) => ({ id: value, label: FACE_LABELS[value], title: FACE_HINTS[value] }))}/>
      <Segmented className="face-show" label="画面显示" value={display.show} onChange={(show) => setDisplay({ show })} items={SHOW_MODES.map(([value, label]) => ({ id: value, label }))}/>
      {focus && <button type="button" onClick={focus.toggle}>{!running ? <><Play size={16}/>开始专注</> : timer.paused ? <><Play size={16}/>继续专注</> : <><Pause size={16}/>暂停专注</>}</button>}
      <button type="button" onClick={toggleFullscreen}>{fullscreen ? <><Contract size={16}/>退出全屏</> : <><Expand size={16}/>全屏</>}</button>
      <button type="button" aria-keyshortcuts="Escape" onClick={close}><X size={16}/>返回小屋</button>
    </nav>
  </div></Dialog>;
}
