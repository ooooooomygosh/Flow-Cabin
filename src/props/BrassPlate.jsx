import React from 'react';

// A brass plate with engraved lettering and two screws: the only kind of label the desk has.
// `arrow` shows where it leads (↑ opens a view above, ‹ › the next corner, ↓ the drawer).
// It is a real <button> (or <a>, or a plain <span> when it is only a label), so the keyboard
// and screen readers see exactly what a mouse does.
// Recipe from DEsk (https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors, draw.c allapps_plate).
export default function BrassPlate({ as, children, arrow, className = '', tone, ...rest }) {
  const Tag = as || (rest.href ? 'a' : rest.onClick || rest.type ? 'button' : 'span');
  const props = Tag === 'button' && !rest.type ? { type: 'button', ...rest } : rest;
  return <Tag className={`brass-plate ${tone ? `is-${tone}` : ''} ${className}`} {...props}>
    <span className="brass-plate-text">{children}</span>
    {arrow && <span className="brass-plate-arrow" aria-hidden="true">{arrow}</span>}
  </Tag>;
}
