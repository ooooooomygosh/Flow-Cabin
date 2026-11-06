import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useCabinRuntime } from '../runtime/CabinRuntime';
import { playSfx } from '../props/sfx.mjs';
import { currentCabinPlayback, onCabinPlayback } from '../scene/playback-listener.mjs';
import { recordDeskLayout, sleeveTilt } from './layout.mjs';
import Turntable from './Turntable';
import './record-desk.css';

// Listening is the heart of the cabin, so the records lie on the desk itself: their sleeves spread out
// on the walnut, a dozen at a time, and the record player stands at the right with a slip of paper
// under it saying what is playing. As on the first Flow Cabin shelf: pick a sleeve, then double-click it,
// press Enter, or drag it onto the player to play it. Everything is lit by DEsk's one lamp.
const typing = (t) => t?.closest?.('input,textarea,select,[contenteditable="true"],[role=slider]');

function usePlayback() {
  const [p, setP] = useState(() => currentCabinPlayback());
  useEffect(() => onCabinPlayback((next) => setP({ ...next })), []);
  return p;
}
const time = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export default function RecordDesk({ lay, shelf, reduced, hidden = false, chrome = 0 }) {
  const { deck, commands } = useCabinRuntime(), playback = usePlayback();
  const list = useMemo(() => (shelf?.visible || []).filter((item) => item?.cover || item?.title), [shelf?.visible]);
  const L = useMemo(() => recordDeskLayout(lay, { chrome }), [lay, chrome]);
  const perPage = L.grid.scroll ? list.length : L.grid.cols * L.grid.rows;
  const pages = Math.max(1, Math.ceil(list.length / Math.max(1, perPage)));
  const [page, setPage] = useState(0), [selected, setSelected] = useState(''), [drag, setDrag] = useState(null);
  const ttRef = useRef(null), gridRef = useRef(null), dragRef = useRef(null), suppress = useRef(false);
  useEffect(() => { if (page >= pages) setPage(pages - 1); }, [pages]);
  const onDeck = deck.deckItem?.id, shown = list.slice(page * perPage, page * perPage + perPage);
  const chosen = list.find((item) => item.id === selected) || deck.deckItem || null;
  // the record on the player is where the spread opens
  useEffect(() => { if (!onDeck || L.grid.scroll) return; const at = list.findIndex((i) => i.id === onDeck); if (at >= 0) setPage(Math.floor(at / perPage)); }, [onDeck, perPage]);

  const play = (item) => { if (!item) return; playSfx('sheet-take'); setSelected(item.id); commands.load(item, 0); };
  const flip = (step) => { const next = Math.max(0, Math.min(pages - 1, page + step)); if (next !== page) { playSfx('page-turn'); setPage(next); } };

  // dragging a sleeve onto the player
  const down = (event, item) => {
    if (event.button !== 0) return;
    dragRef.current = { item, x: event.clientX, y: event.clientY, id: event.pointerId, moving: false };
  };
  const move = (event) => {
    const d = dragRef.current; if (!d || d.id !== event.pointerId) return;
    if (!d.moving && Math.hypot(event.clientX - d.x, event.clientY - d.y) < 7) return;
    if (!d.moving) { d.moving = true; suppress.current = true; try { event.currentTarget.setPointerCapture(event.pointerId); } catch {} playSfx('paper-swing'); }
    const r = ttRef.current?.getBoundingClientRect(), over = r && event.clientX > r.left && event.clientX < r.right && event.clientY > r.top && event.clientY < r.bottom;
    setDrag({ item: d.item, x: event.clientX, y: event.clientY, over });
  };
  const up = (event) => {
    const d = dragRef.current; dragRef.current = null; if (!d || d.id !== event.pointerId) return;
    if (d.moving) { const over = drag?.over; setDrag(null); if (over) play(d.item); else playSfx('paper-land'); }
  };

  // arrows walk the spread, Enter plays, PageUp/PageDown turn to the next pile
  const keys = (event) => {
    if (typing(event.target)) return;
    const buttons = [...(gridRef.current?.querySelectorAll('.desk-sleeve') || [])], at = buttons.indexOf(document.activeElement);
    const cols = L.grid.cols, step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[event.key];
    if (step && at >= 0) {
      event.preventDefault();
      const next = at + step;
      if (next >= 0 && next < buttons.length) buttons[next].focus();
      else if (next >= buttons.length && page < pages - 1) { flip(1); requestAnimationFrame(() => gridRef.current?.querySelector('.desk-sleeve')?.focus()); }
      else if (next < 0 && page > 0) { flip(-1); requestAnimationFrame(() => [...(gridRef.current?.querySelectorAll('.desk-sleeve') || [])].at(-1)?.focus()); }
    } else if (event.key === 'PageDown') { event.preventDefault(); flip(1); } else if (event.key === 'PageUp') { event.preventDefault(); flip(-1); }
  };

  const g = L.grid, tt = L.turntable, playing = Boolean(deck.audible || (deck.provider === 'visual' && deck.effectiveSpin));
  const progress = playback.duration ? (playback.position || 0) / playback.duration : 0;
  const track = deck.nowTrack || deck.deckItem?.tracks?.[deck.shownTrackIndex] || '';
  const box = (r) => ({ left: r.x, top: r.y, width: r.w, height: r.h });

  return <div className={`record-desk ${L.phone ? 'is-phone' : ''}`} inert={hidden || undefined} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { dragRef.current = null; setDrag(null); }}>
    {list.length === 0
      ? <div className="record-desk-empty" style={{ left: g.x, top: g.y, width: Math.min(g.w || 420, 420) }}>
          <p className="record-desk-empty-to">致 唱片架</p>
          <p>桌上还没有唱片。放一张喜欢的专辑上来，唱机就能转起来。</p>
          <button type="button" onClick={() => shelf?.openAdd?.()}>添加第一张专辑 →</button>
        </div>
      : <div className={`record-desk-grid ${g.scroll ? 'is-scroll' : ''}`} ref={gridRef} role="group" aria-label={`桌上的唱片 · 第 ${page + 1} / ${pages} 叠`} onKeyDown={keys}
          style={{ ...box(g), gridTemplateColumns: `repeat(${g.cols}, ${g.size}px)`, gridAutoRows: `${g.size}px`, gap: g.gap }}>
          {shown.map((item, i) => {
            const isOn = item.id === onDeck, isChosen = item.id === selected;
            return <button type="button" key={item.id} className={`desk-sleeve ${isChosen ? 'is-chosen' : ''} ${isOn ? 'is-on-deck' : ''} ${drag?.item?.id === item.id ? 'is-lifted' : ''}`}
              style={{ '--tilt': `${sleeveTilt(item.id)}deg` }} data-autofocus={i === 0 || undefined}
              aria-label={`${item.title}${item.artist ? ` · ${item.artist}` : ''}${isOn ? ' · 在唱机上' : ''}`} aria-pressed={isChosen}
              onPointerDown={(e) => down(e, item)} onClick={() => { if (suppress.current) { suppress.current = false; return; } playSfx('paper-press'); setSelected(item.id); }}
              onDoubleClick={() => play(item)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.repeat) { e.preventDefault(); play(item); } }}>
              {item.cover ? <img src={item.cover} alt="" draggable="false" loading="lazy"/> : <span className="desk-sleeve-plain"><b>{item.title}</b><small>{item.artist}</small></span>}
              {isOn && <span className="desk-sleeve-tag" aria-hidden="true">在唱机上</span>}
            </button>;
          })}
        </div>}
    {list.length > 0 && !g.scroll && <div className="record-desk-caption" style={{ left: g.x, top: g.y + g.h + 10, width: g.w }}>
      <span className="record-desk-what">{chosen ? <><b>{chosen.title}</b>{chosen.artist && <i> · {chosen.artist}</i>}{chosen.tracks?.length ? <i> · {chosen.tracks.length} 首</i> : null}</> : '选一张唱片：双击、回车，或拖到唱机上'}</span>
      {chosen && chosen.id !== onDeck && <button type="button" onClick={() => play(chosen)}>放上唱机</button>}
      {chosen && shelf?.openRecord && <button type="button" onClick={() => shelf.openRecord(chosen)}>唱片卡片</button>}
      {pages > 1 && <span className="record-desk-pages"><button type="button" onClick={() => flip(-1)} disabled={page === 0} aria-label="上一叠（PageUp）">‹</button><small>{page + 1} / {pages}</small><button type="button" onClick={() => flip(1)} disabled={page >= pages - 1} aria-label="下一叠（PageDown）">›</button></span>}
    </div>}

    <div className={`record-desk-player ${drag?.over ? 'is-target' : ''}`} ref={ttRef} style={box(tt)}>
      <button type="button" className="record-desk-platter" aria-label={deck.deckItem ? `唱机 · ${deck.deckItem.title}${playing ? ' · 暂停' : ' · 播放'}` : '唱机 · 还没有唱片，去唱片架挑一张'}
        onClick={() => { playSfx('key-press'); deck.deckItem ? commands.play() : commands.open('library'); }}>
        <Turntable cover={deck.deckItem?.cover} loaded={Boolean(deck.deckItem)} playing={playing} progress={progress} reduced={reduced}/>
      </button>
      <button type="button" className="record-desk-closeup" onClick={() => dispatchEvent(new Event('cabin-open-corner'))}>唱机特写</button>
    </div>
    {L.slip && <div className="record-desk-slip" style={box(L.slip)} aria-live="polite">
      {deck.deckItem ? <>
        <p className="record-desk-slip-title">{track || deck.deckItem.title}</p>
        <p className="record-desk-slip-sub">{deck.deckItem.title}{deck.deckItem.artist ? ` · ${deck.deckItem.artist}` : ''}{deck.statusText ? ` · ${deck.statusText}` : ''}</p>
        <div className="record-desk-slip-row">
          <button type="button" onClick={() => commands.previous()} aria-label="上一首">⏮</button>
          <button type="button" onClick={() => commands.play()} aria-label={playing ? '暂停' : '播放'}>{playing ? '❚❚' : '▶'}</button>
          <button type="button" onClick={() => commands.next()} aria-label="下一首">⏭</button>
          <span className="record-desk-slip-time">{playback.duration ? `${time(playback.position)} / ${time(playback.duration)}` : ''}</span>
          <span className="record-desk-slip-bar" aria-hidden="true"><i style={{ width: `${Math.round(progress * 100)}%` }}/></span>
        </div>
      </> : <p className="record-desk-slip-sub">唱机空着。挑一张唱片，双击或拖到唱机上。</p>}
    </div>}
    {drag && <img className="desk-sleeve-ghost" src={drag.item.cover} alt="" style={{ left: drag.x, top: drag.y, width: g.size * 0.9, height: g.size * 0.9 }}/>}
  </div>;
}
