import React, { useEffect, useId, useMemo, useState } from 'react';
import { Clock, ListBullet, SpeakerWave, Pencil, Study, Sparkles, ChevronRight } from '../icons';
import { Tabs, Segmented, tabPanelProps } from '../ui/Roving';
import { ConfirmButton } from '../ui/Confirm';
import { useFocus, useFocusState } from './useFocus';
import { useSoundscape } from '../audio/useSoundscape';
import { AMBIENCE_TRACKS } from '../audio/ambience.mjs';
import { activePreset, dayKey, focusStats, formatClock, FOCUS_PRESETS, PHASE_LABELS, WEEK_DAYS_HINT, currentRound, overtimeMs, EXTEND_MIN, intentText, INTENT_LENGTH, todayTasks } from './focus-model.mjs';
import useFocusSessions from './stats/useFocusSessions.js';
import FocusDisplayStage, { openFocusDisplay } from './FocusDisplay';
import { useFocusDisplay } from './useFocusDisplay';
import TaskList from './TaskList';
import QuickNotes from './QuickNotes';
import FocusSettingsForm from './FocusSettingsForm';
import PressHost, { PressCard, usePress } from './PressCard';
import useLabs from '../product/useLabs.js';
import { playSfx } from '../props/sfx.mjs';
import Fader from './desk/Fader';
import { roundLamps } from './desk/clock-model.mjs';
import { PencilBox } from './desk/PencilBox';
// The study tab (FSRS scheduler, word books) is a separate chunk, fetched as
// soon as the dock opens; once loaded it renders synchronously like any tab.
let LoadedStudy = null, studyLoad = null;
export const loadStudy = () => (studyLoad ||= import('../study/StudyPanel').then((module) => { LoadedStudy = module.default; return LoadedStudy; }, (error) => { studyLoad = null; throw error; }));
function StudyPanel() {
  const [, setReady] = useState(Boolean(LoadedStudy)), [failed, setFailed] = useState(false);
  useEffect(() => { if (LoadedStudy) return; let alive = true; loadStudy().then(() => alive && setReady(true), () => alive && setFailed(true)); return () => { alive = false; }; }, []);
  return <div className="closeup-sheet is-wide">{LoadedStudy ? <LoadedStudy/> : <p className="focus-loading" role="status">{failed ? '学习工具没有打开，请关闭专注工具后重试。' : '正在打开学习…'}</p>}</div>;
}
import { useStudy } from '../study/useStudy';
import './focus.css';
import './desk/desk-focus.css';

// 专注 is a close-up of the desk (DEsk, https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors):
// 这一段 a plain sheet of paper with the timer on it (the countdown itself lives on the desk's red clock),
// 待办 the desk calendar beside the leather planner, 随手记 the memo pad, 声音 a sheet with the mixer.
// Explicit built-in registry; never loads third-party code or remote widgets. 学习 only with the 词书学习 lab.
export const BUILTIN_FOCUS_TOOLS = Object.freeze([['timer', '这一段', Clock, FocusTimer], ['tasks', '待办', ListBullet, TaskList], ['notes', '随手记', Pencil, QuickNotes], ['sound', '声音', SpeakerWave, SoundMixer], ['study', '学习', Study, StudyPanel]]);
// Tabs saved by older versions (album-circle-focus-dock-v1) or asked for by other entries land here.
const LEGACY_TABS = Object.freeze({ stats: 'timer' });
export const focusTools = (labs = {}) => BUILTIN_FOCUS_TOOLS.filter(([id]) => id !== 'study' || labs.study);
export function focusTabFor(tab, labs = {}) {
  const id = LEGACY_TABS[tab] || tab;
  return focusTools(labs).some(([value]) => value === id) ? id : 'timer';
}

