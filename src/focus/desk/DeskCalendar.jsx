import React, { useEffect, useId, useMemo, useRef } from 'react';
import { Tabs, tabPanelProps } from '../../ui/Roving';
import { playSfx } from '../../props/sfx.mjs';
import Coil from './Coil';
import { WEEK_HEAD, MONTH_ZH, WEEKDAY_ZH, monthGrid, shiftMonth, heatLevel, monthTotals, formatSpan, taskColor, shortDate, ringPath, weekOf, daySessions, clockTime, planLabel } from './calendar-model.mjs';

// DEsk's desk calendar (https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors; src/draw.c
// cal_paper / cal_head): a card on a dark board, hung on a black wire, the big day number and the red
// month at the head, the months either side in small print, today ringed in red pen, coloured tabs
// down the right edge for 年 / 月 / 周 / 日. Days with focus time are washed with pencil by how much;
// a sticky note (or a pad) dropped on a day sticks there.
const RING = ringPath(20, 17, 15.5, 11.5);
export const DAY_NOTE = 'application/x-cabin-task';
export const DAY_PAD = 'application/x-cabin-pad';
export const VIEWS = Object.freeze([['year', '年'], ['month', '月'], ['week', '周'], ['day', '日']]);
const keyDate = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
const keyOf = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const carries = (event) => { const types = Array.from(event.dataTransfer?.types || []); return types.includes(DAY_NOTE) || types.includes(DAY_PAD); };
export const dragCarriesNote = carries;

function useDrop(onDropNote, onDropPad) {
  return (key) => ({
    onDragOver: (event) => { if (carries(event)) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } },
    onDrop: (event) => {
      if (!carries(event)) return;
      event.preventDefault();
      const pad = event.dataTransfer.getData(DAY_PAD), from = { left: event.clientX - 40, top: event.clientY - 24, width: 80, height: 48 };
      if (pad !== '') onDropPad?.(Number(pad), key); else onDropNote?.(event.dataTransfer.getData(DAY_NOTE), key, from);
    }
  });
}

// The neighbouring months, small, at the top right of the page; each turns the calendar to it.
function MiniMonth({ year, month, now, label, onClick }) {
  const weeks = useMemo(() => monthGrid(year, month, now), [year, month]);
  return <button type="button" className="cal-mini" aria-label={label} onClick={onClick}>
    <span className="cal-mini-name" aria-hidden="true">{MONTH_ZH[month]}</span>
    <span className="cal-mini-grid" aria-hidden="true">{weeks.flat().map((cell) => <i key={cell.key} className={`${cell.inMonth ? '' : 'is-out'} ${cell.weekday === 0 ? 'is-sun' : cell.weekday === 6 ? 'is-sat' : ''}`}>{cell.inMonth ? cell.day : ''}</i>)}</span>
  </button>;
}

function Strips({ day, max = 2 }) {
  const notes = [...day.planned].sort((a, b) => (a.at || '99').localeCompare(b.at || '99')), shown = notes.slice(0, max), extra = notes.length - shown.length;
  if (!notes.length) return null;
  return <span className="cal-strips" aria-hidden="true">{shown.map((task) => <i key={task.id} className={`note-${taskColor(task)}`}>{task.at ? `${task.at.slice(0, 5)} ` : ''}{task.text}</i>)}{extra > 0 && <small>+{extra}</small>}</span>;
}

