import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFocus } from '../useFocus';
import useReducedMotion from '../../useReducedMotion';
import useFocusSessions from './useFocusSessions.js';
import { recentSummary, dailySeries, byTask, timeOfDay, weeklyReport, reportMarkdown, formatMinutes, dayKey, distractionSummary } from './stats-model.mjs';
import { WEEK_DAYS_HINT, levelInfo } from '../focus-model.mjs';
import { drawCollectionCard, canDrawCover, CARD_W, CARD_H } from './week-card.mjs';
import { JOURNAL_EVENT, JOURNAL_TABS, journalTab, isJournalKey } from './journal-events.mjs';
import './focus-stats.css';
import { downloadBlob } from '../../lib/download.mjs';
import './journal-art.css';
import './record-diary.css';
import { journalArtStyle, hasArt, JOURNAL_ART, CARD_EXPORT_SLOTS, cardArt, sprite, LETTER_PLACEHOLDER } from './journal-art.mjs';
import { defaultWeekOffset, weekName, catPose, CAT_POSE_CAPTION, barUnits, cabinLetter } from './journal-layout.mjs';
import { readCatMood, subscribeCatMood } from './cat-mood-source.mjs';
import { useLetters, useLetterDelivery } from '../../ai/useCabinLetters.js';
import { TONES } from '../../ai/ai-model.mjs';
import Mailbox from './Mailbox.jsx';
import JournalEntries, { useJournalDraftWarning } from './JournalEntries.jsx';
import useInputStats from '../../desktop/useInputStats';
import '../../study/study.css';
import useLabs from '../../product/useLabs.js';
import { JOURNAL_CHANGE, JOURNAL_KEY, readJournalRecords } from '../journal-entries.mjs';
import { weekDiary, weeklyCollection, collectionMarkdown, yearWall, wallColour, wallSummary, topRecords, FREE_INTENT } from './record-diary.mjs';
import { Sleeve } from '../PressCard';
import { readCoverPixels } from '../../album-wall-canvas.mjs';
import { dominantColour } from '../../cover-colour.mjs';
import { DEFAULT_RECORD_STYLE } from '../../record-library.mjs';

const clock = (t) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const typing = (el) => el?.closest?.('input,textarea,select,[contenteditable="true"]');
const count = (value) => Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0;
const countText = (value) => count(value).toLocaleString('zh-CN');
const hasInput = (input) => Boolean(input && (
  count(input.today?.keyboard) || count(input.today?.click) || count(input.streak)
  || (Array.isArray(input.week) && input.week.some((day) => count(day?.keyboard) || count(day?.click)))
));
const inputLine = (input) => {
  const keyboard = count(input?.today?.keyboard), click = count(input?.today?.click);
  if (!keyboard && !click) return '';
  const parts = [];
  if (keyboard) parts.push(`敲了 ${countText(keyboard)} 次键盘`);
  if (click) parts.push(`点了 ${countText(click)} 次鼠标`);
  return `今天你${parts.join('、')}，奶糖都在旁边。`;
};

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];
const dayLabel = (key) => {
  const date = new Date(`${key}T00:00:00`);
  return Number.isNaN(date.getTime()) ? key.slice(-2) : WEEKDAY[date.getDay()];
};

export function InputWeekChart({ week = [] }) {
  const days = (Array.isArray(week) ? week : []).slice(-7);
  if (!days.length) return null;
  const peak = Math.max(1, ...days.flatMap((day) => [count(day?.keyboard), count(day?.click)]));
  const height = (value) => value ? Math.max(4, Math.round(Math.sqrt(value / peak) * 100)) : 0;
  return <figure className="fs-input-week" aria-label="最近 7 天键盘与点击次数">
    <div className="fs-input-week-row">{days.map((day, index) => {
      const keyboard = count(day?.keyboard), click = count(day?.click);
      return <div key={`${day?.key || index}`} className="fs-input-day" title={`${day?.key || '今天'} · 键盘 ${countText(keyboard)} 次 · 点击 ${countText(click)} 次`}>
        <span className="fs-input-day-bars" aria-hidden="true">
          <i className="is-keyboard" style={{ height: `${height(keyboard)}%` }}/>
          <i className="is-click" style={{ height: `${height(click)}%` }}/>
        </span>
        <small>{day?.key ? dayLabel(day.key) : ''}</small>
      </div>;
    })}</div>
    <figcaption><span><i className="is-keyboard"/>键盘</span><span><i className="is-click"/>点击</span><span className="fs-input-week-caption">最近 7 天</span></figcaption>
  </figure>;
}

