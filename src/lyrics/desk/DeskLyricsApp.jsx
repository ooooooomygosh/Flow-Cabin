import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../styles/tokens.css';
import '../../fonts.css';
import '../lyrics.css';
import './desk-lyrics.css';
import PixelCat from '../../pet/PixelCat';
import KaraokeLine from '../KaraokeLine';
import { activeLyric } from '../lyrics-model.mjs';
import { anchoredPosition, lineEnd, unpackLyrics } from '../lyric-timing.mjs';
import { normalizePrefs, SKIN_CHOICES } from '../lyric-prefs.mjs';
import { skinFor, skinStyle, FIXED_SKINS, LYRIC_SKINS } from '../lyric-skins.mjs';
import { frameClock } from '../../frame-clock.mjs';
import { reducedMotion, onReducedMotionChange } from '../../motion-preference.mjs';

const skinLabel = (choice, room) => choice === 'cabin' ? `跟随小屋 · ${LYRIC_SKINS[room]?.name || '像素'}` : FIXED_SKINS[choice]?.name || choice;
const join = line => line?.words.map(w => w.word).join('') || '';

// The desktop lyric bar (网易云 / QQ 音乐 style), fed by desktop/lyric-window.cjs.
// `api` is window.cabinLyrics in the app and a stub in tests.
export function DeskLyrics({ feed, doc, locked, api, reduced = false }) {
  const prefs = normalizePrefs(feed?.prefs), anchor = feed?.anchor, playing = Boolean(anchor?.playing);
  const skin = useMemo(() => skinFor(feed?.skin, prefs.deskSkin), [feed?.skin, prefs.deskSkin]);
  const state = useRef({ anchor }); state.current = { anchor, feed };
  const getTime = useCallback(() => anchoredPosition(state.current.anchor), []);
  const lines = doc?.lines || [];
  const [index, setIndex] = useState(-1), [quiet, setQuiet] = useState(false);
  const host = useRef(null);
  useEffect(() => { const tick = () => setIndex(activeLyric(lines, getTime(), 0)); tick(); return frameClock().subscribe(tick, { fps: 12 }); }, [lines, getTime]);
  // Energy glows the sung text; each beat gives a small lift.
  useEffect(() => {
    if (reduced) { host.current?.style.setProperty('--energy', '0'); return; }
    let last = 0;
    return frameClock().subscribe(() => {
      const f = state.current.feed || {}, node = host.current; if (!node) return;
      let beat = 0;
      if (f.anchor?.playing && f.bpm >= 40 && f.beatAt) { const length = 60000 / f.bpm, phase = ((Date.now() - f.beatAt) % length + length) % length / length; beat = Math.max(0, 1 - phase * 4); }
      const value = f.anchor?.playing ? Math.min(1, (f.energy || 0) * .8 + beat * .35) : 0;
      if (Math.abs(value - last) > .02) { last = value; node.style.setProperty('--energy', value.toFixed(2)); }
    }, { fps: 30 });
  }, [reduced]);
  // 暂停后隐藏 (optional): fade out five seconds after the music stops.
  useEffect(() => { if (playing || !prefs.deskHideWhenPaused) { setQuiet(false); return; } const timer = setTimeout(() => setQuiet(true), 5000); return () => clearTimeout(timer); }, [playing, prefs.deskHideWhenPaused]);
  const set = patch => api?.setPrefs(patch);
  const nextSkin = () => set({ deskSkin: SKIN_CHOICES[(SKIN_CHOICES.indexOf(prefs.deskSkin) + 1) % SKIN_CHOICES.length] });
  const extra = line => ({ translation: prefs.translation ? line?.translatedLyric || '' : '', roman: prefs.romanization ? line?.romanLyric || '' : '' });
  const current = lines[index], upcoming = lines[index + 1];
  const placeholder = !feed?.title ? '放一首歌，歌词会浮在这里' : doc?.instrumental ? '纯音乐 · 请安静聆听' : !lines.length ? `${feed.title}${feed.artist ? ` — ${feed.artist}` : ''}` : join(lines[0]);
  // KTV layout: lines alternate between a left-aligned top row and a right-aligned bottom row,
  // so the next line is already waiting where the eye goes next.
  const rows = prefs.deskLayout === 'double' && lines.length
    ? (index < 0 ? [lines[0], lines[1]] : index % 2 === 0 ? [current, upcoming] : [upcoming, current]).map((line, row) => ({ line, row, active: line === current }))
    : [{ line: current, row: 0, active: true }];
  return <div ref={host} className={`desk-lyrics layout-${prefs.deskLayout} enter-${skin.enter} ${locked ? 'is-locked' : ''} ${quiet ? 'is-quiet' : ''} ${playing ? 'is-playing' : ''}`} data-skin={skin.id} style={{ ...skinStyle(skin), '--desk-size': `${prefs.deskSize}px` }}>
    {!locked && <div className="desk-lyrics-toolbar" role="toolbar" aria-label="桌面歌词">
      <button type="button" onClick={() => api?.command('previous')} aria-label="上一首">⏮</button>
      <button type="button" onClick={() => api?.command('toggle')} aria-label={playing ? '暂停' : '播放'}>{playing ? '⏸' : '▶'}</button>
      <button type="button" onClick={() => api?.command('next')} aria-label="下一首">⏭</button>
      <span className="desk-lyrics-sep" aria-hidden="true"/>
      <button type="button" onClick={() => set({ deskSize: prefs.deskSize - 2 })} aria-label="字号减小" disabled={prefs.deskSize <= 20}>A−</button>
      <button type="button" onClick={() => set({ deskSize: prefs.deskSize + 2 })} aria-label="字号增大" disabled={prefs.deskSize >= 64}>A+</button>
      <button type="button" onClick={nextSkin} title="切换样式">{skinLabel(prefs.deskSkin, feed?.skin)}</button>
      <button type="button" aria-pressed={prefs.translation} onClick={() => set({ translation: !prefs.translation })}>译</button>
      <button type="button" aria-pressed={prefs.deskLayout === 'double'} onClick={() => set({ deskLayout: prefs.deskLayout === 'double' ? 'single' : 'double' })}>{prefs.deskLayout === 'double' ? '双行' : '单行'}</button>
      <button type="button" aria-pressed={prefs.deskPet} onClick={() => set({ deskPet: !prefs.deskPet })} aria-label="显示伙伴">伙伴</button>
      <span className="desk-lyrics-sep" aria-hidden="true"/>
      <button type="button" onClick={() => api?.command('lock')} aria-label="锁定歌词（鼠标可穿透）">锁定</button>
      <button type="button" onClick={() => api?.command('close')} aria-label="关闭桌面歌词">✕</button>
    </div>}
    {locked && <button type="button" className="desk-lyrics-unlock" aria-label="解锁桌面歌词" onPointerEnter={() => api?.hoverLock(true)} onPointerLeave={() => api?.hoverLock(false)} onClick={() => { api?.hoverLock(false); api?.command('unlock'); }}>🔒</button>}
    <div className="desk-lyrics-stage">
      {prefs.deskPet && <span className={`desk-lyrics-pet ${playing && !reduced ? 'is-bobbing' : ''}`} aria-hidden="true"><PixelCat petId={feed?.pet?.id || 'cat'} accessory={feed?.pet?.accessory || ''} pose={playing ? 'listen' : 'idle'} musicBeat={playing && !reduced} reduceMotion={reduced}/></span>}
      <div className="desk-lyrics-lines" aria-live="polite">
        {current || (prefs.deskLayout === 'double' && lines.length) ? rows.map(({ line, row, active }) => line ? <div key={`${row}:${line.startTime}`} className={`desk-lyrics-row row-${row} ${active ? 'is-active' : 'is-waiting'}`}>
          {active ? <KaraokeLine line={line} end={lineEnd(lines, lines.indexOf(line))} getTime={getTime} reduced={reduced} {...extra(line)}/> : <span className="desk-lyrics-waiting">{join(line)}{extra(line).translation && <small>{extra(line).translation}</small>}</span>}
        </div> : <div key={`empty-${row}`} className={`desk-lyrics-row row-${row}`}/>) : <div className="desk-lyrics-row row-0 is-placeholder"><span>{placeholder}</span></div>}
      </div>
    </div>
  </div>;
}

function DeskLyricsApp() {
  const api = window.cabinLyrics, [feed, setFeed] = useState(null), [doc, setDoc] = useState(null), [locked, setLocked] = useState(false), [reduced, setReduced] = useState(reducedMotion);
  useEffect(() => onReducedMotionChange(() => setReduced(reducedMotion())), []);
  useEffect(() => {
    if (!api) return;
    const offUpdate = api.onUpdate(value => { if ('doc' in value) setDoc(value.doc ? unpackLyrics(value.doc) : null); setFeed(value); });
    const offState = api.onState(value => setLocked(value?.locked === true));
    api.ready();
    return () => { offUpdate(); offState(); };
  }, [api]);
  return <DeskLyrics feed={feed} doc={doc} locked={locked} api={api} reduced={reduced}/>;
}
const root = document.getElementById('root');
if (root && window.cabinLyrics) createRoot(root).render(<DeskLyricsApp/>);