function MonthPage({ month, setMonth, stats, picked, setPicked, now, dragging, drop, turn }) {
  const weeks = useMemo(() => monthGrid(month.year, month.month, now), [month.year, month.month, Math.floor(now / 60000)]);
  const totals = useMemo(() => monthTotals(stats, month.year, month.month), [stats, month.year, month.month]);
  const root = useRef(null), refocus = useRef(false), pickedDate = keyDate(picked);
  const visible = weeks.flat().some((cell) => cell.key === picked), tabbable = visible ? picked : weeks.flat().find((cell) => cell.inMonth)?.key;
  const prev = shiftMonth(month, -1), next = shiftMonth(month, 1);
  useEffect(() => { if (!refocus.current) return; refocus.current = false; root.current?.querySelector(`[data-day="${picked}"]`)?.focus({ preventScroll: true }); });
  const move = (event) => {
    const cell = event.target.closest?.('[data-day]'); if (!cell || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'PageUp' || event.key === 'PageDown') { event.preventDefault(); turn(event.key === 'PageUp' ? -1 : 1); return; }
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key]; if (!step) return;
    event.preventDefault();
    const date = keyDate(cell.dataset.day); date.setDate(date.getDate() + step);
    refocus.current = true; setPicked(keyOf(date));
    if (date.getMonth() !== month.month || date.getFullYear() !== month.year) setMonth({ year: date.getFullYear(), month: date.getMonth() }, step > 0 ? 'next' : 'prev');
  };
  const label = (cell, day) => `${cell.month + 1}月${cell.day}日 ${WEEKDAY_ZH[cell.weekday]}${cell.today ? '，今天' : ''}${day.minutes ? `，专注 ${formatSpan(day.minutes)}` : ''}${day.done.length ? `，完成 ${day.done.length} 项` : ''}${day.planned.length ? `，安排了 ${day.planned.length} 项` : ''}`;
  return <div className="cal-month" ref={root}>
    <header className="cal-head">
      <button type="button" className="cal-big" aria-label={`回到今天（现在看的是 ${pickedDate.getMonth() + 1}月${pickedDate.getDate()}日）`} title="回到今天" onClick={() => { const date = new Date(now); setPicked(keyOf(date)); setMonth({ year: date.getFullYear(), month: date.getMonth() }, keyOf(date) > picked ? 'next' : 'prev'); }}>{pickedDate.getDate()}</button>
      <div className="cal-titles"><span className="cal-month-name">{MONTH_ZH[month.month]}</span><span className="cal-year">{month.year}</span></div>
      <div className="cal-minis">
        <MiniMonth {...prev} now={now} label={`上个月：${MONTH_ZH[prev.month]}（PageUp）`} onClick={() => turn(-1)}/>
        <MiniMonth {...next} now={now} label={`下个月：${MONTH_ZH[next.month]}（PageDown）`} onClick={() => turn(1)}/>
      </div>
    </header>
    <div className="cal-weekdays" aria-hidden="true">{WEEK_HEAD.map((name, index) => <span key={name} className={index === 6 ? 'is-sun' : index === 5 ? 'is-sat' : ''}>{name}</span>)}</div>
    <div className="cal-grid" role="group" aria-label="日期" onKeyDown={move} style={{ '--rows': weeks.length }}>
      {weeks.flat().map((cell) => {
        const day = stats.get(cell.key), heat = heatLevel(day.minutes);
        return <button key={cell.key} type="button" data-day={cell.key} tabIndex={cell.key === tabbable ? 0 : -1} aria-pressed={picked === cell.key} aria-current={cell.today ? 'date' : undefined} aria-label={label(cell, day)}
          className={`cal-day heat-${heat} ${cell.inMonth ? '' : 'is-out'} ${cell.today ? 'is-today' : ''} ${picked === cell.key ? 'is-picked' : ''} ${cell.weekday === 0 ? 'is-sun' : cell.weekday === 6 ? 'is-sat' : ''} ${dragging ? 'is-droppable' : ''}`}
          onClick={() => { playSfx('pencil-tick'); setPicked(cell.key); if (!cell.inMonth) setMonth({ year: cell.year, month: cell.month }, cell.key > picked ? 'next' : 'prev'); }} {...drop(cell.key)}>
          {cell.today && <svg className="cal-ring" viewBox="0 0 40 34" aria-hidden="true"><path d={RING} pathLength="1"/></svg>}
          <span className="cal-num">{cell.day}</span>
          {day.minutes >= 1 && <span className="cal-minutes" aria-hidden="true">{day.minutes >= 60 ? `${Math.floor(day.minutes / 60)}h${day.minutes % 60 ? day.minutes % 60 : ''}` : `${day.minutes}′`}</span>}
          <Strips day={day}/>
        </button>;
      })}
    </div>
    <p className="cal-foot">{totals.minutes ? `本月专注 ${formatSpan(totals.minutes)} · ${totals.daysFocused} 天` : '本月还没有专注记录'}</p>
  </div>;
}

