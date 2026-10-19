import React, { useEffect, useRef, useState } from 'react';
import { inputTotal as total, typingPermissionVerdict } from './input-companion.mjs';

const STATUS_TEXT = {
  off: '未开启，只会在小屋里回应键鼠',
  pending: '正在启动跨应用监听',
  active: '正在跨应用监听键盘与鼠标',
  'needs-permission': '等待 macOS 授权：先允许「辅助功能」，再打开「输入监控」',
  unavailable: '这台电脑暂时无法启动全局监听',
  unsupported: '这个环境不支持跨应用键鼠陪伴'
};

const count = (value) => Math.max(0, Number(value) || 0).toLocaleString('zh-CN');
const weekTotal = (week) => (Array.isArray(week) ? week : [])
  .reduce((sum, day) => sum + Math.max(0, Number(day?.keyboard) || 0) + Math.max(0, Number(day?.click) || 0), 0);
const appearanceEnabled = () => globalThis.window?.albumDesktopAppearance?.typingFollow === true;
const readSnapshot = () => {
  const value = globalThis.window?.albumInputStats;
  return value && typeof value === 'object' ? value : null;
};

export function useTypingCompanion(player, env = {}) {
  const [snapshot, setSnapshot] = useState(readSnapshot);
  const [busy, setBusy] = useState('');
  const baseline = useRef(null), [heard, setHeard] = useState(0);
  const enabled = snapshot?.enabled ?? appearanceEnabled();

  useEffect(() => {
    let alive = true;
    const receive = (event) => { if (alive && event?.detail) setSnapshot(event.detail); };
    const refresh = async () => {
      const next = await player?.typingStatus?.();
      if (alive && next) setSnapshot(next);
    };
    window.addEventListener('album-input-stats', receive);
    refresh();
    const timer = setInterval(refresh, 2500);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('album-input-stats', receive); };
  }, [player]);

  useEffect(() => {
    if (!snapshot) return;
    const now = total(snapshot);
    if (baseline.current === null) baseline.current = now;
    setHeard(Math.max(0, now - baseline.current));
  }, [snapshot]);

  const run = async (name, action) => {
    setBusy(name);
    try {
      const next = await action();
      if (next && typeof next === 'object') setSnapshot(next);
      return next;
    } finally { setBusy(''); }
  };
  return {
    snapshot,
    enabled,
    busy,
    heard,
    verdict: typingPermissionVerdict(snapshot, { enabled, env, heard }),
    setEnabled: (next) => run('toggle', () => player?.setTypingFollow?.(next)),
    requestAccessibility: () => run('accessibility', async () => {
      await player?.requestPermission?.('typing');
      return player?.typingStatus?.();
    }),
    openInputMonitoring: () => run('input', () => player?.openTypingInputMonitoring?.()),
    refresh: () => run('refresh', () => player?.checkTypingPermission?.())
  };
}

// Shared by the first-run / update guide and 设置 › 键鼠陪伴. It deliberately
// shows the local counters: they are the only reliable proof that macOS Input
// Monitoring is actually feeding events, not merely that a toggle is on.
export default function InputCompanionSettings({ player, env = {}, onPermission, compact = false }) {
  const typing = useTypingCompanion(player, env);
  const { snapshot, enabled, verdict } = typing;
  const status = !enabled ? 'off' : snapshot?.status || 'pending';
  const today = snapshot?.today || { keyboard: 0, click: 0 };
  const week = Array.isArray(snapshot?.week) ? snapshot.week.slice(-7) : [];
  const statusText = enabled && env.mac && status === 'active' && verdict === 'pending'
    ? '辅助功能已就绪，还在等待「输入监控」或一次输入确认'
    : STATUS_TEXT[status] || STATUS_TEXT.off;

  useEffect(() => { onPermission?.(verdict); }, [verdict, onPermission]);

  return <section className={`typing-companion${compact ? ' is-compact' : ''}`} aria-label="跨应用键鼠陪伴">
    <header className="typing-companion-head">
      <span>
        <strong>跨应用键鼠陪伴</strong>
        <small>{statusText}。奶糖会用打字或按鼠标的动作回应你。</small>
      </span>
      <label className="hub-toggle">
        <input type="checkbox" aria-label="开启跨应用键鼠陪伴" checked={enabled} disabled={typing.busy === 'toggle'} onChange={(event) => typing.setEnabled(event.target.checked)}/>
        <span>{enabled ? '开' : '关'}</span>
      </label>
    </header>

    <div className="typing-companion-stats">
      <div><span>今天键盘</span><strong>{count(today.keyboard)}</strong><small>下</small></div>
      <div><span>今天点击</span><strong>{count(today.click)}</strong><small>下</small></div>
      <div><span>本次确认</span><strong>{count(typing.heard)}</strong><small>下</small></div>
    </div>

    {snapshot && <p className="typing-companion-week">最近 7 天 {count(weekTotal(week))} 次 · 连续 {count(snapshot.streak)} 天</p>}

    {env.mac && enabled && <div className="typing-companion-actions">
      <button type="button" className="pixel-button" disabled={Boolean(typing.busy)} onClick={typing.requestAccessibility}>{typing.busy === 'accessibility' ? '等待系统…' : '1 · 辅助功能授权'}</button>
      <button type="button" className="pixel-button" disabled={Boolean(typing.busy)} onClick={typing.openInputMonitoring}>{typing.busy === 'input' ? '正在打开…' : '2 · 输入监控设置'}</button>
      <button type="button" className="onboarding-text" disabled={Boolean(typing.busy)} onClick={typing.refresh}>{typing.busy === 'refresh' ? '检测中…' : '重新检测'}</button>
    </div>}

    {env.mac && enabled && <p className="typing-companion-steps">macOS 的两项授权分开进行：<b>1</b> 辅助功能 → <b>2</b> 输入监控 → <b>3</b> 回来敲一下键，确认「本次确认」开始增加。</p>}

    {enabled && <div className={`typing-companion-proof${typing.heard > 0 ? ' is-heard' : ''}`} role="status">
      {typing.heard > 0
        ? `已经收到 ${count(typing.heard)} 次输入，跨应用键鼠陪伴生效了。`
        : env.mac
          ? '随便敲几下、点一下鼠标；上面的「本次确认」增加，才表示两项权限都已生效。一直是 0 时，请点「2 · 输入监控设置」检查授权。'
          : '随便敲几下、点一下鼠标；上面的「本次确认」增加，就表示已经在记录。'}
    </div>}

    <p className="typing-companion-privacy">只统计键盘按下和鼠标点击次数，不读取按键内容、鼠标坐标、窗口标题或正在使用的应用。数据只保存在这台电脑。</p>
    {verdict === 'unsupported' && <p className="typing-companion-warning" role="alert">全局监听组件未能启动。可以先关闭再开启一次；仍然失败时，请重新安装桌面版。</p>}
  </section>;
}
