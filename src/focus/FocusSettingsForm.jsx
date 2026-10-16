import React, { useEffect, useState } from 'react';
import { useFocusState } from './useFocus';

// The timer preferences, once: the dock's ⚙ (计时设置) and Settings › 专注工具
// render this same form. Turning on 系统通知 asks the system for permission
// from either place.
const permissionNow = () => typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
async function askNotifications() {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try { return await Notification.requestPermission(); } catch { return 'denied'; }
}

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
    // Escape first drops an unsaved edit; with nothing pending it closes the dialog as usual.
    if (event.key === 'Escape' && draft !== String(value)) { event.preventDefault(); event.stopPropagation(); setDraft(String(value)); }
  }}/></label>;
}

export default function FocusSettingsForm({ running = false, className = '' }) {
  const focus = useFocusState(), [permission, setPermission] = useState(permissionNow);
  if (!focus) return <p className="onboarding-hint">专注工具未加载。</p>;
  const { settings } = focus.state;
  const number = (key, label, max) => <DurationSetting name={key} label={label} value={settings[key]} max={max} onSave={(value) => focus.settings({ [key]: value })}/>;
  const check = (key, label, change) => <label className="focus-check"><input type="checkbox" checked={Boolean(settings[key])} onChange={change || ((event) => focus.settings({ [key]: event.target.checked }))}/>{label}</label>;
  const notify = async (event) => { const on = event.target.checked; focus.settings({ notify: on }); if (on) setPermission(await askNotifications()); };
  return <div className={`focus-settings ${className}`}>
    {running && <small>时长修改从下一轮开始生效。</small>}
    <div className="focus-settings-grid">{number('focusMin', '专注（分）', 180)}{number('shortMin', '短休（分）', 60)}{number('longMin', '长休（分）', 90)}{number('longEvery', '几轮长休', 8)}</div>
    {check('hideSeconds', '隐藏秒数（仅显示剩余分钟）')}{check('autoBreak', '专注结束自动开始休息')}{check('autoFocus', '休息结束自动开始专注')}{check('notify', '系统通知', notify)}{check('chime', '提示音')}{check('autoSound', '开始专注时打开声音')}
    {settings.notify && permission !== 'granted' && <small role="status">{permission === 'denied' ? '系统通知已被拒绝，可在系统设置里打开。' : permission === 'unsupported' ? '这个环境不支持系统通知，结束时只响提示音。' : '第一次结束时系统会询问是否允许通知。'}</small>}
  </div>;
}