function WeekPage({ stats, picked, setPicked, now, drop, dragging }) {
  const week = weekOf(picked, now), first = keyDate(week[0].key), last = keyDate(week[6].key);
  const step = (days) => { const date = keyDate(picked); date.setDate(date.getDate() + days); playSfx('page-turn'); setPicked(keyOf(date)); };
  const total = week.reduce((sum, day) => sum + stats.get(day.key).minutes, 0);
  return <div className="cal-week">
    <header className="cal-head is-small">
      <div className="cal-titles"><span className="cal-month-name">本周</span><span className="cal-year">{first.getMonth() + 1}月{first.getDate()}日 – {last.getMonth() + 1}月{last.getDate()}日</span></div>
      <span className="cal-turn"><button type="button" className="cal-turn-key" aria-label="上一周" onClick={() => step(-7)}>‹</button><button type="button" className="cal-turn-key" aria-label="下一周" onClick={() => step(7)}>›</button></span>
    </header>
    <ol className="cal-week-days">
      {week.map((cell) => {
        const day = stats.get(cell.key);
        return <li key={cell.key}><button type="button" data-day={cell.key} className={`cal-week-day heat-${heatLevel(day.minutes)} ${cell.today ? 'is-today' : ''} ${picked === cell.key ? 'is-picked' : ''} ${cell.weekday === 0 ? 'is-sun' : cell.weekday === 6 ? 'is-sat' : ''} ${dragging ? 'is-droppable' : ''}`} aria-pressed={picked === cell.key} aria-current={cell.today ? 'date' : undefined}
          aria-label={`${cell.month + 1}月${cell.day}日 ${WEEKDAY_ZH[cell.weekday]}${day.minutes ? `，专注 ${formatSpan(day.minutes)}` : ''}${day.planned.length ? `，安排了 ${day.planned.length} 项` : ''}`} onClick={() => { playSfx('pencil-tick'); setPicked(cell.key); }} {...drop(cell.key)}>
          <span className="cal-week-name">{WEEKDAY_ZH[cell.weekday]}</span>
          <span className="cal-num">{cell.day}{cell.today && <svg className="cal-ring" viewBox="0 0 40 34" aria-hidden="true"><path d={RING} pathLength="1"/></svg>}</span>
          <span className="cal-week-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, day.minutes / 1.8)}%` }}/></span>
          <span className="cal-week-min" aria-hidden="true">{day.minutes ? formatSpan(day.minutes) : ''}</span>
          <Strips day={day} max={3}/>
        </button></li>;
      })}
    </ol>
    <p className="cal-foot">{total ? `这一周专注 ${formatSpan(total)}` : '这一周还没有专注记录'}</p>
  </div>;
}

function DayPage({ stats, sessions, picked, setPicked, now }) {
  const date = keyDate(picked), day = stats.get(picked), rounds = daySessions(sessions, picked), today = keyOf(new Date(now));
  const step = (days) => { const next = keyDate(picked); next.setDate(next.getDate() + days); playSfx('page-turn'); setPicked(keyOf(next)); };
  return <div className="cal-day-page">
    <header className="cal-head">
      <b className="cal-big" aria-hidden="true">{date.getDate()}</b>
      <div className="cal-titles"><span className="cal-month-name">{WEEKDAY_ZH[date.getDay()]}</span><span className="cal-year">{date.getFullYear()} 年 {date.getMonth() + 1} 月{picked === today ? ' · 今天' : ''}</span></div>
      <span className="cal-turn"><button type="button" className="cal-turn-key" aria-label="前一天" onClick={() => step(-1)}>‹</button><button type="button" className="cal-turn-key" aria-label="后一天" onClick={() => step(1)}>›</button></span>
    </header>
    <p className="cal-day-sum">{day.minutes ? `专注 ${formatSpan(day.minutes)}${day.rounds ? ` · ${day.rounds} 轮完整` : ''}` : '这天没有专注记录'}</p>
    {rounds.length > 0 && <ol className="cal-rounds" aria-label={`${shortDate(picked)}的专注`}>{rounds.map((round) => <li key={round.start} className={round.completed ? '' : 'is-short'}><time>{clockTime(round.start)}–{clockTime(round.end)}</time><span>{round.minutes} 分钟{round.completed ? '' : '（提前结束）'}</span>{round.text && <em>{round.text}</em>}</li>)}</ol>}
    {day.planned.length > 0 && <ul className="cal-day-notes" aria-label={`${shortDate(picked)}的便签`}>{day.planned.map((task) => <li key={task.id} className={`note-${taskColor(task)}`}>{task.at ? `${planLabel(task.at)} ` : ''}{task.text}</li>)}</ul>}
  </div>;
}

