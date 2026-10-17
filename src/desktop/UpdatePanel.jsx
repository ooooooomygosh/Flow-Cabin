import React, { useEffect, useState } from 'react';
import { desktopCommand } from '../desktop-client';
import { updateView, UPDATE_EVENT, ACTION_LABELS, ACTION_COMMANDS } from './update-model.mjs';
import './update-panel.css';

// 设置 › 关于: current version, update status and the 自动下载 switch.
export default function UpdatePanel({ version, desktop }) {
  const [state, setState] = useState(() => (typeof window !== 'undefined' && window.cabinUpdateState) || null);
  useEffect(() => {
    if (!desktop) return;
    const receive = (event) => setState(event.detail || window.cabinUpdateState || null);
    window.addEventListener(UPDATE_EVENT, receive);
    desktopCommand('update-state');
    return () => window.removeEventListener(UPDATE_EVENT, receive);
  }, [desktop]);
  const view = updateView(state, { desktop });
  const native = state?.mode === 'install';
  return <div className="hub-row update-panel">
    <span><strong>心流小屋 v{version}</strong><small className="update-status" role="status" data-status={state?.status || 'idle'}>{view.label}{view.detail ? ` · ${view.detail}` : ''}</small>
      {view.progress !== undefined && <span className="update-progress" role="progressbar" aria-label="更新下载进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={view.progress}><i style={{ width: `${view.progress}%` }}/></span>}
      {view.notes && <details className="update-notes"><summary>更新说明</summary><pre>{view.notes}</pre></details>}
      {desktop && native && <label className="update-auto"><input type="checkbox" checked={state?.autoDownload !== false} onChange={(event) => desktopCommand('update-auto', { enabled: event.target.checked })}/>有新版本时自动下载（不会自动重启）</label>}
    </span>
    <span className="hub-row-actions">
      {view.actions.map((action) => <button type="button" key={action} className={`pixel-button${['install', 'relaunch', 'download', 'open-download'].includes(action) ? ' is-primary' : ''}`} onClick={() => desktopCommand(ACTION_COMMANDS[action])}>{ACTION_LABELS[action]}</button>)}
      {view.busy && <button type="button" className="pixel-button" disabled>检查中…</button>}
      <a className="pixel-button" href="https://github.com/ooooooomygosh/album-web" target="_blank" rel="noreferrer">项目主页</a>
    </span>
  </div>;
}
