import React, { useLayoutEffect, useRef } from 'react';
import { frameClock } from '../frame-clock.mjs';
import { wordProgress } from './lyric-timing.mjs';

// One sung line: each word is drawn twice (unsung base + sung fill clipped to its progress),
// so the fill can glow without bleeding through the text outline. Progress is written to
// CSS variables straight from the frame clock — the line never re-renders while it plays.
export default function KaraokeLine({ line, end, getTime, active = true, reduced = false, translation = '', roman = '', className = '', as: Tag = 'span', ...props }) {
  const host = useRef(null);
  useLayoutEffect(() => {
    const node = host.current; if (!node || !line) return;
    const words = [...node.querySelectorAll('[data-karaoke-word]')];
    const paint = () => {
      const time = getTime?.();
      const values = time === null || time === undefined ? words.map(() => 0) : wordProgress(line, time, end);
      // Reduced motion: whole words switch on instead of sweeping.
      words.forEach((word, i) => word.style.setProperty('--p', String(reduced ? (values[i] >= .5 ? 1 : 0) : values[i] ?? 0)));
      node.style.setProperty('--line-p', String(values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0));
    };
    paint();
    if (!active) return;
    return frameClock().subscribe(paint, { fps: reduced ? 8 : 60 });
  }, [line, end, getTime, active, reduced]);
  if (!line) return null;
  return <Tag ref={host} className={`karaoke-line ${className}`} {...props}>
    <span className="karaoke-words">{line.words.map((word, i) => <span key={i} className="karaoke-word" data-karaoke-word=""><span className="karaoke-base">{word.word}</span><span className="karaoke-fill" aria-hidden="true">{word.word}</span></span>)}</span>
    {roman && <small className="karaoke-roman">{roman}</small>}
    {translation && <small className="karaoke-translation">{translation}</small>}
  </Tag>;
}
