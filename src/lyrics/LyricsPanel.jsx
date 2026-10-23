import { desktopCommand } from '../desktop/desktop-command.mjs';
import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Dialog from '../Dialog';
import { loadLyrics, invalidateLyrics, playbackPosition, LYRIC_CHANGED } from './lyric-session.mjs';
import { onBackgroundChange, frameClock } from '../frame-clock.mjs';
import { activeLyric, lyricTrackKey, MAX_LYRIC_BYTES, parseLyrics } from './lyrics-model.mjs';
import './lyrics.css';
const AmllPlayer = lazy(() => import('./AmllPlayer'));
class RendererBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
const storageKey = key => `flow-cabin-lyrics-v1:${key}`;
const readSaved = key => { try { return JSON.parse(localStorage.getItem(storageKey(key))) || {}; } catch { return {}; } };
export default function LyricsPanel({ track, playback, system, close }) {
  const [doc, setDoc] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [retry, setRetry] = useState(0);
  const key = lyricTrackKey(track), saved = useMemo(() => readSaved(key), [key, retry]);
  const [offset, setOffset] = useState(saved.offset || 0), [font, setFont] = useState(28), [translation, setTranslation] = useState(true), [immersive, setImmersive] = useState(true);
  const [time, setTime] = useState(null), [background, setBackground] = useState(false);
  const current = useRef({ playback, system }); current.current = { playback, system };
  const generation = useRef(0), list = useRef(null), manualUntil = useRef(0);
  useEffect(() => { setOffset(saved.offset || 0); }, [key]);
  useEffect(() => {
    const id = ++generation.current; setError(''); setDoc(null); setBusy(true);
    loadLyrics(track, retry > 0).then(value => { if (generation.current === id) setDoc(value); }).catch(e => { if (generation.current === id) setError(e.message); }).finally(() => { if (generation.current === id) setBusy(false); });
    return () => { generation.current++; };
  }, [key, retry]);
  useEffect(() => onBackgroundChange(setBackground), []);
  useEffect(() => {
    if (background) return;
    return frameClock().subscribe(() => {
      const { playback: p, system: s } = current.current;
      setTime(playbackPosition(p, s));
    }, { fps: 30 });
  }, [background]);
  const persist = patch => {
    try { localStorage.setItem(storageKey(key), JSON.stringify({ ...readSaved(key), ...patch })); if ('text' in patch) invalidateLyrics(track); else window.dispatchEvent(new Event(LYRIC_CHANGED)); return true; }
    catch { setError('歌词设置没有保存，请检查本机存储空间。'); return false; }
  };
  const importFile = async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (file.size > MAX_LYRIC_BYTES) throw Error('歌词文件不能超过 1 MiB。');
      const text = await file.text(), format = file.name.split('.').at(-1).toLowerCase(); parseLyrics(text, format);
      if (persist({ text, format, source: 'local' })) setRetry(v => v + 1);
    } catch (e) { setError(e.message); }
    event.target.value = '';
  };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.desktopReduceMotion === 'true';
  const lines = useMemo(() => doc?.lines.map(line => ({ ...line, translatedLyric: translation ? line.translatedLyric : '' })) || [], [doc, translation]);
  const totalOffset = (doc?.offset || 0) + offset;
  const index = activeLyric(lines, time, totalOffset), seekable = !system && playback?.canControl && !playback?.remote;
  const seek = value => { if (seekable && Number.isFinite(value)) playback.seek(Math.max(0, (value + totalOffset) / 1000)); };
  useEffect(() => { if (Date.now() >= manualUntil.current) list.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'center', behavior: reduced ? 'instant' : 'smooth' }); }, [index]);
  const fallback = <div ref={list} className="cabin-lyric-list" onWheel={() => { manualUntil.current = Date.now() + 5000; }} onTouchMove={() => { manualUntil.current = Date.now() + 5000; }}>{lines.map((line, i) => <button type="button" key={`${line.startTime}:${i}`} aria-current={i === index ? 'true' : undefined} onClick={() => seek(line.startTime)} disabled={!seekable}><span>{line.words.map(w => w.word).join('')}</span>{translation && line.translatedLyric && <small>{line.translatedLyric}</small>}</button>)}</div>;
  return <Dialog title="歌词" close={close} size="xl" className="cabin-lyrics-dialog">
    <p>{track.title} · {track.artist}</p>
    <div className="cabin-lyrics-tools">
      <label>导入歌词<input type="file" accept=".lrc,.eslrc,.yrc,.qrc,.ttml,.txt" onChange={importFile}/></label>
      <label>偏移（毫秒）<input type="number" min="-30000" max="30000" step="100" value={offset} onChange={e => { const value = Math.max(-30000, Math.min(30000, Number(e.target.value) || 0)); setOffset(value); persist({ offset: value }); }}/></label>
      <label>字号<input type="range" min="18" max="48" value={font} onChange={e => setFont(Number(e.target.value))}/></label>
      <label><input type="checkbox" checked={translation} onChange={e => setTranslation(e.target.checked)}/>翻译</label>
      <label><input type="checkbox" checked={immersive} onChange={e => setImmersive(e.target.checked)}/>沉浸歌词</label>
      {document.documentElement.dataset.desktopClient==='true' && <button type="button" onClick={()=>desktopCommand('lyrics-open')}>独立伴随歌词</button>}
      <button type="button" onClick={() => setRetry(v => v + 1)}>重试</button>
      {saved.text && <button type="button" onClick={() => { if (persist({ text: '', format: '' })) setRetry(v => v + 1); }}>清除本地歌词</button>}
    </div>
    {error && <p role="alert">{error}</p>}{busy && <p role="status">正在读取歌词…</p>}
    {time === null && <p>播放器未提供可靠进度，可手动浏览歌词。</p>}
    <div className="cabin-lyrics-stage" style={{ fontSize: font }}>
      {doc && !lines.length && <p>{doc.plain || (doc.instrumental ? '纯音乐' : doc.reason || '暂无歌词，可以导入本地歌词。')}</p>}
      {lines.length > 0 && (immersive && doc.precision === 'word' && time !== null && !background ? <RendererBoundary key={key} fallback={fallback}><Suspense fallback={fallback}><AmllPlayer lines={lines} time={Math.max(0, time - totalOffset)} playing={Boolean(system ? system.playing : playback?.playing)} reduced={reduced} onSeek={seek}/></Suspense></RendererBoundary> : fallback)}
    </div>
    <small>来源：{doc?.source || '—'} · {doc?.precision === 'word' ? '逐字时间' : doc?.precision === 'line' ? '逐行时间' : '普通文本'} · <a href="https://github.com/amll-dev/applemusic-like-lyrics" target="_blank" rel="noreferrer">AMLL（AGPL-3.0-only）</a> · <a href="https://github.com/ooooooomygosh/Flow-Cabin" target="_blank" rel="noreferrer">小屋对应源码</a></small>
  </Dialog>;
}
