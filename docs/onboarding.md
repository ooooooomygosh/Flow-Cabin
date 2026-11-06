# 新手引导、版本更新与设置入口

本文对应当前 `v3.1.0` 行为（智能唱片机一节自 v1.21.4 起未变）。代码在 `src/onboarding/`：`onboarding-model.mjs` 保存纯状态，`onboarding-adapter.mjs` 连接播放器与桌面命令，`OnboardingWizard.jsx`、`InputCompanionSettings.jsx` 和 `SettingsHub.jsx` 负责界面。版本变化摘要来自 `releases.mjs`。

相关验证：`src/onboarding/onboarding.test.mjs`（状态与适配层单测）、`scripts/onboarding-checks.mjs`（浏览器冒烟）、`src/ai/smart-turntable.test.mjs` 与 `scripts/smart-turntable-regression.mjs`（智能唱片机）。

> **3.1：引导变成一封信。** 启动时不再有任何窗口压在书桌上。首次（或上次没走完）时，`launchPlan` 的 `first-run` / `resume` 不再直接打开向导，而是在书桌的灯亮起 2.5 秒后往信箱里寄一封欢迎信（`src/desk/post.mjs` `welcomeLetter`，仿 DEsk 的 try-it）；信上的「选音源 / 挑伙伴 / 试听」各自打开向导的那一步（`cabin:onboarding-step`）。`update` 也不再弹出「新功能」，而是寄一封这个版本的信（`releaseLetter`），同时记为已看过；完整的版本历史在「设置 › 实验室 › 关于 › 查看新功能」。

## 1. 三种打开方式

| 场景 | 什么时候发生 | 结果 |
| --- | --- | --- |
| 首次 / 没走完 | 全新 profile（没有 `flow-cabin-onboarding-v1`、v1.9 欢迎标记或任何 `album-circle-*` 本地数据），或上次引导停在中途（`status: active`） | 书桌亮起后信箱里寄来欢迎信；信上的三步各自打开向导：音源 → 房间与伙伴 → 试听。扔掉的欢迎信不会再寄 |
| 版本更新 | `seenVersion` 低于当前应用版本 | 寄一封这个版本的信，并把当前版本写入 `seenVersion`；不打开向导 |
| 重新引导 | 「设置 › 实验室 › 关于 › 重新引导」、应用菜单「重新引导」或伴侣命令 `open-onboarding` | 从「音源」开始打开向导，保留上次的音源、试听结果与权限状态 |

向导可以整体「跳过引导」；完成（「进入小屋」）或跳过都会把当前版本写入 `seenVersion`。中途关闭时状态保持 `active`，下次从同一步继续。

对于升级用户：在版本感知引导加入前已经完成 v1.9 入门指南的 profile，会以 `1.17.0` 作为已确认基线。2.1 保存的旧步骤（`welcome`、`updates`、`permissions`、`done`）读取时映射到最接近的新步骤。

## 2. 状态与恢复

状态保存在 `localStorage['flow-cabin-onboarding-v1']`，当前 `version: 2`：

- `status`: `new | active | skipped | done`
- `step`: `source | room | test`
- `source`, `quality`, `permissions`, `tested`
- `seenVersion`, `fromVersion`, `updatedAt`

`launchPlan(state, { isNew, currentVersion })` 是唯一决定启动时做什么的地方：

- `active`：上次没走完，寄欢迎信（不直接打开向导）。
- 全新小屋：寄欢迎信。
- `seenVersion < currentVersion`：寄版本信并记为已看过。
- 同版本 `done` 或 `skipped`：什么也不做。

任何持久化失败都不会假装保存成功；设置与引导会显示错误并允许重试。

## 3. 每一步在做什么

1. **音源**：从实际支持的来源中选一个并连接；本地文件夹、QQ 音乐、网易云音乐、Apple Music（仅 Mac）和系统播放器按环境显示。网页版把需要桌面版的选项标为不可用；本地音乐改为打开「添加到唱片架」选择音乐文件。桌面版另有「更多音源（Music Assistant 等）」，打开「设置 › 音乐 › 账户与文件夹」。
2. **房间与伙伴**：选择伙伴，立即生效。这一步仍沿用旧名字，也仍显示旧的场景选择和场景缩略图；3.1 的首页是书桌，这里选的场景不会改变首页。设置里只保留伙伴选择。
3. **试听**：只有按下「播放测试」才出声。能取到曲目时低音量真实试放几秒；本地曲库为空时播放提示音。之后选择「听到了 / 没听到」，没听到会给出静音、输出设备、平台版权与音源设置提示。这一步还列出音源、试听结果和权限，以及折叠的「可选权限」：跨应用键鼠陪伴（「去设置」打开「设置 › 小屋与奶糖 › 键鼠陪伴」）、通知、音乐 App（选择 Apple Music 或系统播放器时）、开机启动（桌面版报告支持时）。

网页版不能登录 QQ / 网易云，也不会出现桌面版的全局键盘钩子；它仍会在小屋窗口内响应键盘和鼠标。

## 4. 设置入口

