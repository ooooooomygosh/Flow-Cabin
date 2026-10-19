import React, { useMemo } from 'react';
import { useFocus } from './useFocus';
import { focusStats, levelInfo, dayKey, STREAK_HINT } from './focus-model.mjs';
import { FishPixel } from '../icons';
import { Bars, Strip } from './stats/CabinJournal.jsx';
import { openJournal } from './stats/journal-events.mjs';
import { isMonday } from './stats/stats-model.mjs';
import useFocusSessions from './stats/useFocusSessions.js';
import { useLetters } from '../ai/useCabinLetters.js';
import useInputStats from '../pet/useInputStats';
import '../study/study.css';
import './stats/focus-stats.css';

const hours = (minutes) => minutes >= 60 ? `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分` : `${minutes} 分钟`;
// 统计 tab: one compact card, no scrolling. The full picture lives in 小屋日记.
export default function FocusStats() {
  const focus = useFocus(), sessions = useFocusSessions(focus.state.sessions);
  const today = dayKey(focus.now), stats = useMemo(() => focusStats(sessions, focus.now), [sessions, today]);
  const { unread } = useLetters();
  const input = useInputStats();
  const goal = focus.state.settings.dailyGoal, { rewards } = focus.state, level = levelInfo(rewards.xp);
  return <div className="focus-stats fs-compact">
    <dl className="focus-stat-tiles">
      <div><dt>今日专注</dt><dd>{hours(stats.today)}</dd></div>
      <div title={STREAK_HINT}><dt>当前连续</dt><dd>{stats.streak} 天</dd></div>
    </dl>
    {goal > 0 ? <div className={`focus-goal ${stats.today >= goal ? 'is-met' : ''}`}>
      <span>每日目标 {stats.today} / {goal} 分钟{stats.today >= goal ? ' · 今天达成了' : ` · 还差 ${goal - stats.today} 分钟`}</span>
      <span className="focus-goal-bar" role="progressbar" aria-label="每日目标进度" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(goal, stats.today)}><i style={{ width: `${Math.min(100, stats.today / goal * 100)}%` }}/></span>
    </div> : <p className="fs-hint">每日目标已关闭，可在「设置 › 专注工具」里打开。</p>}
    <Bars days={stats.week.map((d) => ({ ...d, isToday: d.key === today }))} label="最近 7 天 · 分钟" mini/>
    {input && (input.status === 'active' || input.today?.total > 0) && <p className="fs-hint">伙伴今天陪你敲了 {Math.max(0, Number(input.today?.keyboard) || 0).toLocaleString('zh-CN')} 下键盘、点了 {Math.max(0, Number(input.today?.click) || 0).toLocaleString('zh-CN')} 下鼠标。</p>}
    <button type="button" className="fs-open-journal" aria-keyshortcuts="L" title="概览、待办与周报 · L" onClick={() => openJournal()}>打开小屋日记 →</button>
    {unread > 0 && <button type="button" className="fs-link fs-mail-entry" data-unread={unread} onClick={() => openJournal('letters')}><Strip name="mailbox" w={32} h={32} frames={2} frame={1}/>信箱里有 {unread} 封小屋来信</button>}
    {isMonday(focus.now) && <button type="button" className="fs-link" onClick={() => openJournal('weekly')}>新的一周 · 上周的小屋周报写好了，去看看</button>}
    <button type="button" className="pixel-button is-quiet focus-cat-link" onClick={() => window.dispatchEvent(new Event('cabin-open-cat'))}><FishPixel size={12}/>Lv.{level.level} · {rewards.fish} 小鱼干 · 去看看小猫 ›</button>
  </div>;
}
