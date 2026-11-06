import React, { useEffect, useState } from 'react';
import { useCabinRuntime } from '../runtime/CabinRuntime';
import useLabs from '../product/useLabs';
import { playSfx } from '../props/sfx.mjs';
import RecordShelf, { useShelfBinders } from '../listen/RecordShelf';
import { PLATES } from './layout.mjs';
import { deskUrl } from './images.mjs';

// The bookcase, looked up at from the desk: DEsk's (https://github.com/fyzugx/DEsk, MIT, (c) 2026
// The DEsk authors), its picture with the label cards wiped (scripts/desk-plates.py). Each binder on
// the top board is one of the record boxes (or 唱片 / 我喜欢 / 最近播放), its card typed with the name
// and how many are in it; the navy book at the end is the index of every record. Under the pointer a
// binder comes forward off the board, as on DEsk; taking it carries it down to the desk (RecordShelf).
// `place(rect)` turns the picture's own 1440x900 coordinates into the window's.
const G = PLATES.shelf;
const bounds = (quad) => {
  const xs = quad.map((p) => p[0]), ys = quad.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return [x, y, Math.max(...xs) - x, Math.max(...ys) - y];
};
const clip = (quad, [x, y, w, h]) => `polygon(${quad.map(([px, py]) => `${((px - x) / w * 100).toFixed(2)}% ${((py - y) / h * 100).toFixed(2)}%`).join(', ')})`;

// One binder (or the book): a slice of the picture, clipped to the binder's own outline, that can come
// forward. Only the slice takes the pointer (a clip-path also clips hit testing), so where two binders'
// boxes overlap the hand finds the one it is over.
function Standing({ quad, place, s, className = '', label, taken, onTake, children, autoFocus }) {
  const box = bounds(quad), r = place(box);
  return <button type="button" className={`shelf-stand ${className}${taken ? ' is-taken' : ''}`} style={{ left: r.x, top: r.y, width: r.w, height: r.h }} aria-label={label} aria-expanded={taken} data-autofocus={autoFocus || undefined} onClick={onTake}>
    <span className="shelf-stand-slice" aria-hidden="true" style={{ clipPath: clip(quad, box), backgroundImage: `url(${deskUrl('view-shelf.webp')})`, backgroundSize: `${PLATES.w * s}px ${PLATES.h * s}px`, backgroundPosition: `${-box[0] * s}px ${-box[1] * s}px` }}>{children}</span>
  </button>;
}

export default function ShelfView({ place, s, shelf: props = {}, lookBack }) {
  const { items, commands } = useCabinRuntime(), labs = useLabs();
  const shelf = useShelfBinders();
  const [taken, setTaken] = useState('');
  const take = (id) => { if (id) playSfx('binder-lift'); setTaken(id); };
  useEffect(() => { if (taken && taken !== 'book' && taken !== 'more' && !shelf.binders.some((b) => b.id === taken)) setTaken(''); }, [taken, shelf.binders]);
  const empty = !items.length;
  return <div className="shelf-view">
    {G.binders.map((quad, i) => {
      const binder = shelf.standing[i];
      if (!binder) return null;
      const mine = taken === binder.id || (binder.id === 'more' && shelf.rest.some((b) => b.id === taken));
      const inner = { left: `${(G.cards[i][0] - bounds(quad)[0]) / bounds(quad)[2] * 100}%`, top: `${(G.cards[i][1] - bounds(quad)[1]) / bounds(quad)[3] * 100}%`, width: G.cards[i][2], height: G.cards[i][3], transform: `scale(${s})` };
      return <Standing key={binder.id} quad={quad} place={place} s={s} className="is-binder" label={binder.id === 'more' ? `更多唱片盒活页夹，${binder.count} ${binder.unit}` : `${binder.label}活页夹，${binder.count} ${binder.unit}`} taken={mine} autoFocus={i === 0} onTake={() => take(binder.id)}>
        {/* typed at the picture's own size and scaled with it, like the card DEsk prints into the pocket */}
        <span className="shelf-card" style={inner}><b className="shelf-card-name">{binder.label}</b><i className="shelf-card-count">{binder.count}</i></span>
      </Standing>;
    })}
    <Standing quad={G.book} place={place} s={s} className="is-book" label={`索引本 · 所有唱片，${items.length} 张，按名字查找`} taken={taken === 'book'} onTake={() => take('book')}>
      {/* tooled at the picture's own size and scaled with it, as the gold on DEsk's spine is */}
      {(() => { const b = bounds(G.book), at = (r) => ({ left: `${(r[0] - b[0]) / b[2] * 100}%`, top: `${(r[1] - b[1]) / b[3] * 100}%`, width: r[2], height: r[3], transform: `scale(${s})` }); return <>
        <span className="shelf-spine-label" style={at(G.bookLabel)}><b>所有</b><b>唱片</b></span>
        <span className="shelf-spine-count" style={at(G.bookCount)}><b>{items.length}</b><small>张</small></span>
      </>; })()}
    </Standing>
    {empty && (() => { const r = place([252, 748, 196, 92]); return <button type="button" className="shelf-letter-note" style={{ left: r.x, top: r.y, width: r.w, minHeight: r.h, fontSize: Math.max(13, 14 * s) }} onClick={() => props.openAdd?.()}>
      <span className="shelf-letter-to">致 唱片架</span>
      <span className="shelf-letter-body">活页夹都还空着。</span>
      <strong className="shelf-letter-sign">添加第一张专辑 →</strong>
    </button>; })()}
    <nav className="shelf-view-plates" aria-label="唱片架上的铭牌">
      <button type="button" className="shelf-view-plate" style={{ backgroundImage: `url(${deskUrl('plate-shelf.webp')})` }} onClick={() => props.openAdd?.()}>添加到唱片架</button>
      <button type="button" className="shelf-view-plate" style={{ backgroundImage: `url(${deskUrl('plate-shelf.webp')})` }} onClick={() => props.openWall?.()}>专辑墙</button>
      {labs.smartTurntable && props.openSmart && <button type="button" className="shelf-view-plate" style={{ backgroundImage: `url(${deskUrl('plate-shelf.webp')})` }} onClick={props.openSmart}>让小屋挑一张</button>}
      <button type="button" className="shelf-view-plate" style={{ backgroundImage: `url(${deskUrl('plate-shelf.webp')})` }} onClick={() => commands.open('music-settings')}>音源与账号</button>
      <button type="button" className="shelf-view-plate is-back" style={{ backgroundImage: `url(${deskUrl('plate-shelf.webp')})` }} onClick={lookBack}>回到书桌 ↓</button>
    </nav>
    {taken && <RecordShelf taken={taken} take={take} shelf={shelf} visible={props.visible || items} filters={props.filters} setFilters={props.setFilters} openAdd={props.openAdd} openRecord={props.openRecord} openWall={props.openWall}/>}
  </div>;
}
