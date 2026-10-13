// What the 关于 › 检查更新 row says and offers, from the desktop updater state
// (desktop/updater.cjs → window.cabinUpdateState / 'cabin:update-state').
export const UPDATE_EVENT = 'cabin:update-state';
export function updateView(state, { desktop = true } = {}) {
  if (!desktop) return { label: '网页版总是最新的', detail: '桌面版可在这里检查更新。', actions: [] };
  const s = state || { status: 'idle' };
  const version = s.latestVersion ? `v${s.latestVersion}` : '';
  const notify = s.mode !== 'install';
  switch (s.status) {
    case 'checking': return { label: '检查中…', detail: '', actions: [], busy: true };
    case 'latest': return { label: '已是最新', detail: s.checkedAt ? `上次检查：${new Date(s.checkedAt).toLocaleString('zh-CN', { hour12: false })}` : '', actions: ['check'] };
    case 'available': return notify
      ? { label: `发现新版本 ${version}`, detail: s.reason || '', notes: s.notes || '', actions: [s.downloadUrl ? 'open-download' : 'open-release', 'open-release'].filter((v, i, a) => a.indexOf(v) === i) }
      : { label: `发现新版本 ${version}`, detail: s.autoDownload ? '即将开始下载…' : '', notes: s.notes || '', actions: ['download', 'open-release'] };
    case 'downloading': return { label: `下载中 ${Math.round(s.percent || 0)}%`, detail: '下载完成后不会自动重启。', progress: Math.round(s.percent || 0), actions: [] };
    case 'downloaded': return { label: `${version} 已下载，重启安装`, detail: '点「重启安装」时才会重启；或下次退出小屋时自动安装。', notes: s.notes || '', actions: ['install'] };
    case 'restart': return { label: `已安装 ${version}，重启后生效`, detail: '新版本已经装好，正在运行的还是旧版本。', actions: ['relaunch'] };
    case 'error': return { label: '检查更新失败', detail: s.error || '', actions: ['check', 'open-release'] };
    default: return { label: '尚未检查', detail: notify && s.reason ? s.reason : '', actions: ['check'] };
  }
}
export const ACTION_LABELS = { check: '检查更新', download: '下载更新', install: '重启安装', relaunch: '重启到新版本', 'open-release': '打开发布页', 'open-download': '下载安装包' };
export const ACTION_COMMANDS = { check: 'update-check', download: 'update-download', install: 'update-install', relaunch: 'update-relaunch', 'open-release': 'update-open', 'open-download': 'update-download' };
