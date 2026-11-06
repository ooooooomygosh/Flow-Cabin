import React, { useEffect, useRef } from 'react';
import { letterTime, APP_NAME } from './post.mjs';
import { LETTER, CARD } from './layout.mjs';
import { deskUrl } from './images.mjs';
import './post.css';

// The post box's letters as DEsk draws them (https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk
// authors; src/draw.c post_card_face, desk-pages/tryit zh/letter.webp): letter paper, ruled; at the top
// the sender's mark (a small square: the app's icon), who it is from in type, the time at the right; a
// hand-ruled line under the head, what it is about in bold, and what it says on the lines. A letter in
// the box shows its head and the first lines; taken out, it lies on the desk whole, with what can be
// done about it typed at its foot.

const ICON = '/icons/icon-192.png';
const kindWord = { welcome: '欢迎信', release: '更新说明', notice: '便条', mail: '来信' };

function Head({ letter, now, card }) {
  return <div className={card ? 'post-card-head' : 'post-letter-head'}>
    <img className="post-mark" src={ICON} alt="" draggable="false"/>
    {card ? <span className="post-card-who">
      <b className="post-card-title">{letter.title}</b>
      <span className="post-from"><span>寄件人</span> <b>{letter.from || APP_NAME}</b></span>
    </span> : <b className="post-letter-from">{letter.from || APP_NAME}</b>}
    <time className="post-time" dateTime={letter.at ? new Date(letter.at).toISOString() : undefined}>{letterTime(letter.at, now)}</time>
  </div>;
}

// One letter standing in the box. `depth` 0 is the one in front.
// `place` is where it stands on the window ({ x, y }) and `scale` the view's scale times the card's own.
export function BoxCard({ letter, card, place, scale, now, onClick, front }) {
  const label = `${letter.title}，寄件人 ${letter.from || APP_NAME}${letter.read ? '' : '，未读'}${front ? '，取出来读' : '，翻到这封'}`;
  return <button type="button" className={`post-card ${letter.read ? '' : 'is-unread'} ${letter.tone === 'error' ? 'is-express' : ''} ${front ? 'is-front' : ''}`}
    style={{ left: place.x, top: place.y, width: CARD.w, height: CARD.h, transform: `scale(${scale})`, '--dim': card.dim, zIndex: 10 - card.depth }}
    aria-label={label} data-autofocus={front || undefined} onClick={onClick}>
    <span className="post-card-face" aria-hidden="true">
      <Head letter={letter} now={now} card/>
      <span className="post-card-body">{letter.body}</span>
    </span>
  </button>;
}

// The letter taken out, lying on the desk. Clicking the paper (not one of its buttons) or Esc puts it
// back; the caller plays DEsk's flight back to the box.
export function LyingLetter({ letter, rect, now, phone, onAway, onStep, onAction, onDiscard, onUnread }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, [letter.id]);
  const away = (event) => { if (event.target.closest('button,a')) return; onAway(); };
  return <div className="post-letter-at" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} onClick={away}>
    <article ref={ref} tabIndex={-1} className={`post-letter ${phone ? 'is-phone' : ''} ${letter.tone === 'error' ? 'is-express' : ''}`} role="dialog" aria-modal="false"
      aria-label={`${kindWord[letter.kind] || '信'} · ${letter.title}`}
      style={{ width: LETTER.w, height: LETTER.h, transform: `scale(${rect.s})`, backgroundImage: `url(${deskUrl('letter-blank.webp')})` }}>
      <Head letter={letter} now={now}/>
      <h2 className="post-letter-title">{letter.title}</h2>
      <div className="post-letter-body">
        {letter.body.split('\n').map((line, i) => <p key={i}>{line}</p>)}
        {letter.steps?.length > 0 && <ol className="post-letter-steps" aria-label="三件小事">
          {letter.steps.map((step, i) => <li key={step.id}><button type="button" onClick={() => onStep(step)}><span className="post-step-n" aria-hidden="true">{i + 1}.</span> <b>{step.label}</b>{step.hint && <small> — {step.hint}</small>}</button></li>)}
        </ol>}
      </div>
      <div className="post-letter-actions">
        {letter.actions?.map((action) => <button type="button" key={action.id + (action.arg || '')} onClick={() => onAction(action)}>{action.label}</button>)}
        {letter.source !== 'cabin' && <button type="button" onClick={onUnread}>标为未读</button>}
        {letter.source !== 'cabin' && <button type="button" onClick={onDiscard}>丢掉</button>}
        <button type="button" className="post-letter-away" onClick={onAway}>放回信箱</button>
      </div>
    </article>
  </div>;
}
