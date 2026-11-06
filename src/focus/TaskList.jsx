import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Pencil, Down, Up, Minus, X } from '../icons';
import { ConfirmButton, UndoLine, useUndo } from '../ui/Confirm';
import { useFocus } from './useFocus';
import { dayKey, MAX_SUBTASKS, planTime } from './focus-model.mjs';
import useFocusSessions from './stats/useFocusSessions.js';
import { playSfx } from '../props/sfx.mjs';
import DeskCalendar, { DAY_NOTE, DAY_PAD } from './desk/DeskCalendar';
import { PencilBox } from './desk/PencilBox';
import { flyNote } from './desk/fly.mjs';
import { dayStats, dayPage, taskBucket, scheduleChange, SCHEDULE_REFUSALS, taskColor, NOTE_COLORS, NOTE_NAMES, shortDate, planLabel, formatSpan, MONTH_ZH, WEEKDAY_ZH } from './desk/calendar-model.mjs';
import './desk/desk-focus.css';

// 待办 as DEsk's calendar close-up (https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors;
// docs/screenshots/calendar.jpg): the ring-bound desk calendar on the left, the leather planner on the
// right. The planner's left leaf holds the six sticky pads (pick a colour; drag one onto a day to write
// on that day) and the pile of notes kept for 之后; the right leaf is the page of the day picked on the
// calendar: 计划 (notes with a time) and 待办 (notes with a pencil box), each with a slot to stick a new
// one. Dragging a note onto a day of the calendar plans it for that day. Every behaviour of the plain
// list is still here: estimates, subtasks, 顺延, drag to reorder, rename, delete with 撤销, 清除已完成.

// 番茄数 as pencil ticks: one stroke for each round done, a faint box for each still planned.
function Ticks({ task }) {
  const shown = Math.min(Math.max(task.pomodoros, task.estimate), 6);
  if (!shown) return null;
  return <small className="focus-task-rounds" aria-label={task.estimate ? `已专注 ${task.pomodoros} 轮，预估 ${task.estimate} 轮` : `已专注 ${task.pomodoros} 轮`}>
    {Array.from({ length: shown }, (_, round) => <i key={round} className={round < task.pomodoros ? 'is-done' : 'is-planned'}/>)}
    {Math.max(task.pomodoros, task.estimate) > 6 ? <em>{task.pomodoros}/{task.estimate || task.pomodoros}</em> : null}
  </small>;
}

// One note's details: estimate, a day and a time for it, subtasks, and moving it between 今天 and 之后.
function TaskDetails({ task, focus, today, bucket, onSchedule }) {
  const [draft, setDraft] = useState(''), [time, setTime] = useState(task.at || '');
  useEffect(() => setTime(task.at || ''), [task.at]);
  const add = (event) => { event.preventDefault(); if (draft.trim() && focus.addSubtask(task.id, draft)) setDraft(''); };
  const toToday = () => bucket === 'scheduled' ? focus.updateTask(task.id, { plannedFor: today }) : focus.moveTaskToList(task.id, 'today');
  const saveTime = () => { const at = planTime(time); if (at !== (task.at || '')) focus.updateTask(task.id, { at }); setTime(at); };
  return <div className="focus-task-details">
    <div className="focus-task-estimate" role="group" aria-label={`预估番茄数：${task.text}`}>
      <span>预估</span>
      <button type="button" aria-label="少一个番茄" disabled={task.estimate <= 0} onClick={() => focus.updateTask(task.id, { estimate: task.estimate - 1 })}><Minus size={12}/></button>
      <b aria-live="polite">{task.estimate || '—'}</b>
      <button type="button" aria-label="多一个番茄" disabled={task.estimate >= 20} onClick={() => focus.updateTask(task.id, { estimate: task.estimate + 1 })}><Plus size={12}/></button>
      <button type="button" className="focus-task-move" onClick={() => bucket === 'today' ? focus.moveTaskToList(task.id, 'later') : toToday()}>{bucket === 'today' ? '移到之后' : '移到今天'}</button>
      {task.at && !task.done && <button type="button" className="focus-task-move" onClick={() => { playSfx('pencil-tick'); focus.updateTask(task.id, { done: true }); }}>做完了</button>}
    </div>
    {!task.done && <div className="focus-task-when">
      <label className="focus-task-day">贴到哪天
        <input type="date" aria-label={`安排日期：${task.text}`} min={today} value={task.list === 'today' ? task.plannedFor || '' : ''} onChange={(event) => event.target.value && onSchedule(task, event.target.value, event.currentTarget.closest('li'))}/>
      </label>
      <label className="focus-task-day">几点
        <input type="text" inputMode="numeric" aria-label={`计划时间：${task.text}`} placeholder="10:00 或 14:30-16:00" maxLength={13} value={time} onChange={(event) => setTime(event.target.value)} onBlur={saveTime} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); saveTime(); } }}/>
      </label>
    </div>}
    {task.subtasks.length > 0 && <ul className="focus-subtasks" aria-label={`子任务：${task.text}`}>
      {task.subtasks.map((item) => <li key={item.id} className={item.done ? 'is-done' : ''}>
        <button type="button" role="checkbox" aria-checked={item.done} aria-label={`${item.done ? '标记为未完成' : '完成子任务'}：${item.text}`} className="focus-task-check" onClick={() => { if (!item.done) playSfx('pencil-tick'); focus.toggleSubtask(task.id, item.id); }}><PencilBox done={item.done}/></button>
        <span>{item.text}</span>
        <button type="button" aria-label={`删除子任务：${item.text}`} onClick={() => focus.removeSubtask(task.id, item.id)}><X size={12}/></button>
      </li>)}
    </ul>}
    {task.subtasks.length < MAX_SUBTASKS && <form className="focus-subtask-form" onSubmit={add}>
      <input aria-label={`新的子任务：${task.text}`} placeholder="拆成一小步…" maxLength={80} value={draft} onChange={(event) => setDraft(event.target.value)}/>
      <button type="submit" aria-label="添加子任务" disabled={!draft.trim()}><Plus size={14}/></button>
    </form>}
  </div>;
}

