import React, { useEffect, useRef, useState } from 'react';

// The one in-app confirm for destructive actions (never window.confirm): the
// trigger turns into「question 取消 确认…」in place. Focus goes to 取消 (the safe
// choice) and back to the trigger when cancelled. Bulk or irreversible actions
// use this; a single small row is deleted at once and offered back (useUndo).
export function ConfirmButton({ question, confirmLabel, onConfirm, children, className = 'pixel-button', disabled, label, title, icon, skip }) {
  const [armed, setArmed] = useState(false), trigger = useRef(null), cancel = useRef(null), returnFocus = useRef(false);
  useEffect(() => {
    if (armed) cancel.current?.focus();
    else if (returnFocus.current) { returnFocus.current = false; trigger.current?.focus(); }
  }, [armed]);
  if (!armed) return <button type="button" ref={trigger} className={className} disabled={disabled} aria-label={label} title={title} onClick={() => skip?.() ? onConfirm() : setArmed(true)}>{icon}{children}</button>;
  const back = () => { returnFocus.current = true; setArmed(false); };
  return <span className="confirm-inline" role="group" aria-label={question} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); back(); } }}>
    <span>{question}</span>
    <button type="button" ref={cancel} className="pixel-button is-quiet" onClick={back}>取消</button>
    <button type="button" className="pixel-button is-danger" onClick={() => { if (onConfirm() !== false) setArmed(false); }}>{confirmLabel}</button>
  </span>;
}

// 「已删除 x · 撤销」for 6 s after a single small row is removed.
export function useUndo(ms = 6000) {
  const [offer, setOffer] = useState(null);
  useEffect(() => { if (!offer) return; const timer = setTimeout(() => setOffer(null), ms); return () => clearTimeout(timer); }, [offer, ms]);
  return [offer, (text, restore) => setOffer({ text, restore, at: Date.now() }), () => setOffer(null)];
}
export function UndoLine({ offer, clear }) {
  if (!offer) return null;
  return <p className="undo-line" role="status" key={offer.at}><span>{offer.text}</span><button type="button" className="pixel-button is-quiet" onClick={() => { offer.restore(); clear(); }}>撤销</button></p>;
}
