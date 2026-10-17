import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFocus } from '../useFocus';
import useReducedMotion from '../../useReducedMotion';
import useFocusSessions from './useFocusSessions.js';
import { recentSummary, dailySeries, yearHeatmap, byTask, timeOfDay, weeklyReport, reportMarkdown, formatMinutes, dayKey } from './stats-model.mjs';
import { drawWeekCard, canDrawCover, CARD_W, CARD_H } from './week-card.mjs';
import { JOURNAL_EVENT, JOURNAL_TABS, journalTab, isJournalKey } from './journal-events.mjs';
import './focus-stats.css';
import './journal-art.css';
import { journalArtStyle, hasArt } from './journal-art.mjs';

const clock = (t) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const typing = (el) => el?.closest?.('input,textarea,select,[contenteditable="true"]');

export function Bars({ days, label, mini = false }) {
  const peak = Math.max(30, ...days.map((d) => d.minutes)), dense = days.length > 7;
  return <figure className={`fs-bars stats-chart-well ${dense ? 'is-dense' : ''} ${mini ? 'is-mini' : ''}`} aria-label={label}>
    <div className="fs-bars-row">{days.map((d, i) => <div key={d.key} className="fs-bar" title={`${d.key} · ${d.minutes} 分钟`}>
      {!dense && <span className="fs-bar-value">{d.minutes || ''}</span>}
      <span className={`fs-bar-fill ${d.isToday ? 'is-today' : ''}`} style={{ height: `${Math.max(d.minutes ? 6 : 2, d.minutes / peak * 100)}%` }}/>
      <small>{dense ? (i % 5 === 4 || d.isToday ? d.label : '') : d.label}</small>
    </div>)}</div>
    <figcaption>{label}</figcaption>
  </figure>;
}


// 小屋日记: a full-scene in-app overlay (native <dialog> in the top layer, so the
// room's own keys pause while it is open). Opens from the stats card, L, or
// `cabin:open-journal` ({ detail: { tab } }).
export default function CabinJournal() {
  const focus = useFocus();
  const [open, setOpen] = useState(false), [view, setView] = useState('overview'), ref = useRef(null);
  useEffect(() => {
    const on = (event) => { setView(journalTab(event.detail?.tab)); setOpen(true); };
    const key = (event) => { if (!open && isJournalKey(event) && !typing(event.target) && !document.querySelector('dialog[open]') && !document.documentElement.classList.contains('room-corner-open')) { event.preventDefault(); setView('overview'); setOpen(true); } };
    window.addEventListener(JOURNAL_EVENT, on); document.addEventListener('keydown', key);
    return () => { window.removeEventListener(JOURNAL_EVENT, on); document.removeEventListener('keydown', key); };
  }, [open]);
  useEffect(() => { const el = ref.current; if (!el) return; if (open && !el.open) el.showModal?.() ?? el.setAttribute('open', ''); if (!open && el.open) el.close?.(); }, [open]);
  if (!focus) return null;
  return <dialog ref={ref} className="cabin-journal" aria-label="小屋日记" style={journalArtStyle()} onCancel={(event) => { event.preventDefault(); setOpen(false); }} onClose={() => setOpen(false)}>
    {open && <JournalBook state={focus.state} now={focus.now} view={view} setView={setView} close={() => setOpen(false)}/>}
  </dialog>;
}

