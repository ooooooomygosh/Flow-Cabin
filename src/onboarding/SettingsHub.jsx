import React, { useEffect, useState } from 'react';
import { PERFORMANCE_MODES, performanceMode, performanceLevel, setPerformanceMode, onPerformanceChange } from '../perf-profile.mjs';
import Dialog from '../Dialog';
import RoomPickers from '../RoomPickers';
import MusicAccounts from '../MusicSettings';
import FocusSettingsForm from '../focus/FocusSettingsForm';
import { desktopCommand } from '../desktop-client';
import { getAutostart, setAutostart, onAutostartChange } from '../desktop/autostart-client.mjs';
import { ChevronLeft, ChevronRight, Check } from '../icons';
import { providerFor } from './onboarding-model.mjs';
import useSourceStatus from './useSourceStatus';
import { PROVIDERS, providerLabel } from '../player/providers.mjs';
import { version } from '../../package.json';
import UpdatePanel from '../desktop/UpdatePanel';
import './onboarding.css';
import { CROSSFADE_OPTIONS, crossfadeSeconds, setCrossfadeSeconds, onCrossfadeChange } from '../player/crossfade.mjs';
import { shortcutHelp } from '../shortcuts.mjs';

export const HUB_SECTIONS = Object.freeze([
  { id: 'music', label: '音源' }, { id: 'room', label: '房间与桌宠' }, { id: 'focus', label: '专注工具' },
  { id: 'desktop', label: '显示与桌面' }, { id: 'data', label: '数据与备份' }, { id: 'about', label: '关于' }
]);
// A section may open on a sub-page: 'music/accounts' is 音源 › 账户与文件夹.
export const hubTab = (section = '') => String(section).split('/')[0] || 'music';

// Preferences, in one place; actions (timer, album wall, the companion going
// out, fullscreen) stay in the room. Tray / menu / deck shortcuts open this
// dialog on their section.
export default function SettingsHub({ section = 'music', setSection, close, env, player, provider, useSource, look, petId, onRoomChange, reduceMotion, error, desktop, openBackup, restartOnboarding }) {
  const tab = hubTab(section);
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 700px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 700px)'), change = () => setCompact(query.matches);
    change(); query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  const navigateTabs = event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const index = HUB_SECTIONS.findIndex(item => item.id === tab), count = HUB_SECTIONS.length;
    const next = ['ArrowDown', 'ArrowRight'].includes(event.key) ? (index + 1) % count
      : ['ArrowUp', 'ArrowLeft'].includes(event.key) ? (index + count - 1) % count
      : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : -1;
    if (next < 0) return;
    event.preventDefault(); setSection(HUB_SECTIONS[next].id);
    document.getElementById(`hub-tab-${HUB_SECTIONS[next].id}`)?.focus();
  };
  return <Dialog title="设置" label="设置" close={close} className="settings-hub" size="lg">
    <div className="settings-hub-layout">
      <nav className="settings-hub-nav" role="tablist" aria-label="设置分区" aria-orientation={compact ? 'horizontal' : 'vertical'}>{HUB_SECTIONS.map((item) => <button type="button" role="tab" key={item.id} id={`hub-tab-${item.id}`} aria-selected={tab === item.id} aria-controls="hub-panel" tabIndex={tab === item.id ? 0 : -1} onKeyDown={navigateTabs} onClick={() => setSection(item.id)}>{item.label}</button>)}</nav>
      <section id="hub-panel" role="tabpanel" aria-labelledby={`hub-tab-${tab}`} className="settings-hub-panel">
        {section === 'music' && <MusicSection env={env} player={player} provider={provider} useSource={useSource} openAccounts={() => setSection('music/accounts')}/>}
        {section === 'music/accounts' && <div className="hub-subpage" role="region" aria-label="账户与文件夹">
          <button type="button" className="hub-back" onClick={() => setSection('music')}><ChevronLeft size={14}/>音源</button>
          <MusicAccounts/>
        </div>}
        {tab === 'room' && <><p className="personalization-intro">选一个今天想待着的地方，再找一位安静的伙伴。换装不会打断音乐和专注。</p><RoomPickers look={look} petId={petId} onChange={onRoomChange} reduceMotion={reduceMotion}/>{error && <p role="alert" className="record-error">{error}</p>}</>}
        {tab === 'focus' && <><p className="personalization-intro">番茄钟的时长和提醒。计时、待办、学习和声音在右上角「专注」里。</p><FocusSettingsForm className="hub-focus-settings"/></>}
        {tab === 'desktop' && <DisplaySection env={env} desktop={desktop}/>}
        {tab === 'data' && <div className="hub-rows">
          <Row title="收藏与备份" hint="导出 / 导入唱片、歌单、专注记录。备份文件只保存在你选的位置。"><button type="button" className="pixel-button" onClick={openBackup}>收藏与备份</button></Row>
          {env.desktop && <Row title="本地音乐文件夹" hint="添加或移除扫描的文件夹。"><button type="button" className="pixel-button" onClick={() => setSection('music/accounts')}>管理文件夹<ChevronRight size={14}/></button></Row>}
        </div>}
        {tab === 'about' && <div className="hub-rows">
          <UpdatePanel version={version} desktop={Boolean(env.desktop)}/>
          <Row title="重新引导" hint="再走一遍新手引导，之前的选择会保留。"><button type="button" className="pixel-button" onClick={restartOnboarding}>重新引导</button></Row>
        </div>}
      </section>
    </div>
  </Dialog>;
}

