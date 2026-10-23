// 设备联动 in plain Chinese: what a paired device's connection state means,
// and why an action failed. Messages already written in Chinese by the
// desktop / Android services pass through; network and TLS errors from the
// platform (often English) are translated into a reason and a next step.

const REASONS = [
  [/failed to fetch|networkerror|load failed|err_connection_refused.*127\.0\.0\.1|本机同步服务/i, '连不上本机同步服务。请确认桌面版或 Android 版小屋正在运行。'],
  [/econnrefused|connection refused/i, '对方没有开启接收，或已经退出小屋。请在对方的「同步与设备」里开启局域网接收。'],
  [/ehostunreach|enetunreach|enotfound|no route|getaddrinfo/i, '找不到对方。两台设备需要连在同一个 Wi-Fi，对方的地址也可能已经变了。'],
  [/etimedout|timed? ?out|超时/i, '连接超时。请确认两台设备在同一个 Wi-Fi，并且对方屏幕没有休眠。'],
  [/certificate|self[- ]signed|证书指纹不匹配|err_cert/i, '证书指纹不匹配：对方可能重新安装过小屋。为了安全，请撤销信任后重新配对。'],
  [/\b(401|403)\b|unauthori[sz]ed|forbidden|设备已撤销/i, '对方已经撤销了对这台设备的信任，需要重新配对。'],
  [/econnreset|socket hang up|连接中断|websocket.*clos/i, '连接中断了。操作不会自动重放，请确认对方状态后再试一次。'],
  [/尚未在线|not online/i, '对方现在不在线。等对方打开小屋并连接后再试。'],
  [/没有收到执行确认/i, '对方没有回复执行结果。操作不会自动重放，请先看看对方那边是否已经生效。'],
  [/操作已过期/i, '操作等太久已过期，请再点一次。'],
  [/等待处理的操作过多/i, '对方还有很多操作没处理完，请稍等片刻。']
];

export function explainDeviceError(error) {
  const message = String(error?.message ?? error ?? '').trim();
  if (!message) return '操作没有完成，请稍后再试。';
  for (const [pattern, text] of REASONS) if (pattern.test(message)) return text;
  // Already a sentence from the service in Chinese: keep it as written.
  if (/[一-鿿]/.test(message)) return message;
  return `操作没有完成（${message.slice(0, 80)}）。请确认两台设备都开着小屋、在同一个 Wi-Fi。`;
}

// One peer row: { label, hint, tone: 'ok' | 'wait' | 'off' }.
export function deviceStatus({ online = false, enabled = false, address = '', autoReconnect = false, busy = false } = {}) {
  if (online) return { label: '已连接', hint: '可以遥控音乐、发送随手记，或把这一轮专注交过去。', tone: 'ok' };
  if (busy) return { label: '正在连接…', hint: '正在核对证书指纹并建立加密连接。', tone: 'wait' };
  if (!enabled) return { label: '未连接', hint: '先在上方开启「局域网接收」，才能和这台设备连接。', tone: 'off' };
  if (!address) return { label: '等待对方连接', hint: '这台设备是从另一端配对的，请在对方那边点「连接这台小屋」。', tone: 'wait' };
  if (autoReconnect) return { label: '未连接 · 会自动重连', hint: '两台设备回到同一个 Wi-Fi 时会自动连上。', tone: 'wait' };
  return { label: '未连接', hint: '两台设备都打开小屋、连在同一个 Wi-Fi 后，点「连接这台小屋」。', tone: 'off' };
}

// What the peer is doing, for the line under its name.
export function peerActivity(snapshot, formatClock) {
  const focus = snapshot?.focus;
  if (!focus || focus.phase === 'idle') return '对方正在自由活动';
  const what = focus.phase === 'focus' ? '专注' : '休息';
  return `对方${what}中，还剩 ${formatClock(focus.remaining)}${focus.paused ? ' · 已暂停' : ''}`;
}
