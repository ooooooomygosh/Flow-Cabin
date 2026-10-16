# 新手引导与入口收拢 · Onboarding & settings hub

代码：`src/onboarding/`（`onboarding-model.mjs` 状态、`onboarding-adapter.mjs` 适配层、`OnboardingWizard.jsx`、`SettingsHub.jsx`、`onboarding.css`）。
测试：`src/onboarding/onboarding.test.mjs`（单元），`scripts/onboarding-checks.mjs`（浏览器，`npm run test:browser` 自动运行）。

## 1. 入口盘点（v1.10.0，改动前）

| 位置 | 入口 | 打开什么 |
| --- | --- | --- |
| 标题栏 | 入门指南 | 三步 `CabinWelcome`（场景/伙伴 → 音乐说明 → 专注） |
| 标题栏 | 添加专辑 / 我的歌单 / 专辑墙 | 各自对话框 |
| 标题栏 | 收藏与备份 | `BackupDialog` |
| 标题栏（桌面版） | 软件设置（齿轮）、全屏、最小化、最大化、关闭 | 原生设置窗口（缩放、字体、减少动态）与窗口控制 |
| 小屋工具条 | 沉浸 / 伙伴出门 / 桌面模式 / 设为桌面动态背景 | 页面状态与桌面命令（后两项由 #14 合并为「沉入桌面」） |
| 唱机工具 | 筛选与唱片盒 / 布置小屋 / 音源设置 | 筛选面板、`RoomPersonalization`、`MusicSettings` |
| 唱机 | 音源下拉、出错时「音源设置」按钮（`cabin-open-music-settings` 事件） | `MusicSettings` |
| 专注坞 | 番茄钟 / 待办 / 统计 / 随手记 / 计时设置（含通知开关） | `FocusDock` |
| 托盘菜单 | 打开小屋、开始/暂停专注、开关声音、伙伴出门/回家、停止动态背景、退出桌面模式、退出 | 主进程 |
| 应用菜单 | 设置（⌘,）、重新载入、缩放、全屏 F11、桌面模式、打开数据文件夹、关于 | 主进程 |
| 桌宠右键菜单 | 开关小屋声音 等 | `desktop/pet.cjs` |

问题：设置分散在 6 处；音源、房间、桌面、备份互相看不到；首次引导只介绍不配置，不连接音源、不确认声音。

## 2. 收拢后的信息架构

右上角 **「设置」** 是唯一的设置入口，分六区：

| 分区 | 内容 |
| --- | --- |
| 音源 | 唱机当前音源；本地 / QQ / 网易云 / Apple Music（Mac）/ 系统正在播放的状态与「在唱机上用」；**音质（标准 / 高品质 / 无损）预留位**；「音源与账户」详情页（登录、文件夹、Music Assistant） |
| 房间与桌宠 | 场景与伙伴选择（与原「布置小屋」同一组件 `RoomPickers`） |
| 专注工具 | 打开番茄钟 / 待办 / 随手记 / 统计；结束提醒（通知权限） |
| 桌面 | **沉入桌面**（单一开关，`window.cabinDesktop`；`supported=false` 时禁用并直接显示 `reason`；Ctrl/⌘+Alt+D 退出）、伙伴出门、全屏、显示与字体（原生设置窗口） |
| 数据与备份 | 收藏与备份、专辑墙、本地音乐文件夹 |
| 关于 | 版本、项目主页、**重新引导**、快捷键 |

旧入口保留但路由到设置：「布置小屋」→ 设置 › 房间与桌宠；「音源设置」与唱机出错按钮 → 设置 › 音源 的详情页「音源与账户」；「收藏与备份」从标题栏移入 设置 › 数据与备份；「入门指南」改为 设置 › 关于 › 重新引导。托盘新增「小屋设置…」，应用菜单新增「小屋设置… / 重新引导」，原 ⌘, 改名「显示与字体…」（页面命令 `open-settings`、`open-onboarding`，经 `album-companion-command`）。页面也可派发 `cabin-open-settings` `{section}` 打开指定分区。小屋工具条上的桌面模式/动态背景按钮由 #14 处理，本分支没有改动。

## 3. 新手引导

步骤：欢迎 → 音源（选择并连接/登录）→ 权限（通知；Mac 选 Apple Music/系统播放时请求「自动化控制音乐」；桌面版可选开机启动）→ 房间与伙伴 → 试听（按下「播放测试」才出声，再确认「听到了 / 没听到」，没听到给排查提示）→ 完成（摘要）。

