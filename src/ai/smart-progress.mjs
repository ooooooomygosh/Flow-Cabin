// 智能唱片机 while it works: what each step is doing, so a 20-second wait is
// never a blank spinner; and, when AI does not deliver, why — said before the
// local recommendation takes its place.

export const PROGRESS_STEPS = Object.freeze([
  { id: 'intent', label: '读懂你的计划' },
  { id: 'shelf', label: '翻看唱片架' },
  { id: 'ai', label: '请 AI 挑歌、排顺序' },
  { id: 'check', label: '核对歌单' }
]);

// stage: the id of the step in progress. → [{ id, label, state: 'done'|'active'|'pending', detail }]
export function progressSteps(stage, { intent = null, shelfCount = 0, elapsedMs = 0 } = {}) {
  const at = Math.max(0, PROGRESS_STEPS.findIndex((step) => step.id === stage));
  const seconds = Math.floor(elapsedMs / 1000);
  const details = {
    intent: intent ? `${intent.activity?.label || '专注'} · ${intent.minutes} 分钟${intent.autoplay === false ? ' · 先不播放' : ''}` : '',
    shelf: shelfCount ? `唱片架上有 ${shelfCount} 张，可作为参考` : '唱片架还是空的，全部交给 AI 来挑',
    ai: seconds >= 5 ? `已等待 ${seconds} 秒，通常需要 10–30 秒` : '已发送计划和唱片架摘要',
    check: '确认每首歌都有歌名和歌手，并按时长排好'
  };
  return PROGRESS_STEPS.map((step, index) => ({ ...step, state: index < at ? 'done' : index === at ? 'active' : 'pending', detail: index <= at ? details[step.id] : '' }));
}

// Why AI did not produce the playlist. `reply` is chat()'s result (its
// `error` is already a Chinese sentence from explainError), `invalid` means it
// answered but the answer was not a usable playlist.
export function fallbackNotice({ configured = true, enabled = false, reply = null, invalid = false, thrown = false } = {}) {
  if (!configured) return enabled
    ? { kind: 'setup', title: 'AI 还没有配置完成', reason: '接口地址、模型或 API Key 还缺一项，所以这次没有请 AI。', canRetry: false }
    : { kind: 'off', title: 'AI 没有开启', reason: '智能唱片机这次只用了本机推荐；在「设置 › AI」开启后，可以排出唱片架以外的完整歌单。', canRetry: false };
  if (reply?.kind === 'cancelled' || reply?.kind === 'cli-cancelled') return { kind: 'cancelled', title: '已停止等待 AI', reason: '你取消了这次请求，没有任何内容被保存。', canRetry: true };
  if (invalid) return { kind: 'invalid', title: 'AI 的回答用不上', reason: 'AI 有回应，但没有给出能播放的歌单（缺少歌名、歌手，或格式不对）。', canRetry: true };
  if (thrown) return { kind: 'error', title: 'AI 这次没有接上', reason: '请求在途中出错了，可能是网络中断。', canRetry: true };
  const reason = String(reply?.error || '').trim() || '服务没有给出原因。';
  const kind = /超时/.test(reason) ? 'timeout' : /401|403|Key/i.test(reason) ? 'auth' : /429|频繁|余额/.test(reason) ? 'quota' : /连不上|CORS|跨域/.test(reason) ? 'network' : 'error';
  return { kind, title: 'AI 这次没有接上', reason, canRetry: kind !== 'auth' };
}

// The sentence under the reason: what the cabin did instead.
export function fallbackFollowUp(result) {
  const count = result?.albums?.length || 0;
  return count ? `所以先从你的唱片架里挑了 ${count} 张，可以直接开始。` : '唱片架上还没有唱片，先添加几张，或稍后再请 AI 排一次。';
}
