import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Pencil, Down, Up, Minus, X } from '../icons';
import { ConfirmButton, UndoLine, useUndo } from '../ui/Confirm';
import { Segmented } from '../ui/Roving';
import { useFocus } from './useFocus';
import { dayKey, taskProgress, MAX_SUBTASKS } from './focus-model.mjs';
import useFocusSessions from './stats/useFocusSessions.js';
import { playSfx } from '../props/sfx.mjs';
import DeskCalendar, { DAY_NOTE } from './desk/DeskCalendar';
import { flyNote } from './desk/fly.mjs';
import { dayStats, listOf, taskBucket, scheduleChange, SCHEDULE_REFUSALS, noteColor, NOTE_COLORS, shortDate, WEEKDAY_ZH } from './desk/calendar-model.mjs';
import './desk/desk-focus.css';

// 待办 as things on a desk: a ring-bound desk calendar beside a planner pad whose tasks are sticky
// notes in the six colours of the pad. Ticking one off is a pencil tick; dragging a note onto a day
// of the calendar plans it for that day (the task's own plannedFor, which 顺延 leaves alone while
// it is still ahead). Every behaviour of the plain list is still here: 今天 / 之后, estimates,
// subtasks, 顺延, drag to reorder, rename, delete with 撤销, 清除已完成.
const LISTS = [['today', '今天'], ['later', '之后']];
const TILT = [-1.1, 0.8, -0.5, 1.2, -0.9, 0.5];

// 番茄数 as pencil ticks: one stroke for each round done, a faint box for each still planned.
function Ticks({ task }) {
  const shown = Math.min(Math.max(task.pomodoros, task.estimate), 6);
  if (!shown) return null;
  return <small className="focus-task-rounds" aria-label={task.estimate ? `已专注 ${task.pomodoros} 轮，预估 ${task.estimate} 轮` : `已专注 ${task.pomodoros} 轮`}>
    {Array.from({ length: shown }, (_, round) => <i key={round} className={round < task.pomodoros ? 'is-done' : 'is-planned'}/>)}
    {Math.max(task.pomodoros, task.estimate) > 6 ? <em>{task.pomodoros}/{task.estimate || task.pomodoros}</em> : null}
  </small>;
}

// The pencil square at the head of a note: an irregular box, and a tick drawn into it.
function PencilBox({ done }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="desk-check-art">
    <path className="desk-check-box" d="M3.4 4.1 L20.4 3.3 L20.9 20.2 L3.2 20.8 Z"/>
    {done && <path className="desk-tick" pathLength="1" d="M5 13.4 L9.6 18.4 L20.2 4.6"/>}
  </svg>;
}

