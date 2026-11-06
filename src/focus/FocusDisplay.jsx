import Dialog from '../Dialog';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import FocusFace, { faceFocus } from './FocusFace';
import { useFocusDisplay, useSceneLook } from './useFocusDisplay';
import { FACE_IDS, FACE_LABELS, FACE_HINTS, SHOW_MODES, faceFor } from './focus-display.mjs';
import { PHASE_LABELS, currentRound, dayKey } from './focus-model.mjs';
import { useFocusState } from './useFocus';
import { Segmented } from '../ui/Roving';
import { Expand, Contract, Play, Pause, X, Check } from '../icons';
const OFFER_TITLES = { pause: '专注已暂停', done: '这一轮专注结束了', due: '时间到了，还在继续计时' };
import { readCabinFullscreen, requestCabinFullscreen } from '../desktop/fullscreen-client.mjs';
import { useDesktopFullscreen } from '../desktop-client';
import { roomCovered } from '../room/useRoomChrome';
import RecordNowPlaying, { useNowPlaying, playerCommand } from './RecordNowPlaying';
import { PressCard, usePress } from './PressCard';
import { ledFace, deskFace } from './desk/clock-model.mjs';
import { createKeyFeel } from './desk/key-feel.mjs';
import { paintClock } from '../desk/ClockFace';
import { deskUrl, whenDeskImages } from '../desk/images.mjs';
import './desk/desk-display.css';

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
    <header><strong>专注画面</strong><small>{display.mode ? '桌面挂件和壁纸上的计时、时钟用这个画面。' : '现在用的是默认画面，选一个就固定下来。'}沉浸（Z）放大书桌上的红色台钟；选「唱片计时」则是一张转动的唱片。</small>
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

// 沉浸's clock: the desk's red LED clock (DEsk's clock picture: the housing, the glass and its digits
// photographed a cell at a time — src/desk/ClockFace.jsx), held up close and filling the window.
const LED_PARTS = ['edge-clock.webp', 'clock-face.webp', 'clock-digits.webp', 'clock-keys.webp'];
export function DeskLed({ state, show = 'auto', seconds = false }) {
  const canvas = useRef(null), [now, setNow] = useState(Date.now), [ready, setReady] = useState(false), [width, setWidth] = useState(0);
  useEffect(() => { let alive = true; whenDeskImages(LED_PARTS).then(() => alive && setReady(true)); return () => { alive = false; }; }, []);
  useEffect(() => { const id = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 500); return () => clearInterval(id); }, []);
  useLayoutEffect(() => {
    const el = canvas.current; if (!el) return undefined;
    const measure = () => setWidth(el.clientWidth);
    measure(); const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure); observer?.observe(el);
    return () => observer?.disconnect();
  }, []);
  const led = ledFace({ now, focus: faceFocus(state), show, seconds }), today = dayKey(now);
  const rounds = (state?.sessions || []).filter((session) => session.completed && dayKey(session.end) === today).length;
  const face = deskFace(led, { now, rounds }), key = `${face.digits}|${face.colon}|${face.word}|${face.bar === null ? '-' : Math.round(face.bar * 12)}|${width}|${ready}`;
  // A whole number of pixels to a picture pixel, or the digit cells show seams; the browser scales the rest.
  useEffect(() => { if (ready && width) paintClock(canvas.current, face, Math.ceil(width * (window.devicePixelRatio || 1) / 456) / (window.devicePixelRatio || 1), 6); }, [key]);
  return <div className="display-led" role="img" aria-label={led.label}>
    <img className="display-led-body" src={deskUrl('edge-clock.webp')} alt="" draggable="false"/>
    <canvas ref={canvas} className="display-led-glass" aria-hidden="true"/>
    <img className="display-led-keys" src={deskUrl('clock-keys.webp')} alt="" draggable="false"/>
    <span className="display-led-print" aria-hidden="true">专注</span>
  </div>;
}
// What 沉浸 can show: the red clock, or the record that turns while a round runs.
const STAGES = Object.freeze([{ id: 'desk', label: '红色台钟', title: '书桌上的红色 LED 台钟，放大到整个窗口' }, { id: 'record', label: FACE_LABELS.record, title: FACE_HINTS.record }]);