export default function TaskList() {
  const focus = useFocus(), [draft, setDraft] = useState(''), [planDraft, setPlanDraft] = useState(''), [planAt, setPlanAt] = useState(''), [laterDraft, setLaterDraft] = useState('');
  const [dragging, setDragging] = useState(''), [editing, setEditing] = useState(''), [open, setOpen] = useState(''), [pad, setPad] = useState(0), [view, setView] = useState('month');
  const [undo, offerUndo, clearUndo] = useUndo();
  const { tasks: all, timer } = focus.state, now = focus.now || Date.now(), today = dayKey(now);
  const sessions = useFocusSessions(focus.state.sessions), stats = useMemo(() => dayStats(sessions, all), [sessions, all]);
  const [month, setMonthState] = useState(() => { const date = new Date(now); return { year: date.getFullYear(), month: date.getMonth() }; });
  const [picked, setPicked] = useState(today), [flip, setFlip] = useState(''), [note, setNote] = useState(''), root = useRef(null), todoInput = useRef(null);
  const setMonth = (next, direction = '') => { setFlip(direction); setMonthState(next); };
  useEffect(() => { if (!note) return undefined; const id = setTimeout(() => setNote(''), 3600); return () => clearTimeout(id); }, [note]);
  // Picking a day in another month (week / day pages, the date field) turns the month page with it.
  useEffect(() => { const [y, m] = picked.split('-').map(Number); if (y !== month.year || m - 1 !== month.month) setMonth({ year: y, month: m - 1 }, picked > `${month.year}-${String(month.month + 1).padStart(2, '0')}` ? 'next' : 'prev'); }, [picked]);
  const remove = (task, index) => { if (focus.removeTask(task.id)) offerUndo(`已删除「${task.text}」`, () => focus.restoreTask(task, index)); };
  const page = dayPage(all, picked, today), later = all.filter((task) => taskBucket(task, today) === 'later');
  const pageTasks = [...page.plans, ...page.todos], doneAll = all.filter((task) => task.done).length, openCount = pageTasks.filter((task) => !task.done).length;
  const estimated = pageTasks.filter((task) => !task.done).reduce((sum, task) => sum + Math.max(0, task.estimate - task.pomodoros), 0);
  const finishEdit = (task, value) => { if (value.trim() && value.trim() !== task.text && !focus.renameTask(task.id, value)) return; setEditing(''); };
  const full = all.length >= 200;
  const options = (extra = {}) => ({ list: 'today', plannedFor: picked, color: pad, ...extra });
  const submit = (event) => { event.preventDefault(); if (!draft.trim() || full) return; if (focus.addTask(draft, options())) { setDraft(''); playSfx('paper-press'); } };
  const submitPlan = (event) => {
    event.preventDefault(); if (!planDraft.trim() || full) return;
    const at = planTime(planAt); if (!at) { setNote('先写上时间，比如 10:00 或 14:30-16:00。'); return; }
    if (focus.addTask(planDraft, options({ at }))) { setPlanDraft(''); setPlanAt(''); playSfx('paper-press'); }
  };
  const submitLater = (event) => { event.preventDefault(); if (!laterDraft.trim() || full) return; if (focus.addTask(laterDraft, { list: 'later', color: pad })) { setLaterDraft(''); playSfx('paper-press'); } };
  // A double-click renames: the first click of it must not leave the selection toggled.
  const before = useRef(null);
  const select = (event, task) => { if (event.detail > 1) return; before.current = { id: task.id, selected: timer.taskId }; focus.selectTask(task.id, true); };
  const rename = (task) => { const was = before.current; before.current = null; if (was?.id === task.id && focus.state.timer.taskId !== was.selected) focus.selectTask(was.selected); setEditing(task.id); };
  // Stick a note on a day: it flies there and lands with a press.
  const stick = (task, key, from) => {
    if (!task) return;
    const result = scheduleChange(task, key, today);
    if (!result.ok) { setNote(SCHEDULE_REFUSALS[result.reason] || SCHEDULE_REFUSALS.bad); return; }
    if (result.noop) { setNote(`「${task.text}」已经贴在${shortDate(key)}了。`); return; }
    if (!focus.updateTask(task.id, result.change)) return;
    const rect = from?.getBoundingClientRect ? from.getBoundingClientRect() : from;
    setNote(`贴到${shortDate(key)}了。`);
    setTimeout(() => flyNote({ from: rect, to: root.current?.querySelector(`[data-day="${key}"]`), text: task.text, color: NOTE_COLORS[taskColor(task)] }), 40);
  };
  const dropped = (id, key, from) => { setDragging(''); stick(all.find((task) => task.id === id), key, from); };
  // A pad dropped on a day: that day's page opens, ready to write on a note of that colour.
  const padDropped = (color, key) => {
    setDragging(''); setPad(color);
    if (key < today) { setNote(SCHEDULE_REFUSALS.past); return; }
    playSfx('paper-press'); setPicked(key); setTimeout(() => todoInput.current?.focus(), 60);
  };
  const date = new Date(...picked.split('-').map((v, i) => Number(v) - (i === 1 ? 1 : 0))), pickedStats = stats.get(picked);
  const dragNote = (task) => ({
    draggable: editing !== task.id,
    onDragStart: (event) => { setDragging(task.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', task.text); event.dataTransfer.setData(DAY_NOTE, task.id); playSfx('paper-unpress'); },
    onDragEnd: () => setDragging('')
  });
  const row = (task, list) => {
    const index = all.indexOf(task), bucket = taskBucket(task, today), carried = bucket === 'today' && !task.done && task.carried > 0, color = taskColor(task), plan = Boolean(task.at);
    return <li key={task.id} className={`planner-line note-${color} ${plan ? 'is-plan' : 'is-todo'} ${task.done ? 'is-done' : ''} ${timer.taskId === task.id ? 'is-current' : ''} ${dragging === task.id ? 'is-dragging' : ''} ${open === task.id ? 'is-open' : ''}`} {...dragNote(task)}
      onDragOver={(event) => { if (dragging && dragging !== task.id) event.preventDefault(); }}
      onDrop={(event) => { event.preventDefault(); if (dragging && dragging !== task.id && all.find((item) => item.id === dragging)) focus.moveTask(dragging, index); setDragging(''); }}>
      <div className="focus-task-row">
        <span className="planner-chip" aria-hidden="true"/>
        {plan ? <time className="planner-time">{planLabel(task.at)}</time>
          : <button type="button" className="focus-task-check" role="checkbox" aria-checked={task.done} aria-label={`${task.done ? '标记为未完成' : '完成'}：${task.text}`} disabled={page.past} onClick={() => { if (!task.done) playSfx('pencil-tick'); focus.updateTask(task.id, { done: !task.done }); }}><PencilBox done={task.done}/></button>}
        {editing === task.id ? <input className="focus-task-edit" aria-label={`编辑待办：${task.text}`} defaultValue={task.text} maxLength={120} autoFocus onBlur={(event) => finishEdit(task, event.target.value)} onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); finishEdit(task, event.currentTarget.value); }
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setEditing(''); }
        }}/> : <button type="button" className="focus-task-text" aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" onKeyDown={(event) => {
          if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault(); const neighbours = list.map((item) => all.indexOf(item)), at = list.indexOf(task) + (event.key === 'ArrowUp' ? -1 : 1);
          if (at >= 0 && at < neighbours.length) focus.moveTask(task.id, neighbours[at]);
        }} aria-pressed={timer.taskId === task.id} title={timer.taskId === task.id ? '取消作为当前专注任务' : '设为当前专注任务（双击改名）'} onClick={(event) => select(event, task)} onDoubleClick={() => rename(task)}>
          <span className="planner-text">{task.text}</span>
          <span className="planner-meta"><Ticks task={task}/>
            {carried && <small className="focus-task-carried" title={`没做完，已经顺延 ${task.carried} 天`}>顺延</small>}
            {plan && task.done && <small className="focus-task-planned">做完了</small>}
            {task.subtasks.length > 0 && <small className="focus-task-subcount">{task.subtasks.filter((item) => item.done).length}/{task.subtasks.length}</small>}</span>
        </button>}
        <span className="planner-tools">
          <button type="button" className="focus-task-expand" aria-expanded={open === task.id} aria-label={`${open === task.id ? '收起' : '展开'}预估与子任务：${task.text}`} onClick={() => setOpen(open === task.id ? '' : task.id)}>{open === task.id ? <Up size={14}/> : <Down size={14}/>}</button>
          <button type="button" className="focus-task-rename" aria-label={`编辑待办：${task.text}`} title="编辑（也可双击文字）" onClick={() => setEditing(task.id)}><Pencil size={15}/></button>
          <button type="button" className="focus-task-remove" aria-label={`删除待办：${task.text}`} onClick={() => remove(task, index)}><Trash2 size={15}/></button>
        </span>
      </div>
      {open === task.id && <TaskDetails task={task} focus={focus} today={today} bucket={bucket} onSchedule={stick}/>}
    </li>;
  };
  return <div className="focus-tasks desk-tasks" ref={root}>
    <DeskCalendar view={view} setView={setView} month={month} setMonth={setMonth} stats={stats} sessions={sessions} picked={picked} setPicked={setPicked} now={now} dragging={Boolean(dragging)} onDropNote={dropped} onDropPad={padDropped} flip={flip}/>
    <section className="planner" aria-label="手帐">
      <div className="planner-leaf">
        <h3 className="planner-stamp">便 利 贴</h3>
        <div className="planner-pads" role="radiogroup" aria-label="便利贴颜色（拖到台历上的一天，就在那天写一张）">
          {NOTE_COLORS.map((_, index) => <button type="button" key={index} role="radio" aria-checked={pad === index} aria-label={`${NOTE_NAMES[index]}色便利贴`} className={`planner-pad note-${index} ${pad === index ? 'is-picked' : ''}`} tabIndex={pad === index ? 0 : -1} draggable
            onClick={() => { playSfx('felt-pick'); setPad(index); }}
            onKeyDown={(event) => { const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]; if (!step) return; event.preventDefault(); const next = (index + step + 6) % 6; setPad(next); event.currentTarget.parentElement.children[next]?.focus(); }}
            onDragStart={(event) => { setPad(index); setDragging(`pad-${index}`); event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData(DAY_PAD, String(index)); playSfx('paper-unpress'); }} onDragEnd={() => setDragging('')}/>)}
        </div>
        <section className="planner-later" aria-label="之后再做">
          <h4>之后再做{later.filter((task) => !task.done).length ? <small>{later.filter((task) => !task.done).length}</small> : null}</h4>
          {later.length > 0 && <ul className="planner-later-list" aria-label="之后的待办">{later.map((task) => <li key={task.id} className={`planner-later-note note-${taskColor(task)} ${task.done ? 'is-done' : ''} ${dragging === task.id ? 'is-dragging' : ''}`} {...dragNote(task)}>
            <span className="planner-later-text" title={task.text}>{task.text}</span>
            <button type="button" className="planner-later-move" aria-label={`移到今天：${task.text}`} title="移到今天" onClick={() => { playSfx('paper-press'); focus.moveTaskToList(task.id, 'today'); }}>今天</button>
            <button type="button" className="planner-later-move" aria-label={`删除待办：${task.text}`} title="删除" onClick={() => remove(task, all.indexOf(task))}><X size={12}/></button>
          </li>)}</ul>}
          <form className="planner-later-form" onSubmit={submitLater}><input aria-label="新的之后待办" placeholder="不急的事…" maxLength={120} value={laterDraft} onChange={(event) => setLaterDraft(event.target.value)}/><button type="submit" aria-label="放进之后" disabled={!laterDraft.trim() || full}><Plus size={14}/></button></form>
        </section>
        <p className="planner-leaf-foot">挑颜色 · 拖到台历</p>
      </div>
      <span className="planner-rings" aria-hidden="true"><i/><i/><i/><i/><i/><i/></span>
      <div className="planner-page">
        <header className="planner-head">
          <b className="planner-big" aria-hidden="true">{date.getDate()}</b>
          <span className="planner-date"><em>{WEEKDAY_ZH[date.getDay()]}</em><small>{date.getFullYear()} 年 {MONTH_ZH[date.getMonth()]}</small></span>
          {page.today ? <u className="planner-stamp-red">今天</u> : page.past ? <u className="planner-stamp-red is-grey">已过</u> : null}
          <h3 className="sr-only">{shortDate(picked)}{page.today ? '（今天）' : ''}的一页</h3>
        </header>
        <p className="planner-sum">{pickedStats.minutes ? `专注 ${formatSpan(pickedStats.minutes)}${pickedStats.rounds ? ` · ${pickedStats.rounds} 轮` : ''}` : page.past ? '这天没有专注记录' : '还没有专注'}{estimated ? ` · 还要约 ${estimated} 个番茄` : ''}</p>
        <section className="planner-section" aria-label="计划">
          <h4>计划</h4>
          {page.plans.length > 0 && <ul className="focus-task-list planner-plans" aria-label={`${shortDate(picked)}的计划`}>{page.plans.map((task) => row(task, page.plans))}</ul>}
          {!page.past && <form className="planner-slot" onSubmit={submitPlan}>
            <input className="planner-slot-time" aria-label="计划时间" placeholder="10:00" inputMode="numeric" maxLength={13} value={planAt} onChange={(event) => setPlanAt(event.target.value)}/>
            <input aria-label="新的计划" placeholder="＋ 贴一张计划" maxLength={120} value={planDraft} onChange={(event) => setPlanDraft(event.target.value)}/>
            <button type="submit" aria-label="添加计划" disabled={!planDraft.trim() || full}><Plus size={16}/></button>
          </form>}
        </section>
        <section className="planner-section" aria-label="待办">
          <h4>待办</h4>
          {page.todos.length > 0 && <ul className="focus-task-list planner-todos" aria-label={page.today ? '今天的待办' : `${shortDate(picked)}的待办`}>{page.todos.map((task) => row(task, page.todos))}</ul>}
          {!page.past && <form className="planner-slot focus-task-form" onSubmit={submit}>
            <input ref={todoInput} aria-label="新的待办" placeholder={page.today ? '＋ 今天要做什么？' : `＋ ${shortDate(picked)}要做的事`} maxLength={120} value={draft} onChange={(event) => setDraft(event.target.value)}/>
            <button type="submit" aria-label="添加待办" disabled={!draft.trim() || full}><Plus size={16}/></button>
          </form>}
          {page.past && !pageTasks.length && <p className="focus-empty">这天没有做完的便签。</p>}
        </section>
        {full && <p role="status" className="focus-empty">已达 200 项上限，请先清理已完成的待办。</p>}
        {note && <p className="planner-status" role="status">{note}</p>}
        <UndoLine offer={undo} clear={clearUndo}/>
        <footer className="planner-foot">
          <span>{page.today && !pageTasks.length ? '写下今天的小目标，点一行设为这一段；没做完的明天自动顺延。' : '点一行：设为这一段 · 双击：改名 · 拖到台历：换一天 · Alt+↑↓：排序'}</span>
          {(openCount > 0 || doneAll > 0) && <span className="planner-foot-row">{openCount > 0 && <span>{openCount} 项待完成</span>}{doneAll > 0 && <ConfirmButton className="planner-clear" question={`清除 ${doneAll} 项已完成的待办（今天和之后）？`} confirmLabel="确认清除" onConfirm={focus.clearDone}>清除已完成</ConfirmButton>}</span>}
        </footer>
      </div>
    </section>
  </div>;
}
