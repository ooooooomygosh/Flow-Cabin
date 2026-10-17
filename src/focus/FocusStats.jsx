import React, { useMemo } from 'react';
import { useFocus } from './useFocus';
import { focusStats, levelInfo, minutesByDay, dayKey } from './focus-model.mjs';
import { heatmap } from '../study/study-model.mjs';
import '../study/study.css';
import { NumberField } from '../lib/NumberField.jsx';
import { Check, FishPixel } from '../icons';

const hours = (minutes) => minutes >= 60 ? `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分` : `${minutes} 分钟`;
export default function FocusStats() {
  const focus = useFocus(), { sessions, rewards } = focus.state;
  const today = dayKey(focus.now), stats = useMemo(() => focusStats(sessions, focus.now), [sessions, today]), peak = Math.max(30, ...stats.week.map((day) => day.minutes));
  const level = levelInfo(rewards.xp);
  const goal = focus.state.settings.dailyGoal, weeks = useMemo(() => heatmap(minutesByDay(sessions), focus.now, 18), [sessions, today]), activeDays = weeks.flat().filter((day) => day.minutes > 0).length;
  return <div className="focus-stats">
    <dl className="focus-stat-tiles">
      <div><dt>今日专注</dt><dd>{hours(stats.today)}</dd></div>
      <div><dt>连续天数</dt><dd>{stats.streak} 天</dd></div>
      <div><dt>累计</dt><dd>{hours(stats.totalMinutes)}</dd></div>
      <div><dt>完成轮数</dt><dd>{stats.sessions}</dd></div>
    </dl>
    {goal > 0 && <div className={`focus-goal ${stats.today >= goal ? 'is-met' : ''}`}>
      <span>每日目标 {stats.today} / {goal} 分钟{stats.today >= goal ? <> · 今天达成了<Check size={14}/></> : ` · 还差 ${goal - stats.today} 分钟`}</span>
      <span className="focus-goal-bar" role="progressbar" aria-label="每日目标进度" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(goal, stats.today)}><i style={{ width: `${Math.min(100, stats.today / goal * 100)}%` }}/></span>
    </div>}
    <label className="focus-goal">每日目标（分钟，0 关闭）<NumberField min={0} max={720} step="15" aria-label="每日专注目标分钟" value={goal} onCommit={(dailyGoal) => focus.settings({ dailyGoal })}/></label>
    <figure className="focus-week stats-chart-well" aria-label="最近 7 天专注分钟">
      <div className="focus-week-bars">{stats.week.map((day) => <div key={day.key} className="focus-week-day" title={`${day.key} · ${day.minutes} 分钟`}>
        <span className="focus-week-value">{day.minutes || ''}</span>
        <span className={`focus-week-bar ${day.key === today ? 'is-today' : ''}`} style={{ height: `${Math.max(day.minutes ? 6 : 2, day.minutes / peak * 100)}%` }}/>
        <small>{day.label}</small>
      </div>)}</div>
      <figcaption>最近 7 天 · 分钟</figcaption>
    </figure>
    <figure className="focus-heatmap stats-chart-well" aria-label={`最近 18 周专注热力图，有 ${activeDays} 天专注`}>
      <div className="focus-heatmap-grid">{weeks.flat().map((day) => <span key={day.key} data-level={day.level} className={day.future ? 'is-future' : ''} title={`${day.key} · ${day.minutes} 分钟`}/>)}</div>
      <figcaption className="focus-heatmap-legend">最近 18 周 · {activeDays} 天有专注 · 少<span data-level="1" style={{ background: 'var(--px-heat-1, #5c3b1e)' }}/><span style={{ background: 'var(--px-heat-2, #8f5d2e)' }}/><span style={{ background: 'var(--px-heat-3, #c48745)' }}/><span style={{ background: 'var(--px-heat-4, #ffd99c)' }}/>多</figcaption>
    </figure>
    <button type="button" className="pixel-button is-quiet focus-cat-link" onClick={() => window.dispatchEvent(new Event('cabin-open-cat'))}><FishPixel size={12}/>Lv.{level.level} · {rewards.fish} 小鱼干 · 去看看小猫 ›</button>
  </div>;
}
