import React, { useEffect, useState } from 'react';
import { clampNumber } from './clamp-number.mjs';


// A number input that never saves a half-typed value: an empty or invalid field is not written
// (clearing it does not mean 0), Enter / blur commit the clamped number, Escape and blur restore.
// `live` also commits every valid value while typing (for settings with an instant preview).
export function NumberField({ value, min = 0, max = 9999, onCommit, live = false, ...props }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => { const next = clampNumber(draft, min, max, value); setDraft(String(next)); if (next !== value) onCommit(next); };
  return <input type="number" inputMode="numeric" min={min} max={max} {...props} value={draft}
    onChange={(event) => { setDraft(event.target.value); const next = clampNumber(event.target.value, min, max, null); if (live && next !== null && next !== value) onCommit(next); }}
    onBlur={commit}
    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit(); } if (event.key === 'Escape' && draft !== String(value)) { event.stopPropagation(); setDraft(String(value)); } }}/>;
}