// 「这一段做什么？」: one ruled line on the sheet. Enter starts; a to-do of today can be picked instead.
// The typed text is kept on the timer (intent) and becomes the session's taskText.
function IntentField({ focus, idle, onStart }) {
  const { timer, tasks } = focus.state, open = todayTasks(tasks, Date.now()).filter((item) => !item.done || item.id === timer.taskId);
  const current = tasks.find((item) => item.id === timer.taskId), choices = current && !open.includes(current) ? [current, ...open] : open;
  const saved = intentText(focus.state), [draft, setDraft] = useState(null), value = draft ?? saved;
  const commit = (text = value) => {
    const typed = text.trim(), match = choices.find((item) => item.text === typed && !item.done);
    if (match) { if (timer.taskId !== match.id) focus.selectTask(match.id); }
    else if (typed !== saved) focus.setIntent(typed);
    setDraft(null);
  };
  const submit = (event) => { event.preventDefault(); commit(); if (idle) onStart(); };
  return <form className={`focus-intent ${idle ? '' : 'is-running'}`} onSubmit={submit}>
    <label className="focus-intent-field"><span>这一段做什么？</span>
      <input type="text" aria-label="这一段做什么？" enterKeyHint="go" maxLength={INTENT_LENGTH} value={value} placeholder={idle ? '写一句，回车开始（可以不写）' : '这一段在做的事'} onChange={(event) => setDraft(event.target.value)} onBlur={() => { if (draft !== null) commit(); }}/></label>
    {choices.length > 0 && <select className="focus-intent-pick" aria-label="从待办里选" title="从今天的待办里选一件" value={choices.some((item) => item.id === timer.taskId) ? timer.taskId : ''} onChange={(event) => { setDraft(null); focus.selectTask(event.target.value); }}>
      <option value="">待办</option>{choices.map((item) => <option key={item.id} value={item.id}>{item.text}</option>)}</select>}
  </form>;
}

// 这一段: a plain sheet. What the round is for, the keys, the rhythm, today's rounds. The time is printed
// large in ink; the live red digits are on the desk's clock.
export function FocusTimer({ close }) {
  const focus = useFocus(), { timer, settings, tasks } = focus.state, [editing, setEditing] = useState(false), [rhythm, setRhythm] = useState(false);
  const [display] = useFocusDisplay(), idle = timer.phase === 'idle';
  const sessions = useFocusSessions(focus.state.sessions), press = usePress('dock');
  const now = focus.now || Date.now(), day = dayKey(now), today = useMemo(() => focusStats(sessions, now), [sessions, day]), preset = activePreset(settings);
  const task = tasks.find((item) => item.id === timer.taskId), round = currentRound(timer, now) % settings.longEvery, intent = intentText(focus.state);
  const todayDistractions = focus.state.distractions.filter((item) => dayKey(item.at) === day).length;
  const presetLabel = FOCUS_PRESETS.find((item) => item.id === preset)?.label || '自定义';
  // 开始专注 with 沉浸 on: the sheet goes back on the desk and the clock fills the window.
  const start = () => { focus.toggle(); if (display.autoEnter && close) { close(); setTimeout(() => openFocusDisplay(), 0); } };
  const toggle = () => { if (idle) start(); else focus.toggle(); };
  // The round just finished is pressed right here, in place of the timer.
  if (press.mine) return <div className="closeup-sheet focus-timer is-pressing"><PressCard record={press.record} inline/></div>;
  const big = idle ? `${String(settings.focusMin).padStart(2, '0')}:00` : timer.due ? `+${formatClock(overtimeMs(timer, now))}` : formatClock(focus.remaining, settings.hideSeconds);
  const roundNo = round + (timer.phase === 'focus' ? 1 : 0);
  return <div className={`closeup-sheet focus-timer phase-${timer.phase} ${timer.paused ? 'is-paused' : ''}${timer.due ? ' is-overtime' : ''}`}>
    <header className="sheet-head"><b>这一段</b><span>{idle ? `${presetLabel} · ${settings.focusMin} / ${settings.shortMin}` : `第 ${Math.max(1, roundNo)} / ${settings.longEvery} 轮`}</span></header>
    <p className="focus-phase" role="status">{timer.due ? '到点了 · 还在继续计时' : PHASE_LABELS[timer.phase]}{timer.paused ? ' · 已暂停' : ''}</p>
    <p className="sheet-time" aria-hidden="true">{big}</p>
    <div className="sheet-rounds" aria-label={`本组 ${settings.longEvery} 轮，已完成 ${round} 轮`}>{roundLamps({ round, longEvery: settings.longEvery, phase: timer.phase }).map((state, index) => <span key={index} className={`sheet-round is-${state}`}><PencilBox done={state === 'done'}/></span>)}</div>
    {!idle && intent ? <p className="focus-task-now" title={intent}>这一段：{intent}{task?.estimate > 0 ? ` · ${task.pomodoros}/${task.estimate} 轮` : ''}</p> : null}
    <IntentField focus={focus} idle={idle} onStart={start}/>
    <div className="focus-controls sheet-keys" role="group" aria-label="计时按键">
      <button type="button" className="sheet-key is-primary focus-start" onClick={toggle}>{idle ? '开始专注' : timer.paused ? '继续' : '暂停'}</button>
      {idle && <button type="button" className="sheet-key" onClick={() => focus.start('shortBreak')}>休息一下</button>}
      {!idle && <button type="button" className="sheet-key" aria-label={timer.due ? '结束这一轮，去休息' : timer.phase === 'focus' ? '提前结束本轮专注' : '跳过休息'} title={timer.due ? '这一轮算完成，超出的时间也记上' : timer.phase === 'focus' ? '结束并回到待机，满一分钟的专注时间会保留（不计奖励）' : '跳过休息'} onClick={timer.due ? focus.skip : timer.phase === 'focus' ? focus.endRound : focus.skip}>{timer.phase === 'focus' ? '结束' : '跳过'}</button>}
      {!idle && <button type="button" className="sheet-key" aria-label={`延长 ${EXTEND_MIN} 分钟`} title={timer.phase === 'focus' ? `这一轮再加 ${EXTEND_MIN} 分钟` : `多休息 ${EXTEND_MIN} 分钟`} onClick={() => focus.extend()}>+{EXTEND_MIN}</button>}
      {!idle && <ConfirmButton className="sheet-key" label="重置计时" title="重置计时" question={timer.phase === 'focus' ? '放弃这一轮专注？' : '结束这次休息？'} confirmLabel="重置" skip={() => timer.phase !== 'focus' || (!timer.paused && Date.now() >= timer.endsAt)} onConfirm={focus.reset}>重置</ConfirmButton>}
    </div>
    <div className="sheet-links">
      {idle && <button type="button" className="sheet-link focus-rhythm-toggle" aria-expanded={rhythm} title="专注节奏：冲刺、经典、深度、心流" onClick={() => { playSfx('page-turn'); setRhythm(!rhythm); }}>节奏 · {presetLabel} {settings.focusMin} / {settings.shortMin}</button>}
      <button type="button" className="sheet-link" aria-label="计时设置" aria-expanded={editing} onClick={() => setEditing(!editing)}>计时设置</button>
      <button type="button" className="sheet-link" aria-keyshortcuts="F" title="沉浸：窗口变成红色台钟 · Z / F" onClick={() => { close?.(); setTimeout(() => openFocusDisplay(), 0); }}>沉浸专注</button>
    </div>
    {idle && rhythm && <Segmented className="focus-presets" label="专注节奏" value={preset} onChange={(id) => { playSfx('pencil-tick'); focus.preset(id); }} items={FOCUS_PRESETS.map((item) => ({ id: item.id, title: `专注 ${item.focusMin} 分钟，短休 ${item.shortMin} 分钟，长休 ${item.longMin} 分钟`, label: <><strong>{item.label}</strong><small>{item.hint}</small></> }))}/>}
    {editing && <FocusSettingsForm running={!idle} faces={false}/>}
    <footer className="focus-ledger">
      <p className="focus-today" title={WEEK_DAYS_HINT} aria-label={`今天完成 ${today.todaySessions} 轮，专注 ${today.today} 分钟，本周来了 ${today.weekDays} 天。`}><span>今日</span><b>{today.todaySessions}</b> 轮<span aria-hidden="true">·</span><b>{today.today}</b> 分钟{today.weekDays > 0 && <><span aria-hidden="true">·</span>本周来了 <b>{today.weekDays}</b> 天</>}</p>
      {timer.phase === 'focus' && <button type="button" className="sheet-link focus-distraction" title="走神了？点一下记下来，然后回到手头的事。唱片日记 › 统计里能看到。" onClick={focus.distraction}>分心了{todayDistractions ? ` · 今天 ${todayDistractions} 次` : ''}</button>}
    </footer>
  </div>;
}