// One task's details: estimate, a day for it, subtasks, and moving it between 今天 and 之后.
function TaskDetails({ task, focus, today, bucket, onSchedule }) {
  const [draft, setDraft] = useState('');
  const add = (event) => { event.preventDefault(); if (draft.trim() && focus.addSubtask(task.id, draft)) setDraft(''); };
  const toToday = () => bucket === 'scheduled' ? focus.updateTask(task.id, { plannedFor: today }) : focus.moveTaskToList(task.id, 'today');
  return <div className="focus-task-details">
    <div className="focus-task-estimate" role="group" aria-label={`预估番茄数：${task.text}`}>
      <span>预估</span>
      <button type="button" aria-label="少一个番茄" disabled={task.estimate <= 0} onClick={() => focus.updateTask(task.id, { estimate: task.estimate - 1 })}><Minus size={12}/></button>
      <b aria-live="polite">{task.estimate || '—'}</b>
      <button type="button" aria-label="多一个番茄" disabled={task.estimate >= 20} onClick={() => focus.updateTask(task.id, { estimate: task.estimate + 1 })}><Plus size={12}/></button>
      <button type="button" className="focus-task-move" onClick={() => bucket === 'today' ? focus.moveTaskToList(task.id, 'later') : toToday()}>{bucket === 'today' ? '移到之后' : '移到今天'}</button>
    </div>
    {!task.done && <label className="focus-task-day">贴到哪天
      <input type="date" aria-label={`安排日期：${task.text}`} min={today} value={task.list === 'today' ? task.plannedFor || '' : ''} onChange={(event) => event.target.value && onSchedule(task, event.target.value, event.currentTarget.closest('li'))}/>
    </label>}
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
  const focus = useFocus(), [draft, setDraft] = useState(''), [dragging, setDragging] = useState(''), [editing, setEditing] = useState(''), [open, setOpen] = useState(''), [list, setList] = useState('today');
  const [undo, offerUndo, clearUndo] = useUndo();
  const { tasks: all, timer } = focus.state, now = focus.now || Date.now(), today = dayKey(now);
  const sessions = useFocusSessions(focus.state.sessions), stats = useMemo(() => dayStats(sessions, all), [sessions, all]);
  const [month, setMonth] = useState(() => { const date = new Date(now); return { year: date.getFullYear(), month: date.getMonth() }; });
  const [picked, setPicked] = useState(today), [flip, setFlip] = useState(''), [note, setNote] = useState(''), root = useRef(null);
  useEffect(() => { if (!note) return undefined; const id = setTimeout(() => setNote(''), 3600); return () => clearTimeout(id); }, [note]);
  const remove = (task, index) => { if (focus.removeTask(task.id)) offerUndo(`已删除「${task.text}」`, () => focus.restoreTask(task, index)); };
  const tasks = all.filter((task) => listOf(task, today) === list), progress = taskProgress(tasks, now), open_ = progress.open;
  const counts = Object.fromEntries(LISTS.map(([id]) => [id, all.filter((task) => listOf(task, today) === id && !task.done).length]));
  const finishEdit = (task, value) => { if (value.trim() && value.trim() !== task.text && !focus.renameTask(task.id, value)) return; setEditing(''); };
  const submit = (event) => { event.preventDefault(); if (!draft.trim() || all.length >= 200) return; if (focus.addTask(draft, { list })) { setDraft(''); playSfx('paper-press'); } };
  // A double-click renames: the first click of it must not leave the selection toggled.
  const before = useRef(null);
  const select = (event, task) => { if (event.detail > 1) return; before.current = { id: task.id, selected: timer.taskId }; focus.selectTask(task.id, true); };
  const rename = (task) => { const was = before.current; before.current = null; if (was?.id === task.id && focus.state.timer.taskId !== was.selected) focus.selectTask(was.selected); setEditing(task.id); };
  const doneAll = all.filter((task) => task.done).length;
  const estimated = tasks.filter((task) => !task.done).reduce((sum, task) => sum + Math.max(0, task.estimate - task.pomodoros), 0);
  // Stick a note on a day: it flies there and lands with a press.
  const stick = (task, key, from) => {
    if (!task) return;
    const result = scheduleChange(task, key, today);
    if (!result.ok) { setNote(SCHEDULE_REFUSALS[result.reason] || SCHEDULE_REFUSALS.bad); return; }
    if (result.noop) { setNote(`「${task.text}」已经贴在${shortDate(key)}了。`); return; }
    if (!focus.updateTask(task.id, result.change)) return;
    const [year, mon] = key.split('-').map(Number), rect = from?.getBoundingClientRect ? from.getBoundingClientRect() : from;
    setMonth({ year, month: mon - 1 }); setPicked(key); setFlip(key > picked ? 'next' : 'prev'); setNote(`贴到${shortDate(key)}了。`);
    setTimeout(() => flyNote({ from: rect, to: root.current?.querySelector(`[data-day="${key}"]`), text: task.text, color: NOTE_COLORS[noteColor(task.id)] }), 40);
  };
  const dropped = (id, key, from) => { setDragging(''); stick(all.find((task) => task.id === id), key, from); };
  const nowDate = new Date(now);
  return <div className="focus-tasks desk-tasks" ref={root}>
    <DeskCalendar month={month} setMonth={setMonth} stats={stats} picked={picked} setPicked={setPicked} now={now} dragging={Boolean(dragging)} onDropNote={dropped} flip={flip} setFlip={setFlip}/>
    <section className="desk-plan" aria-label="待办便签">
      <span className="desk-plan-rings" aria-hidden="true"><i/><i/><i/></span>
      <header className="desk-plan-head" aria-hidden="true">
        <b>{nowDate.getDate()}</b><span><em>{WEEKDAY_ZH[nowDate.getDay()]}</em><small>PLANS</small></span><u className="desk-stamp">{list === 'today' ? 'TODAY' : 'LATER'}</u>
      </header>
      <Segmented className="focus-task-lists" label="待办清单" value={list} onChange={(id) => { setList(id); setOpen(''); playSfx('page-turn'); }} items={LISTS.map(([id, label]) => ({ id, label: <>{label}{counts[id] ? <small>{counts[id]}</small> : null}</> }))}/>
      <form className="focus-task-form" onSubmit={submit}>
        <input aria-label="新的待办" placeholder={list === 'today' ? '今天要做什么？' : '之后想做的事…'} maxLength={120} value={draft} onChange={(event) => setDraft(event.target.value)}/>
        <button type="submit" aria-label="添加待办" disabled={!draft.trim() || all.length >= 200}><Plus size={18}/></button>
      </form>
      {all.length >= 200 && <p role="status" className="focus-empty">已达 200 项上限，请先清理已完成的待办。</p>}
      {tasks.length > 0 && <div className="focus-task-meter" role="progressbar" aria-label="待办完成进度" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
        <div className="focus-task-meter-bar"><span style={{ width: `${progress.done / progress.total * 100}%` }}/></div>
        <small>{progress.done} / {progress.total} 完成{progress.doneToday ? ` · 今天 ${progress.doneToday} 项` : ''}{estimated ? ` · 还要约 ${estimated} 个番茄` : ''}</small>
      </div>}
      {!tasks.length && <p className="focus-empty">{list === 'today' ? '把今天的小目标写下来，选中一项后开始专注。没做完的明天会自动顺延。' : '暂时不急的事放这里，想做时移到「今天」。拖到台历上的某一天，就贴在那天等你。'}</p>}
      <ul className="focus-task-list" aria-label={list === 'today' ? '今天的待办' : '之后的待办'}>
        {tasks.map((task, position) => {
          const index = all.indexOf(task), bucket = taskBucket(task, today), carried = bucket === 'today' && !task.done && task.carried > 0, color = noteColor(task.id);
          return <li key={task.id} className={`desk-note note-${color} ${task.done ? 'is-done' : ''} ${timer.taskId === task.id ? 'is-current' : ''} ${dragging === task.id ? 'is-dragging' : ''} ${open === task.id ? 'is-open' : ''}`} style={{ '--tilt': `${TILT[position % TILT.length]}deg` }} draggable={editing !== task.id}
            onDragStart={(event) => { setDragging(task.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', task.id); event.dataTransfer.setData(DAY_NOTE, task.id); playSfx('paper-unpress'); }}
            onDragEnd={() => setDragging('')} onDragOver={(event) => { if (dragging) event.preventDefault(); }}
            onDrop={(event) => { event.preventDefault(); if (dragging && dragging !== task.id) focus.moveTask(dragging, index); setDragging(''); }}>
            <div className="focus-task-row">
              <button type="button" className="focus-task-check" role="checkbox" aria-checked={task.done} aria-label={`${task.done ? '标记为未完成' : '完成'}：${task.text}`} onClick={() => { if (!task.done) playSfx('pencil-tick'); focus.updateTask(task.id, { done: !task.done }); }}><PencilBox done={task.done}/></button>
              {editing === task.id ? <input className="focus-task-edit" aria-label={`编辑待办：${task.text}`} defaultValue={task.text} maxLength={120} autoFocus onBlur={(event) => finishEdit(task, event.target.value)} onKeyDown={(event) => {
                if (event.key === 'Enter') { event.preventDefault(); finishEdit(task, event.currentTarget.value); }
                if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setEditing(''); }
              }}/> : <button type="button" className="focus-task-text" aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" onKeyDown={(event) => {
                if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
                event.preventDefault(); const neighbours = tasks.map((item) => all.indexOf(item)), at = tasks.indexOf(task) + (event.key === 'ArrowUp' ? -1 : 1);
                if (at >= 0 && at < neighbours.length) focus.moveTask(task.id, neighbours[at]);
              }} aria-pressed={timer.taskId === task.id} title={timer.taskId === task.id ? '取消作为当前专注任务' : '设为当前专注任务'} onClick={(event) => select(event, task)} onDoubleClick={() => rename(task)}>
                <span className="desk-note-text">{task.text}</span>
                <span className="desk-note-meta"><Ticks task={task}/>
                  {carried && <small className="focus-task-carried" title={`没做完，已经顺延 ${task.carried} 天`}>顺延</small>}
                  {bucket === 'scheduled' && <small className="focus-task-planned" title="贴在台历的这一天，到了那天就在「今天」里">{shortDate(task.plannedFor)}</small>}
                  {task.subtasks.length > 0 && <small className="focus-task-subcount">{task.subtasks.filter((item) => item.done).length}/{task.subtasks.length}</small>}</span>
              </button>}
            </div>
            <div className="desk-note-tools">
              <button type="button" className="focus-task-expand" aria-expanded={open === task.id} aria-label={`${open === task.id ? '收起' : '展开'}预估与子任务：${task.text}`} onClick={() => setOpen(open === task.id ? '' : task.id)}>{open === task.id ? <Up size={14}/> : <Down size={14}/>}</button>
              <button type="button" className="focus-task-rename" aria-label={`编辑待办：${task.text}`} title="编辑（也可双击文字）" onClick={() => setEditing(task.id)}><Pencil size={16}/></button>
              <button type="button" className="focus-task-remove" aria-label={`删除待办：${task.text}`} onClick={() => remove(task, index)}><Trash2 size={16}/></button>
            </div>
            {open === task.id && <TaskDetails task={task} focus={focus} today={today} bucket={bucket} onSchedule={stick}/>}
          </li>;
        })}
      </ul>
      {note && <p className="desk-plan-status" role="status">{note}</p>}
      <UndoLine offer={undo} clear={clearUndo}/>
      {tasks.length > 1 && <p className="focus-empty">拖动排序，或选中任务后按 Alt + ↑ / ↓ 调整顺序；双击文字可改名。拖到台历的某一天，或展开后选日期，就贴在那天。完成当前任务后会自动选中下一项。</p>}
      {tasks.length > 0 && <footer className="focus-task-footer"><span>{open_} 项待完成</span>{doneAll > 0 && <ConfirmButton className="" question={`清除 ${doneAll} 项已完成的待办（今天和之后）？`} confirmLabel="确认清除" onConfirm={focus.clearDone}>清除已完成</ConfirmButton>}</footer>}
    </section>
  </div>;
}
