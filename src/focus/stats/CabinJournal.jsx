import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFocus } from '../useFocus';
import useReducedMotion from '../../useReducedMotion';
import useFocusSessions from './useFocusSessions.js';
import { recentSummary, dailySeries, yearHeatmap, byTask, timeOfDay, weeklyReport, reportMarkdown, formatMinutes, dayKey } from './stats-model.mjs';
import { drawWeekCard, canDrawCover, CARD_W, CARD_H } from './week-card.mjs';
import { JOURNAL_EVENT, JOURNAL_TABS, journalTab, isJournalKey } from './journal-events.mjs';
import './focus-stats.css';
import './journal-art.css';
import { journalArtStyle, hasArt, JOURNAL_ART, CARD_EXPORT_SLOTS, cardArt, sprite, LETTER_PLACEHOLDER } from './journal-art.mjs';
import { defaultWeekOffset, weekName, catPose, CAT_POSE_CAPTION, barUnits, cabinLetter } from './journal-layout.mjs';
import { readCatMood, subscribeCatMood } from './cat-mood-source.mjs';
import { useLetters, useLetterDelivery } from '../../ai/useCabinLetters.js';
import { TONES } from '../../ai/ai-model.mjs';

const clock = (t) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const typing = (el) => el?.closest?.('input,textarea,select,[contenteditable="true"]');

export function Bars({ days, label, mini = false, set = 'records', best = null }) {
  const peak = Math.max(30, ...days.map((d) => d.minutes)), dense = days.length > 7, max = mini ? 5 : 10;
  return <figure className={`fs-bars stats-chart-well ${dense ? 'is-dense' : ''} ${mini ? 'is-mini' : ''}`} aria-label={label}>
    <div className="fs-bars-row">{days.map((d, i) => { const n = barUnits(d.minutes, peak, max); return <div key={d.key} className={`fs-bar ${d === best ? 'is-best' : ''} ${d.isToday ? 'is-today' : ''}`} title={`${d.key} · ${d.minutes} 分钟`}>
      {d === best && !mini && <img className="fs-sticker fs-bar-sticker" src={sprite('sticker-best-day')} alt="最好的一天" width={32} height={32}/>}
      {!dense && <span className="fs-bar-value">{d.minutes ? `${d.minutes}′` : ''}</span>}
      <span className={`fs-bar-fill fs-stack is-${set}`} data-units={n} style={{ '--units': n }}>{n > 0 && <i className="fs-stack-cap"/>}{d === best && !mini && n > 0 && <SmallSticker name="sticker-best-day" className="fs-bar-sticker-sm"/>}</span>
      <small>{dense ? (i % 5 === 4 || d.isToday ? d.label : '') : d.label}</small>
    </div>; })}</div>
    <figcaption>{label}</figcaption>
  </figure>;
}

// 小屋日记: a full-scene in-app overlay (native <dialog> in the top layer, so the
// room's own keys pause while it is open). Opens from the stats card, L, or
// `cabin:open-journal` ({ detail: { tab } }).
export default function CabinJournal() {
  const focus = useFocus();
  const [open, setOpen] = useState(false), [view, setView] = useState('overview'), ref = useRef(null), openRef = useRef(false), closingRef = useRef(false);
  openRef.current = open;
  useLetterDelivery(useFocusSessions(focus?.state?.sessions));
  // Close synchronously so an L pressed in the same frame as Esc (before React re-renders) reopens.
  const shut = () => { openRef.current = false; setOpen(false); };
  const show = (tab) => { openRef.current = true; setView(tab); setOpen(true); };
  useEffect(() => {
    const on = (event) => show(journalTab(event.detail?.tab));
    // Our own dialog may still be mid-close (exit animation / pending effect): it never blocks L.
    const key = (event) => { if (!openRef.current && isJournalKey(event) && !typing(event.target) && !document.querySelector('dialog[open]:not(.cabin-journal)') && !document.documentElement.classList.contains('room-corner-open')) { event.preventDefault(); show('overview'); } };
    window.addEventListener(JOURNAL_EVENT, on); document.addEventListener('keydown', key);
    return () => { window.removeEventListener(JOURNAL_EVENT, on); document.removeEventListener('keydown', key); };
  }, []);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (open) { if (!el.open) { if (el.showModal) el.showModal(); else el.setAttribute('open', ''); } }
    else if (el.open) { closingRef.current = true; el.close?.(); }
  }, [open]);
  if (!focus) return null;
  return <dialog ref={ref} className="cabin-journal" aria-label="小屋日记" style={journalArtStyle()} onCancel={(event) => { event.preventDefault(); shut(); }} onClose={() => { // Our own close() queues this event; if L / cabin:open-journal reopened meanwhile it must not shut again.
    if (closingRef.current) { closingRef.current = false; return; } if (openRef.current && !ref.current?.open) shut(); }}>
    {open && <JournalBook state={focus.state} now={focus.now} view={view} setView={setView} close={shut}/>}
  </dialog>;
}