// 声音: a sheet with the radio's switch and a printed fader for each sound.
export function SoundMixer() {
  const sound = useSoundscape(), { mix } = sound;
  return <div className="closeup-sheet sound-mixer">
    <header className="sheet-head"><b>声音</b><span>环境音与 Lo-fi</span></header>
    <button type="button" className={`sheet-key sound-power ${sound.enabled ? 'is-on' : ''}`} aria-pressed={sound.enabled} onClick={sound.toggle} onPointerDown={() => playSfx('power-press')}>{sound.enabled ? '声音已开启' : '开启小屋声音'}</button>
    <section className={`sound-lofi ${mix.lofiOn ? 'is-on' : ''}`}>
      <header><label className="focus-check"><input type="checkbox" checked={mix.lofiOn} onChange={(event) => { playSfx('toggle'); sound.setLofi(event.target.checked); }}/>Lo-fi 电台 · 实时生成</label>{sound.lofiState === 'playing' && <button type="button" className="sheet-link" aria-label="换一段 Lo-fi" title="换一段" onClick={sound.skipSection}>换一段</button>}</header>
      <p className="sound-section" role="status">{sound.lofiState === 'loading' ? '正在调音…' : sound.section ? `${sound.section.key} 调 · ${sound.section.bpm} BPM · ${sound.section.chords.map((chord) => chord.name).join(' → ')}` : mix.lofiOn && !sound.enabled ? '开启声音后开始播放' : '离线生成的 Lo-fi，每 16 小节换一段'}</p>
      {sound.ducked && sound.lofiState === 'playing' && <small>唱机播放中，Lo-fi 已自动调低</small>}
    </section>
    <div className="sound-board">
      <Fader label="Lo-fi" name="Lo-fi 音量" value={mix.lofi} onChange={sound.setLofiVolume}/>
      <section className="sound-ambience" aria-label="环境音">
        {AMBIENCE_TRACKS.map((track) => <Fader key={track.id} label={track.name} value={mix.tracks[track.id]} onChange={(value) => sound.setTrack(track.id, value)}/>)}
      </section>
      <Fader label="总音量" name="总音量" value={mix.master} onChange={sound.setMaster} tone="is-master"/>
    </div>
    {sound.error && <p className="record-error" role="alert">{sound.error}</p>}
    <small className="sound-note">环境音由程序合成，不使用录音素材，离线也能用。</small>
  </div>;
}

