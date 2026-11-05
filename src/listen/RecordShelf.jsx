import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Dialog from '../Dialog';
import BrassPlate from '../props/BrassPlate';
import { EASE_LOOK, moveSeconds } from '../props/motion.mjs';
import { playSfx } from '../props/sfx.mjs';
import { useCabinRuntime } from '../runtime/CabinRuntime';
import { useRecordLibrary } from '../RecordLibrary';
import { Search } from '../icons';
import { likedSongs } from '../player/likes.mjs';
import { sleeveTone } from '../player/pixel-cover.mjs';
import useLabs from '../product/useLabs';
import { recentSongs } from './listen-model.mjs';
import { useLikes } from './listen-hooks';
import { shelfBinders, binderById, binderShape, boxItems } from '../shelf/shelf-model.mjs';
import Binder from '../shelf/Binder';
import IndexBook from '../shelf/IndexBook';
import './listen.css';
import '../shelf/shelf.css';

// 唱片架 (docs/design/3.0-design.md §6.2, re-skinned as an object in docs/v3-desk-design.md):
// a walnut bookcase close-up. The record boxes (唱片盒) and the three views stand on the shelf as
// leather ring binders, the A–Z index book stands at the end, and the album wall hangs beside
// it as a framed poster. Taking one down opens it on the desk; 放回 puts it back, and so do
// Esc, a press outside the case, and the plate in the corner.
// Binder and book looks follow DEsk's shelf (https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors, draw.c).
const OBJECT = 'shelf-object-open';

function Frame({ items, openWall }) {
  const tiles = useMemo(() => items.slice(0, 9).map((item) => ({ id: item.id, cover: item.cover || '', tone: item.cover ? '' : sleeveTone(item) })), [items]);
  return <button type="button" className="shelf-frame" aria-label="专辑墙" title="专辑墙 · 把喜欢的封面拼成一张海报" onClick={openWall}>
    <span className="shelf-frame-mat" aria-hidden="true">{tiles.length ? tiles.map((tile) => tile.cover ? <img key={tile.id} src={tile.cover} alt="" loading="lazy" draggable="false" referrerPolicy="no-referrer"/> : <i key={tile.id} style={{ background: tile.tone }}/>) : <b>空</b>}</span>
    <span className="shelf-frame-plate" aria-hidden="true">专辑墙</span>
  </button>;
}

