import React, { useRef } from 'react';
import { playSfx } from '../props/sfx.mjs';

// A piano-style push key: a bakelite cap on a square stem that goes down when pressed. It is a
// plain <button> (names, disabled, keyboard — all as before); the key sounds are the desk's:
// key-press when it goes down, key-release when it comes back up. `tone` cream | black; `lit` puts
// the amber lamp on (the play key while music plays); `lamp` shows the lamp at all.
export default function PushKey({ tone = 'cream', lit = false, lamp = false, className = '', children, onClick, onPointerDown, onPointerUp, onPointerLeave, onPointerCancel, onKeyDown, onKeyUp, ...rest }) {
  const down = useRef(false);
  const press = () => { if (down.current) return; down.current = true; playSfx('key-press'); };
  const release = () => { if (!down.current) return; down.current = false; playSfx('key-release'); };
  const isKey = (event) => event.key === 'Enter' || event.key === ' ';
  return <button type="button" className={`c-key is-${tone}${lit ? ' is-lit' : ''}${lamp ? ' has-lamp' : ''} ${className}`} {...rest}
    onClick={onClick}
    onPointerDown={(event) => { if (!event.currentTarget.disabled) press(); onPointerDown?.(event); }}
    onPointerUp={(event) => { release(); onPointerUp?.(event); }}
    onPointerLeave={(event) => { release(); onPointerLeave?.(event); }}
    onPointerCancel={(event) => { release(); onPointerCancel?.(event); }}
    onKeyDown={(event) => { if (isKey(event) && !event.repeat && !event.currentTarget.disabled) press(); onKeyDown?.(event); }}
    onKeyUp={(event) => { if (isKey(event)) release(); onKeyUp?.(event); }}
    onBlur={release}>
    {lamp && <i className="c-key-lamp" aria-hidden="true"/>}
    <span className="c-key-cap">{children}</span>
  </button>;
}
