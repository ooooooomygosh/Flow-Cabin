import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { gridIndex, rovingIndex } from './roving-keys.mjs';

// items: [{ id, label, icon?, title?, disabled? }]. Only the selected entry is in
// the Tab order; arrows/Home/End move the selection and the focus together.
function useRoving(items, value, onChange, orientation) {
  const refs = useRef({});
  const onKeyDown = (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const enabled = items.filter((item) => !item.disabled);
    const next = enabled[rovingIndex(event.key, enabled.findIndex((item) => item.id === value), enabled.length, orientation)];
    if (!next) return;
    event.preventDefault(); onChange(next.id); refs.current[next.id]?.focus();
  };
  const current = items.some((item) => item.id === value && !item.disabled) ? value : items.find((item) => !item.disabled)?.id;
  return { refs, onKeyDown, tabIndex: (id) => id === current ? 0 : -1 };
}

// One tablist. Pair it with <div {...tabPanelProps(idPrefix, value)}>. `arrows`
// widens the keys (a rail that flips orientation with the window takes 'both').
// An item may bring its own body (`content`) and its own class (`className`);
// the label is then only the fallback name.
export function Tabs({ items, value, onChange, label, idPrefix, orientation = 'horizontal', arrows = orientation, className = '' }) {
  const fallback = useId(), prefix = idPrefix || fallback, { refs, onKeyDown, tabIndex } = useRoving(items, value, onChange, arrows);
  return <nav role="tablist" aria-label={label} aria-orientation={orientation} className={className}>{items.map((item) => <button type="button" role="tab" key={item.id} ref={(node) => { refs.current[item.id] = node; }} id={`${prefix}-${item.id}`} aria-controls={`${prefix}-panel`} aria-selected={item.id === value} tabIndex={tabIndex(item.id)} disabled={item.disabled} title={item.title} onKeyDown={onKeyDown} onClick={() => onChange(item.id)} className={item.className}>{item.content ?? <>{item.icon}{item.label}</>}</button>)}</nav>;
}
export const tabPanelProps = (idPrefix, value) => ({ role: 'tabpanel', id: `${idPrefix}-panel`, 'aria-labelledby': `${idPrefix}-${value}` });

// One segmented control (a radiogroup): the same keys, `aria-checked` instead of tabs.
export function Segmented({ items, value, onChange, label, className = 'segmented' }) {
  const { refs, onKeyDown, tabIndex } = useRoving(items, value, onChange, 'both');
  return <span role="radiogroup" aria-label={label} className={className}>{items.map((item) => <button type="button" role="radio" key={item.id} ref={(node) => { refs.current[item.id] = node; }} aria-checked={item.id === value} tabIndex={tabIndex(item.id)} disabled={item.disabled} title={item.title} onKeyDown={onKeyDown} onClick={() => onChange(item.id)}>{item.icon}{item.label}</button>)}</span>;
}

// A grid of toggle buttons (the album wall's library): the whole grid is one
// Tab stop and the arrow keys walk it — ← → along a row, ↑ ↓ a row up or down,
// Home/End the ends of the row, PageUp/PageDown the first/last row. Enter and
// Space still toggle the tile under the focus, so nothing is mouse-only.
// `renderItem(item, index, props)` returns the tile; `props` carries the ref,
// the roving tabIndex and the key handling.
export function ToggleGrid({ items, columns = 1, label, className = '', renderItem }) {
  const root = useRef(null), refs = useRef([]), lastFocused = useRef(null), [focus, setFocus] = useState(0), [cols, setCols] = useState(columns);
  // The grid may reflow (the wall widens on a big screen): read the real column
  // count off the layout instead of guessing it here.
  useLayoutEffect(() => {
    const node = root.current; if (!node) return undefined;
    const measure = () => {
      const template = getComputedStyle(node).gridTemplateColumns;
      const count = template && template !== 'none' ? template.split(' ').filter(Boolean).length : 0;
      if (count) setCols(count);
    };
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(node);
    return () => observer?.disconnect();
  }, []);
  // A shorter list (a search narrowed it) must not leave the focus past the end.
  // The tile that held the focus may be gone with it: the focus would drop to
  // <body> and the Tab order would start from the top of the page again. Keep
  // it inside the grid, on the tile that took its place.
  useEffect(() => {
    if (focus < items.length) return;
    const next = Math.max(0, items.length - 1);
    setFocus(next);
    const active = document.activeElement, gone = lastFocused.current && !lastFocused.current.isConnected;
    if (gone && (!active || active === document.body)) refs.current[next]?.focus();
  }, [items.length, focus]);
  const key = (event, index) => {
    const next = gridIndex(event.key, index, items.length, cols);
    if (next < 0) return;
    event.preventDefault(); setFocus(next); refs.current[next]?.focus();
  };
  return <div ref={root} role="group" aria-label={label} className={className}>{items.map((item, index) => renderItem(item, index, {
    ref: (node) => { refs.current[index] = node; },
    tabIndex: index === focus ? 0 : -1,
    onFocus: () => { lastFocused.current = refs.current[index]; setFocus(index); },
    onKeyDown: (event) => key(event, index)
  }))}</div>;
}
