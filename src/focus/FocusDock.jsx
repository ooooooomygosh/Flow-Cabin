import React, { useEffect, useId, useState } from 'react';
import { Clock, ListBullet, ChartBar, SpeakerWave, SpeakerOff, Play, Pause, Forward, Loading, X, Settings, Shuffle, BookOpen, Bookmark } from '../icons';
import { useFocus } from './useFocus';
import { useSoundscape } from '../audio/useSoundscape';
import { AMBIENCE_TRACKS } from '../audio/ambience.mjs';
import { activePreset, focusStats, formatClock, FOCUS_PRESETS, PHASE_LABELS, phaseDuration, phaseProgress } from './focus-model.mjs';
import PixelRing from './PixelRing';
import PixelClock from './PixelClock';
import TaskList from './TaskList';
import FocusStats from './FocusStats';
import QuickNotes from './QuickNotes';
import StudyPanel from '../study/StudyPanel';
import { useStudy } from '../study/useStudy';
import './focus.css';

// Explicit built-in registry; never loads third-party code or remote widgets.
export const BUILTIN_FOCUS_TOOLS = Object.freeze([['timer', '番茄钟', Clock, FocusTimer], ['tasks', '待办', ListBullet, TaskList], ['stats', '统计', ChartBar, FocusStats], ['study', '学习', Bookmark, StudyPanel], ['sound', '声音', SpeakerWave, SoundMixer], ['notes', '随手记', BookOpen, QuickNotes]]);
const TABS = BUILTIN_FOCUS_TOOLS;

function DurationSetting({ name, label, value, max, onSave }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const save = () => {
    if (!draft.trim() || !Number.isFinite(Number(draft))) { setDraft(String(value)); return; }
    const next = Math.max(name === 'longEvery' ? 2 : 1, Math.min(max, Math.round(Number(draft))));
    setDraft(String(next)); onSave(next);
  };
  return <label>{label}<input type="number" min={name === 'longEvery' ? 2 : 1} max={max} step="1" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={save} onKeyDown={(event) => {
    if (event.key === 'Enter') { event.preventDefault(); save(); }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setDraft(String(value)); }
  }}/></label>;
}

