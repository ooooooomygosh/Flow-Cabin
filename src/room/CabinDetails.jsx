import React, { useEffect, useState } from 'react';
import { useSoundscape } from '../audio/useSoundscape';

// Hotspots are attached to painted objects in art coordinates, so they move
// with the room instead of becoming another floating toolbar.
export default function CabinDetails() {
  const sound = useSoundscape(), [dim, setDim] = useState(false), [notice, setNotice] = useState('');
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 3000); return () => clearTimeout(timer); }, [notice]);
  const fireOn = Boolean(sound?.enabled && sound?.mix?.tracks?.fire > 0);
  const fire = () => {
    sound?.setTrack('fire', fireOn ? 0 : .3);
    setNotice(fireOn ? '炉火继续暖着，声音先歇一会儿。' : '炉火轻轻响着。声音里还能调节音量。');
  };
  return <>
    <div className={`cabin-rest-light${dim ? ' is-dim' : ''}`} aria-hidden="true"/>
    <button className="cabin-object cabin-lamp" type="button" aria-label="阅读灯" aria-pressed={!dim} title="阅读灯 · 调暗 / 点亮" onClick={() => { setDim(!dim); setNotice(dim ? '灯亮了，欢迎回来。' : '灯光暗一点，眼睛也歇一会儿。'); }}><span>{dim ? '点亮阅读灯' : '调暗阅读灯'}</span></button>
    <button className="cabin-object cabin-window" type="button" aria-label="窗外天气与时间设置" title="窗外 · 天气与时间" onClick={() => window.dispatchEvent(new CustomEvent('cabin-open-settings', { detail: { section: 'room' } }))}><span>看看窗外</span></button>
    {sound && <button className="cabin-object cabin-hearth" type="button" aria-label="壁炉声音" aria-pressed={fireOn} title="壁炉 · 开关柴火声" onClick={fire}><span>{fireOn ? '让炉火安静些' : '听听柴火声'}</span></button>}
    <span className="cabin-tea-steam" aria-hidden="true"><i/><i/><i/></span>
    {notice && <p className="cabin-object-note" role="status">{notice}</p>}
  </>;
}
