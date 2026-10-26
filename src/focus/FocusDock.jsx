import React, { useEffect, useId, useMemo, useState } from 'react';
import { Clock, ListBullet, SpeakerWave, SpeakerOff, Play, Pause, PausePixel, Forward, Reset, X, Settings, Shuffle, Study, Sparkles, ChevronRight } from '../icons';
import { Tabs, Segmented, tabPanelProps } from '../ui/Roving';
import { ConfirmButton } from '../ui/Confirm';
import { useFocus, useFocusState } from './useFocus';
import { useSoundscape } from '../audio/useSoundscape';
import { AMBIENCE_TRACKS } from '../audio/ambience.mjs';
import { activePreset, dayKey, focusStats, formatClock, FOCUS_PRESETS, PHASE_LABELS, WEEK_DAYS_HINT, currentRound, overtimeMs, EXTEND_MIN, intentText, INTENT_LENGTH } from './focus-model.mjs';
import useFocusSessions from './stats/useFocusSessions.js';
import FocusFace, { faceFocus } from './FocusFace';
import FocusDisplayStage, { FaceSwitch } from './FocusDisplay';
import { useFocusDisplay, useSceneLook } from './useFocusDisplay';
import { faceFor } from './focus-display.mjs';
import TaskList from './TaskList';
import QuickNotes from './QuickNotes';
import FocusSettingsForm from './FocusSettingsForm';
import PressHost, { PressCard, usePress } from './PressCard';
import useLabs from '../product/useLabs.js';
// The study tab (FSRS scheduler, word books) is a separate chunk, fetched as
// soon as the dock opens; once loaded it renders synchronously like any tab.
let LoadedStudy = null, studyLoad = null;
export const loadStudy = () => (studyLoad ||= import('../study/StudyPanel').then((module) => { LoadedStudy = module.default; return LoadedStudy; }, (error) => { studyLoad = null; throw error; }));
function StudyPanel() {
  const [, setReady] = useState(Boolean(LoadedStudy)), [failed, setFailed] = useState(false);
  useEffect(() => { if (LoadedStudy) return; let alive = true; loadStudy().then(() => alive && setReady(true), () => alive && setFailed(true)); return () => { alive = false; }; }, []);
  if (LoadedStudy) return <LoadedStudy/>;
  return <p className="focus-loading" role="status">{failed ? '学习工具没有打开，请关闭专注工具后重试。' : '正在打开学习…'}</p>;
}
import { useStudy } from '../study/useStudy';
import './focus.css';
import './focus-session.css';

// Explicit built-in registry; never loads third-party code or remote widgets.
// 3.0: 这一段 / 待办 / 声音, plus 学习 as a 4th tab only with the 词书学习 lab. 统计 moved into
// 唱片日记; 随手记 became the 便签 inside 这一段 (its history: 唱片日记 › 手记).
export const BUILTIN_FOCUS_TOOLS = Object.freeze([['timer', '这一段', Clock, FocusTimer], ['tasks', '待办', ListBullet, TaskList], ['sound', '声音', SpeakerWave, SoundMixer], ['study', '学习', Study, StudyPanel]]);
// Tabs saved by older versions (album-circle-focus-dock-v1) or asked for by other entries land here.
const LEGACY_TABS = Object.freeze({ notes: 'timer', stats: 'timer' });
export const focusTools = (labs = {}) => BUILTIN_FOCUS_TOOLS.filter(([id]) => id !== 'study' || labs.study);
export function focusTabFor(tab, labs = {}) {
  const id = LEGACY_TABS[tab] || tab;
  return focusTools(labs).some(([value]) => value === id) ? id : 'timer';
}
const tabItems = (tools) => tools.map(([id, label, Icon]) => ({ id, label: <span>{label}</span>, icon: <Icon size={16}/> }));