export function FocusTimer() {
  const focus = useFocus(), { timer, settings, tasks } = focus.state, [editing, setEditing] = useState(false);
  const idle = timer.phase === 'idle', remaining = idle ? phaseDuration(settings, 'focus') : focus.remaining;
  const displayRemaining = settings.hideSeconds ? Math.ceil(remaining / 60000) * 60000 : remaining;
  const progress = phaseProgress(timer.paused ? timer : { ...timer, endsAt: focus.now + displayRemaining }, settings, focus.now);
  const today = focusStats(focus.state.sessions, focus.now), preset = activePreset(settings);
  const task = tasks.find((item) => item.id === timer.taskId);
  const number = (key, label, max) => <DurationSetting name={key} label={label} value={settings[key]} max={max} onSave={(value) => focus.settings({ [key]: value })}/>;
  const check = (key, label) => <label className="focus-check"><input type="checkbox" checked={settings[key]} onChange={(event) => focus.settings({ [key]: event.target.checked })}/>{label}</label>;
  return <div className={`focus-timer phase-${timer.phase} ${timer.paused ? 'is-paused' : ''}`}>
    <p className="focus-phase" role="status">{PHASE_LABELS[timer.phase]}{timer.paused ? ' · 已暂停' : ''}</p>
    <PixelRing progress={progress} running={!idle && !timer.paused}>
      <PixelClock text={formatClock(remaining, settings.hideSeconds)} label={`剩余 ${formatClock(remaining, settings.hideSeconds)}`}/>
      <small className="focus-ring-caption">{idle ? `${settings.focusMin} 分钟专注 · ${settings.shortMin} 分钟休息` : `${Math.round(progress * 100)}%`}</small>
    </PixelRing>
    <div className="focus-rounds" aria-label={`本组第 ${timer.round % settings.longEvery + (timer.phase === 'focus' ? 1 : 0)} 轮`}>{Array.from({ length: settings.longEvery }, (_, index) => <span key={index} className={index < timer.round % settings.longEvery ? 'is-done' : index === timer.round % settings.longEvery && timer.phase === 'focus' ? 'is-active' : ''}/>)}</div>
    <div className="focus-controls">
      <button type="button" className="focus-primary" onClick={focus.toggle}>{idle ? <><Play size={18}/>开始专注</> : timer.paused ? <><Play size={18}/>继续</> : <><Pause size={18}/>暂停</>}</button>
      {!idle && <button type="button" aria-label={timer.phase === 'focus' ? '提前结束本轮专注' : '跳过休息'} title={timer.phase === 'focus' ? '提前结束本轮（不计奖励）' : '跳过休息'} onClick={focus.skip}><Forward size={18}/></button>}
      {!idle && <button type="button" aria-label="重置计时" title="重置计时" onClick={focus.reset}><Loading size={18}/></button>}
      {idle && <button type="button" onClick={() => focus.start('shortBreak')}>休息一下</button>}
      <button type="button" aria-label="计时设置" aria-expanded={editing} onClick={() => setEditing(!editing)}><Settings size={18}/></button>
    </div>
    {idle && <div className="focus-presets" role="radiogroup" aria-label="专注节奏">{FOCUS_PRESETS.map((item) => <button type="button" role="radio" key={item.id} aria-checked={preset === item.id} title={`专注 ${item.focusMin} 分钟，短休 ${item.shortMin} 分钟，长休 ${item.longMin} 分钟`} onClick={() => focus.preset(item.id)}><strong>{item.label}</strong><small>{item.hint}</small></button>)}</div>}
    <p className="focus-today" aria-label={`今天完成 ${today.todaySessions} 轮，专注 ${today.today} 分钟`}><span>今日</span><b>{today.todaySessions}</b> 轮<span aria-hidden="true">·</span><b>{today.today}</b> 分钟{today.streak > 1 && <><span aria-hidden="true">·</span>连续 <b>{today.streak}</b> 天</>}</p>
    <label className="focus-current-task">当前任务<select aria-label="当前专注任务" value={timer.taskId} onChange={(event) => focus.selectTask(event.target.value)}><option value="">自由专注</option>{tasks.filter((item) => !item.done || item.id === timer.taskId).map((item) => <option key={item.id} value={item.id}>{item.text}</option>)}</select></label>
    {task && <p className="focus-task-now" title={task.text}>正在：{task.text}</p>}
    {editing && <div className="focus-settings">
      {!idle && <small>时长修改从下一轮开始生效。</small>}
      <div className="focus-settings-grid">{number('focusMin', '专注（分）', 180)}{number('shortMin', '短休（分）', 60)}{number('longMin', '长休（分）', 90)}{number('longEvery', '几轮长休', 8)}</div>
      {check('hideSeconds', '隐藏秒数（仅显示剩余分钟）')}{check('autoBreak', '专注结束自动开始休息')}{check('autoFocus', '休息结束自动开始专注')}{check('notify', '系统通知')}{check('chime', '提示音')}{check('autoSound', '开始专注时打开声音')}
    </div>}
  </div>;
}

export function SoundMixer() {
  const sound = useSoundscape(), { mix } = sound;
  const slider = (label, value, change, name) => <label className="sound-slider"><span>{label}</span><input type="range" min="0" max="1" step=".01" aria-label={name || `${label}音量`} value={value} onChange={(event) => change(Number(event.target.value))}/></label>;
  return <div className="sound-mixer">
    <button type="button" className={`sound-power ${sound.enabled ? 'is-on' : ''}`} aria-pressed={sound.enabled} onClick={sound.toggle}>{sound.enabled ? <><SpeakerWave size={18}/>声音已开启</> : <><SpeakerOff size={18}/>开启小屋声音</>}</button>
    <section className="sound-lofi">
      <header><label className="focus-check"><input type="checkbox" checked={mix.lofiOn} onChange={(event) => sound.setLofi(event.target.checked)}/>Lofi 电台 · 实时生成</label>{sound.lofiState === 'playing' && <button type="button" aria-label="换一段 Lofi" title="换一段" onClick={sound.skipSection}><Shuffle size={16}/></button>}</header>
      <p className="sound-section" role="status">{sound.lofiState === 'loading' ? '正在调音…' : sound.section ? `${sound.section.key} 调 · ${sound.section.bpm} BPM · ${sound.section.chords.map((chord) => chord.name).join(' → ')}` : mix.lofiOn && !sound.enabled ? '开启声音后开始播放' : '离线生成的 Lo-fi，每 16 小节换一段'}</p>
      {sound.ducked && sound.lofiState === 'playing' && <small>唱机播放中，Lofi 已自动调低</small>}
      {slider('音量', mix.lofi, sound.setLofiVolume, 'Lofi 音量')}
    </section>
    <section className="sound-ambience" aria-label="环境音">
      {AMBIENCE_TRACKS.map((track) => <div key={track.id}>{slider(track.name, mix.tracks[track.id], (value) => sound.setTrack(track.id, value))}</div>)}
    </section>
    {slider('总音量', mix.master, sound.setMaster)}
    {sound.error && <p className="record-error" role="alert">{sound.error}</p>}
    <small className="sound-note">环境音由程序合成，不使用录音素材，离线也能用。</small>
  </div>;
}

