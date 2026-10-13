import React, { useState } from 'react';
import { Plus, Trash2, Check, Pencil } from '../icons';
import { useFocus } from './useFocus';
import { taskProgress } from './focus-model.mjs';

export default function TaskList() {
  const focus = useFocus(), [draft, setDraft] = useState(''), [dragging, setDragging] = useState(''), [editing, setEditing] = useState('');
  const { tasks, timer } = focus.state, progress = taskProgress(tasks, focus.now), open = progress.open;
  const finishEdit = (task, value) => { if (value.trim() && value.trim() !== task.text && !focus.renameTask(task.id, value)) return; setEditing(''); };
  const submit = (event) => { event.preventDefault(); if (!draft.trim() || tasks.length >= 200) return; if (focus.addTask(draft)) setDraft(''); };
  return <div className="focus-tasks">
    <form className="focus-task-form" onSubmit={submit}>
      <input aria-label="新的待办" placeholder="接下来要做什么？" maxLength={120} value={draft} onChange={(event) => setDraft(event.target.value)}/>
      <button type="submit" aria-label="添加待办" disabled={!draft.trim() || tasks.length >= 200}><Plus size={18}/></button>
    </form>
    {tasks.length >= 200 && <p role="status" className="focus-empty">已达 200 项上限，请先清理已完成的待办。</p>}
    {tasks.length > 0 && <div className="focus-task-meter" role="progressbar" aria-label="待办完成进度" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
      <div className="focus-task-meter-bar"><span style={{ width: `${progress.done / progress.total * 100}%` }}/></div>
      <small>{progress.done} / {progress.total} 完成{progress.doneToday ? ` · 今天 ${progress.doneToday} 项` : ''}</small>
    </div>}
    {!tasks.length && <p className="focus-empty">把今天的小目标写下来，选中一项后开始专注。</p>}
    <ul className="focus-task-list" aria-label="待办清单">
      {tasks.map((task, index) => <li key={task.id} className={`${task.done ? 'is-done' : ''} ${timer.taskId === task.id ? 'is-current' : ''} ${dragging === task.id ? 'is-dragging' : ''}`} draggable
        onDragStart={(event) => { setDragging(task.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', task.id); }}
        onDragEnd={() => setDragging('')} onDragOver={(event) => { if (dragging) event.preventDefault(); }}
        onDrop={(event) => { event.preventDefault(); if (dragging && dragging !== task.id) focus.moveTask(dragging, index); setDragging(''); }}>
        <button type="button" className="focus-task-check" role="checkbox" aria-checked={task.done} aria-label={`${task.done ? '标记为未完成' : '完成'}：${task.text}`} onClick={() => focus.updateTask(task.id, { done: !task.done })}>{task.done && <Check size={14}/>}</button>
        {editing === task.id ? <input className="focus-task-edit" aria-label={`编辑待办：${task.text}`} defaultValue={task.text} maxLength={120} autoFocus onBlur={(event) => finishEdit(task, event.target.value)} onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); finishEdit(task, event.currentTarget.value); }
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setEditing(''); }
        }}/> : <button type="button" className="focus-task-text" aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" onKeyDown={(event) => {
          if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault(); focus.moveTask(task.id, index + (event.key === 'ArrowUp' ? -1 : 1));
        }} aria-pressed={timer.taskId === task.id} title={timer.taskId === task.id ? '取消作为当前专注任务' : '设为当前专注任务'} onClick={() => focus.selectTask(task.id, true)} onDoubleClick={() => setEditing(task.id)}>
          <span>{task.text}</span>{task.pomodoros > 0 && <small aria-label={`已专注 ${task.pomodoros} 轮`}>{'🍅'.repeat(Math.min(task.pomodoros, 4))}{task.pomodoros > 4 ? `×${task.pomodoros}` : ''}</small>}
        </button>}
        <button type="button" className="focus-task-rename" aria-label={`编辑待办：${task.text}`} title="编辑（也可双击文字）" onClick={() => setEditing(task.id)}><Pencil size={14}/></button>
        <button type="button" className="focus-task-remove" aria-label={`删除待办：${task.text}`} onClick={() => focus.removeTask(task.id)}><Trash2 size={15}/></button>
      </li>)}
    </ul>
    {tasks.length > 1 && <p className="focus-empty">拖动排序，或选中任务后按 Alt + ↑ / ↓ 调整顺序；双击文字可改名。</p>}
    {tasks.length > 0 && <footer className="focus-task-footer"><span>{open} 项待完成</span>{tasks.length > open && <button type="button" onClick={focus.clearDone}>清除已完成</button>}</footer>}
  </div>;
}
