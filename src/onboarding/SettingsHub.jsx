import React, { useEffect, useState } from 'react';
import { PERFORMANCE_MODES, performanceMode, performanceLevel, setPerformanceMode, onPerformanceChange } from '../perf-profile.mjs';
import Dialog from '../Dialog';
import { RoomPickers } from '../RoomPersonalization';
import { desktopCommand, useDesktopFullscreen } from '../desktop-client';
import { Check, Music2 } from '../icons';
import { sourceOptions, providerFor } from './onboarding-model.mjs';
import { version } from '../../package.json';
import UpdatePanel from '../desktop/UpdatePanel';
import './onboarding.css';
import { CROSSFADE_OPTIONS, crossfadeSeconds, setCrossfadeSeconds, onCrossfadeChange } from '../player/crossfade.mjs';

export const HUB_SECTIONS = Object.freeze([
  { id: 'music', label: '音源' }, { id: 'room', label: '房间与桌宠' }, { id: 'focus', label: '专注工具' },
  { id: 'desktop', label: '桌面' }, { id: 'data', label: '数据与备份' }, { id: 'about', label: '关于' }
]);
const PROVIDER_LABEL = { visual: '仅动画展示', auto: '自动匹配', qq: 'QQ 音乐', netease: '网易云音乐', ma: 'Music Assistant', local: '本地音乐', system: '系统正在播放' };

// One place for every setting. Old shortcuts (布置小屋, 音源设置, 收藏与备份,
// tray / menu commands) open this hub on their section.
export default function SettingsHub({ section = 'music', setSection, close, env, player, desktop, provider, useSource, openMusicSettings, look, petId, onRoomChange, reduceMotion, error, focus, openDock, pet, openBackup, openWall, restartOnboarding }) {
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 700px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 700px)'), change = () => setCompact(query.matches);
    change(); query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  const navigateTabs = event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const index = HUB_SECTIONS.findIndex(item => item.id === section), count = HUB_SECTIONS.length;
    const next = ['ArrowDown', 'ArrowRight'].includes(event.key) ? (index + 1) % count
      : ['ArrowUp', 'ArrowLeft'].includes(event.key) ? (index + count - 1) % count
      : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : -1;
    if (next < 0) return;
    event.preventDefault(); setSection(HUB_SECTIONS[next].id);
    document.getElementById(`hub-tab-${HUB_SECTIONS[next].id}`)?.focus();
  };
  return <Dialog title="设置" label="设置" close={close} className="settings-hub room-personalization" wide>
    <div className="settings-hub-layout">
      <nav className="settings-hub-nav" role="tablist" aria-label="设置分区" aria-orientation={compact ? 'horizontal' : 'vertical'}>{HUB_SECTIONS.map((item) => <button type="button" role="tab" key={item.id} id={`hub-tab-${item.id}`} aria-selected={section === item.id} aria-controls="hub-panel" tabIndex={section === item.id ? 0 : -1} onKeyDown={navigateTabs} onClick={() => setSection(item.id)}>{item.label}</button>)}</nav>
      <section id="hub-panel" role="tabpanel" aria-labelledby={`hub-tab-${section}`} className="settings-hub-panel">
        {section === 'music' && <MusicSection env={env} player={player} provider={provider} useSource={useSource} openMusicSettings={openMusicSettings}/>}
        {section === 'room' && <><p className="personalization-intro">选一个今天想待着的地方，再找一位安静的伙伴。换装不会打断音乐和专注。</p><RoomPickers look={look} petId={petId} onChange={onRoomChange} reduceMotion={reduceMotion}/>{error && <p role="alert" className="record-error">{error}</p>}</>}
        {section === 'focus' && <FocusSection focus={focus} openDock={openDock} player={player}/>}
        {section === 'desktop' && <DesktopSection env={env} desktop={desktop} pet={pet}/>}
        {section === 'data' && <div className="hub-rows">
          <Row title="收藏与备份" hint="导出 / 导入唱片、歌单、专注记录。备份文件只保存在你选的位置。"><button type="button" className="pixel-button" onClick={openBackup}>收藏与备份</button></Row>
          <Row title="专辑墙" hint="挑选专辑，生成一张专辑墙图片。"><button type="button" className="pixel-button" onClick={openWall}>打开专辑墙</button></Row>
          {env.desktop && <Row title="本地音乐文件夹" hint="添加或移除扫描的文件夹，在「音源与账户」里管理。"><button type="button" className="pixel-button" onClick={openMusicSettings}>管理文件夹</button></Row>}
        </div>}
        {section === 'about' && <div className="hub-rows">
          <UpdatePanel version={version} desktop={Boolean(env.desktop)}/>
          <Row title="重新引导" hint="再走一遍新手引导，之前的选择会保留。"><button type="button" className="pixel-button is-primary" onClick={restartOnboarding}>重新引导</button></Row>
          <Row title="快捷键" hint="空格 播放/暂停 · Z 沉浸 · M 静音 · F11 全屏 · Ctrl/⌘+Alt+D 退出沉入桌面 · Ctrl/⌘+, 软件设置"/>
        </div>}
        <footer className="personalization-footer"><small>设置只保存在本机。</small><button type="button" className="record-primary" onClick={close}>回到小屋</button></footer>
      </section>
    </div>
  </Dialog>;
}

