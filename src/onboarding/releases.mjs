// User-facing release notes used by the launch guide. Keep these short and
// product-facing; technical verification notes belong in RELEASE-NOTES.md.
export const RELEASES = Object.freeze([
  {
    version: '1.21.0',
    title: '升级不再错过设置，奶糖也学会了新陪伴',
    items: [
      '每次版本更新后自动打开更新向导，列出从上次确认的版本到现在的全部变化。',
      '「键鼠陪伴」进入「设置」一级入口；辅助功能与输入监控会逐项检查，并直接显示今天的键盘 / 点击计数。',
      '统计与日记会显示今天的键盘 / 点击次数、连续天数与最近 7 天趋势；来信也会引用今天的键鼠陪伴。',
      '奶糖的桌面小面板可以看计数、喂食、开始专注、换配饰，也能一键进入专注画面。',
      '新增智能唱片机：从你的唱片架按顺序挑选 1–3 张唱片，确认后开始专注并把第一张放上唱机；可以立即播放，也可以先放上稍后自己按播放。'
    ]
  },
  {
    version: '1.20.0',
    title: '奶糖开始跨应用陪你打字、点鼠标',
    items: [
      '焦点不在小屋时，键盘按下会让奶糖轮流落爪，鼠标点击会让它伸手回应。',
      '桌宠面板记录今天的键盘、点击、连续陪伴天数与最近 7 天。',
      '只保存事件类型和时间戳，不读取按键内容、坐标、应用名或窗口标题。'
    ]
  },
  {
    version: '1.19.0',
    title: '六间房有了可以碰一碰的日常',
    items: [
      '琥珀小屋泡茶、林间书屋浇花、海边慢屋推开海风窗、星夜阁楼连星图。',
      '奶糖补齐打字、进食、跳跃与送信等动作，房间和桌宠共用同一套装扮。',
      '手记、来信、学习与专注日记继续保存在本机，并支持更完整的整理与备份。'
    ]
  },
  {
    version: '1.18.0',
    title: '奶糖可以出门，待在桌面的任何地方',
    items: [
      '把小鱼干拖到桌宠身上直接喂食，双击会让奶糖跳一下。',
      '奶糖的位置会被记住，换显示器或分辨率后也会回到屏幕内。',
      '菜单栏 / 系统托盘可以查看专注剩余时间，也能直接控制音乐和专注。'
    ]
  }
]);

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseVersion(value) {
  const match = VERSION_PATTERN.exec(String(value || '').trim().replace(/^v/i, ''));
  return match ? match.slice(1).map(Number) : null;
}

export function compareVersions(left, right) {
  const a = parseVersion(left), b = parseVersion(right);
  if (!a || !b) return 0;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

export function releaseFor(version) {
  return RELEASES.find((release) => compareVersions(release.version, version) === 0) || null;
}

// Newest first. Only releases strictly after `from` and no newer than `to`
// are included, so a skipped release is never silently omitted.
export function releasesBetween(from, to) {
  return RELEASES
    .filter((release) => compareVersions(release.version, from) > 0 && compareVersions(release.version, to) <= 0)
    .sort((left, right) => compareVersions(right.version, left.version));
}