抽屉里的螺丝刀「设置」是统一入口（托盘与应用菜单的「小屋设置…」打开同一个）。设置是一张纸，夹在线圈本上，分为六个分区，每个分区的各部分在右侧有便利贴可以直接翻到：

| 分区 | 主要内容 |
| --- | --- |
| 音乐 | 唱机音源单选、音质、歌曲过渡；「账户与文件夹」子页负责登录、本地文件夹与 Music Assistant |
| 专注 | 计时设置（含专注画面与「开始专注时自动进入沉浸」）、每日目标 |
| 小屋与奶糖 | 伙伴选择、伙伴出门与习性、天空与天气、桌宠衣柜（支持时）、键鼠陪伴 |
| 桌面 | 流畅模式、桌面音效与动作快慢、沉入桌面、开机启动、显示与字体、迷你唱机、全局媒体快捷键、快捷键 |
| 数据 | 收藏与备份、本地音乐文件夹、功能诊断 |
| 实验室 | 实验室功能开关（词书学习、小屋来信、智能唱片机、设备联动、场景配方与睡前、小屋明信片）、AI（Beta）、同步与设备、关于（版本与检查更新、新功能、重新引导） |

顶部的搜索框可以按名字找设置项。页面可派发 `cabin-open-settings` `{ section }` 或 `cabin-open-music-settings`；桌面伴侣命令使用 `album-companion-command` 的 `open-settings`、`open-about`、`open-onboarding`。`section` 支持 `music/accounts` 这样的子页；旧的分区 id（`companion`、`sky`、`weather`、`ai`、`sync`、`about`、`diagnostics`、`beta`）会打开新分区并滚到对应位置。

## 5. 跨应用键鼠陪伴

桌面版设置默认 `typingFollow: true`；显式关闭过的用户仍保持关闭。原生钩子在总开关开启后运行，独立于桌宠是否显示，因此隐藏桌宠不会停止统计。只记录两种固定事件：

- `keyboard`：键盘按下。
- `click`：鼠标按下。

钩子不读取事件对象中的按键、鼠标按钮、坐标、应用名或窗口标题。持久化文件 `input-stats.json` 只保留按本地日期归档的键盘 / 点击次数、累计次数、活跃天数与连续天数；时间戳只用于确定当天，不保存逐次时间线。历史最多保留 400 天。

macOS 只需要「输入监控」一项授权。设置页提供：

1. `授予输入监控权限`：用户点击后才调用系统请求
2. `打开输入监控设置`：已拒绝或系统未弹窗时的明确入口
3. 回到小屋敲键或点击，确认「本次确认」增加
4. 一直无反应时才使用 `修复输入监控授权`；先确认，再执行一次 `tccutil reset ListenEvent`，启动路径不会自动重置

`typingPermissionVerdict()` 不会仅凭开关或系统返回就宣称已生效：macOS 上必须看到计数增加，或本次操作后听到了新输入，才显示 `granted`。从未授权、等待系统确认与无法加载原生模块会分别显示为待确认、待授权或不支持。

计数展示在「设置 › 小屋与奶糖 › 键鼠陪伴」、奶糖桌宠面板、专注统计、唱片日记与来信中；来信只引用聚合计数与连续天数，不包含原始输入事件。

## 6. 智能唱片机

智能唱片机是实验室功能，在「设置 › 实验室」打开后，入口出现在唱机控制面板和书柜底部的「让小屋挑一张」，以及专注计时单「这一段」页的「智能唱片机」。用户说一句计划（如「我要学习五十分钟，帮我搭配音乐」）后，界面先解析时长、活动类型和是否播放，再把这句话、本机约束和唱片架摘要发给可选 AI。AI 按计划编排一张完整歌单，可以包含唱片架之外的歌曲，不再只从唱片架选 1–3 张。

AI 连接采用固定供应商模板：DeepSeek（默认 `deepseek-flash`，官方接口关闭思考）、OpenAI、OpenRouter、Ollama、LM Studio、桌面版本机 Codex CLI 和自定义接口。预设模板填写地址与默认模型，只有自定义模板允许改地址。Ollama 与 LM Studio 使用 keyless loopback；桌面版 Codex 通过 `codex exec` 调用本机已登录 CLI，保留用户的登录与服务商配置，但关闭通知钩子、MCP、插件与 execpolicy 规则，只读取 `--output-last-message` 的最终回答，丢弃 reasoning、工具事件和临时会话。网页版不提供 Codex 模板。

生成后有两个动作：

- **只收进唱片架**：把歌单保存为普通 playlist 记录，不启动专注，也不改动唱机。
- **收进唱片架并开始专注**：先保存歌单，再把它放上唱机并启动对应时长与活动的专注；`autoplay` 决定是否立即播放，关闭时歌单仍在唱机上等待手动播放。

歌单以普通 `type: "playlist"` 记录落架：标题、说明、曲目顺序和每首歌的音乐人 / 专辑都会保留，来源标记为「智能唱片机」，`externalIds.playlist` 使用 `ai:<id>`。播放时不使用模型给出的平台 id，而是沿用自动匹配音源（默认 `auto`，按歌名、歌手与专辑在 QQ / 网易云检索可播放版本；用户已在唱机里选定其他音源时沿用该选择），找不到时给出当前播放器的匹配提示。