export function InputCompanion({ input, title = '今天的陪伴' }) {
  const ready = hasInput(input);
  const keyboard = count(input?.today?.keyboard), click = count(input?.today?.click);
  return <section className={`fs-input-companion ${ready ? '' : 'is-empty'}`} aria-label={title}>
    <header className="fs-input-head"><strong>{title}</strong><small>{ready && input?.streak ? `连续 ${countText(input.streak)} 天` : '本地统计'}</small></header>
    {ready ? <>
      <dl className="fs-input-today">
        <div><dt>键盘</dt><dd>{countText(keyboard)}<small> 次</small></dd></div>
        <div><dt>点击</dt><dd>{countText(click)}<small> 次</small></dd></div>
        <div><dt>连续</dt><dd>{countText(input?.streak)}<small> 天</small></dd></div>
      </dl>
      <InputWeekChart week={input?.week}/>
    </> : <p className="fs-input-empty">开启键鼠陪伴后，这里会亮起来。</p>}
    <p className="fs-input-privacy">只统计次数，不记录内容。</p>
  </section>;
}

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

// 唱片日记 (3.0, formerly 小屋日记): a full-scene in-app overlay (native <dialog> in the top
// layer, so the room's own keys pause while it is open). Opens from L, the top nav 「日记」,
// or `cabin:open-journal` ({ detail: { tab } }); the default page is 这一周.
export default function CabinJournal() {
  const focus = useFocus();
  useJournalDraftWarning();
  const [open, setOpen] = useState(false), [view, setView] = useState('week'), ref = useRef(null), openRef = useRef(false), closingRef = useRef(false);
  openRef.current = open;
  useLetterDelivery(useFocusSessions(focus?.state?.sessions), focus?.state?.notes || '');
  // Close synchronously so an L pressed in the same frame as Esc (before React re-renders) reopens.
  const shut = () => { openRef.current = false; setOpen(false); };
  const show = (tab) => { openRef.current = true; setView(tab); setOpen(true); };
  useEffect(() => {
    const on = (event) => show(journalTab(event.detail?.tab));
    // Our own dialog may still be mid-close (exit animation / pending effect): it never blocks L.
    const key = (event) => { if (!openRef.current && isJournalKey(event) && !typing(event.target) && !document.querySelector('dialog[open]:not(.cabin-journal)') && !document.documentElement.classList.contains('room-corner-open')) { event.preventDefault(); show('week'); } };
    window.addEventListener(JOURNAL_EVENT, on); document.addEventListener('keydown', key);
    return () => { window.removeEventListener(JOURNAL_EVENT, on); document.removeEventListener('keydown', key); };
  }, []);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (open) { if (!el.open) { if (el.showModal) el.showModal(); else el.setAttribute('open', ''); } }
    else if (el.open) { closingRef.current = true; el.close?.(); }
  }, [open]);
  if (!focus) return null;
  return <dialog ref={ref} className="cabin-journal" aria-label="唱片日记" style={journalArtStyle()} onCancel={(event) => { event.preventDefault(); shut(); }} onClose={() => { // Our own close() queues this event; if L / cabin:open-journal reopened meanwhile it must not shut again.
    if (closingRef.current) { closingRef.current = false; return; } if (openRef.current && !ref.current?.open) shut(); }}>
    {open && <JournalBook state={focus.state} now={focus.now} view={view} setView={setView} close={shut}/>}
  </dialog>;
}

