# 新手引导、版本更新与设置入口

本文对应当前 `v1.21.0` 行为。代码在 `src/onboarding/`：`onboarding-model.mjs` 保存纯状态，`onboarding-adapter.mjs` 连接播放器与桌面命令，`OnboardingWizard.jsx`、`InputCompanionSettings.jsx` 和 `SettingsHub.jsx` 负责界面。版本变化摘要来自 `releases.mjs`。

相关验证：`src/onboarding/onboarding.test.mjs`（状态与适配层单测）、`scripts/onboarding-checks.mjs`（浏览器冒烟）、`src/ai/smart-turntable.test.mjs` 与 `scripts/smart-turntable-regression.mjs`（智能唱片机）。

## 1. 三种打开方式

| 场景 | 什么时候打开 | 从哪里开始 |
| --- | --- | --- |
| 首次引导 | 全新 profile，没有 `flow-cabin-onboarding-v1`、v1.9 欢迎标记或任何 `album-circle-*` 本地数据 | 欢迎 → 音源 → 权限 → 房间与伙伴 → 试听 → 完成 |
| 版本更新 | `seenVersion` 低于当前应用版本；同一版本完成过引导后不会重复打开 | 更新 → 音源 → 权限 → 房间与伙伴 → 试听 → 完成 |
| 重新引导 | 用户在「设置 › 关于 › 重新引导」主动打开 | 欢迎 → 音源 → 权限 → 房间与伙伴 → 试听 → 完成 |

首次引导可以整体跳过，完成后把当前版本写入 `seenVersion`。主动打开重新引导时，会保留上次的音源、试听结果与权限状态，但从欢迎页重新开始。

版本更新不是欢迎导览：它没有欢迎页，先展示从 `seenVersion` 到当前版本的累计变化，再重新确认音源、权限、房间伙伴与试听。中途关闭或点「稍后继续」时，状态保持 `active`，下次启动回到保存的步骤；更新向导不提供一键跳过。完成向导，或首次 / 重新引导中的明确跳过，会推进 `seenVersion`；更新向导的「稍后继续」不会。

对于升级用户：在版本感知引导加入前已经完成 v1.9 入门指南的 profile，会以 `1.17.0` 作为已确认基线，因此第一次打开 v1.21.0 时能看到 `1.18.0` 到 `1.21.0` 的完整变化，而不是只看到最后一张更新卡。

## 2. 状态与恢复

状态保存在 `localStorage['flow-cabin-onboarding-v1']`，当前 `version: 2`：

- `status`: `new | active | skipped | done`
- `step`: `welcome | updates | source | permissions | room | test | done`
- `source`, `quality`, `permissions`, `tested`
- `seenVersion`, `fromVersion`, `updatedAt`

`launchPlan(state, { isNew, currentVersion })` 是唯一决定是否自动打开的地方：

- `active`：继续当前向导；更新过程中关闭的向导会保留更新模式并从原步骤继续。
- 全新小屋：打开首次引导。
- `seenVersion < currentVersion`：打开版本更新；`releasesBetween()` 会返回严格晚于 `fromVersion`、不晚于当前版本的全部更新卡，并按新到旧排列。跳过中间版本不会漏掉变化。
- 同版本 `done` 或 `skipped`：不自动打开。

任何持久化失败都不会假装保存成功；设置与引导会显示错误并允许重试。

## 3. 每一步在做什么

1. **音源**：从实际支持的来源中选一个并连接；本地文件夹、QQ 音乐、网易云音乐、Apple Music（仅 Mac）和系统播放器按环境显示。网页版把需要桌面版的选项标为不可用；本地音乐改为打开「添加到唱片架 › 本地音乐」。
2. **权限**：桌面版显示「跨应用键鼠陪伴」的完整开关、授权入口、今日计数与实时确认；通知是可选权限；选择 Apple Music 或系统播放器时才会出现 macOS 自动化权限；开机启动只有桌面版报告支持时才显示。
3. **房间与伙伴**：复用「设置 › 房间与桌宠」的同一组选择器，选择立即生效。
4. **试听**：只有按下「播放测试」才出声。能取到曲目时低音量真实试放几秒；本地曲库为空时播放提示音。之后选择「听到了 / 没听到」，没听到会给出静音、输出设备、平台版权与音源设置提示。
5. **完成**：显示音源、已允许 / 待系统确认的权限与试听结果。版本更新完成后才把当前版本写入 `seenVersion`。

网页版不能登录 QQ / 网易云，也不会出现桌面版的全局键盘钩子；它仍会在小屋窗口内响应键盘和鼠标。

## 4. 设置入口

右上角「设置」是统一入口，当前分为八个分区：

| 分区 | 主要内容 |
| --- | --- |
| 音源 | 唱机音源单选、音质、歌曲过渡；「账户与文件夹」子页负责登录、本地文件夹与 Music Assistant |
| 房间与桌宠 | 场景、伙伴、天气与跨窗口同步 |
| 键鼠陪伴 | 跨应用开关、macOS 两项授权、实时计数确认、7 天趋势与隐私说明 |
| 专注工具 | 计时设置、每日目标 |
| 显示与桌面 | 流畅模式、沉入桌面、开机启动、显示与字体、快捷键 |
| 数据与备份 | 收藏与专注数据导入 / 导出、本地音乐文件夹 |
| AI（Beta） | AI 服务配置与隐私边界；智能唱片机在未配置时使用本机推荐 |
| 关于 | 版本与检查更新、重新引导 |