// 「这一段做什么？」: one line above the start button. Enter starts; a todo can be picked instead.
// The typed text is kept on the timer (intent) and becomes the session's taskText.
function IntentField({ focus, idle }) {
  const { timer, tasks } = focus.state, open = tasks.filter((item) => !item.done || item.id === timer.taskId);
  const saved = intentText(focus.state), [draft, setDraft] = useState(null), value = draft ?? saved;
  const commit = (text = value) => {
    const typed = text.trim(), match = open.find((item) => item.text === typed && !item.done);
    if (match) { if (timer.taskId !== match.id) focus.selectTask(match.id); }
    else if (typed !== saved) focus.setIntent(typed);
    setDraft(null);
  };
  const submit = (event) => { event.preventDefault(); commit(); if (idle) focus.start('focus'); };
  return <form className={`focus-intent ${idle ? '' : 'is-running'}`} onSubmit={submit}>
    <label className="focus-intent-field"><span>这一段做什么？</span>
      <input type="text" aria-label="这一段做什么？" enterKeyHint="go" maxLength={INTENT_LENGTH} value={value} placeholder={idle ? '写一句，回车开始（可以不写）' : '这一段在做的事'} onChange={(event) => setDraft(event.target.value)} onBlur={() => { if (draft !== null) commit(); }}/></label>
    {open.length > 0 && <select className="focus-intent-pick" aria-label="从待办里选" title="从待办里选一件" value={open.some((item) => item.id === timer.taskId) ? timer.taskId : ''} onChange={(event) => { setDraft(null); focus.selectTask(event.target.value); }}>
      <option value="">待办</option>{open.map((item) => <option key={item.id} value={item.id}>{item.text}</option>)}</select>}
  </form>;
}