const Row = ({ title, hint, children }) => <div className="hub-row"><span><strong>{title}</strong>{hint && <small>{hint}</small>}</span>{children && <span className="hub-row-actions">{children}</span>}</div>;

function MusicSection({ env, player, provider, useSource, openMusicSettings }) {
  const [sources, setSources] = useState(() => sourceOptions(env)), [status, setStatus] = useState({}), [quality, setQuality] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const list = await player.listSources(); if (!alive) return; setSources(list);
      const entries = await Promise.all(list.map(async (item) => [item.id, await player.getSourceStatus(item.id)]));
      if (alive) setStatus(Object.fromEntries(entries));
    };
    load(); player.qualities().then((value) => alive && setQuality(value));
    window.addEventListener('album-music-account', load); window.addEventListener('album-local-music', load);
    return () => { alive = false; window.removeEventListener('album-music-account', load); window.removeEventListener('album-local-music', load); };
  }, []);
  return <div className="hub-rows">
    <p className="hub-current">唱机现在用：<strong>{PROVIDER_LABEL[provider] || provider || '自动匹配'}</strong></p>
    {sources.map((source) => { const p = source.provider || providerFor(source.id); return <Row key={source.id} title={source.label} hint={source.available ? status[source.id]?.detail || source.hint : source.reason}>
      {source.available && (p && p === provider ? <span className="onboarding-ok"><Check size={14}/>唱机在用</span> : <button type="button" className="pixel-button" aria-label={`唱机改用 ${source.label}`} onClick={() => useSource(p)}>在唱机上用</button>)}
    </Row>; })}
    <label className="turntable-source">音源<select aria-label="唱机音源" value={provider} onChange={(event) => useSource(event.target.value)}><option value="visual">仅动画展示</option><option value="auto" disabled={!env.desktop}>自动匹配可播放音源</option><option value="qq" disabled={!env.desktop}>QQ 音乐 · {env.desktop ? 'Simple Music' : '桌面客户端'}</option><option value="netease" disabled={!env.desktop}>网易云 · {env.desktop ? 'Simple Music' : '桌面客户端'}</option><option value="ma" disabled={!env.desktop}>Music Assistant · {env.desktop ? '服务器播放器' : '桌面客户端'}</option><option value="local" disabled={!env.desktop}>本地音乐 · {env.desktop ? '文件夹' : '桌面客户端'}</option>{env.mac && <option value="appleMusic" disabled={!env.desktop}>系统 Apple Music · {env.desktop ? '“音乐”App' : '桌面客户端'}</option>}<option value="system" disabled={!env.desktop}>系统正在播放 · {env.desktop ? '跟随播放器' : '桌面客户端'}</option></select></label>
    {/* Reserved: player teammate's 音质 setting (标准 / 高品质 / 无损, auto-downgrade). */}
    <Row title="音质" hint={quality?.options?.length ? '播放不了时会自动降一档。' : '标准 / 高品质 / 无损 · 等播放器更新后开放'}>
      {quality?.options?.length ? <select aria-label="音质" value={quality.current || ''} onChange={async (event) => { const id = event.target.value; if (await player.setQuality(id)) setQuality({ ...quality, current: id }); }}>{quality.options.map((option) => <option key={option.id ?? option} value={option.id ?? option}>{option.label ?? option}</option>)}</select> : <select aria-label="音质" disabled><option>自动</option></select>}
    </Row>
    <CrossfadeRow/>
    <Row title="账户、文件夹与 Music Assistant" hint="登录 QQ 音乐 / 网易云、管理本地文件夹、连接家里的播放器。"><button type="button" className="pixel-button" onClick={openMusicSettings}><Music2 size={15}/>音源与账户</button></Row>
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

