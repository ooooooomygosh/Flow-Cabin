import React, { useEffect, useMemo, useRef } from 'react';
import { playSfx } from '../../props/sfx.mjs';
import BrassPlate from '../../props/BrassPlate';
import Coil from './Coil';
import { WEEK_HEAD, MONTH_ZH, MONTH_EN, WEEKDAY_ZH, monthGrid, heatLevel, monthTotals, formatSpan, noteColor, shortDate, ringPath } from './calendar-model.mjs';

// A desk calendar: a card hung on a black wire coil, the month's big day number engraved at the
// top, today circled in red pen, days with finished focus time tinted and dotted. A sticky note
// dragged onto a day sticks to it. Page layout after DEsk's month page
// (https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors, src/draw.c cal_paper / cal_head).
const RING = ringPath(20, 17, 15.5, 11.5);
const DAY_NOTE = 'application/x-cabin-task';
const keyDate = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
const keyOf = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const dragCarriesNote = (event) => Array.from(event.dataTransfer?.types || []).includes(DAY_NOTE);
export { DAY_NOTE };

export default function DeskCalendar({ month, setMonth, stats, picked, setPicked, now, dragging, onDropNote, flip, setFlip }) {
  const root = useRef(null), refocus = useRef(false), coil = useRef(`coil-${Math.random().toString(36).slice(2, 8)}`).current;
  const weeks = useMemo(() => monthGrid(month.year, month.month, now), [month.year, month.month, now - now % 60000]);
  const totals = useMemo(() => monthTotals(stats, month.year, month.month), [stats, month.year, month.month]);
  const pickedDate = keyDate(picked), pickedStats = stats.get(picked);
  const visible = weeks.flat().some((cell) => cell.key === picked);
  const tabbable = visible ? picked : weeks.flat().find((cell) => cell.inMonth)?.key;
  const turn = (delta) => { playSfx('page-turn'); setFlip(delta > 0 ? 'next' : 'prev'); const index = month.year * 12 + month.month + delta; setMonth({ year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 }); };
  const goToday = () => { const date = new Date(now); playSfx('page-turn'); setFlip(keyOf(date) > picked ? 'next' : 'prev'); setMonth({ year: date.getFullYear(), month: date.getMonth() }); setPicked(keyOf(date)); };
  useEffect(() => { if (!refocus.current) return; refocus.current = false; root.current?.querySelector(`[data-day="${picked}"]`)?.focus({ preventScroll: true }); });
  const move = (event) => {
    const cell = event.target.closest?.('[data-day]'); if (!cell || event.altKey || event.ctrlKey || event.metaKey) return;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (event.key === 'PageUp' || event.key === 'PageDown') { event.preventDefault(); turn(event.key === 'PageUp' ? -1 : 1); return; }
    if (!step) return;
    event.preventDefault();
    const date = keyDate(cell.dataset.day); date.setDate(date.getDate() + step);
    refocus.current = true; setPicked(keyOf(date));
    if (date.getMonth() !== month.month || date.getFullYear() !== month.year) { setFlip(step > 0 ? 'next' : 'prev'); setMonth({ year: date.getFullYear(), month: date.getMonth() }); }
  };
  const label = (cell, day) => `${cell.month + 1}月${cell.day}日 ${WEEKDAY_ZH[cell.weekday]}${cell.today ? '，今天' : ''}${day.minutes ? `，专注 ${formatSpan(day.minutes)}` : ''}${day.done.length ? `，完成 ${day.done.length} 项` : ''}${day.planned.length ? `，安排了 ${day.planned.length} 项` : ''}`;
  const drop = (event, cell) => {
    if (!dragCarriesNote(event)) return;
    event.preventDefault();
    onDropNote?.(event.dataTransfer.getData(DAY_NOTE), cell.key, { left: event.clientX - 40, top: event.clientY - 24, width: 80, height: 48 });
  };
  return <section className="desk-cal" ref={root} aria-label={`${month.year} 年 ${month.month + 1} 月台历`}>
    <Coil id={coil}/>
    <div className={`desk-cal-page ${flip ? `is-turning-${flip}` : ''}`} key={`${month.year}-${month.month}`}>
      <header className="desk-cal-head">
        <b className="desk-cal-big" aria-hidden="true">{pickedDate.getDate()}</b>
        <div className="desk-cal-titles">
          <span className="desk-cal-month">{MONTH_ZH[month.month]}</span>
          <span className="desk-cal-year">{MONTH_EN[month.month]} {month.year}</span>
          <span className="desk-cal-sum">{totals.minutes ? `本月专注 ${formatSpan(totals.minutes)} · ${totals.daysFocused} 天` : '本月还没有专注记录'}</span>
        </div>
        <div className="desk-cal-turn">
          <BrassPlate className="desk-cal-btn" aria-label="上个月" title="上个月（PageUp）" onClick={() => turn(-1)}>‹</BrassPlate>
          <BrassPlate className="desk-cal-btn desk-cal-today" aria-label="回到今天" onClick={goToday}>今天</BrassPlate>
          <BrassPlate className="desk-cal-btn" aria-label="下个月" title="下个月（PageDown）" onClick={() => turn(1)}>›</BrassPlate>
        </div>
      </header>
      <div className="desk-cal-weekdays" aria-hidden="true">{WEEK_HEAD.map((name, index) => <span key={name} className={index === 6 ? 'is-sun' : index === 5 ? 'is-sat' : ''}>{name}</span>)}</div>
      <div className="desk-cal-grid" role="group" aria-label="日期" onKeyDown={move}>
        {weeks.flat().map((cell) => {
          const day = stats.get(cell.key), heat = heatLevel(day.minutes), flags = [...day.planned, ...day.done].slice(0, 3), extra = day.planned.length + day.done.length - flags.length;
          return <button key={cell.key} type="button" data-day={cell.key} tabIndex={cell.key === tabbable ? 0 : -1} aria-pressed={picked === cell.key} aria-current={cell.today ? 'date' : undefined} aria-label={label(cell, day)}
            className={`desk-cal-day heat-${heat} ${cell.inMonth ? '' : 'is-out'} ${cell.today ? 'is-today' : ''} ${cell.past ? 'is-past' : ''} ${picked === cell.key ? 'is-picked' : ''} ${cell.weekday === 0 ? 'is-sun' : cell.weekday === 6 ? 'is-sat' : ''} ${dragging ? 'is-droppable' : ''}`}
            onClick={() => { playSfx('tick'); setPicked(cell.key); if (!cell.inMonth) { setFlip(cell.key > picked ? 'next' : 'prev'); setMonth({ year: cell.year, month: cell.month }); } }}
            onDragOver={(event) => { if (dragCarriesNote(event)) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }}
            onDrop={(event) => drop(event, cell)}>
            {cell.today && <svg className="desk-cal-ring" viewBox="0 0 40 34" aria-hidden="true"><path d={RING} pathLength="1"/></svg>}
            <span className="desk-cal-num">{cell.day}</span>
            {heat > 0 && <span className="desk-cal-dots" aria-hidden="true">{Array.from({ length: heat }, (_, i) => <i key={i}/>)}</span>}
            {flags.length > 0 && <span className="desk-cal-flags" aria-hidden="true">{flags.map((task) => <i key={task.id} className={`${task.done ? 'is-done' : ''} note-${noteColor(task.id)}`}/>)}{extra > 0 && <small>+{extra}</small>}</span>}
          </button>;
        })}
      </div>
      <footer className="desk-cal-foot" aria-live="polite">
        <strong>{pickedDate.getMonth() + 1}月{pickedDate.getDate()}日 {WEEKDAY_ZH[pickedDate.getDay()]}</strong>
        <span>{pickedStats.minutes ? `专注 ${formatSpan(pickedStats.minutes)}${pickedStats.rounds ? ` · ${pickedStats.rounds} 轮` : ''}` : '这天没有专注记录'}</span>
        {(pickedStats.planned.length > 0 || pickedStats.done.length > 0) && <ul className="desk-cal-notes" aria-label={`${shortDate(picked)}的便签`}>
          {[...pickedStats.planned, ...pickedStats.done].map((task) => <li key={task.id} className={`note-${noteColor(task.id)} ${task.done ? 'is-done' : ''}`}>{task.text}</li>)}
        </ul>}
      </footer>
    </div>
  </section>;
}
