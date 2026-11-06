import React, { useEffect, useRef, useState } from 'react';
import { useFocusState } from './useFocus';
import { MAX_NOTE_LENGTH } from './focus-model.mjs';
import { ConfirmButton } from '../ui/Confirm';
import { archiveScratch } from './journal-entries.mjs';
import { openJournal } from './stats/journal-events.mjs';
import { playSfx } from '../props/sfx.mjs';
import { reducedMotion } from '../motion-preference.mjs';
import Coil from './desk/Coil';
import './desk/desk-focus.css';

const SAVE_DELAY_MS = 400, MAX_WAIT_MS = 2000;
// Built-in local tool: plain text only, no remote requests or script execution.
// Typing edits a local draft. The focus record (sessions included) is
// serialised on the first keystroke of a burst (so a failing save shows at
// once), then at most every 2 s while typing and once the typing pauses, on
// blur, when the window hides and on unmount — not on every keystroke.
//
// 3.1: DEsk's memo pad held up close (https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors;
// src/draw.c memo_sheet): a pad of cream sheets on a board, the wire through their tops, a red MEMO
// head and the sheet's number, blue rules, a red margin, and the writing in a blue-black hand sitting
// on the rules. It is one long sheet: the rules scroll with the writing. 收进日记 tears a copy off over
// the wire into 唱片日记 › 手记 (the writing stays on the pad).
export default function QuickNotes() {
  const focus = useFocusState(), saved = focus.state.notes || '';
  const [draft, setDraft] = useState(null), timer = useRef(0), burst = useRef(0), written = useRef(null), latest = useRef({ draft: null, focus });
  const [archiveNotice, setArchiveNotice] = useState(''), [tearing, setTearing] = useState(false), coil = useRef(`memo-${Math.random().toString(36).slice(2, 8)}`).current;
  latest.current = { draft, focus };
  const write = (value) => { written.current = value; latest.current.focus.saveNotes(value); };
  const flush = () => {
    clearTimeout(timer.current); timer.current = 0; burst.current = 0;
    const value = latest.current.draft; if (value === null) return;
    if (value !== written.current) write(value);
    latest.current.draft = null; setDraft(null);
  };
  const flushRef = useRef(flush); flushRef.current = flush;
  useEffect(() => {
    const hide = () => { if (document.hidden) flushRef.current(); }, leave = () => flushRef.current();
    document.addEventListener('visibilitychange', hide); window.addEventListener('pagehide', leave);
    return () => { document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', leave); flushRef.current(); };
  }, []);
  useEffect(() => { if (!tearing) return undefined; const id = setTimeout(() => setTearing(false), 700); return () => clearTimeout(id); }, [tearing]);
  const change = (value) => {
    setDraft(value); latest.current.draft = value;
    const now = Date.now();
    if (!burst.current) { burst.current = now; write(value); }
    else if (now - burst.current >= MAX_WAIT_MS) { burst.current = now; write(value); }
    clearTimeout(timer.current); timer.current = setTimeout(() => flushRef.current(), SAVE_DELAY_MS);
  };
  const notes = draft ?? saved, lines = notes ? notes.split('\n').length : 0;
  const archive = () => {
    flush();
    const result = archiveScratch({ storage: globalThis.localStorage, body: notes });
    if (result.ok) { playSfx('page-turn'); if (!reducedMotion()) setTearing(true); }
    setArchiveNotice(result.ok ? '已收进手记。便签原文也留着，可以继续写。' : result.error);
  };
  return <div className="memo-closeup">
    <section className="memo-pad" aria-label="随手记">
      <div className="memo-board" aria-hidden="true"/>
      <div className="memo-under" aria-hidden="true"/>
      {tearing && <div className="memo-torn" aria-hidden="true"><span className="memo-head-print"><b>MEMO</b><i>No. 1</i></span></div>}
      <div className="memo-sheet">
        <header className="memo-head"><b aria-hidden="true">MEMO</b><span className="memo-no" aria-hidden="true">No. 1{lines > 1 ? ` · ${lines} 行` : ''}</span><h3 className="sr-only">随手记</h3></header>
        <label className="memo-lines"><textarea aria-label="随手记内容" maxLength={MAX_NOTE_LENGTH} value={notes} placeholder="写在这里…灵感、会议要点、稍后再做的事" spellCheck={false} onChange={(event) => change(event.target.value)} onBlur={() => flush()}/></label>
      </div>
      <Coil id={coil}/>
    </section>
    <footer className="memo-foot">
      <span className="memo-count">{notes.length} / {MAX_NOTE_LENGTH}</span>
      {!focus.error && <small role="status">{draft !== null && draft !== written.current ? '正在保存…' : '已自动保存到本机'}</small>}
      <span className="memo-actions">
        <button type="button" className="sheet-link" disabled={!notes.trim()} onClick={archive}>收进日记</button>
        <button type="button" className="sheet-link" onClick={() => openJournal('entries')}>翻开手记</button>
        <ConfirmButton className="sheet-link" disabled={!notes} question="清空随手记？清空后无法找回。" confirmLabel="确认清空" onConfirm={() => { clearTimeout(timer.current); timer.current = 0; burst.current = 0; latest.current.draft = null; setDraft(null); write(''); }}>清空</ConfirmButton>
      </span>
      {archiveNotice && <small className="memo-notice" role="status">{archiveNotice}</small>}
    </footer>
  </div>;
}
