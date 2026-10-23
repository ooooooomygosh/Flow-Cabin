import React, { useEffect, useState } from 'react';
import { useFocusState } from '../focus/useFocus';
import { desktopCommand } from '../desktop/desktop-command.mjs';

// 设置 › 房间与桌宠 › 伙伴的脾气: every companion behaviour in one place. 免打扰 lives in the focus
// record (the room cat, the wallpaper and the desktop pet all read it); the desktop pet's own
// switches live in the shell (pet.json) and arrive with album-pet-state.
const DEFAULTS = { bubbles: true, walk: true, gravity: true, onTop: true, locked: false, clickThrough: false, autoHide: true, opacity: 1 };
const SWITCHES = [
  ['bubbles', '显示气泡', '只在开始、过半、最后 1 分钟和结束时说一句，不挡住下面的点击。'],
  ['walk', '自己走动', '没在专注、没放音乐时偶尔沿着屏幕底部散步，可以走到并排的另一块屏幕。'],
  ['gravity', '落到底部', '拖起放下后落到任务栏 / 程序坞上；关掉则停在放下的位置。'],
  ['onTop', '保持置顶', '一直浮在其他窗口上面。'],
  ['locked', '锁定位置', '不能拖动，也不会走开；单击和右键菜单照常可用。'],
  ['clickThrough', '始终鼠标穿透', '鼠标完全穿过伙伴。想再摸摸它时，在这里或托盘菜单里关掉。'],
  ['autoHide', '全屏时自动隐藏', '看视频、玩游戏或演示时先躲起来（macOS 一直如此；Windows 需要桌面版助手）。']
];
const readPet = () => window.albumPetState || {};

export default function PetBehaviourSettings({ desktop = false }) {
  const focus = useFocusState(), [pet, setPet] = useState(readPet);
  useEffect(() => { const receive = (event) => setPet(event.detail || {}); window.addEventListener('album-pet-state', receive); return () => window.removeEventListener('album-pet-state', receive); }, []);
  const prefs = { ...DEFAULTS, ...(pet.prefs || {}) }, quiet = Boolean(focus?.state.settings.quietMode);
  const set = (change) => { setPet((now) => ({ ...now, prefs: { ...prefs, ...change } })); desktopCommand('pet-prefs', change); };
  const hidden = pet.hiddenUntil > Date.now();
  return <section className="pet-behaviour" aria-label="伙伴的脾气">
    <header><strong>伙伴的脾气</strong><small>小屋里的伙伴、桌面壁纸和桌宠都按这里来。</small></header>
    <label className="focus-check"><input type="checkbox" checked={quiet} disabled={!focus} onChange={(event) => focus?.settings({ quietMode: event.target.checked })}/>免打扰：安静陪着，不跟着音乐跳、不主动说话、不讨食</label>
    {desktop ? <>
      <div className="pet-behaviour-grid">{SWITCHES.map(([key, label, hint]) => <label key={key} className="focus-check" title={hint}><input type="checkbox" checked={Boolean(prefs[key])} onChange={(event) => set({ [key]: event.target.checked })}/><span>{label}<small>{hint}</small></span></label>)}</div>
      <label className="pet-behaviour-opacity">透明度<input type="range" min="30" max="100" step="5" aria-label="桌宠透明度" value={Math.round(prefs.opacity * 100)} onChange={(event) => set({ opacity: Number(event.target.value) / 100 })}/><span>{Math.round(prefs.opacity * 100)}%</span></label>
      <div className="pet-behaviour-actions">
        {hidden ? <button type="button" className="pixel-button" onClick={() => desktopCommand('pet-hide', { hours: 0 })}>现在叫伙伴出来</button>
          : <button type="button" className="pixel-button" disabled={!pet.active} onClick={() => desktopCommand('pet-hide', { hours: 1 })}>桌宠隐藏 1 小时</button>}
        <small>{pet.active ? hidden ? `隐藏到 ${new Date(pet.hiddenUntil).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : '桌宠在桌面上。右键它也能改这些。' : '桌宠还没出门：在托盘菜单或房间里让伙伴出门。关闭应用前开着的话，下次会自己出来。'}</small>
      </div>
    </> : <p className="onboarding-hint">桌宠（独立在桌面上走动的伙伴）需要心流小屋电脑版。</p>}
  </section>;
}