// The whole-window display (沉浸). Esc or a click on the dimmed room returns; ←/→ skip
// tracks; the bar's tabs change the face; Space still plays / pauses the deck behind it.
// Who opens and closes it, and what it excludes: docs/entry-map.md.
export default function FocusDisplayStage() {
  const [open, setOpen] = useState(false), [flash, setFlash] = useState(''), [idle, setIdle] = useState(false), [offer, setOffer] = useState(''), [keyFeel] = useState(createKeyFeel);
  const now = useNowPlaying(), press = usePress(open ? 'display' : '');
  const focus = useFocusState(), look = useSceneLook(), [display, setDisplay] = useFocusDisplay(), id = display.mode === 'record' ? 'record' : 'desk';
  const fullscreen = useDesktopFullscreen(), ownFullscreen = useRef(false), stage = useRef(null), live = useRef(id); live.current = id;
  const close = () => { setOpen(false); setOffer(''); };
  const autoEnter = useRef(display.autoEnter); autoEnter.current = display.autoEnter;
  // Starting a pomodoro (button, shortcut, tray or the next round) enters 沉浸.
  useEffect(() => { const on = () => { if (autoEnter.current && !roomCovered() && !document.documentElement.classList.contains('room-desktop')) { setOffer(''); setOpen(true); } }; window.addEventListener('album-focus-start', on); return () => window.removeEventListener('album-focus-start', on); }, []);
  // Pausing or finishing a focus round offers the way back instead of throwing the user out.
  const phase = focus?.state?.timer?.phase, paused = Boolean(focus?.state?.timer?.paused), due = Boolean(focus?.state?.timer?.due), seen = useRef({ phase, paused, due });
  useEffect(() => {
    const before = seen.current; seen.current = { phase, paused, due };
    if (!open) return;
    if (paused && !before.paused && phase !== 'idle') setOffer('pause');
    else if (before.phase === 'focus' && phase !== 'focus') setOffer('done');
    else if (due && !before.due) setOffer('due');
    else if (!paused && phase === 'focus' && !due) setOffer('');
  }, [open, phase, paused, due]);
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
      else if (/^[fF]$/.test(event.key) && !typing(event.target)) { event.preventDefault(); event.stopImmediatePropagation(); if (!event.repeat) setOpen(false); }
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
  const currentTask = state?.tasks.find((item) => item.id === timer.taskId), task = currentTask?.text;
  const note = clockShown ? (running ? `${PHASE_LABELS[timer.phase]}中` : '') : [task, timer && running ? `第 ${currentRound(timer, Date.now()) % state.settings.longEvery + (timer.phase === 'focus' ? 1 : 0)} / ${state.settings.longEvery} 轮` : ''].filter(Boolean).join(' · ');
  const toggleFullscreen = () => { const exit = readCabinFullscreen(); ownFullscreen.current = !exit; requestCabinFullscreen({ exit }).catch(() => {}); };
  return <Dialog variant="full" title="专注画面" close={close} initialFocus={stage} returnFocus=".focus-badge" className="focus-display-shell" deckKeys><div ref={stage} className={`focus-display${idle ? ' is-idle' : ''}`} data-face={id} tabIndex={-1} onClick={(event) => { if (!event.target.closest('.focus-display-bar, .focus-display-offer, .focus-display-press')) close(); }}>
    <div className="focus-display-stage">
      {id === 'record' ? <FocusFace face="record" look={look} focus={faceFocus(state)} show={display.show} seconds={display.seconds} variant="full" maxScale={8} music={{ playing: now.playing }}><RecordNowPlaying now={now}/></FocusFace> : <DeskLed state={state} show={display.show} seconds={display.seconds}/>}
      {note && <p className="focus-display-note">{note}</p>}
    </div>
    {flash && <p className="focus-display-flash" role="status">{flash}</p>}
    {/* A finished round is pressed here: the 压制唱片 card takes the place of 「这一轮专注结束了」. */}
    {press.mine && <div className="focus-display-press"><PressCard record={press.record} inline onDone={() => setOffer('')}/></div>}
    {offer && !(press.mine && offer === 'done') && <div className="focus-display-offer paper" role="group" aria-label={OFFER_TITLES[offer]} onClick={(event) => event.stopPropagation()}>
      <strong>{OFFER_TITLES[offer]}</strong>
      {/* The next step right here: 开始休息 / 再来一轮 / 完成任务 (or, in overtime, 结束 / +5). */}
      {offer === 'done' && focus && <>
        {timer.phase === 'idle' && <button type="button" onClick={() => { focus.startBreak(); setOffer(''); }}>开始休息</button>}
        <button type="button" onClick={() => { focus.nextRound(); setOffer(''); }}>{timer.phase === 'idle' ? '再来一轮' : '跳过休息，再来一轮'}</button>
        {currentTask && !currentTask.done && <button type="button" onClick={() => focus.completeCurrent()}><Check size={16}/>完成「{currentTask.text.slice(0, 12)}」</button>}
      </>}
      {offer === 'due' && focus && <>
        <button type="button" onClick={() => { focus.skip(); }}>结束这一轮，去休息</button>
        <button type="button" onClick={() => { focus.extend(); setOffer(''); }}>再专注 5 分钟</button>
      </>}
      <button type="button" onClick={close}><X size={16}/>返回小屋</button>
      <button type="button" onClick={() => setOffer('')}>{offer === 'due' ? '继续计时' : '留在这里'}</button>
    </div>}
    <nav className="focus-display-bar" aria-label="专注画面工具" {...keyFeel}>
      <Segmented className="face-tabs" label="画面样式" value={id} onChange={(stage) => { if (stage === 'record') setDisplay({ mode: 'record' }); else if (display.mode === 'record') setDisplay({ mode: '' }); setFlash(STAGES.find((item) => item.id === stage).label); }} items={STAGES}/>
      <Segmented className="face-show" label="画面显示" value={display.show} onChange={(show) => setDisplay({ show })} items={SHOW_MODES.map(([value, label]) => ({ id: value, label }))}/>
      {focus && <button type="button" onClick={focus.toggle}>{!running ? <><Play size={16}/>开始专注</> : timer.paused ? <><Play size={16}/>{timer.phase === 'focus' ? '继续专注' : '继续休息'}</> : <><Pause size={16}/>{timer.phase === 'focus' ? '暂停专注' : '暂停休息'}</>}</button>}
      {focus && running && <button type="button" title="这一轮再加 5 分钟" onClick={() => focus.extend()}>+5 分钟</button>}
      {focus && timer.phase === 'focus' && <button type="button" title="走神了？记下来，统计里能看到" onClick={() => focus.distraction()}>分心了</button>}
      <button type="button" onClick={toggleFullscreen}>{fullscreen ? <><Contract size={16}/>退出全屏</> : <><Expand size={16}/>全屏</>}</button>
      <button type="button" aria-keyshortcuts="Escape" onClick={close}><X size={16}/>返回小屋</button>
    </nav>
  </div></Dialog>;
}