托盘 / 应用菜单和页面事件打开的是同一个 `SettingsHub`。页面可派发 `cabin-open-settings` `{ section }` 或 `cabin-open-music-settings`；桌面伴侣命令使用 `album-companion-command` 的 `open-settings`、`open-about`、`open-onboarding`。`section` 支持 `music/accounts` 这样的子页。

## 5. 跨应用键鼠陪伴

桌面版设置默认 `typingFollow: true`；显式关闭过的用户仍保持关闭。原生钩子在总开关开启后运行，独立于桌宠是否显示，因此隐藏桌宠不会停止统计。只记录两种固定事件：

- `keyboard`：键盘按下。
- `click`：鼠标按下。

钩子不读取事件对象中的按键、鼠标按钮、坐标、应用名或窗口标题。持久化文件 `input-stats.json` 只保留按本地日期归档的键盘 / 点击次数、累计次数、活跃天数与连续天数；时间戳只用于确定当天，不保存逐次时间线。历史最多保留 400 天。

macOS 的「辅助功能」与「输入监控」是两项独立授权。设置页提供：

1. `1 · 辅助功能授权`
2. `2 · 输入监控设置`
3. 回到小屋敲键或点击，确认「本次确认」增加

`typingPermissionVerdict()` 不会仅凭开关或系统返回就宣称已生效：macOS 上必须看到计数增加，或本次操作后听到了新输入，才显示 `granted`。从未授权、等待系统确认与无法加载原生模块会分别显示为待确认、待授权或不支持。

计数展示在「设置 › 键鼠陪伴」、奶糖桌宠面板、专注统计、小屋日记与来信中；来信只引用聚合计数与连续天数，不包含原始输入事件。

## 6. 智能唱片机

入口在唱机旁的「智能唱片机」，以及「专注 › 番茄钟」的同一入口。用户说一句计划（如「我要学习五十分钟，帮我搭配音乐」）后，界面先解析时长、活动类型和是否播放，再向可选 AI 请求 1–3 张现存唱片。

### 结构化输出契约

模型必须只输出一个 JSON 对象，不能带 Markdown、解释或代码块：

```json
{
  "minutes": 50,
  "activity": "study",
  "albumIds": ["album-a", "album-b"],
  "autoplay": true,
  "reason": "不超过 100 个中文字符"
}
```

| 字段 | 约束 |
| --- | --- |
| `minutes` | 15–180 的整数 |
| `activity` | `sleep / workout / writing / reading / study / work / focus / relax` 之一 |
| `albumIds` | 当前唱片架中真实存在的 `id`，按播放顺序，1–3 个，不重复 |
| `autoplay` | 布尔值；`true` 表示放上后立即播放，`false` 表示只放盘 |
| `reason` | 面向用户的简短理由，最多 100 字符 |

请求消息同时带有 `constraints`：用户明确说出的时长、活动或播放偏好会以非 `null` 值锁定；模型必须原样返回。即使用户没有明确指定，`parseIntent()` 也会给出本机默认值，模型只能在未指定字段上补充。显式请求始终优先于模型漂移。

适配器使用 `response_format: { "type": "json_object" }`、低温度和 420 token 上限。部分兼容端点不接受 `response_format`，传输层会在 400 / 422 时去掉该字段重试一次；无论重试与否，返回都必须经过本地严格校验。

`parseAiSelection()` 会：

- 从代码块或前后文字中提取 JSON 对象；
- 只保留唱片架中存在的 ID；
- 去重并最多保留三张，同时保持模型返回的播放顺序；
- 拒绝空选片、伪造 ID、非数组 `albumIds` 和无效 JSON。

失败时使用 `localRecommendation()`：按活动类型、流派、标题、音乐人与收藏顺序评分，不调用网络。界面会明确显示「本机推荐」，不会把回退说成 AI 的答案。

用户确认时，`normalizePlaybackPlan()` 再按当前唱片架验证一次 ID、顺序、数量、时长、活动、`autoplay` 与理由。已经下架的唱片会被剔除；如果一张都不剩，不会开始专注。通过验证后：

- 替换旧待播，第一张不上重复入队；
- `autoplay: true` 时切换音源、加载第一张并开始播放；
- `autoplay: false` 时仍开始专注并放上第一张，队列保留，但音频保持暂停，等待用户按播放；
- 当音源是「仅动画展示」或系统播放器时，文案只陈述视觉与专注状态，不宣称小屋正在出声。

AI 请求只发送唱片摘要（`id`、标题、音乐人、流派）、这句话与本机约束，不发送封面、曲目详情、待办、日记、手记、信件或 API Key。

## 7. 验证命令

```bash
npm test
npm run test:browser
npm run test:focus-ui
npm run test:smart-turntable
```

`test:browser` 包含引导的浏览器检查；智能唱片机回归使用固定唱片架与隔离音源，覆盖 AI 返回顺序、伪造 ID 被过滤、旧待播替换、真实 `audio.play()`、`autoplay:false` 只放盘，以及确认后保持暂停。

[回到 README](../README.md) · [第一次使用](getting-started.md) · [使用边界](limitations.md)
