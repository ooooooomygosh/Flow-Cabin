import React from 'react';
import { useFocus } from '../useFocus';
import { NumberField } from '../../lib/NumberField.jsx';

// Settings › 专注工具: the only place the daily goal is edited (the 统计 card shows progress).
export default function DailyGoalField() {
  const focus = useFocus();
  if (!focus) return null;
  return <label className="focus-goal hub-daily-goal">每日目标（分钟，0 关闭）<NumberField min={0} max={720} step="15" aria-label="每日专注目标分钟" value={focus.state.settings.dailyGoal} onCommit={(dailyGoal) => focus.settings({ dailyGoal })}/></label>;
}