### 严格 JSON 契约

模型必须只输出一个 JSON 对象，不能带 Markdown、解释或代码块：

```json
{
  "title": "纸上散步",
  "description": "钢琴、氛围与低声爵士，给写作留出空间。",
  "minutes": 50,
  "activity": "writing",
  "tracks": [
    { "title": "Near Light", "artist": "Ólafur Arnalds", "album": "Living Room Songs" },
    { "title": "A Walk", "artist": "Tycho", "album": "Dive" }
  ],
  "autoplay": true
}
```

| 字段 | 约束 |
| --- | --- |
| `title` | 歌单名，最多 40 字符；为空时使用「活动 · 时长」 |
| `description` | 按计划编排的简短说明，最多 120 字符 |
| `minutes` | 15–180 的整数；用户明确说出的时长优先 |
| `activity` | `sleep / workout / writing / reading / study / work / focus / relax` 之一；用户明确说出的活动优先 |
| `tracks` | 提示词要求按播放顺序的 6–14 首歌，不重复；每项只含 `title`、`artist`、`album`，`title` 与 `artist` 必填，`album` 可省略。本地解析至少保留 1 首合法曲目，最多 14 首 |
| `autoplay` | 布尔值；`true` 表示开始专注后立即播放，`false` 表示把歌单放上唱机但等待手动播放；用户明确说出的播放偏好优先 |

`tracks` 只接受歌名、歌手和专辑，不接受模型提供的平台 id（例如 `providerId`、歌曲 mid 或平台链接）。模型即使返回这些字段，本地解析也会丢弃；播放时再由自动匹配音源查找可播放版本。模型只能写真实存在的录音室歌曲，不写翻唱、现场版、伴奏或平台 id。

请求消息同时带有 `constraints`：用户明确说出的时长、活动或播放偏好会以非 `null` 值锁定；模型必须原样返回。即使用户没有明确指定，`parseIntent()` 也会给出本机默认值，模型只能在未指定字段上补充。显式请求始终优先于模型漂移。

适配器使用 `response_format: { "type": "json_object" }`、`temperature: 0.35` 和 1200 token 上限。部分兼容端点不接受 `response_format`，传输层会在 400 / 422 时去掉该字段重试一次；无论重试与否，返回都必须经过本地严格校验。

`parseAiPlaylist()` 会：

- 从代码块或前后文字中提取 JSON 对象；
- 只读取上述六个字段，丢弃未知字段，尤其是模型给出的平台 id；
- 校验 `minutes`、`activity` 和 `autoplay`：用户明确指定的值优先，非法值回退到本机解析；
- 清洗 `title` / `description`；缺失时用活动、时长和默认说明补齐；
- 要求 `tracks` 至少有一首合法曲目，按 `title + artist` 去重并最多保留 14 首；
- 拒绝非法 JSON、非对象输出、空曲目和缺少 `title` 或 `artist` 的曲目。

AI 不可用、请求失败或歌单不合格时，使用 `localRecommendation()`：按活动类型、流派、标题、音乐人与收藏顺序从唱片架评分，返回 1–3 张本机推荐，不调用网络。界面会明确显示「本机推荐」，不会把回退说成 AI 的答案。

用户确认「收进唱片架并开始专注」时，`normalizePlaylistPlaybackPlan()` 再按当前记录验证一次：必须是 `playlist`、标题非空、至少有一首合法曲目；AI 曲目必须保持 `source: "ai"` 且不带模型平台 id，平台曲目只接受格式合法的 QQ / 网易云来源。验证通过后：

- 歌单替换旧待播并放上唱机；
- `autoplay: true` 时开始播放；
- `autoplay: false` 时仍开始专注并放上歌单，但音频保持暂停，等待用户按播放；
- 当音源是「仅动画展示」或系统播放器时，文案只陈述视觉与专注状态，不宣称小屋正在出声。

「只收进唱片架」不会启动专注，也不会改变唱机；保存后的歌单和导入歌单一样，可以双击放上唱机、查看曲目与说明。AI 请求只发送这句话、本机约束、唱片架摘要（`id`、标题、音乐人、流派）和输出 schema，不发送封面、曲目详情、待办、日记、手记、信件或 API Key。

## 7. 验证命令

```bash
npm test
npm run test:browser
npm run test:focus-ui
npm run test:smart-turntable
```

`test:browser` 包含引导的浏览器检查；智能唱片机单元测试覆盖完整歌单解析、严格 JSON 字段、曲目去重与平台 id 丢弃；隔离回归使用固定 AI 响应、唱片架、目录检索与本地音频，覆盖「只收进唱片架」和「收进唱片架并开始专注」两条路径、普通 playlist 落架，以及自动匹配后的真实 `audio.play()`。

[回到 README](../README.md) · [第一次使用](getting-started.md) · [使用边界](limitations.md)
