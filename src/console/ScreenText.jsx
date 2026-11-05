import React, { useEffect, useRef, useState } from 'react';

// One line of text on a lit screen. When it is wider than the window it scrolls back and forth
// (a slow marquee, paused at both ends); reduced motion leaves it still with an ellipsis. The
// whole text is always in the DOM, so a screen reader reads it once, in full.
export default function ScreenText({ text, children, className = '', as: Tag = 'span', title }) {
  const box = useRef(null), inner = useRef(null), [shift, setShift] = useState(0);
  useEffect(() => {
    const measure = () => { const a = box.current, b = inner.current; if (a && b) setShift(Math.max(0, Math.ceil(b.scrollWidth - a.clientWidth))); };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (observer && box.current) observer.observe(box.current);
    return () => observer?.disconnect();
  }, [text]);
  return <Tag ref={box} className={`c-screen-text ${shift > 0 ? 'is-long' : ''} ${className}`} title={title ?? (text || undefined)} style={shift > 0 ? { '--shift': `${shift}px`, '--run': `${Math.max(6, shift / 18 + 5)}s` } : undefined}>
    <span ref={inner} className="c-screen-run">{children ?? (text || ' ')}</span>
  </Tag>;
}
