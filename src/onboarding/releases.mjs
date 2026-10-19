// User-facing release notes used by the launch guide. Keep these short and
// product-facing; technical verification notes belong in RELEASE-NOTES.md.
export const RELEASES = Object.freeze([
  {
    version: '1.21.2',
    title: 'AI 用固定模板，桌面版可接本机 Codex',
    items: [
      'AI 设置改成固定模板：DeepSeek、OpenAI、OpenRouter、Ollama、LM Studio、本机 Codex CLI 和自定义接口；预设地址只读，Ollama / LM Studio 不需要 API Key。',
      'DeepSeek 官方模型统一为 deepseek-flash，旧模型会在升级时迁移；连接测试、小屋来信和智能唱片机都会关闭思考模式，避免空正文。',
      '桌面版新增本机 Codex CLI：小屋只读取 codex exec 的最后一条回答，思考过程、工具调用和会话文件不会显示或保存；网页版不可用。',
      '所有 AI 入口共用模板与连接判断；失败时会说明具体原因，并继续保留本机唱片架推荐或本地回信。'
    ]
  },
  {
    version: '1.21.1',
    title: '奶糖连普通打字也能立刻跟上',
    items: [
      'macOS 的全局输入层改成只观察、不拦截的 HID listen-only tap：普通字母、数字、修饰键和中文输入法中的按键都会让奶糖落爪，不再只有少数快捷键灵敏。',
      'macOS 只申请「输入监控」一项，不再要求辅助功能；设置、首次引导和更新向导统一成一步授权，并保留「本次确认」计数。',
      '桌面版从这一版开始使用稳定签名身份。只有从 1.21.0 旧签名的版本迁移时，才可能需要点一次「修复输入监控授权」；以后更新不再因为构建指纹变化反复清除授权。',
      '更新向导会明确展示本次桌宠与权限变化，并在版本变化时逐项复核音源、键鼠陪伴、房间和试听。',
      '智能唱片机改为按计划编排完整歌单，可以推荐唱片架之外的歌；生成后可只收进唱片架，或收进唱片架并开始专注。歌单作为普通 playlist 保存，播放时沿用自动匹配音源。'
    ]
  },
  {
    version: '1.21.0',
    title: '升级不再错过设置，奶糖也学会了新陪伴',
    items: [
      '每次版本更新后自动打开更新向导，列出从上次确认的版本到现在的全部变化。',
      '「键鼠陪伴」进入「设置」一级入口；输入监控授权会在同一轮检查，并直接显示今天的键盘 / 点击计数。',
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
