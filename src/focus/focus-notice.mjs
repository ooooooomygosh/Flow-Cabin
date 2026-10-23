// What the system notification says when a phase ends, and which buttons it offers.
// Pure: the desktop shell turns `actions` into notification buttons (macOS) and every
// command is one of the companion commands it already accepts (desktop/companion-sync.cjs).
import { desktopCommand } from '../desktop/desktop-command.mjs';

const BODY = { focus: '辛苦啦，起来伸个懒腰吧。+1 小鱼干', shortBreak: '准备好就开始下一轮专注。', longBreak: '状态回来了吗？开始新一轮吧。' };
export function noticeFor(event, state) {
  if (!event) return null;
  const phase = state?.timer?.phase || 'idle';
  if (event.type === 'phase-due') return { title: '专注时间到', body: '还在继续计时，想停下时点「结束本轮」。', actions: [{ command: 'focus-end', label: '结束本轮' }, { command: 'focus-extend', label: '再 5 分钟' }] };
  if (event.phase === 'focus') {
    const body = event.unlocked?.length ? `${BODY.focus}\n解锁：${event.unlocked.join('、')}` : BODY.focus;
    // 自动开始休息 already started the break: offer to skip it; otherwise offer to start it.
    const actions = phase === 'shortBreak' || phase === 'longBreak'
      ? [{ command: 'focus-next', label: '跳过休息' }, { command: 'focus-extend', label: '多休 5 分钟' }]
      : [{ command: 'focus-break', label: '开始休息' }, { command: 'focus-next', label: '跳过休息' }];
    return { title: '专注完成', body, actions };
  }
  if (event.phase === 'shortBreak' || event.phase === 'longBreak') {
    return { title: event.phase === 'longBreak' ? '长休息结束' : '休息结束', body: BODY[event.phase], actions: phase === 'focus' ? [] : [{ command: 'focus-next', label: '开始专注' }] };
  }
  return null;
}

const desktopClient = (doc = globalThis.document) => doc?.documentElement?.dataset?.desktopClient === 'true';
// Desktop: the shell shows it (with sound unless the cabin's own chime just played, a click
// brings the window back, buttons on macOS). Browser: the Web Notification API, when allowed.
export function showNotice(notice, { silent = false, win = globalThis, command = desktopCommand } = {}) {
  if (!notice?.title) return false;
  if (desktopClient(win.document)) {
    command('notify', { title: notice.title, body: notice.body || '', silent: Boolean(silent), actions: (notice.actions || []).map((a) => `${a.command}:${a.label}`).join('|') });
    return true;
  }
  const Notice = win.Notification;
  if (!Notice || Notice.permission !== 'granted') return false;
  try {
    const shown = new Notice(notice.title, { body: notice.body || '', silent: Boolean(silent), tag: notice.tag || 'album-focus' });
    shown.onclick = () => { try { win.focus?.(); } catch {} shown.close?.(); };
    return true;
  } catch { return false; }
}