function JournalBook({ state, now, view, setView, close }) {
  const sessions = useFocusSessions(state.sessions), tasks = state.tasks, reduced = useReducedMotion();
  const [range, setRange] = useState(7), [weekOffset, setWeekOffset] = useState(-1), [note, setNote] = useState('');
  const today = dayKey(now), canvas = useRef(null);
  const recent = useMemo(() => recentSummary(sessions, now, 5), [sessions, today]);
  const daily = useMemo(() => dailySeries(sessions, now, range), [sessions, today, range]);
  const year = useMemo(() => yearHeatmap(sessions, now), [sessions, today]);
  const taskRows = useMemo(() => byTask(sessions, tasks), [sessions, tasks]);
  const tod = useMemo(() => timeOfDay(sessions), [sessions]);
  const report = useMemo(() => weeklyReport(sessions, tasks, now, weekOffset), [sessions, tasks, today, weekOffset]);
  const doneTasks = tasks.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 12);
  const taskName = (id) => tasks.find((t) => t.id === id)?.text;
  const activeDays = year.flat().filter((d) => d.minutes > 0).length, slotPeak = Math.max(1, ...tod.slots.map((s) => s.minutes)), taskPeak = Math.max(1, ...taskRows.map((r) => r.minutes));
  const flash = (text) => { setNote(text); setTimeout(() => setNote(''), 2400); };
  const copy = async () => {
    const text = reportMarkdown(report);
    try { await navigator.clipboard.writeText(text); } catch { const area = document.createElement('textarea'); area.value = text; document.body.append(area); area.select(); document.execCommand?.('copy'); area.remove(); }
    flash('已复制周报文字');
  };
  const loadCover = (url) => new Promise((resolve) => {
    if (!canDrawCover(url, location.origin)) return resolve(null);
    const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = url;
  });
  const exportPng = async () => {
    const el = canvas.current || document.createElement('canvas'); el.width = CARD_W; el.height = CARD_H;
    drawWeekCard(el.getContext('2d'), report, undefined, { cover: await loadCover(report.album?.cover) });
    const a = document.createElement('a'); a.href = el.toDataURL('image/png'); a.download = `心流小屋周报-${dayKey(report.from)}.png`; a.click(); flash('周报图片已导出');
  };
  const [coverFailed, setCoverFailed] = useState('');
  return <div className={`fs-book ${reduced ? 'is-reduced' : ''}`}>
    <header className="fs-book-head">
      <h2>小屋日记</h2>
      <div className="fs-ribbons" role="tablist" aria-label="日记分区">{JOURNAL_TABS.map(([id, name]) => <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}>{name}</button>)}</div>
      <button type="button" className="fs-back" aria-keyshortcuts="Escape" onClick={close}>返回小屋</button>
    </header>
    {view === 'overview' && <div className="fs-spread" key="overview" role="tabpanel" aria-label="概览">
      <div className="fs-page is-turning">
        <h3 className="fs-title">每天</h3>
        <div className="fs-seg" role="group" aria-label="时间范围">{[7, 30].map((n) => <button key={n} type="button" aria-pressed={range === n} onClick={() => setRange(n)}>近 {n} 天</button>)}</div>
        <Bars days={daily} label={`最近 ${range} 天 · 分钟`}/>
        <figure className="fs-year stats-chart-well" aria-label={`过去一年专注热力图，有 ${activeDays} 天专注`}>
          <div className="fs-year-grid">{year.flat().map((d) => <span key={d.key} data-level={d.level} className={d.future ? 'is-future' : ''} title={`${d.key} · ${d.minutes} 分钟`}/>)}</div>
          <figcaption className="focus-heatmap-legend">过去一年 · {activeDays} 天有专注 · 少{[1, 2, 3, 4].map((l) => <span key={l} data-level={l}/>)}多</figcaption>
        </figure>
      </div>
      <div className={`fs-spine ${hasArt('spine') ? 'has-art' : ''}`} aria-hidden="true"/>
      <div className="fs-page is-turning">
        <h3 className="fs-title">时段</h3>
      <p className="fs-hint">{tod.best ? `你通常在${tod.best.label}（${tod.best.from}–${tod.best.to} 点）最专注。` : '专注几次之后，这里会告诉你最顺手的时段。'}</p>
      <ol className="fs-rank">{tod.slots.map((s) => <li key={s.id} className={tod.best?.id === s.id ? 'is-best' : ''}>
        <span className="fs-rank-name">{s.label} <small>{s.from}–{s.to} 点</small></span><span className="fs-rank-num">{formatMinutes(s.minutes)}</span>
        <span className="fs-meter" aria-hidden="true"><i style={{ width: `${s.minutes / slotPeak * 100}%` }}/></span></li>)}</ol>
      <h3 className="fs-title">最近的专注</h3>
      {recent.recent.length ? <ol className="fs-sessions">{recent.recent.map((s) => <li key={s.id}>
        <span className="fs-time">{clock(s.start)}</span><span className="fs-task">{taskName(s.taskId) || s.taskText || '自由专注'}{s.album ? <small> · 《{s.album.title}》</small> : null}</span>
        <span className="fs-min">{Math.round(s.durationMs / 60000)} 分{s.completed ? '' : ' · 提前结束'}</span></li>)}</ol>
        : <p className="fs-empty">还没有专注记录。开一个番茄，小屋会帮你记下来。</p>}
      </div>
    </div>}
    {view === 'tasks' && <div className="fs-spread" key="tasks" role="tabpanel" aria-label="待办"><div className="fs-page is-turning">
      <h3 className="fs-title">时间花在哪里</h3>
      {taskRows.length ? <ol className="fs-rank">{taskRows.map((r) => <li key={r.id || 'free'} className={r.free ? 'is-free' : ''}>
        <span className="fs-rank-name">{r.name}{r.done ? <small> · 已完成</small> : null}</span><span className="fs-rank-num">{formatMinutes(r.minutes)} · {r.pomodoros} 个番茄</span>
        <span className="fs-meter" aria-hidden="true"><i style={{ width: `${r.minutes / taskPeak * 100}%` }}/></span></li>)}</ol>
        : <p className="fs-empty">在「待办」里选一件事再开始专注，这里就会按待办统计。</p>}
    </div><div className={`fs-spine ${hasArt('spine') ? 'has-art' : ''}`} aria-hidden="true"/><div className="fs-page is-turning">
      <h3 className="fs-title">做完的事</h3>
      {doneTasks.length ? <ul className="fs-sessions">{doneTasks.map((t) => <li key={t.id}><span className="fs-time">{t.doneAt ? clock(t.doneAt).split(' ')[0] : ''}</span><span className="fs-task">✓ {t.text}</span><span className="fs-min">{formatMinutes(taskRows.find((r) => r.id === t.id)?.minutes || 0)}</span></li>)}</ul>
        : <p className="fs-empty">勾掉的待办会留在这一页。</p>}
    </div></div>}
    {view === 'weekly' && <div className="fs-spread" key="weekly" role="tabpanel" aria-label="周报"><div className="fs-page is-turning">
      <article className="fs-card" aria-label="周报卡片">
        <header><span>心流小屋 · 周报</span><small>{report.label}</small></header>
        <span className={`fs-card-doodle ${hasArt('doodle') ? 'has-art' : ''}`} aria-hidden="true"/>
        <p className="fs-card-total">{formatMinutes(report.totalMinutes)} <small className={report.deltaMinutes >= 0 ? 'is-up' : ''}>{report.deltaMinutes === 0 ? '与上周持平' : `${report.deltaMinutes > 0 ? '比上周多' : '比上周少'} ${formatMinutes(Math.abs(report.deltaMinutes))}`} · {report.pomodoros} 个番茄</small></p>
        <Bars days={report.daily.map((d) => ({ ...d, isToday: d === report.bestDay }))} label="这一周 · 分钟"/>
        <dl className="fs-facts">
          <div><dt>最好的一天</dt><dd>{report.bestDay ? `${report.bestDay.label} · ${formatMinutes(report.bestDay.minutes)}` : '—'}</dd></div>
          <div><dt>最专注时段</dt><dd>{report.bestSlot ? `${report.bestSlot.label} ${report.bestSlot.from}–${report.bestSlot.to} 点` : '—'}</dd></div>
          <div><dt>最长连续</dt><dd>{report.longestStreak} 天</dd></div>
          <div><dt>最常听</dt><dd className="fs-album">{report.album?.cover && coverFailed !== report.album.cover && <img className="fs-card-cover" src={report.album.cover} alt="" width={32} height={32} onError={() => setCoverFailed(report.album.cover)}/>}{report.album ? `《${report.album.title}》${report.album.artist ? ` · ${report.album.artist}` : ''}` : '—'}</dd></div>
          <div><dt>主要待办</dt><dd>{report.topTasks.length ? report.topTasks.map((t) => `${t.name} ${formatMinutes(t.minutes)}`).join('、') : '—'}</dd></div>
          <div><dt>完成待办</dt><dd>{report.completed.length ? report.completed.join('、') : '—'}</dd></div>
        </dl>
        <p className="fs-card-summary">{report.summary}</p>
      </article>
    </div><div className={`fs-spine ${hasArt('spine') ? 'has-art' : ''}`} aria-hidden="true"/><div className="fs-page is-turning">
      <h3 className="fs-title">翻看每一周</h3>
      <div className="fs-weekpick" role="group" aria-label="选择周">
        <button type="button" aria-label="上一周" onClick={() => setWeekOffset((w) => w - 1)}>‹</button>
        <strong>{weekOffset === -1 ? '上周' : weekOffset === 0 ? '本周' : `${-weekOffset} 周前`} · {report.label}</strong>
        <button type="button" aria-label="下一周" disabled={weekOffset >= 0} onClick={() => setWeekOffset((w) => Math.min(0, w + 1))}>›</button>
      </div>
      <p className="fs-hint">每周一，上周的周报会写在这里。可以复制成文字，或导出一张图片。</p>
      <div className="fs-actions"><button type="button" onClick={copy}>复制文字</button><button type="button" onClick={exportPng}>导出图片</button><span role="status" aria-live="polite">{note}</span></div>
      <canvas ref={canvas} hidden/>
    </div></div>}
  </div>;
}
