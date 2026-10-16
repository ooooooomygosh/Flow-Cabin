import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import './mini.css';

// 沉入桌面 mini player. Idle: a quiet pixel strip with the track name.
// Hover: play / sound / focus / 浮出 buttons. Double-click: back to the window.
export function MiniPlayer({ snapshot, command, player = () => {}, exit }) {
  const playing = Boolean(snapshot?.musicPlaying || snapshot?.playing), phase = snapshot?.focus?.phase || 'idle', paused = snapshot?.focus?.paused === true;
  const focusLabel = phase === 'idle' ? '开始专注' : paused ? (phase === 'focus' ? '继续专注' : '继续休息') : (phase === 'focus' ? '暂停专注' : '暂停休息');
  const track = snapshot?.track || (playing ? '正在播放' : '唱机休息中');
  return <div className={`mini-bar ${playing ? 'is-playing' : ''}`} onDoubleClick={exit} title="双击回到小屋窗口">
    <span className="mini-disc" aria-hidden="true"/>
    <span className="mini-track">{track}</span>
    <nav className="mini-actions" aria-label="迷你唱机">
      <button type="button" aria-label="上一首" onClick={() => player('previous')}>◀◀</button>
      <button type="button" aria-label={playing ? '暂停' : '播放'} onClick={() => player('toggle')}>{playing ? '❚❚' : '▶'}</button>
      <button type="button" aria-label="下一首" onClick={() => player('next')}>▶▶</button>
      <button type="button" aria-label="开关小屋声音" onClick={() => command('sound-toggle')}>♪</button>
      <button type="button" aria-label={focusLabel} onClick={() => command('focus-toggle')}>◷</button>
      <button type="button" className="is-primary" aria-label="浮出桌面" onClick={exit}>浮出</button>
    </nav>
  </div>;
}

function MiniApp() {
  const api = window.albumMini, [snapshot, setSnapshot] = useState(null);
  useEffect(() => { if (!api) return; api.getSnapshot().then((value) => value && setSnapshot(value)).catch(() => {}); return api.onSnapshot(setSnapshot); }, [api]);
  return <MiniPlayer snapshot={snapshot} command={(value) => api?.command(value)} player={(action) => api?.player?.(action)} exit={() => api?.exit()}/>;
}
const root = document.getElementById('root');
if (root) createRoot(root).render(<MiniApp/>);