// `fallback`: sprite used when the file is not there yet (e.g. art still in review).
function Sprite({ name, fallback, scale = 2, size = 64, className = '', alt = '' }) {
  const source = sprite(name), [readyFor, setReadyFor] = useState('');
  return <img className={`fs-sprite ${className}`} src={source} alt={alt} width={size * scale} height={size * scale} draggable={false} style={{ visibility: readyFor === source ? 'visible' : 'hidden' }} onLoad={() => setReadyFor(source)}
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

// 小屋来信 spot (lab): the newest AI letter when there is one (sealed until opened; the cat
// walks it in once), else the template letter built from this week's data.
function LetterSpot({ template, reduced, input }) {
  const { list, unread, markRead } = useLetters();
  const incoming = useMemo(() => list.filter((letter) => letter.direction === 'in' && !letter.replyTo && letter.status !== 'draft' && !letter.trashed), [list]);
  const [index, setIndex] = useState(0), ai = incoming[index] || null;
  const sealed = ai && !ai.read;
  const tone = ai && TONES.find((t) => t.id === ai.tone)?.label;
  const companionLine = ai?.evidence?.find((item) => item.kind === 'input')?.text || inputLine(input);
  return <section className={`fs-letter ${ai ? 'is-ai' : 'is-template'}`} aria-label="小屋来信">
    <div className="fs-letter-head"><h3 className="fs-title">小屋来信{ai ? <small> · {ai.period}{tone ? ` · ${tone}` : ''}{ai.source === 'ai' ? ' · AI' : ''}</small> : null}</h3>
      <span className={`fs-mailbox ${unread ? 'has-flag' : ''}`} data-unread={unread} title={unread ? `${unread} 封未读` : '信箱'}><Strip name="mailbox" w={32} h={32} frames={2} frame={unread ? 1 : 0} alt={unread ? `信箱：${unread} 封未读` : '信箱'}/></span>
      {incoming.length > 1 && <span className="fs-letter-nav"><button type="button" aria-label="更早的信" disabled={index >= incoming.length - 1} onClick={() => setIndex((i) => i + 1)}>‹</button><button type="button" aria-label="更新的信" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>›</button></span>}
    </div>
    {companionLine && <p className="fs-input-letter-line"><span>键鼠陪伴</span>{companionLine}</p>}
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
// 手记 / 随手记 entries, live: they appear in 这一周 as 「文字」 items.
function useJournalTexts() {
  const read = () => { try { return readJournalRecords(globalThis.localStorage); } catch { return []; } };
  const [entries, setEntries] = useState(read);
  useEffect(() => {
    const reload = () => setEntries(read()), sync = (event) => { if (event.key === JOURNAL_KEY) reload(); };
    window.addEventListener(JOURNAL_CHANGE, reload); window.addEventListener('storage', sync);
    return () => { window.removeEventListener(JOURNAL_CHANGE, reload); window.removeEventListener('storage', sync); };
  }, []);
  return entries;
}
// Dominant colour of each cover thumbnail (cached per window); the reader's default colour means "unknown".
const colourCache = new Map();
function useCoverColours(covers) {
  const key = covers.join('\n'), [colours, setColours] = useState(() => new Map(covers.filter((c) => colourCache.has(c)).map((c) => [c, colourCache.get(c)])));
  useEffect(() => {
    let alive = true;
    const missing = covers.filter((cover) => cover && !colourCache.has(cover));
    if (!missing.length) { setColours(new Map(covers.map((c) => [c, colourCache.get(c)]))); return undefined; }
    Promise.all(missing.map(async (cover) => { try { const pixels = await readCoverPixels(cover); colourCache.set(cover, pixels ? dominantColour(pixels) : DEFAULT_RECORD_STYLE.base); } catch { colourCache.set(cover, DEFAULT_RECORD_STYLE.base); } }))
      .then(() => { if (alive) setColours(new Map(covers.map((c) => [c, colourCache.get(c)]))); });
    return () => { alive = false; };
  }, [key]);
  return colours;
}

const MINUTE = 60000;
function RecordRow({ item, selected, onSelect }) {
  if (item.kind === 'text') return <li className={`rd-item is-text ${selected ? 'is-selected' : ''}`}><button type="button" aria-pressed={selected} onClick={onSelect}>
    <span className="rd-text-mark" aria-hidden="true">文</span>
    <span className="rd-item-copy"><strong><em className="rd-badge">文字 · {item.label}</em>{item.snippet}</strong><small>{item.time}</small></span></button></li>;
  return <li className={`rd-item is-record ${selected ? 'is-selected' : ''}`}><button type="button" aria-pressed={selected} onClick={onSelect}>
    <Sleeve cover={item.cover} title={item.album?.title || ''} artist={item.album?.artist || ''} size="sm"/>
    <span className="rd-item-copy"><strong>{item.intent || FREE_INTENT}</strong>{item.note && <span className="rd-note">「{item.note}」</span>}
      <small>{formatMinutes(item.minutes)} · {item.time}{item.album?.title ? ` · 《${item.album.title}》` : ''}</small></span></button></li>;
}
function ItemDetail({ item }) {
  if (!item) return <Empty pose="cat-wait" title="这一周的唱片会放在这里">开始一段专注，结束时它会压成一张唱片，收进这一页。</Empty>;
  if (item.kind === 'text') return <article className="rd-detail is-text" aria-label="文字详情">
    <p className="rd-detail-kicker">文字 · {item.label} · {clock(item.at)}</p>
    <div className="rd-detail-body fs-hand">{item.body.split('\n').map((line, i) => <p key={i}>{line || ' '}</p>)}</div>
    {item.tags.length > 0 && <p className="rd-detail-tags">{item.tags.map((tag) => `#${tag}`).join(' ')}</p>}
  </article>;
  return <article className="rd-detail is-record" aria-label="唱片详情">
    <Sleeve cover={item.cover} title={item.album?.title || ''} artist={item.album?.artist || ''} size="lg" spinning/>
    <p className="rd-detail-kicker">{clock(item.start)} · {item.slot}</p>
    <h3 className="rd-detail-title">{item.intent || FREE_INTENT}</h3>
    <dl className="rd-detail-facts">
      <div><dt>时长</dt><dd>{formatMinutes(item.minutes)}</dd></div>
      <div><dt>时段</dt><dd>{item.slot} {item.time}</dd></div>
      <div><dt>唱片</dt><dd>{item.album?.title ? `《${item.album.title}》${item.album.artist ? ` · ${item.album.artist}` : ''}` : '没有放唱片'}</dd></div>
      {item.track?.title && <div><dt>那时在放</dt><dd>{item.track.title}</dd></div>}
    </dl>
    {item.note ? <blockquote className="rd-detail-note fs-hand">「{item.note}」</blockquote> : <p className="rd-detail-quiet">这一段没有留话。</p>}
  </article>;
}

function WeekView({ sessions, entries, tasks, now, spine }) {
  const [offset, setOffset] = useState(0), today = dayKey(now);
  const week = useMemo(() => weekDiary(sessions, entries, now, { weekOffset: offset, tasks }), [sessions, entries, tasks, today, offset]);
  const all = week.days.flatMap((day) => day.items), [selected, setSelected] = useState('');
  const current = all.find((item) => item.id === selected) || [...all].reverse().find((item) => item.kind === 'record') || all.at(-1) || null;
  const shown = week.days.filter((day) => !day.future || day.items.length);
  // Later in the week, open on today rather than on Monday.
  const list = useRef(null);
  useEffect(() => {
    // After the dialog is shown (its own effect runs after ours), so the page has a layout.
    const frame = requestAnimationFrame(() => { const day = list.current?.querySelector('.rd-day.is-today'), page = list.current?.closest('.fs-page'); if (day && page && offset === 0 && day !== list.current.firstElementChild) page.scrollTop += day.getBoundingClientRect().top - page.getBoundingClientRect().top - 12; });
    return () => cancelAnimationFrame(frame);
  }, [offset]);
  return <div className="fs-spread rd-week" key="week" role="tabpanel" aria-label="这一周">
    <div className="fs-page is-turning rd-week-left">
      <div className="fs-weekpick rd-weekpick" role="group" aria-label="选择周">
        <button type="button" aria-label="上一周" onClick={() => setOffset((w) => w - 1)}>‹</button>
        <strong>{weekName(offset)} · {week.label}</strong>
        <button type="button" aria-label="下一周" disabled={offset >= 0} onClick={() => setOffset((w) => Math.min(0, w + 1))}>›</button>
      </div>
      <p className="rd-week-sum" title={WEEK_DAYS_HINT}>{offset === 0 ? '本周来了' : '那周来了'} <b>{week.weekDays}</b> 天 · 压制 <b>{week.records}</b> 张唱片 · 专注 <b>{formatMinutes(week.totalMinutes)}</b></p>
      <ol className="rd-days" ref={list}>{shown.map((day) => <li key={day.key} className={`rd-day ${day.isToday ? 'is-today' : ''} ${day.items.length ? '' : 'is-quiet'}`}>
        <h4 className="rd-day-head"><span>{day.label}</span><small>{day.date}{day.isToday ? ' · 今天' : ''}</small>{day.minutes > 0 && <small className="rd-day-min">{formatMinutes(day.minutes)}</small>}</h4>
        {day.items.length ? <ul className="rd-items">{day.items.map((item) => <RecordRow key={`${item.kind}-${item.id}`} item={item} selected={current?.id === item.id} onSelect={() => { setSelected(item.id); if (window.matchMedia?.('(max-width: 760px)').matches) requestAnimationFrame(() => document.querySelector('.rd-week-right')?.scrollIntoView({ block: 'start', behavior: 'smooth' })); }}/>)}</ul>
          : <p className="rd-day-quiet">{day.isToday ? '今天还没压唱片，放一张开始吧。' : '安静的一天。'}</p>}
      </li>)}</ol>
    </div>
    {spine}
    <div className="fs-page is-turning rd-week-right"><ItemDetail item={current}/></div>
  </div>;
}

function CollectionView({ sessions, entries, tasks, now, labs, input, reduced, spine, flash, note }) {
  const today = dayKey(now), canvas = useRef(null);
  const [weekOffset, setWeekOffset] = useState(() => defaultWeekOffset(sessions, tasks, now));
  const collection = useMemo(() => weeklyCollection(sessions, entries, now, { weekOffset, tasks }), [sessions, entries, tasks, today, weekOffset]);
  const report = useMemo(() => weeklyReport(sessions, tasks, now, weekOffset), [sessions, tasks, today, weekOffset]);
  const mood = useCatMood(report.from, report.to), pose = catPose(report.totalMinutes, mood), letter = cabinLetter(report, mood);
  const pastWeeks = useMemo(() => Array.from({ length: 8 }, (_, i) => { const offset = -i; const w = weeklyReport(sessions, tasks, now, offset); return { offset, label: w.label, totalMinutes: w.totalMinutes, daily: w.daily }; }).reverse(), [sessions, tasks, today]);
  const weekPeak = Math.max(30, ...pastWeeks.flatMap((w) => w.daily.map((d) => d.minutes)));
  const weekDone = tasks.filter((t) => t.done && t.doneAt >= report.from && t.doneAt < report.to).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const copy = async () => {
    const text = `${reportMarkdown(report)}\n\n${collectionMarkdown(collection)}`;
    try { await navigator.clipboard.writeText(text); } catch { const area = document.createElement('textarea'); area.value = text; document.body.append(area); area.select(); document.execCommand?.('copy'); area.remove(); }
    flash('已复制本周合集的文字');
  };
  const loadImage = (url) => new Promise((resolve) => {
    if (!canDrawCover(url, location.origin)) return resolve(null);
    const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = url;
  });
  const exportPng = async () => {
    const el = canvas.current || document.createElement('canvas'); el.width = CARD_W; el.height = CARD_H;
    const [covers, slots] = await Promise.all([Promise.all(collection.top.map((r) => loadImage(r.cover))), Promise.all(CARD_EXPORT_SLOTS.map((slot) => loadImage(JOURNAL_ART[slot])))]);
    const art = cardArt(Object.fromEntries(CARD_EXPORT_SLOTS.map((slot, i) => [slot, slots[i]])));
    drawCollectionCard(el.getContext('2d'), collection, undefined, { covers, art });
    const blob = await new Promise(resolve => el.toBlob(resolve, 'image/png'));
    if (!blob) { flash('无法生成本周合集图片，请重试'); return; }
    const saved = await downloadBlob(blob, `心流小屋本周合集-${dayKey(collection.from)}.png`);
    if (!saved?.cancelled && !saved?.failed) flash('本周合集图片已导出');
  };
  return <div className="fs-spread rd-collection" key="collection" role="tabpanel" aria-label="本周合集"><div className="fs-page is-turning fs-week-left rd-collection-left">
    <article className={`fs-card rd-card ${hasArt('card') ? 'has-stamp' : ''} ${hasArt('cardTape') ? 'has-tape' : ''}`} aria-label="本周合集卡片">
      <Tape className="is-card"/>
      {hasArt('card') && <span className="fs-stamp" aria-hidden="true"/>}
      <header><span>心流小屋 · 本周合集</span><small>{collection.label}</small></header>
      <div className="fs-card-hero">
        <figure className={`fs-cat is-${pose}`}><Sprite name={pose} scale={2} alt={`小猫${CAT_POSE_CAPTION[pose]}`}/><figcaption>{CAT_POSE_CAPTION[pose]}</figcaption></figure>
        <div className="fs-card-total"><small>{weekName(weekOffset)}专注</small><strong>{formatMinutes(collection.totalMinutes)}</strong>
          <small>{weekOffset === 0 ? '本周来了' : '那周来了'} {collection.daysVisited} 天 · 压制 {collection.records} 张唱片</small>
          <ol className="rd-dots" aria-label={`${collection.daysVisited} 天来过小屋`}>{collection.days.map((d) => <li key={d.key} className={`${d.visited ? 'is-visited' : ''} ${d.isToday ? 'is-today' : ''}`} title={`周${d.label}${d.visited ? ' · 来过' : ''}`}><span aria-hidden="true"/><small>{d.label}</small></li>)}</ol></div>
      </div>
      <h3 className="fs-title">陪你最久的唱片</h3>
      {collection.top.length ? <ol className="rd-top">{collection.top.map((r, i) => <li key={r.key}><Sleeve cover={r.cover} title={r.title} artist={r.artist}/><span className="rd-top-copy"><strong>{i + 1}. 《{r.title}》</strong><small>{[r.artist, `陪你 ${formatMinutes(r.minutes)}`].filter(Boolean).join(' · ')}</small></span></li>)}</ol>
        : <p className="fs-hint fs-hand">这周还没有唱片陪着专注。放一张喜欢的，再开始一段吧。</p>}
      <h3 className="fs-title">你写下的话</h3>
      {collection.notes.length ? <ul className="rd-notes">{collection.notes.slice(0, 4).map((n) => <li key={n.id} className="fs-hand">「{n.text}」{n.intent ? <small> · {n.intent}</small> : null}</li>)}{collection.notes.length > 4 && <li className="rd-notes-more">还有 {collection.notes.length - 4} 句</li>}</ul>
        : <p className="fs-hint fs-hand">这周没有留话，也没关系。</p>}
      <p className="fs-card-summary fs-hand rd-card-line">{collection.line}</p>
    </article>
  </div>{spine}<div className="fs-page is-turning fs-week-right rd-collection-right">
    <div className="fs-weekpick" role="group" aria-label="选择周">
      <button type="button" aria-label="上一周" onClick={() => setWeekOffset((w) => w - 1)}>‹</button>
      <strong>{weekName(weekOffset)} · {collection.label}</strong>
      <button type="button" aria-label="下一周" disabled={weekOffset >= 0} onClick={() => setWeekOffset((w) => Math.min(0, w + 1))}>›</button>
    </div>
    <ol className="fs-weeks" aria-label="最近几周">{pastWeeks.map((w) => <li key={w.offset}><button type="button" aria-pressed={w.offset === weekOffset} aria-label={`${w.label} · ${formatMinutes(w.totalMinutes)}`} title={`${w.label} · ${formatMinutes(w.totalMinutes)}`} onClick={() => setWeekOffset(w.offset)}>
      <span className="fs-weeks-bars" aria-hidden="true">{w.daily.map((d) => <i key={d.key} style={{ height: `${d.minutes ? Math.max(2, Math.round(d.minutes / weekPeak * 24 / 2) * 2) : 1}px` }}/>)}</span>
      <small>{w.offset === 0 ? '本周' : w.label.split(' – ')[0]}</small></button></li>)}</ol>
    <p className="fs-hint fs-hand">{report.summary}</p>
    <Bars days={report.daily} best={report.bestDay} set="books" mini label="这一周 · 每天的分钟"/>
    <ul className="fs-notes is-mini" aria-label="这周做完的事">{weekDone.length ? weekDone.slice(0, 3).map((t, i) => <li key={t.id} className="fs-note" style={{ '--tilt': `${[2, -1.5, 1][i]}deg` }}><span className="fs-note-check" aria-hidden="true">✓</span><span className="fs-note-text">{t.text}</span></li>)
      : <li className="fs-note is-blank" style={{ '--tilt': '1.5deg' }}><span className="fs-note-text">做完的一件小事，会成为这里的一张便签。</span></li>}
      {weekDone.length > 3 && <li className="fs-note-more">还有 {weekDone.length - 3} 件</li>}</ul>
    {labs.letters && <LetterSpot template={letter} reduced={reduced} input={weekOffset === 0 ? input : null}/>}
    <div className="fs-actions"><button type="button" onClick={copy}>复制文字</button><button type="button" onClick={exportPng}>导出图片</button><span role="status" aria-live="polite">{note}</span></div>
    <canvas ref={canvas} hidden/>
  </div></div>;
}

function WallView({ sessions, now }) {
  const today = dayKey(now), cols = useMemo(() => yearWall(sessions, now), [sessions, today]), cells = cols.flat();
  const covers = useMemo(() => [...new Set(cells.map((cell) => cell.top?.cover).filter(Boolean))], [cols]);
  const colours = useCoverColours(covers), summary = wallSummary(cols), [picked, setPicked] = useState('');
  const yearTop = useMemo(() => { const from = new Date(`${cells[0].key}T00:00:00`).getTime(); return topRecords(sessions.filter((s) => s.end >= from), 3); }, [sessions, today]);
  // On a narrow window the wall scrolls sideways: start at the recent end.
  const wall = useRef(null);
  useEffect(() => { const frame = requestAnimationFrame(() => { if (wall.current) wall.current.scrollLeft = wall.current.scrollWidth; }); return () => cancelAnimationFrame(frame); }, []);
  const cell = cells.find((c) => c.key === picked) || [...cells].reverse().find((c) => c.minutes > 0 && !c.future) || null;
  return <div className="fs-spread rd-wall" key="wall" role="tabpanel" aria-label="一年唱片墙"><div className="fs-page is-turning rd-wall-page">
    <h3 className="fs-title">一年唱片墙 <small>· 每天一格，用那天陪你最久的唱片上色</small></h3>
    {summary.days > 0 ? <figure ref={wall} className="fs-year rd-wall-figure stats-chart-well" aria-label={`过去一年 ${summary.days} 天有专注，其中 ${summary.withRecord} 天有唱片陪着`}>
      <div className="fs-year-grid rd-wall-grid">{cells.map((c) => { const colour = wallColour(c, colours, DEFAULT_RECORD_STYLE.base); return <button type="button" key={c.key} data-level={c.level} className={`${c.future ? 'is-future' : ''} ${colour ? 'has-cover' : ''} ${cell?.key === c.key ? 'is-picked' : ''}`} style={colour ? { '--cell': colour } : undefined} tabIndex={c.minutes ? 0 : -1} disabled={c.future} aria-label={`${c.key} · ${c.minutes} 分钟${c.top ? ` · 《${c.top.title}》` : ''}`} title={`${c.key} · ${c.minutes} 分钟${c.top ? ` · 《${c.top.title}》` : ''}`} onClick={() => setPicked(c.key)}/>; })}</div>
      <figcaption className="focus-heatmap-legend">过去一年 · {summary.days} 天有专注 · 唱片的颜色来自封面；没有封面时：少{[1, 2, 3, 4].map((l) => <span key={l} data-level={l}/>)}多</figcaption>
    </figure> : <Empty title="每一段，都会在这面墙上留一格颜色">开始一段专注，墙上就会亮起今天这一格。</Empty>}
    {cell && <p className="rd-wall-day fs-hand">{cell.key} · 专注 {formatMinutes(cell.minutes)}{cell.top ? ` · 陪着你的是《${cell.top.title}》` : ''}</p>}
    <div className="rd-wall-lower"><section className="rd-wall-side" aria-label="这一年">
    <dl className="rd-wall-facts"><div><dt>有专注的日子</dt><dd>{summary.days} 天</dd></div><div><dt>有唱片陪着</dt><dd>{summary.withRecord} 天</dd></div><div><dt>一共</dt><dd>{formatMinutes(summary.minutes)}</dd></div></dl>
    </section><section className="rd-wall-side" aria-label="这一年陪你最久的唱片">
    <h3 className="fs-title">这一年陪你最久的唱片</h3>
    {yearTop.length ? <ol className="rd-top is-year">{yearTop.map((r, i) => <li key={r.key}><Sleeve cover={r.cover} title={r.title} artist={r.artist}/><span className="rd-top-copy"><strong>{i + 1}. 《{r.title}》</strong><small>{[r.artist, `陪你 ${formatMinutes(r.minutes)}`].filter(Boolean).join(' · ')}</small></span></li>)}</ol>
      : <p className="fs-hint fs-hand">放着唱片专注过，这里就会排出一年里的老朋友。</p>}
    </section></div>
  </div></div>;
}

// 统计 (secondary): the former 概览 and 待办 pages — today, goal, 7/30-day bars, time of day, recent rounds, where time went.
function StatsView({ state, sessions, now, input, spine, close }) {
  const tasks = state.tasks, [part, setPart] = useState('overview'), [range, setRange] = useState(7), today = dayKey(now);
  const recent = useMemo(() => recentSummary(sessions, now, 4), [sessions, today]);
  const daily = useMemo(() => dailySeries(sessions, now, range), [sessions, today, range]);
  const taskRows = useMemo(() => byTask(sessions, tasks), [sessions, tasks]);
  const tod = useMemo(() => timeOfDay(sessions), [sessions]);
  const weekMinutes = daily.slice(-7).reduce((sum, d) => sum + d.minutes, 0);
  const distracted = useMemo(() => distractionSummary(state.distractions, now, { tasks, focusMinutes: weekMinutes }), [state.distractions, today, weekMinutes]);
  const doneTasks = tasks.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 8), openTasks = tasks.filter((t) => !t.done).length;
  const taskName = (id) => tasks.find((t) => t.id === id)?.text;
  const slotPeak = Math.max(1, ...tod.slots.map((s) => s.minutes)), taskPeak = Math.max(1, ...taskRows.map((r) => r.minutes));
  const goal = state.settings?.dailyGoal || 0, level = levelInfo(state.rewards.xp);
  const toggle = <div className="fs-seg rd-stats-seg" role="group" aria-label="统计内容">{[['overview', '概览'], ['tasks', '待办']].map(([id, name]) => <button key={id} type="button" aria-pressed={part === id} onClick={() => setPart(id)}>{name}</button>)}</div>;
  if (part === 'tasks') return <div className="fs-spread" key="stats-tasks" role="tabpanel" aria-label="统计 · 待办"><div className="fs-page is-turning fs-tasks-left">
    {toggle}
    <h3 className="fs-title">时间花在哪里</h3>
    {taskRows.length ? <ol className="fs-rank fs-task-rank">{taskRows.map((r, i) => <li key={r.id || 'free'} className={`${r.free ? 'is-free' : ''} ${i === 0 ? 'is-best' : ''}`}>
      <span className="fs-rank-name"><b className="fs-rank-no">{i + 1}</b>{r.name}{r.done ? <small> · 已完成</small> : null}</span><span className="fs-rank-num">{formatMinutes(r.minutes)} · {r.pomodoros} 个番茄</span>
      <span className="fs-meter" aria-hidden="true"><i style={{ width: `${r.minutes / taskPeak * 100}%` }}/></span></li>)}</ol>
      : <Empty pose="cat-wait" title="把时间，留给一件小事" action={<button type="button" className="fs-cta" onClick={close}>回小屋写一条待办</button>}>在「这一段做什么？」里写一句或选一件待办，这一页就会告诉你时间都花在了哪里。</Empty>}
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
  </div></div>;
  return <div className="fs-spread" key="stats" role="tabpanel" aria-label="统计"><div className="fs-page is-turning fs-ov-left">
    {toggle}
    <section className="fs-today" aria-label="今天">
      <div className="fs-today-num"><small>今天</small><strong>{formatMinutes(recent.todayMinutes)}</strong>{goal ? <small>目标 {goal} 分钟{recent.todayMinutes >= goal ? ' · 达成 ✓' : ''}</small> : null}</div>
      <div className="fs-today-num"><small>番茄</small><strong>{recent.todayPomodoros} 个</strong></div>
      <div className="fs-today-num fs-today-week" title={WEEK_DAYS_HINT}><small>本周来了</small><strong>{recent.weekDays} 天</strong><small>每周一重新开始</small></div>
    </section>
    {goal > 0 && <div className={`focus-goal ${recent.todayMinutes >= goal ? 'is-met' : ''}`}><span>每日目标 {recent.todayMinutes} / {goal} 分钟{recent.todayMinutes >= goal ? ' · 今天达成了' : ''}</span>
      <span className="focus-goal-bar" role="progressbar" aria-label="每日目标进度" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(goal, recent.todayMinutes)}><i style={{ width: `${Math.min(100, recent.todayMinutes / goal * 100)}%` }}/></span></div>}
    <InputCompanion input={input} title="今天的陪伴"/>
    <div className="fs-section-head"><h3 className="fs-title">每天</h3><div className="fs-seg" role="group" aria-label="时间范围">{[7, 30].map((n) => <button key={n} type="button" aria-pressed={range === n} onClick={() => setRange(n)}>近 {n} 天</button>)}</div></div>
    <Bars days={daily} label={`最近 ${range} 天 · 分钟`} set="records"/>
    {distracted.week > 0 && <p className="fs-hint fs-distractions" aria-label="分心记录">分心 · 今天 {distracted.today} 次 · 最近 7 天 {distracted.week} 次{distracted.perHour !== null ? `（约每小时 ${distracted.perHour} 次）` : ''}{distracted.busiest ? ` · 多在${distracted.busiest.label}` : ''}{distracted.task ? ` · 「${distracted.task.name}」时最多` : ''}</p>}
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
      <span className="fs-time">{clock(s.start)}</span><span className="fs-task">{taskName(s.taskId) || s.taskText || FREE_INTENT}{s.album ? <small> · 《{s.album.title}》</small> : null}</span>
      <span className="fs-min">{Math.round(s.durationMs / MINUTE)} 分</span></li>)}</ol>
      : <Empty title="第一段，从这里开始">开始一段专注，小屋会帮你记下来。</Empty>}
    <button type="button" className="fs-link rd-cat-link" onClick={() => { close(); window.dispatchEvent(new Event('cabin-open-cat')); }}>Lv.{level.level} · {state.rewards.fish} 小鱼干 · 去看看小猫 ›</button>
  </div></div>;
}