export function FocusBadge({ onClick, open = false }) {
  const focus = useFocus(), { timer } = focus.state;
  if (timer.phase === 'idle') return <button type="button" className="focus-badge" aria-expanded={open} title="打开专注工具，开始一轮或写下待办" onClick={onClick}><Clock size={17}/>专注 · {focus.state.settings.focusMin} 分钟</button>;
  const clock = formatClock(focus.remaining, focus.state.settings.hideSeconds);
  return <button type="button" className={`focus-badge is-running phase-${timer.phase}${timer.paused ? ' is-paused' : ''}${open ? ' is-open' : ''}`} aria-expanded={open} title="打开专注工具" onClick={onClick} aria-label={`${PHASE_LABELS[timer.phase]}，剩余 ${clock}`}><Clock size={17}/><span className="focus-badge-time">{clock}{timer.paused ? ' ⏸' : ''}</span>{open && <span>收起</span>}</button>;
}

export default function FocusDock({ open, close, tab, setTab }) {
  const tabId = useId(), focus = useFocus(), study = useStudy();
  useEffect(() => {
    if (!open) return;
    const escape = event => { if (event.key === 'Escape' && !event.repeat && !event.defaultPrevented && !document.querySelector('dialog[open], .listening-corner')) { event.preventDefault(); close(); document.querySelector('.focus-badge')?.focus(); } };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open, close]);
  const Panel = TABS.find(([id]) => id === tab)?.[3] || FocusTimer;
  if (!open) return null;
  const navigateTabs = (event) => {
    const index = TABS.findIndex(([id]) => id === tab);
    const next = event.key === 'ArrowRight' ? (index + 1) % TABS.length : event.key === 'ArrowLeft' ? (index + TABS.length - 1) % TABS.length : event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault(); setTab(TABS[next][0]);
    document.getElementById(`${tabId}-${TABS[next][0]}`)?.focus();
  };
  return <aside className="focus-dock" aria-label="专注工具">
    <header className="focus-dock-header">
      <nav role="tablist" aria-label="专注工具">{TABS.map(([id, label, Icon]) => <button type="button" role="tab" key={id} id={`${tabId}-${id}`} aria-controls={`${tabId}-panel`} tabIndex={tab === id ? 0 : -1} onKeyDown={navigateTabs} aria-selected={tab === id} onClick={() => setTab(id)}><Icon size={16}/><span>{label}</span></button>)}</nav>
      <button type="button" className="focus-dock-close" aria-label="收起专注工具" onClick={close}><X size={18}/></button>
    </header>
    {focus.error && <div className="focus-save-error" role="alert">{focus.error}{focus.hasUnsavedChanges ? <>{tab === 'notes' && ' 请先复制内容，避免丢失。'} <button type="button" className="pixel-button" onClick={focus.retrySave}>重试保存</button></> : ' 请在原控件重试刚才的操作。'}</div>}
    {tab === 'study' && study?.error && <div className="focus-save-error" role="alert">{study.error} 本次操作未保存，请在原控件重试。</div>}
    <div className="focus-dock-body" role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${tab}`}>
      <Panel/>
    </div>
  </aside>;
}
