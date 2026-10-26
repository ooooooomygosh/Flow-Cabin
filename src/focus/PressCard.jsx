import React, { useEffect, useId, useState, useSyncExternalStore } from 'react';
import Dialog from '../Dialog';
import { useFocusState } from './useFocus';
import { useSceneLook } from './useFocusDisplay';
import { getRoomScene } from '../scene-catalog.mjs';
import { skySnapshot } from '../sky-clock.mjs';
import { pressStore } from './press-store.mjs';
import { NOTE_LIMIT } from './session-log.mjs';
import { slotOf, FREE_INTENT } from './stats/record-diary.mjs';
import { formatMinutes } from './stats/stats-model.mjs';
import { sprite } from './stats/journal-art.mjs';
import useReducedMotion from '../useReducedMotion';
import './press-card.css';

// 压制唱片 (3.0 core moment): the round just finished becomes a record. Calm, one optional line,
// three ways on. Shown by exactly one host per window (see press-store.mjs).
const WEATHER_LINES = Object.freeze({ snow: '窗外下着雪', clear: '窗外很晴朗', rain: '窗外下着雨', starry: '窗外满天星', cloudy: '窗外多云', fog: '窗外起了雾', storm: '窗外雷雨' });
const hm = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
export function usePress(kind) {
  const store = pressStore(), value = useSyncExternalStore(store.subscribe, store.get, store.get);
  useEffect(() => kind ? store.claim(kind) : undefined, [kind]);
  return { ...value, mine: Boolean(value.record) && value.host === (kind || '') };
}
// The deck's own cover when it is still the same record (sharper than the 32 px thumbnail).
function coverFor(record) {
  const deck = globalThis.window?.__cabinDeckItem;
  if (deck?.cover && record.album?.title && deck.title === record.album.title) return deck.cover;
  return record.cover || '';
}
export function Sleeve({ cover, title = '', artist = '', size = 'md', spinning = false, className = '' }) {
  const [failed, setFailed] = useState('');
  const shown = cover && failed !== cover;
  return <span className={`press-sleeve is-${size} ${spinning ? 'is-out' : ''} ${className}`} aria-hidden="true">
    <span className="press-disc"><span className="press-disc-label" style={shown ? { backgroundImage: `url(${JSON.stringify(cover)})` } : undefined}/></span>
    <span className="press-jacket">{shown ? <img src={cover} alt="" draggable={false} onError={() => setFailed(cover)}/> : <span className="press-jacket-blank"><b>{title.slice(0, 6) || '唱片'}</b>{artist ? <small>{artist.slice(0, 10)}</small> : null}</span>}</span>
  </span>;
}

export function PressCard({ record, onDone, inline = false }) {
  const focus = useFocusState(), store = pressStore(), look = useSceneLook(), reduced = useReducedMotion(), id = useId();
  const [draft, setDraft] = useState(() => store.draft()), { error } = useSyncExternalStore(store.subscribe, store.get, store.get);
  const change = (value) => { const next = Array.from(value).slice(0, NOTE_LIMIT).join(''); setDraft(next); store.setDraft(next); };
  const phase = focus?.state?.timer?.phase || 'idle';
  const finish = (next) => { if (!store.keep()) return; onDone?.(); next?.(); };
  const rest = () => finish(() => { if (phase === 'idle') focus?.startBreak(); });
  const again = () => finish(() => { if (phase !== 'focus') focus?.nextRound(); });
  const intent = record.taskText || (record.taskId && focus?.state?.tasks.find((task) => task.id === record.taskId)?.text) || '';
  const sky = (() => { try { return skySnapshot(); } catch { return null; } })();
  const weather = WEATHER_LINES[sky?.real?.kind || focus?.state?.rewards?.equipped?.weather] || '';
  const room = getRoomScene(look)?.label || '';
  const minutes = Math.max(1, Math.round(record.durationMs / 60000));
  return <section className={`press-card ${inline ? 'is-inline' : ''} ${reduced ? 'is-reduced' : ''}`} aria-labelledby={`${id}-title`} onClick={(event) => event.stopPropagation()}>
    <div className="press-art"><Sleeve cover={coverFor(record)} title={record.album?.title || ''} artist={record.album?.artist || ''} size="lg" spinning/>
      {sprite('cat-rub') && <img className="press-cat" src={sprite('cat-rub')} alt="" width={64} height={64} draggable={false} onError={(event) => { event.currentTarget.hidden = true; }}/>}</div>
    <div className="press-copy">
      {inline && <p className="press-kicker">这一段压成了一张唱片</p>}
      <h3 id={`${id}-title`} className="press-title">{intent || FREE_INTENT}</h3>
      <p className="press-meta"><span>{formatMinutes(minutes)}</span><span>{slotOf(record.start).label} {hm(record.start)}–{hm(record.end)}</span>{record.album?.title ? <span>《{record.album.title}》</span> : null}</p>
      {(room || weather) && <p className="press-place">{[room && `在${room}`, weather].filter(Boolean).join(' · ')}</p>}
      <label className="press-note"><span>留一句话给这一段</span>
        <input type="text" value={draft} maxLength={NOTE_LIMIT * 2} placeholder="可以不写" aria-describedby={`${id}-count`} onChange={(event) => change(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); finish(); } }}/>
        <small id={`${id}-count`}>{Array.from(draft).length} / {NOTE_LIMIT}</small></label>
      {error && <p className="press-error" role="alert">{error}</p>}
      <div className="press-actions">
        <button type="button" onClick={rest}>休息一下</button>
        <button type="button" onClick={again}>再来一段</button>
        <button type="button" className="is-primary" data-autofocus onClick={() => finish()}>收好了</button>
      </div>
    </div>
  </section>;
}

// Over the cabin when neither 沉浸 nor the panel's 「这一段」 is showing.
export default function PressHost() {
  const { record, host } = usePress('');
  if (!record || host) return null;
  return <Dialog title="压好了一张唱片" size="sm" className="press-dialog" close={() => pressStore().keep()} label="压好了一张唱片"><PressCard record={record}/></Dialog>;
}
