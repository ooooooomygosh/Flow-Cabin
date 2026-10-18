import React, { useEffect, useRef, useState } from 'react';
import { useFocusState } from './useFocus';
import { MAX_NOTE_LENGTH } from './focus-model.mjs';
import { ConfirmButton } from '../ui/Confirm';
import { archiveScratch } from './journal-entries.mjs';
import { openJournal } from './stats/journal-events.mjs';

const SAVE_DELAY_MS = 400, MAX_WAIT_MS = 2000;
// Built-in local tool: plain text only, no remote requests or script execution.
// Typing edits a local draft. The focus record (sessions included) is
// serialised on the first keystroke of a burst (so a failing save shows at
// once), then at most every 2 s while typing and once the typing pauses, on
// blur, when the window hides and on unmount — not on every keystroke.
export default function QuickNotes() {
  const focus = useFocusState(), saved = focus.state.notes || '';
  const [draft, setDraft] = useState(null), timer = useRef(0), burst = useRef(0), written = useRef(null), latest = useRef({ draft: null, focus });
  const [archiveNotice, setArchiveNotice] = useState('');
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
  const change = (value) => {
    setDraft(value); latest.current.draft = value;
    const now = Date.now();
    if (!burst.current) { burst.current = now; write(value); }
    else if (now - burst.current >= MAX_WAIT_MS) { burst.current = now; write(value); }
    clearTimeout(timer.current); timer.current = setTimeout(() => flushRef.current(), SAVE_DELAY_MS);
  };
  const notes = draft ?? saved;
  const archive = () => {
    flush();
    const result = archiveScratch({ storage: globalThis.localStorage, body: notes });
    setArchiveNotice(result.ok ? '已收进手记。便签原文也留着，可以继续写。' : result.error);
  };
  return <section className="focus-notes" aria-label="随手记">
    <p>先把突然想到的事记下来，继续专注。内容仅保存在本机。</p>
    <label>随手记<textarea aria-label="随手记内容" maxLength={MAX_NOTE_LENGTH} value={notes} placeholder="灵感、会议要点、稍后再做的事…" onChange={(event) => change(event.target.value)} onBlur={() => flush()}/></label>
    <div className="focus-task-footer"><span>{notes.length} / {MAX_NOTE_LENGTH}</span><ConfirmButton className="" disabled={!notes} question="清空随手记？清空后无法找回。" confirmLabel="确认清空" onConfirm={() => { clearTimeout(timer.current); timer.current = 0; burst.current = 0; latest.current.draft = null; setDraft(null); write(''); }}>清空</ConfirmButton></div>
    {!focus.error && <small role="status">{draft !== null && draft !== written.current ? '正在保存…' : '已自动保存到本机'}</small>}
    <div className="focus-task-footer"><button type="button" className="pixel-button" disabled={!notes.trim()} onClick={archive}>收进日记</button><button type="button" className="pixel-button" onClick={() => openJournal('entries')}>翻开手记</button></div>
    {archiveNotice && <small role="status">{archiveNotice}</small>}
  </section>;
}