export function FocusTimer() {
  const focus = useFocusState(), { timer, settings, tasks } = focus.state, [editing, setEditing] = useState(false), [rhythm, setRhythm] = useState(false);
  const look = useSceneLook(), [display] = useFocusDisplay(), idle = timer.phase === 'idle';
  const sessions = useFocusSessions(focus.state.sessions), press = usePress('dock');
  const now = Date.now(), day = dayKey(now), today = useMemo(() => focusStats(sessions, now), [sessions, day]), preset = activePreset(settings);
  const task = tasks.find((item) => item.id === timer.taskId), round = currentRound(timer, now) % settings.longEvery, intent = intentText(focus.state);
  const todayDistractions = focus.state.distractions.filter((item) => dayKey(item.at) === day).length;
  const presetLabel = FOCUS_PRESETS.find((item) => item.id === preset)?.label || '自定义';
  // The round just finished is pressed right here, in place of the timer.
  if (press.mine) return <div className="focus-timer is-pressing"><PressCard record={press.record} inline/></div>;
  return <div className={`focus-timer phase-${timer.phase} ${timer.paused ? 'is-paused' : ''}${timer.due ? ' is-overtime' : ''}`}>
    <p className="focus-phase" role="status">{timer.due ? '到点了 · 还在继续计时' : PHASE_LABELS[timer.phase]}{timer.paused ? ' · 已暂停' : ''}</p>
    {/* 这一段 counts down; 显示 › 时钟 keeps the wall clock here too. */}
    <FocusFace face={faceFor(display, look)} look={look} focus={faceFocus(focus.state)} show={display.show === 'clock' ? 'clock' : 'timer'} seconds={display.seconds} variant="dock"/>
    {idle ? <IntentField focus={focus} idle/> : intent ? <p className="focus-task-now" title={intent}>这一段：{intent}{task?.estimate > 0 ? ` · ${task.pomodoros}/${task.estimate} 轮` : ''}</p> : null}
    {!idle && <div className="focus-rounds" aria-label={`本组第 ${round + (timer.phase === 'focus' ? 1 : 0)} 轮`}>{Array.from({ length: settings.longEvery }, (_, index) => <span key={index} className={index < round ? 'is-done' : index === round && timer.phase === 'focus' ? 'is-active' : ''}/>)}</div>}
    <div className={`focus-controls ${idle ? 'is-idle' : ''}`}>
      <button type="button" className="pixel-button is-primary focus-start" onClick={focus.toggle}>{idle ? <><Play size={18}/>开始专注</> : timer.paused ? <><Play size={18}/>继续</> : <><Pause size={18}/>暂停</>}</button>
      {!idle && <button type="button" aria-label={timer.due ? '结束这一轮，去休息' : timer.phase === 'focus' ? '提前结束本轮专注' : '跳过休息'} title={timer.due ? '这一轮算完成，超出的时间也记上' : timer.phase === 'focus' ? '结束并回到待机，满一分钟的专注时间会保留（不计奖励）' : '跳过休息'} onClick={timer.due ? focus.skip : timer.phase === 'focus' ? focus.endRound : focus.skip}><Forward size={18}/></button>}
      {!idle && <button type="button" aria-label={`延长 ${EXTEND_MIN} 分钟`} title={timer.phase === 'focus' ? `这一轮再加 ${EXTEND_MIN} 分钟` : `多休息 ${EXTEND_MIN} 分钟`} onClick={() => focus.extend()}>+{EXTEND_MIN}</button>}
      {!idle && <ConfirmButton className="" label="重置计时" title="重置计时" icon={<Reset size={18}/>} question={timer.phase === 'focus' ? '放弃这一轮专注？' : '结束这次休息？'} confirmLabel="重置" skip={() => timer.phase !== 'focus' || (!timer.paused && Date.now() >= timer.endsAt)} onConfirm={focus.reset}/>}
      {!idle && <button type="button" aria-label="计时设置" aria-expanded={editing} onClick={() => setEditing(!editing)}><Settings size={18}/></button>}
    </div>
    {/* The four rhythms stay one tap away, behind a small 节奏 selector, so 开始专注 leads. */}
    {idle && <div className="focus-rhythm">
      <button type="button" className="focus-rhythm-toggle" aria-expanded={rhythm} title="专注节奏：冲刺、经典、深度、心流" onClick={() => setRhythm(!rhythm)}>节奏 · {presetLabel} {settings.focusMin} / {settings.shortMin}</button>
      <button type="button" onClick={() => focus.start('shortBreak')}>休息一下</button>
      <button type="button" aria-label="计时设置" aria-expanded={editing} onClick={() => setEditing(!editing)}><Settings size={16}/></button>
    </div>}
    {idle && rhythm && <Segmented className="focus-presets" label="专注节奏" value={preset} onChange={focus.preset} items={FOCUS_PRESETS.map((item) => ({ id: item.id, title: `专注 ${item.focusMin} 分钟，短休 ${item.shortMin} 分钟，长休 ${item.longMin} 分钟`, label: <><strong>{item.label}</strong><small>{item.hint}</small></> }))}/>}
    <p className="focus-today" title={WEEK_DAYS_HINT} aria-label={`今天完成 ${today.todaySessions} 轮，专注 ${today.today} 分钟，本周来了 ${today.weekDays} 天。`}><span>今日</span><b>{today.todaySessions}</b> 轮<span aria-hidden="true">·</span><b>{today.today}</b> 分钟{today.weekDays > 0 && <><span aria-hidden="true">·</span>本周来了 <b>{today.weekDays}</b> 天</>}</p>
    {!idle && <IntentField focus={focus} idle={false}/>}
    {timer.phase === 'focus' && <button type="button" className="focus-distraction" title="走神了？点一下记下来，然后回到手头的事。唱片日记 › 统计里能看到。" onClick={focus.distraction}>分心了{todayDistractions ? ` · 今天 ${todayDistractions} 次` : ''}</button>}
    {editing && <FocusSettingsForm running={!idle} faces={false}/>}
    <QuickNotes compact/>
  </div>;
}

