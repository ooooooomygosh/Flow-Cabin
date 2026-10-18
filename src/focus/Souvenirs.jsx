import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, Album, DocumentArrow, BookOpen } from '../icons';
import { FOCUS_SESSION_EVENT, SESSION_LOG_KEY } from './stats/session-source.mjs';
import { PLAYBACK_LOG_KEY } from '../player/playback-log.mjs';
import { LETTER_EVENT, LETTERS_KEY } from '../ai/ai-model.mjs';
import { JOURNAL_CHANGE, JOURNAL_KEY } from './journal-entries.mjs';
import { SOUVENIRS, SOUVENIR_KEYS, SOUVENIR_CHANGE, normalizeSouvenirs, syncSouvenirs, souvenirReason } from './souvenirs.mjs';
import './souvenirs.css';

const ICONS = { clock: Clock, record: Album, letter: DocumentArrow, book: BookOpen };
const SOURCE_KEYS = new Set([SESSION_LOG_KEY, PLAYBACK_LOG_KEY, LETTERS_KEY, JOURNAL_KEY, ...SOUVENIR_KEYS]);
const store = () => { try { return globalThis.localStorage; } catch { return null; } };

// Mounted with CatPanel even while its dialog is closed. Failed writes keep
// their working copy until a successful retry or this window is closed.
export function useSouvenirs() {
  const retained = useRef(normalizeSouvenirs());
  const [result, setResult] = useState({ state: retained.current, savedIds: [], error: '' });
  const refresh = useCallback(() => {
    const next = syncSouvenirs({ storage: store(), previous: retained.current, target: window });
    retained.current = next.state;
    setResult(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
  }, []);
  useEffect(() => {
    let pending;
    const schedule = () => {
      if (pending != null) return;
      pending = setTimeout(() => { pending = null; refresh(); }, 0);
    };
    const storage = event => { if (event.key == null || SOURCE_KEYS.has(event.key)) schedule(); };
    const visible = () => { if (document.visibilityState !== 'hidden') schedule(); };
    const events = [FOCUS_SESSION_EVENT, LETTER_EVENT, JOURNAL_CHANGE, SOUVENIR_CHANGE];
    events.forEach(event => window.addEventListener(event, schedule));
    window.addEventListener('storage', storage);
    window.addEventListener('focus', visible);
    document.addEventListener('visibilitychange', visible);
    // Playback checkpoints have no custom event. Read at their 15-second cadence.
    const timer = setInterval(visible, 15000);
    schedule();
    return () => {
      clearTimeout(pending); clearInterval(timer);
      events.forEach(event => window.removeEventListener(event, schedule));
      window.removeEventListener('storage', storage);
      window.removeEventListener('focus', visible);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh]);
  return { ...result, refresh };
}

export default function Souvenirs({ state, savedIds, error, refresh }) {
  return <section className="cabin-souvenirs" aria-label="小屋纪念物">
    <header><h3>小屋纪念物</h3><span>{state.records.filter(record => savedIds.includes(record.id)).length} / {SOUVENIRS.length}</span></header>
    <p>把真实发生的小事收好。按本机日志获得，获得后保留，不消耗或增加小鱼干。</p>
    {error && <div className="souvenir-error"><p role="alert">{error}</p><button type="button" className="pixel-button is-quiet" onClick={refresh}>重试保存纪念物</button></div>}
    <ul className="souvenir-list">
      {SOUVENIRS.map(item => {
        const record = state.records.find(record => record.id === item.id);
        const saved = record && savedIds.includes(item.id), Icon = ICONS[item.icon];
        return <li key={item.id} className="souvenir-card" data-earned={saved ? 'true' : 'false'}>
          <span className="souvenir-emblem" aria-hidden="true"><Icon size={24}/></span>
          <div><h4>{item.name}</h4>
            {record ? <>
              <p className="souvenir-date">{saved ? '获得于' : '已达成 · 保存待确认'} <time dateTime={record.earnedOn}>{record.earnedOn}</time></p>
              <p>{souvenirReason(record)}</p>
            </> : <><p className="souvenir-date">尚未获得</p><p>{item.hint}</p></>}
          </div>
        </li>;
      })}
    </ul>
    <small>日期按获得时的本地日历记录；旧日志会在读取时补记。手记按创建日期统计，编辑和整理不增加天数。</small>
  </section>;
}