// `fallback`: sprite used when the file is not there yet (e.g. art still in review).
function Sprite({ name, fallback, scale = 2, size = 64, className = '', alt = '' }) {
  return <img className={`fs-sprite ${className}`} src={sprite(name)} alt={alt} width={size * scale} height={size * scale} draggable={false}
    onError={fallback ? (e) => { const to = sprite(fallback); if (to && !e.currentTarget.src.endsWith(to)) e.currentTarget.src = to; } : undefined}/>;
}
// 16×16 sticker for narrow screens; until the -sm file exists the 32×32 one is drawn at 16 px.
const SmallSticker = ({ name, className = '' }) => <img className={`fs-sticker-sm ${className}`} src={sprite(`${name}-sm`)} alt="" width={16} height={16} draggable={false}
  onError={(e) => { const to = sprite(name); if (!e.currentTarget.src.endsWith(to)) e.currentTarget.src = to; }}/>;
function Empty({ pose = 'cat-wait', title, children, action }) {
  return <div className="fs-empty-state"><Sprite name={pose} scale={2}/><p className="fs-empty-title">{title}</p><p className="fs-empty">{children}</p>{action}</div>;
}
const Tape = ({ className = '' }) => <span className={`fs-tape ${className}`} aria-hidden="true"/>;

// One frame of a horizontal sprite strip (or the whole strip, animated by CSS), falling back
// to the placeholder in public/letters/ when the art file is missing.
export function Strip({ name, w, h, frames = 1, frame = 0, scale = 1, className = '', alt = '' }) {
  return <span className={`fs-strip ${className}`} role={alt ? 'img' : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}
    style={{ width: w * scale, height: h * scale, '--frames': frames, '--fw': `${w * scale}px` }}>
    <img src={sprite(name)} alt="" width={w * frames * scale} height={h * scale} draggable={false} style={{ transform: `translateX(${-frame * w * scale}px)` }}
      onError={(e) => { const to = LETTER_PLACEHOLDER[name]; if (to && !e.currentTarget.src.endsWith(to)) e.currentTarget.src = to; }}/></span>;
}

// 小屋来信 spot: the newest AI letter when there is one (sealed until opened; the cat walks
// it in once), else the template letter built from this week's data. The 信箱 flag is up
// while any letter is unread.
function LetterSpot({ template, reduced }) {
  const { list, unread, markRead } = useLetters();
  const [index, setIndex] = useState(0), ai = list[index] || null;
  const sealed = ai && !ai.read;
  const tone = ai && TONES.find((t) => t.id === ai.tone)?.label;
  return <section className={`fs-letter ${ai ? 'is-ai' : 'is-template'}`} aria-label="小屋来信">
    <div className="fs-letter-head"><h3 className="fs-title">小屋来信{ai ? <small> · {ai.period}{tone ? ` · ${tone}` : ''} · AI</small> : null}</h3>
      <span className={`fs-mailbox ${unread ? 'has-flag' : ''}`} data-unread={unread} title={unread ? `${unread} 封未读` : '信箱'}><Strip name="mailbox" w={32} h={32} frames={2} frame={unread ? 1 : 0} alt={unread ? `信箱：${unread} 封未读` : '信箱'}/></span>
      {list.length > 1 && <span className="fs-letter-nav"><button type="button" aria-label="更早的信" disabled={index >= list.length - 1} onClick={() => setIndex((i) => i + 1)}>‹</button><button type="button" aria-label="更新的信" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>›</button></span>}
    </div>
    {sealed ? <div className="fs-envelope">
      <Strip name="cat-deliver" w={64} h={64} frames={8} frame={reduced ? 7 : 0} className={`fs-deliver ${reduced ? '' : 'is-playing'}`}/>
      <span className="fs-envelope-art"><Strip name="letter-envelope" w={48} h={32} frames={2} frame={0} scale={2}/><Strip name="letter-seal" w={16} h={16} className="fs-seal"/></span>
      <button type="button" className="fs-cta" onClick={() => markRead(ai.id)}>小猫送来一封信 · 拆开看看</button>
    </div> : <div className={`fs-hand ${ai ? 'fs-letter-paper' : ''}`} style={ai ? { backgroundImage: `url(${sprite('letter-paper')}), url(${LETTER_PLACEHOLDER['letter-paper']})` } : undefined}>
      {ai && <Strip name="letter-envelope" w={48} h={32} frames={2} frame={1} className="fs-envelope-open"/>}
      {(ai ? ai.lines : template).map((l, i) => <p key={i}>{l}</p>)}<p className="fs-sign">—— 小屋里的猫{ai && <Strip name="letter-seal" w={16} h={16} className="fs-sign-seal"/>}</p></div>}
  </section>;
}