function JournalBook({ state, now, view, setView, close }) {
  const sessions = useFocusSessions(state.sessions), entries = useJournalTexts(), tasks = state.tasks, reduced = useReducedMotion(), labs = useLabs();
  const { unread } = useLetters();
  const input = useInputStats();
  const [note, setNote] = useState('');
  const flash = (text) => { setNote(text); setTimeout(() => setNote(''), 2400); };
  const tabs = JOURNAL_TABS.filter(([id]) => id !== 'letters' || labs.letters), active = tabs.some(([id]) => id === view) ? view : 'week';
  const spine = <div className={`fs-spine ${hasArt('spine') ? 'has-art' : ''}`} aria-hidden="true"/>;
  return <div className={`fs-book ${reduced ? 'is-reduced' : ''}`}>
    <header className="fs-book-head">
      <h2>唱片日记</h2>
      <div className="fs-ribbons" role="tablist" aria-label="日记分区">{tabs.map(([id, name]) => <button key={id} type="button" role="tab" aria-selected={active === id} onClick={() => setView(id)}>{name}{id === 'letters' && unread > 0 ? <b className="fs-tab-unread" aria-label={`${unread} 封未读`}>{unread}</b> : null}</button>)}</div>
      <button type="button" className="fs-back" aria-keyshortcuts="Escape" onClick={close}>返回小屋</button>
    </header>
    {active === 'week' && <WeekView sessions={sessions} entries={entries} tasks={tasks} now={now} spine={spine}/>}
    {active === 'collection' && <CollectionView sessions={sessions} entries={entries} tasks={tasks} now={now} labs={labs} input={input} reduced={reduced} spine={spine} flash={flash} note={note}/>}
    {active === 'wall' && <WallView sessions={sessions} now={now}/>}
    {active === 'stats' && <StatsView state={state} sessions={sessions} now={now} input={input} spine={spine} close={close}/>}
    {active === 'letters' && <Mailbox sessions={sessions} state={state} now={now} reduced={reduced}/>}
    {active === 'entries' && <JournalEntries/>}
  </div>;
}
