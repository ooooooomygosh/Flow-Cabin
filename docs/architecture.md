# 心流小屋 · 结构说明

Electron 主进程负责系统能力与本机数据，React 渲染进程负责小屋。3.1 起首页是 `src/desk/` 里的书桌（移植自 MIT 许可的 [DEsk](https://github.com/fyzugx/DEsk)，© 2026 The DEsk authors）。主窗口、桌宠和壁纸分别运行在受限窗口中。架构描述表示代码路径存在，不代表真实 macOS／Windows 已完成验收。

## 数据和能力边界

- `desktop/site-router.cjs` 为主界面固定虚拟来源 `https://album-circle.vercel.app` 提供本机路由，保留旧版 storage origin。音乐和封面等功能仍有受控外部访问；这不表示整个应用永不联网
- `/api/items` → `collection-store.cjs`；`/api/search` → 曲库适配器；`/desktop-music/*` → `music-service.cjs` 本机随机端口服务，携带会话令牌
- `album-desktop://action/*` 只接受固定原生命令。网页没有通用 Node 执行权限
- `CompanionBridge` → `albumCompanionSnapshot()` → `companion-sync.cjs` → 桌宠／壁纸。快照只携带白名单显示状态（计时、曲名、天气、配饰、场景、伙伴），不携带平台凭证
- 伴随窗口命令须通过白名单；停止轮询后丢弃迟到快照，页面加载失败时清理窗口

## 首页：书桌

| 模块 | 职责 |
|---|---|
| `src/CabinRoom.jsx` | 播放、专注、设置等状态的宿主；`openTool(action)` 把各处入口（抽屉、书柜、台钟、信箱）路由到对应面板或抬头视角 |
| `src/desk/DeskHome.jsx` | 书桌本身：后沿的唱机铜牌、LED 台钟、信箱、唱片架铜牌，前沿的抽屉，抬头看书柜 / 控制面板 / 信箱的过场，按键 A / C / N / D / Esc |
| `src/desk/desk-model.mjs` | 纯数据（有测试）：后沿四件 `EDGE`、抽屉 `DRAWER`（`lab` 字段对应实验室开关）、抬头视角 `VIEWS`、台钟四键 `CLOCK_KEYS`、`deskKey()` |
| `src/desk/RecordDesk.jsx` | 桌面上摊开的唱片封套、右侧唱机和下面的纸条；双击、回车或拖到唱机上播放 |
| `src/desk/ShelfView.jsx` | 抬头看到的书柜：活页夹 = 唱片盒，索引本 = 全部唱片，底部铜牌 |
| `src/desk/views/ConsoleView.jsx` | 抬头看到的唱机控制面板（屏幕、电平表、旋钮、拨杆、推子、按键、音源钥匙） |
| `src/desk/post.mjs`、`usePost.js` | 信箱里的信：欢迎信、版本信、需要留意的提示，以及实验室「小屋来信」 |
| `src/desk/SheetCorner.jsx`、`packets.mjs` | 纸张右上角的纸角（折起 · 展开 · 丢掉）和桌上的纸包 |
| `src/WallpaperRoom.jsx` | 沉入桌面：同一套布局画书桌和台钟，只显示、不响应点击 |

## 可扩展但封闭的目录

| 模块 | 契约 |
|---|---|
| `src/scene-catalog.mjs` | 旧的房间场景 ID（pixel 默认、warm、night-study、forest、seaside、starlight、rain-train、greenhouse）；3.1 起首页不再画房间，ID 只为旧设置的清洗、伴随窗口快照和沿用场景色板的专注画面保留；非法值回退 pixel |
| `src/pet/pet-catalog.mjs` | cat 奶糖、chick 蛋挞、bunny 棉花、bear 可可、fox 枫糖；非法值回退 cat |
| `src/pet/pet-sprites.mjs` | 原创代码生成不同物种的像素轮廓、动作与配饰；保留旧猫；边界化缓存与像素命中 |
| `src/RoomPickers.jsx` | 伙伴选择（设置 › 小屋与奶糖 用 `petsOnly`）；新手引导的「房间与伙伴」一步仍同时显示场景选择。经收藏设置保存；不创建新的播放或计时实例 |
| `src/focus/FocusDock.jsx` | `BUILTIN_FOCUS_TOOLS` 固定注册 timer（这一段）、tasks、notes、sound、study（学习，需开启词书学习） |
| `src/focus/QuickNotes.jsx` | 纯文本、本机保存、长度上限、清空确认、保存失败提示 |

这些是编译进应用的内置模块，不支持下载执行任意插件。场景 ID 与 petId 必须同时经过本机设置和伴随窗口快照清洗。伙伴是原创代码绘制，不使用 Steam 游戏资产；书桌图片来自 DEsk，许可见 `public/licenses/DEsk-MIT.txt`。

## 持久化

| 数据 | 位置 |
|---|---|
| 唱片、曲目、专辑笔记 | 用户数据目录 `collection.json`；迁移旧 `local/collection.json` |
| 黑胶、流派、唱片盒、场景 look（旧字段）、petId、唱机位置（旧字段） | localStorage `album-circle-library-v1-local-owner` |
| 信箱里的信 | localStorage `flow-cabin-post-v1` |
| 专注、待办、奖励、随手记 notes | localStorage `album-circle-focus-v1:local-owner` |
| 声音混音 | localStorage `album-circle-sound-v1` |
| 平台登录、Music Assistant 令牌 | `music.json`，经 safeStorage；拒绝不可用加密和 Linux 明文后端 |
| 本地音乐索引／封面 | `local-music.json`／`local-music/covers/` |
| 桌宠位置和尺寸 | `pet.json` |

用户数据目录沿用 `Album Circle`。`src/backup-model.mjs` 清洗专注备份：纳入 notes，兼容旧备份，不恢复正在运行的计时器或任意额外字段。自动保存失败须显示错误；不要把未落盘内容描述为已安全保存。

## 可靠性与安全实现

- 专注状态机以原始轮次时长计算，暂停不累计时间；睡眠恢复不凭空补多轮奖励，统计按真实本地午夜处理 DST
- 音频生命周期控制器管理异步加载、关闭、销毁和迟到回调；播放请求可取消，音源变更不接受过时结果
- 退出账号先撤销本机凭证并使在途请求／播放地址失效；Music Assistant 更换 origin 不沿用旧令牌
- 本地音频访问校验实际路径，防止链接替换逃逸选定目录；扫描期间删除目录不恢复其曲目
- 封面代理逐次校验重定向并限制跳数；原生控制错误（含 macOS 自动化权限失败）不得返回伪成功

这些防护有专门回归用例，但不是完整安全认证。剩余依赖公告和发行许可问题见 [产品审查](audit/2026-10-product-review.md)。系统加密行为参见 [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)，窗口安全基线参见 [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)。

## 验证分层

- `npm run check`：桌面 Node 测试、16 项音频生命周期测试及 Vite 生产构建；`npm test` 已包含音频回归，模型与模拟依赖测试不要求真实账号
- `node --test src/audio/lifecycle.test.mjs`：注入可控异步播放器的音频生命周期回归
- `npm run test:browser`：隔离浏览器、内存收藏和媒体响应、生成的 WAV，禁止外网；验证页面交互，不验证账号或原生 OS
- `desktop/test/*-ui.cjs`：Electron 受控界面夹具；不能替代真实平台功能测试
- `desktop/test/client-ui.cjs` 与发行工作流：打包应用检查入口；配置存在不表示本次执行通过

云浏览器已经执行合并 PR #4 后的 V6 隔离预览：31/31 自测通过，捕获错误列表为空；涵盖生成 WAV 的真实播放、PNG 导出、真实一分钟计时、唱机位置、慢封面保存竞态与模拟壁纸错误恢复。另有真实指针拖动和页面重载，确认场景、伙伴、位置共同保留。伙伴普通／减少动态效果在 V5 已用实际画面采样验证，后续未更改其实现。详见 [验证记录](audit/browser-validation.md)、[V6 结果](audit/browser-self-test-v6-result.json) 与 [位置持久化](audit/browser-turntable-v6-result.json)。独立 Playwright 启动仍受阻；真实账号、macOS／Windows 原生窗口和系统媒体、本机完整音乐库及安装包验收仍为 **NOT RUN**。夹具预览不能代替这些检查，也不是生产发行。

## PR #4 整合：唱机与壁纸恢复（历史）

以下描述的是 3.1 之前的房间首页。本地整合 `d7ee5a6` 的可移动唱机、封面主色和壁纸失败恢复，同时保留五场景／伙伴与安全回归。`useTurntablePosition` 将位置归一化保存在现有 room 设置；`useCoverColour` 读取封面主色供默认黑胶使用，手动颜色优先。`shell-protocol.cjs` 集中验证静态窗口资源。独立启动超时、取消、崩溃清理与旧请求隔离的模型测试不等于真实 Windows／macOS 挂载已验收。
