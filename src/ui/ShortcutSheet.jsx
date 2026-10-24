import React, { useEffect, useMemo, useState } from 'react';
import Dialog from '../Dialog';
import { groupShortcuts, isHelpKey, isTypingTarget } from './shortcut-sheet.mjs';
import './shortcut-sheet.css';

// 快捷键速查: "?" or Ctrl/⌘+/ anywhere (except while typing) toggles one sheet
// built from src/shortcuts.mjs. Other surfaces open it with the
// `cabin:shortcuts` window event (设置 › 显示与桌面 › 快捷键).
export default function ShortcutSheet() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const key = (event) => {
      if (!isHelpKey(event) || isTypingTarget(event.target)) return;
      event.preventDefault();
      setOpen((value) => !value);
    };
    const show = () => setOpen(true);
    window.addEventListener('keydown', key);
    window.addEventListener('cabin:shortcuts', show);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('cabin:shortcuts', show); };
  }, []);
  if (!open) return null;
  return <ShortcutDialog close={() => setOpen(false)}/>;
}

function ShortcutDialog({ close }) {
  const desktop = typeof document !== 'undefined' && document.documentElement.dataset.desktopClient === 'true';
  const groups = useMemo(() => groupShortcuts(undefined, { desktop }), [desktop]);
  return <Dialog title="快捷键" label="快捷键" close={close} className="shortcut-sheet" size="lg">
    <div className="shortcut-sheet-groups">{groups.map((group) => <section key={group.id} aria-labelledby={`shortcut-group-${group.id}`}>
      <h3 id={`shortcut-group-${group.id}`}>{group.label}</h3>
      <dl>{group.entries.map((entry) => <div key={entry.id}><dt>{entry.label.split(' / ').map((part, index) => <React.Fragment key={part}>{index > 0 && <span className="shortcut-sheet-or">或</span>}<kbd>{part}</kbd></React.Fragment>)}</dt><dd>{entry.action}</dd></div>)}</dl>
    </section>)}</div>
    <p className="shortcut-sheet-hint">输入文字时这些按键不会生效。按 <kbd>?</kbd> 或 <kbd>Ctrl/⌘+/</kbd> 随时打开或关上这张表。</p>
  </Dialog>;
}
