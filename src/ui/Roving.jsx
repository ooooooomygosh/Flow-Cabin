import React, { useId, useRef } from 'react';
import { rovingIndex } from './roving.mjs';

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

// One tablist. Pair it with <div {...tabPanelProps(idPrefix, value)}>.
export function Tabs({ items, value, onChange, label, idPrefix, orientation = 'horizontal', className = '' }) {
  const fallback = useId(), prefix = idPrefix || fallback, { refs, onKeyDown, tabIndex } = useRoving(items, value, onChange, orientation);
  return <nav role="tablist" aria-label={label} aria-orientation={orientation} className={className}>{items.map((item) => <button type="button" role="tab" key={item.id} ref={(node) => { refs.current[item.id] = node; }} id={`${prefix}-${item.id}`} aria-controls={`${prefix}-panel`} aria-selected={item.id === value} tabIndex={tabIndex(item.id)} disabled={item.disabled} title={item.title} onKeyDown={onKeyDown} onClick={() => onChange(item.id)}>{item.icon}{item.label}</button>)}</nav>;
}
export const tabPanelProps = (idPrefix, value) => ({ role: 'tabpanel', id: `${idPrefix}-panel`, 'aria-labelledby': `${idPrefix}-${value}` });

// One segmented control (a radiogroup): the same keys, `aria-checked` instead of tabs.
export function Segmented({ items, value, onChange, label, className = 'segmented' }) {
  const { refs, onKeyDown, tabIndex } = useRoving(items, value, onChange, 'both');
  return <span role="radiogroup" aria-label={label} className={className}>{items.map((item) => <button type="button" role="radio" key={item.id} ref={(node) => { refs.current[item.id] = node; }} aria-checked={item.id === value} tabIndex={tabIndex(item.id)} disabled={item.disabled} title={item.title} onKeyDown={onKeyDown} onClick={() => onChange(item.id)}>{item.icon}{item.label}</button>)}</span>;
}
