import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { addToast, removeToast } from './toast-model.mjs';

// notify(text) confirms quietly for 3.2 s; notify(text, { tone: 'error' }) is an alert
// that stays 6 s; notify(text, { action: { label: '撤销', run } }) offers one action.
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const notify = useCallback((text, options = {}) => setToasts(list => addToast(list, text, options)), []);
  const dismiss = useCallback(id => setToasts(list => removeToast(list, id)), []);
  return [toasts, notify, dismiss];
}

function Toast({ toast, dismiss }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => { if (paused) return; const timer = setTimeout(() => dismiss(toast.id), toast.duration); return () => clearTimeout(timer); }, [paused, toast.at, toast.duration, toast.id, dismiss]);
  return <p className={`app-toast ${toast.tone === 'error' ? 'is-error' : ''}`} role={toast.tone === 'error' ? 'alert' : 'status'}
    onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
    <span>{toast.text}</span>
    {toast.action && <button type="button" onClick={() => { dismiss(toast.id); toast.action.run(); }}>{toast.action.label}</button>}
  </p>;
}

// A manual popover lives in the browser's top layer, so toasts stay visible above
// open modal dialogs. Re-showing it on every new toast lifts it above a dialog that
// opened after it.
export function ToastStack({ toasts, dismiss }) {
  const host = useRef(null), newest = toasts.at(-1)?.id;
  useLayoutEffect(() => {
    const node = host.current; if (!node?.showPopover) return;
    try { if (node.matches(':popover-open')) node.hidePopover(); if (toasts.length) node.showPopover(); } catch {}
  }, [newest, toasts.length]);
  return <div ref={host} className="app-toasts" popover="manual" aria-live="polite">{toasts.map(toast => <Toast key={toast.id} toast={toast} dismiss={dismiss}/>)}</div>;
}
