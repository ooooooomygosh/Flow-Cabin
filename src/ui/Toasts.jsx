import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
// open modal dialogs. A modal makes everything outside it inert, though, so while one
// is open the stack is rendered inside the topmost dialog: its 撤销 button stays
// clickable. Re-showing the popover on every change keeps it above that dialog.
const topDialog = () => [...document.querySelectorAll('dialog[open]')].at(-1) || null;
function useTopDialog() {
  const [dialog, setDialog] = useState(topDialog);
  useEffect(() => {
    const observer = new MutationObserver(() => setDialog(previous => { const next = topDialog(); return next === previous ? previous : next; }));
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
    return () => observer.disconnect();
  }, []);
  return dialog;
}
export function ToastStack({ toasts, dismiss }) {
  const host = useRef(null), newest = toasts.at(-1)?.id, dialog = useTopDialog();
  useLayoutEffect(() => {
    const node = host.current; if (!node?.showPopover) return;
    try { if (node.matches(':popover-open')) node.hidePopover(); if (toasts.length) node.showPopover(); } catch {}
  }, [newest, toasts.length, dialog]);
  const stack = <div ref={host} key={dialog ? 'in-dialog' : 'page'} className="app-toasts" popover="manual" aria-live="polite">{toasts.map(toast => <Toast key={toast.id} toast={toast} dismiss={dismiss}/>)}</div>;
  return dialog ? createPortal(stack, dialog) : stack;
}