// The desk's own little badge when the timer runs outside the desk (kept for the toolbar of other homes).
export function FocusBadge({ onClick, open = false }) {
  const focus = useFocus(), { timer } = focus.state;
  if (timer.phase === 'idle') return <button type="button" className="focus-badge" aria-expanded={open} title="打开专注工具，开始一轮或写下待办" onClick={onClick}><Clock size={17}/>专注 · {focus.state.settings.focusMin} 分钟</button>;
  const clock = timer.due ? `+${formatClock(overtimeMs(timer, focus.now))}` : formatClock(focus.remaining, focus.state.settings.hideSeconds);
  return <button type="button" className={`focus-badge is-running phase-${timer.phase}${timer.paused ? ' is-paused' : ''}${open ? ' is-open' : ''}`} aria-expanded={open} title="打开专注工具" onClick={onClick} aria-label={`${PHASE_LABELS[timer.phase]}，剩余 ${clock}`}><Clock size={17}/><span className="focus-badge-time">{clock}</span></button>;
}

export default function FocusDock({ open, close, tab: asked, setTab, onOpenSmart, embedded = false }) {
  const tabId = useId(), focus = useFocusState(), study = useStudy(), labs = useLabs();
  const tools = focusTools(labs), tab = focusTabFor(asked, labs), items = useMemo(() => tools.map(([id, label]) => ({ id, label })), [tools.length]);
  useEffect(() => { if (open && labs.study) loadStudy().catch(() => {}); }, [open, labs.study]);
  const Panel = tools.find(([id]) => id === tab)?.[3] || FocusTimer;
  // The non-embedded instance (always mounted once per room) owns 沉浸 and the 压制唱片 card over the cabin.
  if (!embedded) return <><FocusDisplayStage/><PressHost/></>;
  if (!open) return null;
  return <section className="focus-dock focus-closeup" data-tab={tab} aria-label="专注工具">
    <header className="closeup-bar">
      <Tabs className="closeup-tabs" label="专注工具" idPrefix={tabId} value={tab} onChange={(id) => { if (id !== tab) playSfx('binder-lift'); setTab(id); }} items={items}/>
      <button type="button" className="closeup-back" aria-label="收起专注工具" aria-keyshortcuts="Escape" onClick={close}>放回 <kbd>Esc</kbd></button>
    </header>
    {focus.error && <div className="focus-save-error" role="alert">{focus.error}{focus.hasUnsavedChanges ? <>{tab === 'notes' && ' 请先复制随手记的内容，避免丢失。'} <button type="button" className="sheet-key" onClick={focus.retrySave}>重试保存</button></> : ' 请在原控件重试刚才的操作。'}</div>}
    {tab === 'study' && study?.error && <div className="focus-save-error" role="alert">{study.error} 本次操作未保存，请在原控件重试。</div>}
    <div className="focus-dock-body closeup-body" {...tabPanelProps(tabId, tab)}>
      <Panel close={close}/>
      {/* 智能唱片机 is a lab (needs AI): its entry shows only when the lab is on. */}
      {tab === 'timer' && onOpenSmart && labs.smartTurntable && <button type="button" className="smart-turntable-entry" onClick={onOpenSmart}>
        <span className="smart-turntable-entry-icon" aria-hidden="true"><Sparkles size={17}/></span>
        <span className="smart-turntable-entry-copy"><strong>智能唱片机</strong><small>说出计划，让小屋按场景编排一张歌单</small></span>
        <ChevronRight size={15}/>
      </button>}
    </div>
  </section>;
}
