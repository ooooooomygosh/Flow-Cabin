// Pure layout helpers for the 小屋日记 notebook (no DOM). Tested in focus-stats.test.mjs.
import { weeklyReport, formatMinutes } from './stats-model.mjs';

// 周报 opens on the current week as soon as it has any focus; otherwise last week
// (e.g. on a quiet Monday morning) when last week has data; otherwise this week.
export function defaultWeekOffset(sessions, tasks, now) {
  if (weeklyReport(sessions, tasks, now, 0).totalMinutes > 0) return 0;
  return weeklyReport(sessions, tasks, now, -1).totalMinutes > 0 ? -1 : 0;
}
export const weekName = (offset) => offset === 0 ? '本周' : offset === -1 ? '上周' : `${-offset} 周前`;

// Cat pose slot for the week's focus amount (mood can lift it to cat-rub).
export const CAT_POSES = Object.freeze(['cat-sleep-books', 'cat-wait', 'cat-desk', 'cat-rub', 'cat-droopy']);
export function catPose(totalMinutes, mood = null) {
  if (mood?.tier === 'happy' && totalMinutes > 0) return 'cat-rub';
  if (totalMinutes >= 300) return 'cat-sleep-books';
  if (totalMinutes >= 60) return 'cat-desk';
  if (mood?.tier === 'droopy') return 'cat-droopy';
  return 'cat-wait';
}
export const CAT_POSE_CAPTION = Object.freeze({
  'cat-sleep-books': '在你读完的书堆上睡着了', 'cat-desk': '一直趴在桌边陪你', 'cat-rub': '开心地蹭了蹭你',
  'cat-wait': '趴在门口等你回来', 'cat-droopy': '有点蔫，想你多来坐坐'
});

// Stacked bar units: each unit is one book spine / record (16×6 art, drawn 2×).
export const UNIT_PX = 12, CAP_PX = 8;
export function barUnits(minutes, peak, maxUnits = 10) {
  if (!minutes) return 0;
  return Math.max(1, Math.min(maxUnits, Math.round(minutes / Math.max(peak, 1) * maxUnits)));
}

// 小屋来信: a short letter assembled from real data only; lines without data are skipped.
export function cabinLetter(r, mood = null) {
  const lines = [];
  if (!r.totalMinutes) {
    lines.push('这周小屋很安静，唱机上落了一点点灰。');
    lines.push('休息也是在往前走。等你想回来的时候，炉火和唱片都还在。');
  } else {
    lines.push(`这一周，你在小屋里一共待了 ${formatMinutes(r.totalMinutes)}，攒下 ${r.pomodoros} 个番茄。`);
    if (r.bestDay) lines.push(`${r.bestDay.label}是状态最好的一天，专注了 ${formatMinutes(r.bestDay.minutes)}${r.bestSlot ? `，大多在${r.bestSlot.label}` : ''}。`);
    const top = r.topTasks.find((t) => !t.free);
    if (top) lines.push(`你把最多的时间给了「${top.name}」。`);
    if (r.completed.length) lines.push(`还勾掉了 ${r.completed.length} 件待办，${r.completed.length > 2 ? '真了不起' : '一件一件来'}。`);
    if (r.album) lines.push(`陪你最久的是《${r.album.title}》，唱针转了 ${formatMinutes(r.album.minutes)}。`);
    if (r.longestStreak >= 3) lines.push(`连续 ${r.longestStreak} 天都有来，小屋记住了。`);
  }
  if (mood?.feeds > 0) lines.push(`你喂了小猫 ${mood.feeds} 次，它${mood.label ? `现在${mood.label}` : '很满足'}。`);
  return lines;
}