function FocusSection({ focus, openDock, player }) {
  const notify = Boolean(focus?.state?.settings?.notify);
  const [permission, setPermission] = useState(() => (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'));
  if (!focus) return <p className="onboarding-hint">专注工具未加载。</p>;
  return <div className="hub-rows">
    <Row title="番茄钟" hint="预设、时长、自动开始都在专注工具的「计时设置」里。"><button type="button" className="pixel-button" onClick={() => openDock('timer')}>打开番茄钟</button></Row>
    <Row title="待办与随手记"><button type="button" className="pixel-button" onClick={() => openDock('tasks')}>待办</button><button type="button" className="pixel-button" onClick={() => openDock('notes')}>随手记</button></Row>
    <Row title="单词与学习卡" hint="复习学习卡、管理卡组、设置考试倒计时与每日目标。"><button type="button" className="pixel-button" onClick={() => openDock('study')}>打开学习</button></Row>
    <Row title="专注统计"><button type="button" className="pixel-button" onClick={() => openDock('stats')}>查看统计</button></Row>
    <Row title="结束提醒" hint={permission === 'denied' ? '系统通知已被拒绝，可在系统设置里打开。' : permission === 'unsupported' ? '这个环境不支持系统通知。' : '专注或休息结束时弹出系统通知。'}>
      <label className="hub-toggle"><input type="checkbox" aria-label="专注结束时通知" checked={notify} disabled={permission === 'unsupported'} onChange={async (event) => { const on = event.target.checked; if (on) setPermission(await player.requestPermission('notifications')); focus.settings({ notify: on }); }}/><span>{notify ? '开' : '关'}</span></label>
    </Row>
  </div>;
}

function PerformanceRow() {
  const [mode, setMode] = useState(performanceMode), [level, setLevel] = useState(performanceLevel);
  useEffect(() => onPerformanceChange((detail) => { setLevel(detail.level); setMode(detail.mode); }), []);
  return <Row title="流畅模式" hint={`电脑带不动时少画一些：减少飘尘、降低雪与炉火的刷新率、关掉模糊阴影。现在：${level === 'low' ? '流畅优先' : '完整画质'}${mode === 'auto' ? '（自动判断）' : ''}。`}>
    <span className="segmented" role="radiogroup" aria-label="流畅模式">{PERFORMANCE_MODES.map(([id, label]) => <button type="button" role="radio" key={id} aria-checked={mode === id} onClick={() => { setLevel(setPerformanceMode(id)); setMode(id); }}>{label}</button>)}</span>
  </Row>;
}
function DesktopSection({ env, desktop, pet }) {
  const fullscreen = useDesktopFullscreen();
  const [mode, setMode] = useState({ active: false, supported: true, reason: '' }), [busy, setBusy] = useState(false);
  useEffect(() => { let alive = true; const read = () => desktop.status().then((value) => alive && setMode(value)); read(); const off = desktop.subscribe(read); return () => { alive = false; off(); }; }, [desktop]);
  const toggle = async () => { setBusy(true); await (mode.active ? desktop.exit() : desktop.enter()); setBusy(false); setMode(await desktop.status()); };
  return <div className="hub-rows">
    <PerformanceRow/>
    <Row title="沉入桌面" hint={mode.reason || '小屋沉到所有窗口下面变成动态桌面，唱机、时钟和专注成为桌面小组件。随时按 Ctrl/⌘+Alt+D 退出。'}>
      <label className="hub-toggle"><input type="checkbox" aria-label="沉入桌面" checked={mode.active} disabled={!mode.supported || busy || mode.busy} onChange={toggle}/><span>{mode.active ? '开' : '关'}</span></label>
    </Row>
    <Row title="伙伴出门（桌宠）" hint={env.desktop ? '伙伴会在桌面上散步，和小屋里选的是同一位。' : '需要心流小屋桌面版。'}>
      <button type="button" className="pixel-button" disabled={!env.desktop} onClick={() => desktopCommand(pet?.active ? 'pet-stop' : 'pet-start')}>{pet?.active ? '让伙伴回家' : '伙伴出门'}</button>
    </Row>
    <Row title="交互全屏" hint={env.desktop ? '右上角全屏图标或 F11 切换。Esc 先关闭弹窗或沉浸，再退出全屏。' : '用右上角全屏图标切换，退出后仍回到当前小屋。'}><span role="status">{fullscreen ? '全屏中' : '窗口中'}</span></Row>
    {env.desktop && <Row title="显示与字体" hint="界面缩放、字体、减少动态效果。"><button type="button" className="pixel-button" onClick={() => desktopCommand('settings')}>软件设置</button></Row>}
  </div>;
}
