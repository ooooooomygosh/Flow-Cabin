import React, { useEffect, useState } from 'react';
import { MEDIA_KEYS_EVENT, MINI_PLAYER_EVENT, MEDIA_KEY_ACTIONS, getMediaKeys, getMiniPlayer, setMediaKeysEnabled, setMediaKey, resetMediaKeys, requestMediaKeys, setMiniPlayer, onDesktopState, acceleratorFromEvent, acceleratorLabel } from './media-keys-client.mjs';

const mac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgentData?.platform || navigator.platform || '');
const Row = ({ title, hint, children }) => <div className="hub-row"><span><strong>{title}</strong>{hint && <small>{hint}</small>}</span>{children && <span className="hub-row-actions">{children}</span>}</div>;

// 设置 › 显示与桌面: the floating mini player (outside 沉入桌面 too) and the global
// media hotkeys. Both rows appear only when the desktop shell has published its state.
export function MiniPlayerRow() {
  const [state, setState] = useState(getMiniPlayer);
  useEffect(() => onDesktopState(MINI_PLAYER_EVENT, getMiniPlayer, setState), []);
  if (!state) return null;
  return <Row title="迷你唱机" hint="一条可拖动的小唱机：封面、歌词、进度和音量。沉入桌面时也会出现；托盘菜单和「控制」菜单也能开关。">
    <label className="hub-toggle"><input type="checkbox" aria-label="显示迷你唱机" checked={state.shown} onChange={(event) => setMiniPlayer({ shown: event.target.checked })}/><span>{state.shown ? '开' : '关'}</span></label>
    <label className="hub-toggle"><input type="checkbox" aria-label="迷你唱机总在最前" checked={state.alwaysOnTop} onChange={(event) => setMiniPlayer({ alwaysOnTop: event.target.checked })}/><span>总在最前</span></label>
  </Row>;
}

function KeyRecorder({ action, label, value, failed }) {
  const [listening, setListening] = useState(false), [hint, setHint] = useState('');
  const keydown = (event) => {
    if (!listening) return;
    event.preventDefault(); event.stopPropagation();
    if (event.key === 'Escape' && !event.ctrlKey && !event.metaKey && !event.altKey) { setListening(false); setHint(''); return; }
    if ((event.key === 'Backspace' || event.key === 'Delete') && !event.ctrlKey && !event.metaKey && !event.altKey) { setMediaKey(action, ''); setListening(false); setHint(''); return; }
    const accelerator = acceleratorFromEvent(event, { mac });
    if (accelerator === '') return;
    if (!accelerator) { setHint('要和 Ctrl / ⌘ 或 Alt 一起按'); return; }
    setMediaKey(action, accelerator); setListening(false); setHint('');
  };
  return <div className="hub-key-row">
    <span>{label}</span>
    <button type="button" className={`pixel-button hub-key${listening ? ' is-listening' : ''}${failed ? ' is-failed' : ''}`} aria-label={`${label} 快捷键：${listening ? '请按下新的组合键' : acceleratorLabel(value, { mac })}${failed ? '，已被其他程序占用' : ''}`} onClick={() => { setListening(!listening); setHint(''); }} onKeyDown={keydown} onBlur={() => setListening(false)}>
      {listening ? '按下组合键…' : acceleratorLabel(value, { mac })}
    </button>
    {(hint || failed) && <small role="status">{hint || '已被其他程序占用，换一个组合吧'}</small>}
  </div>;
}

export function MediaKeysRows() {
  const [state, setState] = useState(getMediaKeys);
  useEffect(() => { const off = onDesktopState(MEDIA_KEYS_EVENT, getMediaKeys, setState); if (!getMediaKeys()) requestMediaKeys(); return off; }, []);
  if (!state) return null;
  return <>
    <Row title="全局媒体快捷键" hint="小屋在后台或收进托盘时也能用：播放 / 暂停、上一首、下一首、音量、桌面歌词。点按键后按下新的组合；Delete 清除，Esc 取消。">
      <label className="hub-toggle"><input type="checkbox" aria-label="全局媒体快捷键" checked={state.enabled} onChange={(event) => setMediaKeysEnabled(event.target.checked)}/><span>{state.enabled ? '开' : '关'}</span></label>
      <button type="button" className="pixel-button" onClick={() => resetMediaKeys()}>恢复默认</button>
    </Row>
    {state.enabled && <div className="hub-keys" role="group" aria-label="全局媒体快捷键">{MEDIA_KEY_ACTIONS.map(([id, label]) => <KeyRecorder key={id} action={id} label={label} value={state.bindings?.[id] || ''} failed={(state.failed || []).includes(id)}/>)}</div>}
  </>;
}