function YearPage({ month, setMonth, setView, stats, now }) {
  const year = month.year, today = keyOf(new Date(now));
  return <div className="cal-year-page">
    <header className="cal-head is-small">
      <div className="cal-titles"><span className="cal-month-name">{year} 年</span><span className="cal-year">每个小格是一天，颜色越深，那天专注越久</span></div>
      <span className="cal-turn"><button type="button" className="cal-turn-key" aria-label="上一年" onClick={() => { playSfx('page-turn'); setMonth({ year: year - 1, month: month.month }, 'prev'); }}>‹</button><button type="button" className="cal-turn-key" aria-label="下一年" onClick={() => { playSfx('page-turn'); setMonth({ year: year + 1, month: month.month }, 'next'); }}>›</button></span>
    </header>
    <div className="cal-year-grid">{MONTH_ZH.map((name, index) => {
      const totals = monthTotals(stats, year, index), days = new Date(year, index + 1, 0).getDate(), lead = (new Date(year, index, 1).getDay() + 6) % 7;
      return <button type="button" key={name} className={`cal-year-month ${index === month.month ? 'is-picked' : ''}`} aria-label={`${name}${totals.minutes ? `，专注 ${formatSpan(totals.minutes)}` : ''}，翻到这个月`} onClick={() => { setMonth({ year, month: index }, index > month.month ? 'next' : 'prev'); setView('month'); }}>
        <span className="cal-year-name">{name}</span>
        <span className="cal-year-days" aria-hidden="true">{Array.from({ length: lead }, (_, i) => <i key={`l${i}`} className="is-blank"/>)}{Array.from({ length: days }, (_, i) => { const key = `${year}-${String(index + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`; return <i key={key} className={`heat-${heatLevel(stats.get(key).minutes)} ${key === today ? 'is-today' : ''}`}/>; })}</span>
      </button>;
    })}</div>
  </div>;
}

export default function DeskCalendar({ view, setView, month, setMonth: turnTo, stats, sessions, picked, setPicked, now, dragging, onDropNote, onDropPad, flip }) {
  const tabs = useId(), coil = useRef(`coil-${Math.random().toString(36).slice(2, 8)}`).current, drop = useDrop(onDropNote, onDropPad);
  const setMonth = (next, direction = '') => turnTo(next, direction);
  const turn = (delta) => { playSfx('page-turn'); setMonth(shiftMonth(month, delta), delta > 0 ? 'next' : 'prev'); };
  const props = { month, setMonth, stats, sessions, picked, setPicked, now, dragging, drop, turn, setView };
  return <section className="desk-cal" aria-label={`台历 · ${month.year} 年 ${month.month + 1} 月`}>
    <div className="cal-board">
      <Coil id={coil}/>
      <div className={`cal-page ${flip ? `is-turning-${flip}` : ''}`} key={`${view}-${view === 'month' || view === 'year' ? `${month.year}-${month.month}` : picked}`} {...tabPanelProps(tabs, view)}>
        {view === 'year' ? <YearPage {...props}/> : view === 'week' ? <WeekPage {...props}/> : view === 'day' ? <DayPage {...props}/> : <MonthPage {...props}/>}
      </div>
      <Tabs className="cal-tabs" label="台历视图" idPrefix={tabs} orientation="vertical" value={view} onChange={(id) => { if (id !== view) playSfx('page-turn'); setView(id); }} items={VIEWS.map(([id, label]) => ({ id, label, className: `cal-tab is-${id}` }))}/>
    </div>
  </section>;
}
