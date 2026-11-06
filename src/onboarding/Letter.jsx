import React from 'react';
import './letter.css';

// The guide and the 新功能 sheet are letters on typewriter paper (docs/v3-desk-design.md): a typed letterhead
// across the top, the text in a typewriter face, a handwritten sign-off at the foot. Both pieces are print and
// ink only: they carry no text a screen reader or a test would find twice, so what is said sits in attributes
// that CSS prints (`content: attr(...)`), and the real content of each step is untouched.

// 心流小屋 — a line about the letter — the date, typed.
export function LetterHead({ note = '' }) {
  const date = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  return <div className="letter-head" aria-hidden="true" data-name="心流小屋" data-note={note} data-date={date}/>;
}

// A line in pen at the foot, then the name.
export function LetterSign({ line = '' }) {
  return <div className="letter-sign" aria-hidden="true" data-line={line}/>;
}

// What the cat writes under each step.
export const SIGN_LINES = Object.freeze({
  source: '先挑个音源，不急。',
  room: '挑个伙伴，随你喜欢。',
  test: '试一下声音，我们就开门了。',
  news: '慢慢看，有空再试。'
});