const Row = ({ title, hint, led, children }) => <div className="hub-row"><span><strong>{led !== undefined && <i className={`hub-led ${led ? 'is-on' : ''}`} aria-hidden="true"/>}{title}</strong>{hint && <small>{hint}</small>}</span>{children && <span className="hub-row-actions">{children}</span>}</div>;

// What the deck plays from: one radio list. Each source row shows whether it is
// connected; logins, folders and Music Assistant live one page deeper.
function MusicSection({ env, player, provider, useSource, openAccounts }) {
  const { sources, status, quality, setQuality } = useSourceStatus(player, env);
  const rows = [
    { id: 'visual', available: true, hint: '唱片转动、显示曲目，不出声。' },
    { id: 'auto', available: Boolean(env.desktop), hint: '按唱片在已连接的音源里找能播放的版本。', reason: '需要心流小屋桌面版' },
    ...sources.map((source) => ({ id: source.provider || providerFor(source.id), source: source.id, available: source.available, hint: status[source.id]?.detail || source.hint, reason: source.reason, connected: status[source.id]?.connected })),
    { id: 'ma', available: Boolean(env.desktop), hint: '由家里的 Music Assistant 服务器出声，在「账户与文件夹」里连接。', reason: '需要心流小屋桌面版' }
  ].filter((row, index, list) => PROVIDERS.some((item) => item.id === row.id) && list.findIndex((other) => other.id === row.id) === index);
  const move = (event) => {
    const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }; if (!keys[event.key]) return;
    const enabled = rows.filter((row) => row.available), index = enabled.findIndex((row) => row.id === provider);
    const next = enabled[(Math.max(0, index) + keys[event.key] + enabled.length) % enabled.length]; if (!next) return;
    event.preventDefault(); useSource(next.id); document.getElementById(`hub-source-${next.id}`)?.focus();
  };
  return <div className="hub-rows">
    <div className="hub-sources" role="radiogroup" aria-label="唱机音源" onKeyDown={move}>{rows.map((row) => { const on = row.id === provider; return <button type="button" role="radio" key={row.id} id={`hub-source-${row.id}`} aria-checked={on} tabIndex={on || (!rows.some((item) => item.id === provider) && row.id === 'visual') ? 0 : -1} disabled={!row.available} aria-label={providerLabel(row.id)} onClick={() => useSource(row.id)}>
      <i className={`hub-led ${row.available && (on || row.connected) ? 'is-on' : ''}`} aria-hidden="true"/><span><strong>{providerLabel(row.id)}</strong><small>{row.available ? row.hint : row.reason}</small></span>{on && <span className="onboarding-ok"><Check size={14}/>唱机在用</span>}
    </button>; })}</div>
    {env.desktop && <Row title="账户与文件夹" hint="登录 QQ 音乐 / 网易云、管理本地文件夹、连接 Music Assistant。"><button type="button" className="pixel-button" onClick={openAccounts}>账户与文件夹<ChevronRight size={14}/></button></Row>}
    {quality?.options?.length > 0 && <Row title="音质" hint="QQ 音乐 / 网易云向平台请求的音质。没有会员或没有该音质时，自动换成能播放的最高一档。">
      <select aria-label="音质" value={quality.current || quality.options[0].id} onChange={(event) => setQuality(event.target.value)}>{quality.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
    </Row>}
    <CrossfadeRow/>
  </div>;
}

