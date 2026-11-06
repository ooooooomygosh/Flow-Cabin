import React, { useEffect, useMemo, useRef } from 'react';
import Dialog from '../Dialog';
import { playSfx } from '../props/sfx.mjs';
import { moveSeconds } from '../props/motion.mjs';
import { useCabinRuntime } from '../runtime/CabinRuntime';
import { useRecordLibrary } from '../RecordLibrary';
import { likedSongs } from '../player/likes.mjs';
import { recentSongs } from './listen-model.mjs';
import { useLikes } from './listen-hooks';
import { shelfBinders, shelfSlots, binderById, boxItems } from '../shelf/shelf-model.mjs';
import Binder from '../shelf/Binder';
import IndexBook from '../shelf/IndexBook';
import { deskUrl } from '../desk/images.mjs';
import './listen.css';
import '../shelf/shelf.css';

// 唱片架: the bookcase itself is DEsk's (src/desk/ShelfView.jsx, https://github.com/fyzugx/DEsk, MIT,
// (c) 2026 The DEsk authors). Its binders are the record boxes and the three views; the navy book at
// the end of the row is the A–Z index of every record. What is here is what a binder or the book
// becomes once it is taken down: "Take a sheet and it is carried down to the desk" — the binder lies
// open on the walnut desk, its sheets on the rings, until it is put back (放回, Esc, a press on the
// bare desk).

// What stands on the shelf, with its counts: the three views, then one binder per 唱片盒.
export function useShelfBinders() {
  const { items, deck, notify } = useCabinRuntime(), library = useRecordLibrary();
  const [likes] = useLikes(notify);
  const boxes = library?.boxes || [];
  const counts = useMemo(() => ({ records: items.length, liked: likedSongs(likes, items).length, recent: recentSongs(deck.player?.listens, items).length }), [items, likes, deck.player?.listens]);
  const binders = useMemo(() => shelfBinders({ boxes, items, counts }), [boxes, items, counts]);
  const slots = useMemo(() => shelfSlots(binders), [binders]);
  return { binders, ...slots, boxes, items };
}

// 更多: the eighth binder holds the record boxes there is no room for; inside, each is a divider to take out.
function MoreSheet({ rest, take, close }) {
  return <Dialog title="更多唱片盒" close={close} className="shelf-more" size="sm" closeLabel="放回更多唱片盒">
    <p className="shelf-more-note">架上只站得下八本活页夹，其余的唱片盒收在这一本里。</p>
    <ul className="shelf-more-list">
      {rest.map((binder, i) => <li key={binder.id}><button type="button" data-autofocus={i === 0 || undefined} aria-label={`${binder.label}活页夹，${binder.count} ${binder.unit}`} onClick={() => take(binder.id)}>
        <span className="shelf-more-name">{binder.label}</span><i className="shelf-leader" aria-hidden="true"/><span className="shelf-more-count">{binder.count}</span>
      </button></li>)}
    </ul>
  </Dialog>;
}

// The binder (or the book) taken down. `taken` is a binder id, 'book' or 'more'; `take(id)` takes
// another down (or, with '', puts this one back).
export default function RecordShelf({ taken, take, shelf, visible, filters, setFilters, openAdd, openRecord, openWall }) {
  const { items } = useCabinRuntime();
  const { binders, rest, boxes } = shelf;
  const binder = taken && taken !== 'book' && taken !== 'more' ? binderById(binders, taken) : null;
  const scopeItems = useMemo(() => binder?.kind === 'box' ? boxItems(items, boxes.find((box) => box.id === binder.box)) : items, [binder, boxes, items]);
  const timers = useRef([]), pressed = useRef(false);
  useEffect(() => { if (!taken) return undefined; const t = setTimeout(() => playSfx('binder-open'), moveSeconds(0.3) * 1000); timers.current.push(t); return () => clearTimeout(t); }, [taken]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const putBack = () => { playSfx('binder-close'); take(''); };
  if (taken === 'more') return <MoreSheet rest={rest} take={take} close={putBack}/>;
  if (!binder && taken !== 'book') return null;
  // A press that starts and ends on the bare desk puts it back (the same rule Dialog uses for its backdrop).
  const away = { onPointerDown: (event) => { pressed.current = event.target === event.currentTarget; }, onClick: (event) => { if (pressed.current && event.target === event.currentTarget) putBack(); pressed.current = false; } };
  const book = taken === 'book';
  return <Dialog variant="full" title={book ? '索引本' : `${binder.label}活页夹`} label={book ? '索引本 · 所有唱片' : `${binder.label}活页夹`} close={putBack} className={`shelf-dialog ${book ? 'is-book' : 'is-binder'}`} initialFocus=".shelf-tabs [aria-checked=true], .shelf-typing input">
    <section className="listen-shelf shelf-room" aria-label={book ? '索引本' : `${binder.label}活页夹`} style={{ '--desk-wood': `url(${deskUrl('desk-wood.webp')})` }} {...away}>
      <div className="shelf-desk" {...away}>
        {binder && <Binder key={binder.id} binder={binder} scopeItems={scopeItems} visible={visible} filters={filters} setFilters={setFilters} openAdd={openAdd} openRecord={openRecord} openWall={openWall} onPutBack={putBack}/>}
        {book && <IndexBook items={items} openRecord={openRecord} openAdd={openAdd} onPutBack={putBack}/>}
      </div>
    </section>
  </Dialog>;
}