export function SoundMixer() {
  const sound = useSoundscape(), { mix } = sound;
  const slider = (label, value, change, name) => <label className="sound-slider"><span>{label}</span><input type="range" min="0" max="1" step=".01" aria-label={name || `${label}音量`} value={value} onChange={(event) => change(Number(event.target.value))}/></label>;
  return <div className="sound-mixer">
    <button type="button" className={`sound-power ${sound.enabled ? 'is-on' : ''}`} aria-pressed={sound.enabled} onClick={sound.toggle}>{sound.enabled ? <><SpeakerWave size={18}/>声音已开启</> : <><SpeakerOff size={18}/>开启小屋声音</>}</button>
    <section className="sound-lofi">
      <header><label className="focus-check"><input type="checkbox" checked={mix.lofiOn} onChange={(event) => sound.setLofi(event.target.checked)}/>Lo-fi 电台 · 实时生成</label>{sound.lofiState === 'playing' && <button type="button" aria-label="换一段 Lo-fi" title="换一段" onClick={sound.skipSection}><Shuffle size={16}/></button>}</header>
      <p className="sound-section" role="status">{sound.lofiState === 'loading' ? '正在调音…' : sound.section ? `${sound.section.key} 调 · ${sound.section.bpm} BPM · ${sound.section.chords.map((chord) => chord.name).join(' → ')}` : mix.lofiOn && !sound.enabled ? '开启声音后开始播放' : '离线生成的 Lo-fi，每 16 小节换一段'}</p>
      {sound.ducked && sound.lofiState === 'playing' && <small>唱机播放中，Lo-fi 已自动调低</small>}
      {slider('音量', mix.lofi, sound.setLofiVolume, 'Lo-fi 音量')}
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
  const clock = timer.due ? `+${formatClock(overtimeMs(timer, focus.now))}` : formatClock(focus.remaining, focus.state.settings.hideSeconds);
  return <button type="button" className={`focus-badge is-running phase-${timer.phase}${timer.paused ? ' is-paused' : ''}${open ? ' is-open' : ''}`} aria-expanded={open} title="打开专注工具" onClick={onClick} aria-label={`${PHASE_LABELS[timer.phase]}，剩余 ${clock}`}><Clock size={17}/><span className="focus-badge-time">{clock}{timer.paused && <PausePixel size={12} className="focus-badge-paused"/>}</span>{open && <span>收起</span>}</button>;
}

export default function FocusDock({ open, close, tab: asked, setTab, onOpenSmart, embedded = false }) {
  const tabId = useId(), focus = useFocusState(), study = useStudy(), labs = useLabs();
  const tools = focusTools(labs), tab = focusTabFor(asked, labs), items = useMemo(() => tabItems(tools), [tools.length]);
  useEffect(() => {
    if (!open) return;
    const escape = event => { if (event.key === 'Escape' && !event.repeat && !event.defaultPrevented && !document.querySelector('dialog[open]')) { event.preventDefault(); close(); document.querySelector('.focus-badge')?.focus(); } };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open, close]);
  useEffect(() => { if (open && labs.study) loadStudy().catch(() => {}); }, [open, labs.study]);
  const Panel = tools.find(([id]) => id === tab)?.[3] || FocusTimer;
  // The non-embedded instance (always mounted once per room) owns 沉浸 and the 压制唱片 card over the cabin.
  return <>{!embedded && <><FocusDisplayStage/><PressHost/></>}{open && <aside className="focus-dock" aria-label="专注工具">
    <header className="focus-dock-header">
      {(!embedded || tab === 'timer') && <FaceSwitch/>}
      <div className="focus-dock-tabs"><Tabs label="专注工具" idPrefix={tabId} value={tab} onChange={setTab} items={items}/>
        <button type="button" className="focus-dock-close" aria-label="收起专注工具" onClick={close}><X size={18}/></button></div>
    </header>
    {focus.error && <div className="focus-save-error" role="alert">{focus.error}{focus.hasUnsavedChanges ? <>{tab === 'timer' && ' 请先复制便签内容，避免丢失。'} <button type="button" className="pixel-button" onClick={focus.retrySave}>重试保存</button></> : ' 请在原控件重试刚才的操作。'}</div>}
    {tab === 'study' && study?.error && <div className="focus-save-error" role="alert">{study.error} 本次操作未保存，请在原控件重试。</div>}
    {/* 智能唱片机 is a lab (needs AI): its entry shows only when the lab is on. */}
    {tab === 'timer' && onOpenSmart && labs.smartTurntable && <button type="button" className="smart-turntable-entry" onClick={onOpenSmart}>
      <span className="smart-turntable-entry-icon" aria-hidden="true"><Sparkles size={17}/></span>
      <span className="smart-turntable-entry-copy"><strong>智能唱片机</strong><small>说出计划，让小屋按场景编排一张歌单</small></span>
      <ChevronRight size={15}/>
    </button>}
    <div className="focus-dock-body" {...tabPanelProps(tabId, tab)}>
      <Panel/>
    </div>
  </aside>}</>;
}
