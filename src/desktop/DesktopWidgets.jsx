import React, { useEffect, useRef, useState } from 'react';
import { useFocus } from '../focus/useFocus';
import { useStudy } from '../study/useStudy';
import { nextCountdown } from '../study/study-model.mjs';
import { formatClock, PHASE_LABELS, phaseProgress } from '../focus/focus-model.mjs';
import { trackNames } from '../room-model.mjs';
import { trackArtist } from '../room-playback.mjs';
import { ChevronLeft, ChevronRight, Pause, Play, Forward, Plus, Eye, Clock, ListBullet, Music2 } from '../icons';
import { clampWidget, defaultWidgetLayout, readWidgetLayout, writeWidgetLayout } from './widget-layout.mjs';
import './desktop-widgets.css';

// Desktop widgets: what a desktop needs at a glance, drawn as small cabin
// cards over the room. Shown in 桌面模式 (all cards) and in immersive mode
// (the clock only). Each card can be dragged; positions are remembered per
// screen proportion, so they survive resolution changes.
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const greeting = (hour) => hour < 5 ? '夜深了' : hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : hour < 22 ? '晚上好' : '夜深了';

function useMinute() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { let timer; const tick = () => { setNow(new Date()); timer = setTimeout(tick, 60000 - (Date.now() % 60000) + 20); }; timer = setTimeout(tick, 60000 - (Date.now() % 60000) + 20); return () => clearTimeout(timer); }, []);
  return now;
}