// 歌曲过渡: the next song is always buffered early; a crossfade also overlaps them.
function CrossfadeRow() {
  const [seconds, setSeconds] = useState(crossfadeSeconds);
  useEffect(() => onCrossfadeChange(setSeconds), []);
  return <Row title="歌曲过渡" hint={seconds ? `上一首结束前 ${seconds} 秒，下一首淡入，上一首淡出。` : '下一首会提前缓冲好，上一首结束时立刻接上。'}>
    <select aria-label="歌曲过渡" value={seconds} onChange={(event) => setSeconds(setCrossfadeSeconds(event.target.value))}>{CROSSFADE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
  </Row>;
}

function PerformanceRow() {
  const [mode, setMode] = useState(performanceMode), [level, setLevel] = useState(performanceLevel);
  useEffect(() => onPerformanceChange((detail) => { setLevel(detail.level); setMode(detail.mode); }), []);
  return <Row title="流畅模式" hint={`电脑带不动时少画一些：减少飘尘、降低雪与炉火的刷新率、关掉模糊阴影。现在：${level === 'low' ? '流畅优先' : '完整画质'}${mode === 'auto' ? '（自动判断）' : ''}。`}>
    <span className="segmented" role="radiogroup" aria-label="流畅模式">{PERFORMANCE_MODES.map(([id, label]) => <button type="button" role="radio" key={id} aria-checked={mode === id} onClick={() => { setLevel(setPerformanceMode(id)); setMode(id); }}>{label}</button>)}</span>
  </Row>;
}

// 开机时打开小屋: shown only where the desktop shell reports it can.
function AutostartRow() {
  const [state, setState] = useState(getAutostart), [busy, setBusy] = useState(false);
  useEffect(() => onAutostartChange(setState), []);
  if (!state.supported) return null;
  return <Row title="开机时打开小屋" hint="登录电脑后自动点亮小屋。">
    <label className="hub-toggle"><input type="checkbox" aria-label="开机时打开小屋" checked={state.enabled} disabled={busy} onChange={async (event) => { setBusy(true); setState(await setAutostart(event.target.checked)); setBusy(false); }}/><span>{state.enabled ? '开' : '关'}</span></label>
  </Row>;
}

// `desktop` is the room's own 沉入桌面 state and toggle (the toolbar uses the same pair).
function DisplaySection({ env, desktop }) {
  const { active, busy, supported, reason } = desktop.state;
  return <div className="hub-rows">
    <PerformanceRow/>
    <Row title="沉入桌面" hint={reason || '小屋沉到所有窗口下面变成动态桌面，唱机、时钟和专注成为桌面小组件。随时按 Ctrl/⌘+Alt+D 退出。'}>
      <label className="hub-toggle"><input type="checkbox" aria-label="沉入桌面" checked={Boolean(active)} disabled={!supported || busy} onChange={desktop.toggle}/><span>{active ? '开' : '关'}</span></label>
    </Row>
    {env.desktop && <AutostartRow/>}
    {env.desktop && <Row title="显示与字体" hint="界面缩放、字体、减少动态效果。"><button type="button" className="pixel-button" onClick={() => desktopCommand('settings')}>打开显示与字体</button></Row>}
    <Row title="快捷键" hint={shortcutHelp()}/>
  </div>;
}