- 状态存在 `localStorage['flow-cabin-onboarding-v1']`：`status: new|active|skipped|done`、`step`、`source`、`quality`、`permissions`、`tested`。
- 自动弹出：全新小屋（没有任何 `album-circle-*` 旧数据，也没看过 v1.9 入门指南）或上次中途关闭（`active`，从那一步继续）。跳过/完成后不再弹。旧用户不被打断。
- 网页版：QQ / 网易云 / 系统播放器标为「需要心流小屋桌面版」并禁用；本地音乐改为「选择音乐文件」（打开 添加专辑）。Apple Music 只在 Mac 出现。
- 像素样式用 `--px-*` token（均有回退值）；`prefers-reduced-motion` 与桌面「减少动态效果」都会关掉步骤动画。

## 4. 接口

适配层在 `onboarding-adapter.mjs`，直接调用 `src/player/sources.mjs` 与 `src/desktop/*`；任何一步失败都如实返回，**不会假装已登录或已授权**。

### 播放器（`src/player/sources.mjs`，docs/player.md「音源接口」）

音源名称只有一张表：`src/player/providers.mjs` 的 `PROVIDERS`（`providerLabel(id)` 取全名，`providerLabel(id, 'short')` 取唱机铭牌上的短名），`sources.mjs` 再导出。

| 方法 | 返回 | 引导 / 设置怎么用 |
| --- | --- | --- |
| `listSources({ mac })` | `[{ id, label, kind, login, platform?, supported }]` | 隐藏 `supported=false` 与 `ma`（MA 在「音源与账户」详情页）；Apple Music 切到唱机 `appleMusic` 音源 |
| `connectSource(id)` | `Promise<{ ok, cancelled, error }>`，登录/选文件夹结束才 resolve | 按钮显示「等待完成…」，结束后刷新状态；`cancelled` 显示「已取消」 |
| `getSourceStatus(id)` | `{ id, supported, connected, detail, needsPermission?, app? }` | 显示 `detail`；读不到时显示「暂时读不到状态」 |
| `requestPermission('appleMusic')` | `{ granted, needsPermission, available, error }` | `granted`→已允许；`available=false`→不支持；否则→未允许 |
| `testPlayback({ provider })` | `{ ok, provider, quality, title }` 或 `{ ok:false, error }` | 「播放测试」低音量真实试放约 3 秒：平台音源试《晴天》；**本地音乐试本地曲库的第一首**，曲库为空时播放提示音确认扬声器；Apple Music / 系统播放用 `auto` |
| 音质 | `GET /desktop-music/config` 的 `quality` / `qualities`，`POST /quality { quality }` | 设置 › 音源 的音质下拉；引导音源步骤在有 `qualities` 时显示 |

通知权限由页面自己用 `Notification.requestPermission()` 处理。播放控制可派发 `cabin:player-command` `{ action: toggle|play|pause|next|previous }`，引导目前不需要。

### 桌面

- 沉入桌面：`src/desktop/desktop-sink-client.mjs`（`window.cabinDesktop` 同一组函数）：`enterDesktopMode()`、`exitDesktopMode()`、`getDesktopModeStatus() → { active, busy, supported, via, reason }`、`onDesktopModeChange(cb)`。`busy` 时开关禁用；`supported=false` 时禁用并直接显示 `reason`（中文）。退出快捷键 Ctrl/⌘+Alt+D 写在设置 › 桌面 与引导完成页。
- 开机启动：`src/desktop/autostart-client.mjs`：`setAutostart(enabled) → Promise<{ supported, enabled }>`、`getAutostart()`、`onAutostartChange(cb)`。页面命令 `album-desktop://action/autostart?enabled=true|false`，主进程（`desktop/main/autostart.cjs`）调用 Electron `app.setLoginItemSettings({ openAtLogin })`，结果写到 `window.cabinAutostart` 并派发 `cabin:autostart`。只有打包后的 macOS / Windows 应用支持；其他情况返回 `supported: false`，引导里显示「不支持」。引导的「开机时打开小屋」用 `requestPermission('autostart')`。

## 5. 待办（TODO）

- 设置 › 桌面 还没有「开机时打开小屋」开关；接 `getAutostart()` / `setAutostart()` 即可。