function useCatMood(from, to) {
  const read = () => { try { return readCatMood(globalThis.localStorage, from, to); } catch { return null; } };
  const [mood, setMood] = useState(read);
  useEffect(() => { setMood(read()); return subscribeCatMood(globalThis.window, () => setMood(read())); }, [from, to]);
  return mood;
}

function JournalBook({ state, now, view, setView, close }) {
  const sessions = useFocusSessions(state.sessions), tasks = state.tasks, reduced = useReducedMotion();
  const [range, setRange] = useState(7), [weekOffset, setWeekOffset] = useState(() => defaultWeekOffset(sessions, tasks, now)), [note, setNote] = useState('');
  const today = dayKey(now), canvas = useRef(null);
  const recent = useMemo(() => recentSummary(sessions, now, 4), [sessions, today]);
  const daily = useMemo(() => dailySeries(sessions, now, range), [sessions, today, range]);
  const year = useMemo(() => yearHeatmap(sessions, now), [sessions, today]);
  const taskRows = useMemo(() => byTask(sessions, tasks), [sessions, tasks]);
  const tod = useMemo(() => timeOfDay(sessions), [sessions]);
  const report = useMemo(() => weeklyReport(sessions, tasks, now, weekOffset), [sessions, tasks, today, weekOffset]);
  const mood = useCatMood(report.from, report.to);
  const pastWeeks = useMemo(() => Array.from({ length: 8 }, (_, i) => { const offset = -i; const w = weeklyReport(sessions, tasks, now, offset); return { offset, label: w.label, totalMinutes: w.totalMinutes, daily: w.daily }; }).reverse(), [sessions, tasks, today]);
  const weekPeak = Math.max(30, ...pastWeeks.flatMap((w) => w.daily.map((d) => d.minutes)));
  const doneTasks = tasks.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 8);
  const openTasks = tasks.filter((t) => !t.done).length;
  const weekDone = tasks.filter((t) => t.done && t.doneAt >= report.from && t.doneAt < report.to).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const taskName = (id) => tasks.find((t) => t.id === id)?.text;
  const activeDays = year.flat().filter((d) => d.minutes > 0).length, slotPeak = Math.max(1, ...tod.slots.map((s) => s.minutes)), taskPeak = Math.max(1, ...taskRows.map((r) => r.minutes));
  const pose = catPose(report.totalMinutes, mood), letter = cabinLetter(report, mood);
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
    const spriteNames = [pose, 'sticker-best-day', 'bar-books', 'bar-books-cap', mood?.feeds ? 'sticker-fed' : null];
    const [cover, ...imgs] = await Promise.all([loadCover(report.album?.cover), ...CARD_EXPORT_SLOTS.map((slot) => loadCover(JOURNAL_ART[slot])), ...spriteNames.map((n) => n ? loadCover(sprite(n)) : null)]);
    const slotImgs = imgs.slice(0, CARD_EXPORT_SLOTS.length), [cat, best, unit, cap, fed] = imgs.slice(CARD_EXPORT_SLOTS.length);
    const art = { ...cardArt(Object.fromEntries(CARD_EXPORT_SLOTS.map((slot, i) => [slot, slotImgs[i]]))), cat, bestSticker: best, barUnit: unit, barCap: cap, fedSticker: fed };
    drawWeekCard(el.getContext('2d'), report, undefined, { cover, art, letter, mood });
    const a = document.createElement('a'); a.href = el.toDataURL('image/png'); a.download = `心流小屋周报-${dayKey(report.from)}.png`; a.click(); flash('周报图片已导出');
  };
  const [coverFailed, setCoverFailed] = useState('');
  const showCover = report.album?.cover && coverFailed !== report.album.cover;
  const spine = <div className={`fs-spine ${hasArt('spine') ? 'has-art' : ''}`} aria-hidden="true"/>;
  const goal = state.settings?.dailyGoal || 0;
  return <div className={`fs-book ${reduced ? 'is-reduced' : ''}`}>
    <header className="fs-book-head">
      <h2>小屋日记</h2>
      <div className="fs-ribbons" role="tablist" aria-label="日记分区">{JOURNAL_TABS.map(([id, name]) => <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}>{name}</button>)}</div>
      <button type="button" className="fs-back" aria-keyshortcuts="Escape" onClick={close}>返回小屋</button>
    </header>
    {view === 'overview' && <div className="fs-spread" key="overview" role="tabpanel" aria-label="概览">
      <div className="fs-page is-turning fs-ov-left">
        <section className="fs-today" aria-label="今天">
          <div className="fs-today-num"><small>今天</small><strong>{formatMinutes(recent.todayMinutes)}</strong>{goal ? <small>目标 {goal} 分钟{recent.todayMinutes >= goal ? ' · 达成 ✓' : ''}</small> : null}</div>
          <div className="fs-today-num"><small>番茄</small><strong>{recent.todayPomodoros} 个</strong></div>
          <div className="fs-today-num fs-today-streak">{recent.streak >= 2 && <img className="fs-sticker" src={sprite('sticker-streak')} alt="" width={32} height={32}/>}<small>连续</small><strong>{recent.streak} 天</strong>{recent.forgiven ? <small>有 {recent.forgiven} 天被原谅了</small> : null}</div>
        </section>
        <div className="fs-section-head"><h3 className="fs-title">每天</h3><div className="fs-seg" role="group" aria-label="时间范围">{[7, 30].map((n) => <button key={n} type="button" aria-pressed={range === n} onClick={() => setRange(n)}>近 {n} 天</button>)}</div></div>
        <Bars days={daily} label={`最近 ${range} 天 · 分钟`} set="records"/>
        <figure className="fs-year stats-chart-well" aria-label={`过去一年专注热力图，有 ${activeDays} 天专注`}>
          <div className="fs-year-grid">{year.flat().map((d) => <span key={d.key} data-level={d.level} className={d.future ? 'is-future' : ''} title={`${d.key} · ${d.minutes} 分钟`}/>)}</div>
          <figcaption className="focus-heatmap-legend">过去一年 · {activeDays} 天有专注 · 少{[1, 2, 3, 4].map((l) => <span key={l} data-level={l}/>)}多</figcaption>
        </figure>
      </div>
      {spine}
      <div className="fs-page is-turning fs-ov-right">
        <h3 className="fs-title">时段</h3>
        <p className="fs-hint fs-hand">{tod.best ? `你通常在${tod.best.label}（${tod.best.from}–${tod.best.to} 点）最专注。` : '专注几次之后，这里会告诉你最顺手的时段。'}</p>
        <ol className="fs-rank fs-slots">{tod.slots.map((s) => <li key={s.id} className={tod.best?.id === s.id ? 'is-best' : ''}>
          <span className="fs-rank-name">{s.label} <small>{s.from}–{s.to} 点</small></span><span className="fs-rank-num">{formatMinutes(s.minutes)}</span>
          <span className="fs-meter" aria-hidden="true"><i style={{ width: `${s.minutes / slotPeak * 100}%` }}/></span></li>)}</ol>
        <h3 className="fs-title">最近的专注</h3>
        {recent.recent.length ? <ol className="fs-sessions">{recent.recent.map((s) => <li key={s.id}>
          <span className="fs-time">{clock(s.start)}</span><span className="fs-task">{taskName(s.taskId) || s.taskText || '自由专注'}{s.album ? <small> · 《{s.album.title}》</small> : null}</span>
          <span className="fs-min">{Math.round(s.durationMs / 60000)} 分{s.completed ? '' : ' · 提前结束'}</span></li>)}</ol>
          : <Empty title="还没有专注记录">开一个番茄，小屋会帮你记下来。</Empty>}
      </div>
    </div>}
    {view === 'tasks' && <div className="fs-spread" key="tasks" role="tabpanel" aria-label="待办"><div className="fs-page is-turning fs-tasks-left">
      <h3 className="fs-title">时间花在哪里</h3>
      {taskRows.length ? <ol className="fs-rank fs-task-rank">{taskRows.map((r, i) => <li key={r.id || 'free'} className={`${r.free ? 'is-free' : ''} ${i === 0 ? 'is-best' : ''}`}>
        <span className="fs-rank-name"><b className="fs-rank-no">{i + 1}</b>{r.name}{r.done ? <small> · 已完成</small> : null}</span><span className="fs-rank-num">{formatMinutes(r.minutes)} · {r.pomodoros} 个番茄</span>
        <span className="fs-meter" aria-hidden="true"><i style={{ width: `${r.minutes / taskPeak * 100}%` }}/></span></li>)}</ol>
        : <Empty pose="cat-wait" title="还没有按待办记下的专注" action={<button type="button" className="fs-cta" onClick={close}>回小屋写一条待办</button>}>在「待办」里选一件事再开番茄，这一页就会告诉你时间都花在了哪里。</Empty>}
      {taskRows.some((r) => !r.free) && <figure className="fs-task-note"><Sprite name="cat-desk" scale={2}/><figcaption className="fs-hand">{(() => { const top = taskRows.find((r) => !r.free); const all = taskRows.reduce((n, r) => n + r.minutes, 0); return <>你最常陪伴的是「{top.name}」，<br/>占了全部专注的 {Math.round(top.minutes / Math.max(1, all) * 100)}%。<br/>{openTasks ? `还有 ${openTasks} 件在路上，慢慢来。` : '手头的事都做完了，休息一下吧。'}</>; })()}</figcaption></figure>}
    </div>{spine}<div className="fs-page is-turning fs-tasks-right">
      <h3 className="fs-title">做完的事 {doneTasks.length ? <small>· {tasks.filter((t) => t.done).length} 件{openTasks ? ` · 还有 ${openTasks} 件在路上` : ''}</small> : null}</h3>
      {doneTasks.length > 0 && <ul className="fs-notes">{doneTasks.map((t, i) => <li key={t.id} className="fs-note" style={{ '--tilt': `${[-2, 1.5, -1, 2, 0, -1.5][i % 6]}deg` }}>
        <Tape className="is-note"/><span className="fs-note-check" aria-hidden="true">✓</span><span className="fs-note-text">{t.text}</span>
        <small>{t.doneAt ? clock(t.doneAt).split(' ')[0] : ''} · {formatMinutes(taskRows.find((r) => r.id === t.id)?.minutes || 0)}</small></li>)}</ul>}
      {doneTasks.length < 3 && <figure className={`fs-todo-empty ${doneTasks.length ? 'is-under' : ''}`}><Sprite name="todo-empty" fallback="cat-wait" scale={2}/>
        <figcaption><p className="fs-empty-title fs-hand">慢慢来，写下第一件事吧</p>
          <p className="fs-empty">{doneTasks.length ? `已经贴上 ${doneTasks.length} 张便签了。每勾掉一条待办，这一页就多一张。` : '每勾掉一条待办，就会在这一页贴一张便签。'}{openTasks ? ` 现在还有 ${openTasks} 件在路上。` : ''}</p>
          {!openTasks && <button type="button" className="fs-cta" onClick={close}>回小屋写一条待办</button>}</figcaption></figure>}
    </div></div>}
    {view === 'weekly' && <div className="fs-spread" key="weekly" role="tabpanel" aria-label="周报"><div className="fs-page is-turning fs-week-left">
      <article className={`fs-card ${hasArt('card') ? 'has-stamp' : ''} ${hasArt('cardTape') ? 'has-tape' : ''}`} aria-label="周报卡片">
        <Tape className="is-card"/>
        {hasArt('card') && <span className="fs-stamp" aria-hidden="true"/>}
        <header><span>心流小屋 · 周报</span><small>{report.label}</small></header>
        <div className="fs-card-hero">
          <figure className={`fs-cat is-${pose}`}><Sprite name={pose} scale={2} alt={`小猫${CAT_POSE_CAPTION[pose]}`}/><figcaption>{CAT_POSE_CAPTION[pose]}</figcaption></figure>
          <div className="fs-card-total"><small>{weekName(weekOffset)}专注</small><strong>{formatMinutes(report.totalMinutes)}</strong>
            <small className={report.deltaMinutes >= 0 ? 'is-up' : ''}>{report.deltaMinutes === 0 ? '与上周持平' : `${report.deltaMinutes > 0 ? '比上周多' : '比上周少'} ${formatMinutes(Math.abs(report.deltaMinutes))}`} · {report.pomodoros} 个番茄</small>
            <p className="fs-card-summary fs-hand">{report.summary}</p></div>
        </div>
        <Bars days={report.daily} best={report.bestDay} set="books" label="这一周 · 分钟"/>
      </article>
    </div>{spine}<div className="fs-page is-turning fs-week-right">
      <div className="fs-weekpick" role="group" aria-label="选择周">
        <button type="button" aria-label="上一周" onClick={() => setWeekOffset((w) => w - 1)}>‹</button>
        <strong>{weekName(weekOffset)} · {report.label}</strong>
        <button type="button" aria-label="下一周" disabled={weekOffset >= 0} onClick={() => setWeekOffset((w) => Math.min(0, w + 1))}>›</button>
      </div>
      <LetterSpot template={letter} reduced={reduced}/>
      <div className="fs-board">
        <figure className="fs-polaroid" style={{ '--tilt': '-3deg' }}><Tape className="is-polaroid"/>
          {report.album ? (showCover ? <img className="fs-card-cover" src={report.album.cover} alt="" width={96} height={96} onError={() => setCoverFailed(report.album.cover)}/> : <span className="fs-cover-ph" aria-hidden="true"/>) : <span className="fs-cover-ph is-empty" aria-hidden="true"/>}
          <figcaption className="fs-hand">{report.album ? `《${report.album.title}》` : '这周还没放唱片'}{report.album?.artist ? <small>{report.album.artist}</small> : null}</figcaption></figure>
        <ul className="fs-notes is-mini" aria-label="这周做完的事">{weekDone.length ? weekDone.slice(0, 3).map((t, i) => <li key={t.id} className="fs-note" style={{ '--tilt': `${[2, -1.5, 1][i]}deg` }}><span className="fs-note-check" aria-hidden="true">✓</span><span className="fs-note-text">{t.text}</span></li>)
          : <li className="fs-note is-blank" style={{ '--tilt': '1.5deg' }}><span className="fs-note-text">这周还没勾掉待办，也没关系。</span></li>}
          {weekDone.length > 3 && <li className="fs-note-more">还有 {weekDone.length - 3} 件</li>}</ul>
        {mood && <figure className="fs-mood" aria-label="小猫心情"><Sprite name={mood.tier === 'droopy' ? 'cat-droopy' : mood.tier === 'happy' ? 'cat-rub' : 'cat-wait'} scale={1}/>{mood.feeds > 0 && <img className="fs-sticker" src={sprite('sticker-fed')} alt="" width={32} height={32}/>}
          <figcaption className="fs-hand">{mood.feeds > 0 ? `喂了 ${mood.feeds} 次` : '还没喂过'}{mood.label ? <small>{mood.label}</small> : null}</figcaption></figure>}
      </div>
      <ol className="fs-weeks" aria-label="最近几周">{pastWeeks.map((w) => <li key={w.offset}><button type="button" aria-pressed={w.offset === weekOffset} aria-label={`${w.label} · ${formatMinutes(w.totalMinutes)}`} title={`${w.label} · ${formatMinutes(w.totalMinutes)}`} onClick={() => setWeekOffset(w.offset)}>
        <span className="fs-weeks-bars" aria-hidden="true">{w.daily.map((d) => <i key={d.key} style={{ height: `${d.minutes ? Math.max(2, Math.round(d.minutes / weekPeak * 24 / 2) * 2) : 1}px` }}/>)}</span>
        <small>{w.offset === 0 ? '本周' : w.label.split(' – ')[0]}</small></button></li>)}</ol>
      <div className="fs-actions"><button type="button" onClick={copy}>复制文字</button><button type="button" onClick={exportPng}>导出图片</button><span role="status" aria-live="polite">{note}</span></div>
      <canvas ref={canvas} hidden/>
    </div></div>}
  </div>;
}
