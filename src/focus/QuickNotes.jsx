import React from 'react';
import { useFocus } from './useFocus';
import { MAX_NOTE_LENGTH } from './focus-model.mjs';

// Built-in local tool: plain text only, no remote requests or script execution.
export default function QuickNotes() {
  const focus = useFocus();
  const notes = focus.state.notes || '';
  return <section className="focus-notes" aria-label="随手记">
    <p>先把突然想到的事记下来，继续专注。内容仅保存在本机。</p>
    <label>随手记<textarea aria-label="随手记内容" maxLength={MAX_NOTE_LENGTH} value={notes} placeholder="灵感、会议要点、稍后再做的事…" onChange={(event) => focus.saveNotes(event.target.value)}/></label>
    <div className="focus-task-footer"><span>{notes.length} / {MAX_NOTE_LENGTH}</span><button type="button" disabled={!notes} onClick={() => { if (window.confirm('清空随手记？此操作无法撤销。')) focus.saveNotes(''); }}>清空</button></div>
    {!focus.error && <small role="status">已自动保存到本机</small>}
  </section>;
}