export default function RecordShelf({ close, visible, filters, setFilters, openAdd, openRecord, openWall, openSmart }) {
  const { items, commands, deck, notify } = useCabinRuntime(), labs = useLabs(), library = useRecordLibrary();
  const [likes] = useLikes(notify);
  const [taken, setTaken] = useState('records');
  const spines = useRef({}), object = useRef(null), timers = useRef([]);
  const boxes = library?.boxes || [];
  const counts = useMemo(() => ({ records: items.length, liked: likedSongs(likes, items).length, recent: recentSongs(deck.player?.listens, items).length }), [items, likes, deck.player?.listens]);
  const binders = useMemo(() => shelfBinders({ boxes, items, counts }), [boxes, items, counts]);
  const binder = taken === 'book' ? null : binderById(binders, taken);
  const scopeItems = useMemo(() => binder?.kind === 'box' ? boxItems(items, boxes.find((box) => box.id === binder.box)) : items, [binder, boxes, items]);

  useEffect(() => { playSfx('binder-open'); return () => timers.current.forEach(clearTimeout); }, []);
  // After a move the focus goes where the hand went: into what was taken, or back to its place on the shelf.
  const focusAfter = useRef('');
  useEffect(() => {
    const target = focusAfter.current; if (!target) return;
    focusAfter.current = '';
    (target === 'object' ? object.current?.querySelector('.shelf-tabs [aria-checked=true]') : spines.current[target])?.focus({ preventScroll: true });
  }, [taken]);
  const take = (id) => {
    if (taken === id) { playSfx('binder-close'); focusAfter.current = id; setTaken(''); return; }
    focusAfter.current = 'object';
    playSfx('binder-lift');
    timers.current.push(setTimeout(() => playSfx('binder-open'), moveSeconds(0.3) * 1000));
    setTaken(id);
  };
  // The binder comes off its place on the shelf and grows into the open one: from the
  // spine's rectangle to its own, on the same spring the room's camera uses.
  const shown = binder || taken === 'book' ? taken : '';
  useLayoutEffect(() => {
    const node = object.current, spine = spines.current[shown];
    if (!node || !spine || !node.animate) return;
    const a = spine.getBoundingClientRect(), b = node.getBoundingClientRect();
    if (!a.width || !b.width) return;
    const dx = a.left + a.width / 2 - (b.left + b.width / 2), dy = a.top + a.height / 2 - (b.top + b.height / 2);
    node.animate([{ transform: `translate(${dx}px, ${dy}px) scale(.2)`, opacity: 0 }, { opacity: 1, offset: 0.2 }, { transform: 'none', opacity: 1 }], { duration: moveSeconds(0.66) * 1000, easing: EASE_LOOK, fill: 'backwards' });
  }, [shown]);

  // A press that starts and ends on the bare wall or the bare desk puts the shelf back
  // (the same rule Dialog uses for its backdrop).
  const pressed = useRef(false);
  const away = { onPointerDown: (event) => { pressed.current = event.target === event.currentTarget; }, onClick: (event) => { if (pressed.current && event.target === event.currentTarget) close(); pressed.current = false; } };
  const bookOpen = taken === 'book';
  return <Dialog variant="full" title="唱片架" label="唱片架" close={close} className="shelf-dialog" initialFocus=".shelf-tabs [aria-checked=true], .shelf-typing input">
    <section className="listen-shelf shelf-room" aria-label="唱片架" {...away}>
      <header className="shelf-cornice">
        <BrassPlate className="shelf-name">唱片架</BrassPlate>
        <span className="shelf-plates">
          {labs.smartTurntable && openSmart && <BrassPlate onClick={openSmart}>让小屋挑一张</BrassPlate>}
          <BrassPlate onClick={() => commands.open('music-settings')}>音源与账号</BrassPlate>
          {items.length > 0 && <BrassPlate onClick={() => openAdd()}>添加到唱片架</BrassPlate>}
          <BrassPlate className="cabin-dialog-close shelf-put-back" aria-label="关闭唱片架（放回）" arrow="↓" onClick={close}>放回</BrassPlate>
        </span>
      </header>
      <div className="shelf-bay">
        <div className="shelf-row" onWheel={(event) => { const row = event.currentTarget; if (row.scrollWidth > row.clientWidth && Math.abs(event.deltaY) > Math.abs(event.deltaX)) row.scrollLeft += event.deltaY; }}>
          <ul className="shelf-binders" aria-label="活页夹">
            {binders.map((entry) => {
              const shape = binderShape(entry.id), open = taken === entry.id;
              return <li key={entry.id}><button type="button" ref={(node) => { spines.current[entry.id] = node; }} className={`shelf-binder is-${entry.colour.id}${open ? ' is-taken' : ''}`} aria-expanded={open} aria-controls={open ? OBJECT : undefined} aria-label={`${entry.label}活页夹，${entry.count} ${entry.unit}`}
                style={{ '--spine': entry.colour.spine, '--edge': entry.colour.edge, '--worn': entry.colour.worn, '--w': `${shape.width}px`, '--h': shape.height, '--tilt': `${shape.tilt}deg` }} onClick={() => take(entry.id)}>
                <span className="shelf-label"><b>{entry.label}</b><i>{entry.count}</i></span>
              </button></li>;
            })}
          </ul>
          <ul className="shelf-fixtures" aria-label="索引与专辑墙">
            <li><button type="button" ref={(node) => { spines.current.book = node; }} className={`shelf-book${bookOpen ? ' is-taken' : ''}`} aria-expanded={bookOpen} aria-controls={bookOpen ? OBJECT : undefined} aria-label="索引本，按首字母和名字查找" onClick={() => take('book')}>
              <span className="shelf-book-label"><b>索引</b><Search size={16}/><em>A–Z</em><small>{items.length}</small></span>
            </button></li>
            <li><Frame items={items} openWall={openWall}/></li>
          </ul>
        </div>
        <div className="shelf-board" aria-hidden="true"/>
      </div>
      <div className="shelf-desk" {...away}>
        {binder && <Binder key={binder.id} ref={object} id={OBJECT} binder={binder} scopeItems={scopeItems} visible={visible} filters={filters} setFilters={setFilters} openAdd={openAdd} openRecord={openRecord} openWall={openWall} onPutBack={() => take(binder.id)}/>}
        {bookOpen && <IndexBook ref={object} id={OBJECT} items={items} openRecord={openRecord} openAdd={openAdd} onPutBack={() => take('book')}/>}
        {!shown && <p className="shelf-hint">取一本下来看看：点一本活页夹，或是那本索引。</p>}
      </div>
    </section>
  </Dialog>;
}