function Widget({ id, title, icon, layout, move, children, className = '' }) {
  const ref = useRef(null), drag = useRef(null);
  const position = layout[id];
  const down = (event) => {
    if (event.button !== 0) return;
    const parent = ref.current.offsetParent.getBoundingClientRect(), box = ref.current.getBoundingClientRect();
    drag.current = { dx: event.clientX - box.left, dy: event.clientY - box.top, parent, width: box.width, height: box.height };
    event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault();
  };
  const moveTo = (event) => {
    const value = drag.current; if (!value) return;
    move(id, clampWidget({ x: (event.clientX - value.dx - value.parent.left) / value.parent.width, y: (event.clientY - value.dy - value.parent.top) / value.parent.height }, value.width / value.parent.width, value.height / value.parent.height), false);
  };
  const up = () => { if (drag.current) { drag.current = null; move(id, layout[id], true); } };
  const nudge = (event) => {
    const step = event.shiftKey ? .05 : .01, delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    if (!delta) return; event.preventDefault();
    move(id, clampWidget({ x: position.x + delta[0], y: position.y + delta[1] }, .2, .15), true);
  };
  return <section ref={ref} className={`desktop-widget is-${id} ${className}`} aria-label={title} style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%` }}>
    <button type="button" className="desktop-widget-handle" aria-label={`移动小组件：${title}（方向键微调）`} title="拖动移动" onPointerDown={down} onPointerMove={moveTo} onPointerUp={up} onKeyDown={nudge}>{icon}<span>{title}</span><i aria-hidden="true">⠿</i></button>
    {children}
  </section>;
}

export function ClockWidget({ layout, move, compact = false }) {
  const now = useMinute(), hours = String(now.getHours()).padStart(2, '0'), minutes = String(now.getMinutes()).padStart(2, '0');
  const study = useStudy(), exam = study ? nextCountdown(study.state, now.getTime()) : null;
  return <Widget id="clock" title="时钟" icon={<Clock size={13}/>} layout={layout} move={move} className={compact ? 'is-compact' : ''}>
    <p className="desktop-clock" aria-live="off"><time dateTime={now.toISOString()}>{hours}<b>:</b>{minutes}</time></p>
    <p className="desktop-date">{now.getMonth() + 1} 月 {now.getDate()} 日 · 周{WEEK[now.getDay()]}<span> · {greeting(now.getHours())}</span></p>
    {exam && <p className="desktop-countdown">距离{exam.title}{exam.days === 0 ? '就是今天' : <>还有 <b>{exam.days}</b> 天</>}</p>}
  </Widget>;
}

function NowPlayingWidget({ layout, move, item, provider, playback, player, spinning, toggleVisual, trackIndex }) {
  const audible = provider !== 'visual' && provider !== 'system' && playback;
  const playing = audible ? playback.playing : spinning;
  const name = audible && playback.actualTrack || trackNames(item)[trackIndex] || '';
  const progress = audible && playback.duration ? Math.min(100, playback.position / playback.duration * 100) : 0;
  return <Widget id="music" title="正在播放" icon={<Music2 size={13}/>} layout={layout} move={move}>
    {item ? <div className="desktop-music">
      <button type="button" className="desktop-music-cover" aria-label="打开唱机特写" title="唱机特写" onClick={() => window.dispatchEvent(new Event('cabin-open-corner'))}>{item.cover ? <img src={item.cover} alt="" referrerPolicy="no-referrer"/> : <span/>}<i className={playing ? 'is-spinning' : ''} aria-hidden="true"/></button>
      <div className="desktop-music-copy"><strong title={name}>{name || item.title}</strong><small title={item.title}>{item.type === 'playlist' ? trackArtist(item, trackIndex) : item.artist} · {item.title}</small>
        <span className="desktop-music-bar" aria-hidden="true"><i style={{ width: `${progress}%` }}/></span>
        <span className="desktop-music-controls">
          <button type="button" aria-label="上一首" disabled={!player?.canPrevious} onClick={() => player?.previous()}><ChevronLeft size={15}/></button>
          <button type="button" className="is-primary" aria-label={playing ? '暂停' : '播放'} onClick={() => audible ? playback.toggle() : toggleVisual?.()}>{playing ? <Pause size={15}/> : <Play size={15}/>}</button>
          <button type="button" aria-label="下一首" disabled={!player?.canNext} onClick={() => player?.next()}><ChevronRight size={15}/></button>
        </span>
      </div>
    </div> : <p className="desktop-widget-empty">双击唱片架上的封面放一张唱片，或打开「我的歌单」。</p>}
  </Widget>;
}

function FocusWidget({ layout, move }) {
  const focus = useFocus();
  if (!focus) return null;
  const { state, now, remaining } = focus, timer = state.timer, running = timer.phase !== 'idle' && !timer.paused;
  const task = state.tasks.find((entry) => entry.id === timer.taskId);
  const progress = timer.phase === 'idle' ? 0 : phaseProgress(timer, state.settings, now);
  return <Widget id="focus" title="专注" icon={<Clock size={13}/>} layout={layout} move={move}>
    <div className="desktop-focus" data-phase={timer.phase}>
      <span className="desktop-focus-ring" style={{ '--focus-progress': `${Math.round(progress * 100)}%` }} aria-hidden="true"/>
      <div><small>{PHASE_LABELS[timer.phase]}{timer.paused ? ' · 已暂停' : ''}</small>
        <strong>{timer.phase === 'idle' ? `${state.settings.focusMin}:00` : formatClock(remaining, state.settings.hideSeconds)}</strong>
        {task && <small className="desktop-focus-task" title={task.text}>{task.text}</small>}</div>
      <span className="desktop-focus-actions">
        <button type="button" className="is-primary" aria-label={running ? '暂停专注' : timer.phase === 'idle' ? '开始专注' : '继续专注'} onClick={focus.toggle}>{running ? <Pause size={15}/> : <Play size={15}/>}</button>
        {timer.phase !== 'idle' && <button type="button" aria-label="跳过本阶段" onClick={focus.skip}><Forward size={15}/></button>}
      </span>
    </div>
    {focus.error && <p className="record-error" role="alert">{focus.error}</p>}
  </Widget>;
}

function TodoWidget({ layout, move }) {
  const focus = useFocus(), [text, setText] = useState('');
  if (!focus) return null;
  const open = focus.state.tasks.filter((task) => !task.done).slice(0, 6), doneToday = focus.state.tasks.filter((task) => task.done && task.doneAt && new Date(task.doneAt).toDateString() === new Date().toDateString()).length;
  return <Widget id="todo" title="待办" icon={<ListBullet size={13}/>} layout={layout} move={move}>
    <form className="desktop-todo-add" onSubmit={(event) => { event.preventDefault(); if (text.trim()) { if (focus.addTask(text.trim())) setText(''); } }}><input aria-label="桌面待办" placeholder="接下来要做…" value={text} maxLength={120} onChange={(event) => setText(event.target.value)}/><button type="submit" aria-label="添加桌面待办"><Plus size={14}/></button></form>
    {focus.error && <p className="record-error" role="alert">{focus.error}</p>}
    {open.length ? <ul className="desktop-todo">{open.map((task) => <li key={task.id}><label><input type="checkbox" checked={false} onChange={() => focus.updateTask(task.id, { done: true })}/><span title={task.text}>{task.text}</span></label></li>)}</ul> : <p className="desktop-widget-empty">{doneToday ? `做完 ${doneToday} 件事了，歇一会儿。` : '写下一件想完成的小事。'}</p>}
  </Widget>;
}

export default function DesktopWidgets({ mode = 'desktop', exit, ...music }) {
  const [layout, setLayout] = useState(readWidgetLayout);
  const move = (id, position, save) => setLayout((old) => { const next = { ...old, [id]: position }; if (save) writeWidgetLayout(next); return next; });
  const reset = () => { const next = defaultWidgetLayout(); setLayout(next); writeWidgetLayout(next); };
  if (mode === 'zen') return <div className="desktop-widgets is-zen"><ClockWidget layout={layout} move={move} compact/></div>;
  return <div className="desktop-widgets">
    <ClockWidget layout={layout} move={move}/>
    <NowPlayingWidget layout={layout} move={move} {...music}/>
    <FocusWidget layout={layout} move={move}/>
    <TodoWidget layout={layout} move={move}/>
    <nav className="desktop-mode-pill" aria-label="桌面模式">
      <span><Eye size={14}/>桌面模式</span>
      <button type="button" onClick={() => window.dispatchEvent(new Event('cabin-open-corner'))}>唱机特写</button>
      <button type="button" onClick={reset}>整理小组件</button>
      <button type="button" className="is-primary" onClick={exit}>回到窗口</button>
    </nav>
  </div>;
}

// A persistent, small recovery control: fullscreen never removes interaction.
export function ImmersiveChrome({ zen, fullscreen, desktopClient, toggleZen, openStudy }) {
  const [tools, setTools] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle('room-zen-tools', zen && tools);
    window.dispatchEvent(new Event('resize'));
    return () => document.documentElement.classList.remove('room-zen-tools');
  }, [zen, tools]);
  if (!zen && !fullscreen) return null;
  return <div className="immersive-exit is-visible" role="toolbar" aria-label="全屏与沉浸工具">
    <button type="button" aria-pressed={zen} onClick={toggleZen}>{zen ? '正常模式' : '沉浸模式'}</button>
    {zen && <button type="button" aria-expanded={tools} onClick={() => setTools((value) => !value)}>{tools ? '收起工具' : '显示工具'}</button>}
    {zen && tools && <button type="button" onClick={openStudy}>学习</button>}
    {fullscreen && desktopClient && <button type="button" onClick={() => window.open('album-desktop://action/fullscreen-exit', '_blank')}>退出全屏</button>}
  </div>;
}
