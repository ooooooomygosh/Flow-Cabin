// The red post box: the mailbox's letters stand in it like the tabs of an old Safari and are
// flipped through on a spring; each has a turned-down corner with 阅读 / 标为已读 / 丢掉 behind it.
// Ported from DEsk (https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors), post.c / wm.c;
// the maths is in post-box.mjs. Every letter is still a real <button> in the same <ol> as before.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { stepSpring, settled, poseAt, flipTarget, flipBy, earActions } from './post-box.mjs';
import { playSfx } from '../../props/sfx.mjs';

const STEP_Y = 29;       // px each letter further back stands higher, so its head shows
const STEP_Z = 34;       // px each steps further back
const WHEEL_NOTCH = 40;  // px of wheel that turn one letter

export default function PostBox({ rows, selectedId, unread, reduced, clock, onChoose, onAct, empty }) {
  const selected = rows.findIndex((row) => row.id === selectedId);
  const [target, setTarget] = useState(() => flipTarget(selected, rows.length));
  const [ear, setEar] = useState(''), box = useRef(null), list = useRef(null), spring = useRef({ pos: target, vel: 0, raf: 0, last: 0 });
  const hover = useRef({ timer: 0, id: '' }), wheel = useRef({ sum: 0, at: 0 });
  const count = rows.length;

  const apply = (pos) => {
    const ol = list.current; if (!ol) return;
    [...ol.children].forEach((li, i) => {
      const p = poseAt(i, pos), depth = p.depth;
      const lie = Math.min(3, Math.max(0, -p.t)) * 6; // flipped letters pile up a little in front of each other
      li.style.transform = `translate3d(0, ${(lie - depth * STEP_Y).toFixed(1)}px, ${(-depth * STEP_Z).toFixed(1)}px) rotateX(${p.lean.toFixed(4)}rad)`;
      li.style.opacity = p.opacity.toFixed(3);
      li.style.zIndex = String(p.z);
      li.style.setProperty('--dim', p.dim.toFixed(3));
      li.style.pointerEvents = p.opacity < 0.3 ? 'none' : '';
      li.dataset.fallen = p.fallen ? 'true' : 'false';
      li.dataset.front = Math.abs(p.t) < 0.5 ? 'true' : 'false';
    });
  };
  // New letters (a filter, a page, a delivery) get placed before the browser paints.
  useLayoutEffect(() => { apply(spring.current.pos); });

  // The spring follows the selected letter, whichever way it was chosen.
  useEffect(() => { setTarget(flipTarget(selected, count)); }, [selectedId, count]);
  useEffect(() => {
    const a = spring.current; cancelAnimationFrame(a.raf);
    const to = Math.min(target, Math.max(0, count - 1));
    if (reduced || typeof requestAnimationFrame !== 'function') { a.pos = to; a.vel = 0; apply(to); return undefined; }
    a.last = 0;
    const tick = (now) => {
      const dt = a.last ? (now - a.last) / 1000 : 1 / 60; a.last = now;
      const next = stepSpring(a, to, dt); a.pos = next.pos; a.vel = next.vel;
      if (settled(a, to)) { a.pos = to; a.vel = 0; apply(to); return; }
      apply(a.pos); a.raf = requestAnimationFrame(tick);
    };
    a.raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(a.raf);
  }, [target, count, reduced]);
  useEffect(() => () => { clearTimeout(hover.current.timer); cancelAnimationFrame(spring.current.raf); }, []);

  const flipTo = (index, sound = true) => { if (index === target) return; if (sound) playSfx('letter-flick', { rate: 1 + Math.min(0.2, Math.abs(index - target) * 0.04) }); setEar(''); setTarget(index); };
  // The wheel turns one letter per notch; it only takes the wheel while there is a letter to turn to.
  useEffect(() => {
    const el = box.current; if (!el) return undefined;
    const onWheel = (event) => {
      const w = wheel.current, now = performance.now();
      if (now - w.at > 250) w.sum = 0;
      w.at = now; w.sum += event.deltaY;
      if (Math.abs(w.sum) < WHEEL_NOTCH) return;
      const next = flipBy(target, w.sum, count); w.sum = 0;
      if (next === target) return;
      event.preventDefault(); flipTo(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const key = (event) => {
    const buttons = [...list.current.querySelectorAll('.fs-mail-face')], at = buttons.indexOf(document.activeElement);
    const go = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    if (event.key === 'Escape' && ear) { event.stopPropagation(); event.preventDefault(); setEar(''); return; }
    if (at < 0) return;
    const to = go ? at + go : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : null;
    if (to === null || to < 0 || to >= buttons.length) return;
    event.preventDefault(); buttons[to].focus();
  };

  const openEar = (row, index, by) => {
    clearTimeout(hover.current.timer);
    if (ear === row.id) { setEar(''); return; }
    playSfx('corner-lift');
    if (index !== target) flipTo(index, false); // a letter further back is flipped to first and arrives open
    setEar(row.id); hover.current.id = by === 'hover' ? row.id : '';
  };
  const act = (id, row, index) => {
    setEar('');
    if (id === 'open') { playSfx('letter-take'); if (index !== target) setTarget(index); onChoose(row); return; }
    playSfx(id === 'trash' ? 'paper-toss' : 'paper-press'); onAct(id, row);
  };

  return <div className="fs-postbox" ref={box} data-unread={unread > 0 ? 'true' : 'false'} data-count={count}>
    <span className="fs-postbox-flag" aria-hidden="true"/>
    <div className="fs-postbox-slot">
      {count ? <ol className="fs-mail-list" ref={list} onKeyDown={key}>{rows.map((row, i) => {
        const choosing = row.id === selectedId, open = ear === row.id;
        return <li key={row.id} className={`fs-mail-letter ${open ? 'is-ear-open' : ''} ${choosing ? 'is-selected' : ''} ${row.unread ? 'is-unread' : ''} ${row.direction === 'out' ? 'is-out' : 'is-in'}`}
          onPointerLeave={() => { clearTimeout(hover.current.timer); if (hover.current.id === row.id) { hover.current.id = ''; setEar(''); } }}>
          <button type="button" aria-current={choosing ? 'true' : undefined} className={`fs-mail-face ${choosing ? 'is-selected' : ''} ${row.unread ? 'is-unread' : ''}`}
            onFocus={() => { if (i !== target) setTarget(i); }} onClick={() => { if (!choosing) { playSfx('letter-take'); setEar(''); setTarget(i); } onChoose(row); }}>
            <span className={`fs-mail-direction is-${row.direction}`}>{row.direction === 'out' ? '寄' : '来'}</span>
            <span className="fs-mail-row-copy"><strong>{row.title}</strong>
              <em className="fs-mail-from">{row.direction === 'out' ? '寄给 小屋' : '来自 奶糖'}</em>
              <small>{row.pending ? '正在等奶糖读信…' : row.preview || '一页没有写字的信'}</small></span>
            <time dateTime={new Date(row.latestAt).toISOString()}>{clock(row.latestAt).split(' ')[0]}</time>
            {row.unread && <i className="fs-mail-unread-dot" aria-label="未读"/>}
          </button>
          <span className="fs-mail-fold" aria-hidden="true"/>
          <button type="button" className="fs-mail-ear" aria-label={`${row.title}的操作`} aria-expanded={open}
            onPointerEnter={(event) => { if (event.pointerType !== 'mouse' || open) return; clearTimeout(hover.current.timer); hover.current.timer = setTimeout(() => openEar(row, i, 'hover'), 450); }}
            onPointerLeave={() => clearTimeout(hover.current.timer)}
            onClick={() => openEar(row, i, 'click')}/>
          {open && <span className="fs-mail-acts" role="group" aria-label={`${row.title}的操作`}>
            {earActions(row).map((action) => <button type="button" key={action.id} className={`fs-mail-act is-${action.id}`} onClick={() => act(action.id, row, i)}>{action.label}</button>)}
          </span>}
        </li>;
      })}</ol> : empty}
    </div>
    <span className="fs-postbox-door" aria-hidden="true"/>
  </div>;
}
