# 功能与验收矩阵

历史矩阵：2026-10-09。2026-10-11 的最新变更和实际验收请见 [整合验收](integration-2026-10-11.md)。本表区分“代码存在”“有确定性用例”“模拟交互”和“真实环境已验收”。不以测试文件存在推断通过，不记录未经核实的测试数量、截图、PR 或 CI 结果。最新执行证据见 [验证汇总](verification-summary.md)、[macOS 原生验收](native-mac-acceptance-2026-10-09.md)与 [浏览器验证记录](browser-validation.md)，需求依据见 [产品审查](2026-10-product-review.md)。

## 判读规则

- **已实现**：当前源代码有对应能力；不自动表示真实设备可用
- **确定性回归**：纯模型、临时目录或注入模拟服务验证。用例路径是覆盖证据，通过状态须看最终提交的运行日志
- **模拟交互**：浏览器／Electron 夹具替代收藏、账号、媒体或原生桥；只能证明其覆盖的交互
- **NOT RUN**：本轮未运行真实账号或目标操作系统验收，绝不能写成“全面测试通过”

本地独立 Playwright 所用 Chromium 在打开首个页面前启动失败；后续 GitHub 托管 CI 的独立冒烟已通过，精确提交与范围见验证汇总。云浏览器验证使用已部署的隔离 Vercel 夹具预览；没有发布生产服务。

## 已执行的页面验证

- 人工检查及 V2 复验：五场景／伙伴切换与重载、收藏增删及笔记、随手记、待办、960×600 与 1180×757 布局；工具栏裁切修复与图标可访问名称已复验，真实夹具截图见 README
- [V3 快照](https://album-circle-4g7r9z66l-homings-projects-d78a7226.vercel.app/)：2026-10-08 16:54:12–16:55:14 UTC，1180×757，自测 **22/22 通过**、`errors: []`；[原始结果](browser-self-test-result.json)
- V3 包括实际解码并播放生成 WAV、实际 PNG 导出、备份字段及真正经过一分钟的专注统计；系统媒体、收藏后端和原生接口仍为模拟数据
- V5 最终伙伴动画复验：可见开关关闭减少动态效果时，10 张局部截图产生 4 个不同帧；开启时 10 张保持同一帧；[逐帧证据](browser-pet-motion-v5-result.json)。系统减少动态效果偏好为 false，未修改 OS 设置
- [当前 V6 合并功能快照](https://album-circle-69p2yqms2-homings-projects-d78a7226.vercel.app/)：2026-10-08 17:36:42–17:37:49 UTC，960×600，自测 **31/31 通过**、`errors: []`；[原始结果](browser-self-test-v6-result.json)。保留原 22 项并新增唱机移动／Home、写入失败回滚、自动／手动颜色延迟早保存、复位及模拟壁纸生命周期检查
- V6 人工指针拖动后，实际重载同时保留 forest 场景、bunny 伙伴和唱机位置；Home 复位后再次重载也保持默认位置；[精确坐标记录](browser-turntable-v6-result.json)。该浏览器结果不代表真实账号或原生 OS 验收；后续独立 CI 与原生结果分别列于验证汇总

## 核心体验

| 功能 | 实现与源码 | 确定性覆盖入口 | 模拟／真实验收边界 |
|---|---|---|---|
| 五场景 | `scene-catalog.mjs`、`RoomScene.jsx`；pixel／warm／forest／seaside／starlight | `scene-catalog.test.cjs`：稳定 ID、资源、十二格几何 | 云浏览器已验证五场景与重载；macOS Apple Silicon 原生背景五场景同步通过；Windows NOT RUN |
| 五伙伴 | `pet-catalog.mjs`、`pet-sprites.mjs`；cat 奶糖、chick 蛋挞、bunny 棉花、bear 可可、fox 枫糖 | `pets.test.cjs`：轮廓、六状态、动画、配饰、旧猫兼容、像素命中 | 云浏览器已验证五伙伴选择；V5 已复验绘制变化／减少动态静态帧，V6 五伙伴选择回归通过；macOS 原生五伙伴同步与启停通过；真实拖动／透传未完成，Windows NOT RUN |
| 布置小屋 | `RoomPersonalization.jsx`、`record-library.mjs` | 场景／伙伴设置清洗及旧值回退 | 选择重载、紧凑布局及控件可访问名称已验证；完整键盘流程仍须补齐 |
| 内置工具 | `FocusDock.jsx` 固定 timer／tasks／stats／sound／notes 注册表 | 专注／随手记状态用例 | 任意第三方插件安装、权限沙箱、市场均未实现 |
| 随手记 | `QuickNotes.jsx`、focus model 与 backup model | `focus-reliability.test.cjs`、`backup-model.test.cjs`：长度限制、隔离、旧备份兼容 | 输入、重载保留及备份内容已在夹具验证；纯文本本地工具 |
| 番茄钟／待办／奖励／统计 | focus model、useFocus、TaskList | `focus-reliability.test.cjs`：自由专注、删除任务、暂停、睡眠、DST、轮次时长 | V6 实际一分钟完成、暂停／继续及待办完成通过；macOS 实际一分钟、隐藏窗口倒计时和重启续时通过；通知、系统睡眠 NOT RUN |
| 合成环境音／离线 Lofi | `audio/ambience.mjs`、`lofi-engine.mjs`、`lifecycle.mjs` | `src/audio/lifecycle.test.mjs`：关闭、迟到加载、销毁等可控异步行为 | 默认 npm test 已纳入 16 项音频回归；V3 WAV 播放通过不等于 Lofi 音质／长期系统音频验收 |
| 收藏／唱片盒／卡片／黑胶／导出 | collection store、RecordLibrary、RecordCard、AlbumWall | collection、record-library、wall 测试 | V6 模拟添加、笔记、确认删除与实际 PNG 导出通过；真实库迁移仍须验收 |
| 备份与恢复 | `BackupDialog.jsx`、`backup-model.mjs` | 备份字段、旧 notes 保留、显式清空 | V6 已验证导出备份内容；导入合并不在这 31 项内，用户实际数据恢复 NOT RUN |

## 合并功能回归

| 功能 | 源码／覆盖入口 | 已执行证据与边界 |
|---|---|---|
| 可移动唱机 | `src/useTurntablePosition.jsx`、`src/RoomTurntable.jsx`、`desktop/test/improvements-ui.cjs` | V6 方向键移动、存储分数坐标、Home 复位通过；人工指针拖动／实际重载／场景伙伴共存通过，精确结果见 `browser-turntable-v6-result.json` |
| 封面默认黑胶色 | `src/cover-colour.mjs`、`src/useCoverColour.jsx`、`src/RecordLibrary.jsx`、`desktop/test/cover-editor-ui.cjs` | V6 真实生成 PNG 采样；延迟封面到达前保存的自动色、手动色及透明度保留通过，恢复默认色通过；原始封面未改写 |
| 设置写入失败 | `src/RecordLibrary.jsx`、`src/CabinRoom.jsx` | V6 注入的存储失败保留旧场景并显示错误，恢复后可继续选择；不等于真实磁盘故障测试 |
| 壁纸错误／取消／重试 | `desktop/wallpaper.cjs`、`desktop/test/wallpaper-lifecycle.test.cjs`、`src/CabinRoom.jsx` | V6 合成事件回归通过；macOS 原生启停、延迟启动取消、缺失资源与 renderer 崩溃恢复通过，故障注入范围见原生报告；Windows NOT RUN |

## 音乐与原生能力

| 能力 | 已有实现 | 本轮边界 |
|---|---|---|
| 曲库搜索 | iTunes／MusicBrainz／QQ 元数据及封面 | 元数据搜索不等于整曲播放授权 |
| 本地音乐 | 选择目录、索引标签、按原路径播放 | 临时目录与夹具测试；实际音乐库、不同编码、外接盘真实验收 NOT RUN |
| 系统正在播放 | Windows 系统媒体控制；macOS Music／Spotify JXA | 控制已运行播放器，非内嵌官方流媒体；目标 OS 权限／切歌 NOT RUN |
| QQ／网易云 | Simple Music 非官方适配器与本机登录会话 | macOS QQ 人工登录、两首歌音频推进及暂停／继续／下一首通过；整曲自然结束、会员／地区覆盖、网易云真实账号 NOT RUN；歌单导入和旧收藏标识补全未实现 |
| Music Assistant | 用户已有服务器与远端播放器 | 更换服务器撤销旧凭证有回归；真实服务连接／音箱输出 NOT RUN |
| 桌宠／动态桌面 | 独立 Electron 页面与 macOS／Windows 原生路径 | macOS 原生启停、场景／伙伴同步、背景故障恢复及两个屏幕分别启动通过；透传／真实拖动未完成，Spaces／热拔插／Windows NOT RUN |
| 官方 Spotify／Apple Music 内嵌播放 | 未实现本轮官方 SDK 接入 | 开发者配置、用户授权、订阅和设备限制为独立范围 |

## 本轮可靠性与安全回归

`desktop/test/runtime-security.test.cjs`、`focus-reliability.test.cjs`、`policy.test.cjs` 等覆盖以下确定性场景：

- Music Assistant 变更服务器不泄漏旧令牌；退出登录优先于迟到登录，并取消在途音频和失效播放 URL
- safeStorage 无可用加密或 Linux 明文回退时拒绝保存凭证
- 本地索引异常恢复、目录删除与扫描竞争、符号链接边界及旧链接迁移
- 封面代理重定向目标逐跳校验、跳数限制
- 伴随窗口只读快照清洗、停止轮询后忽略迟到结果、桌宠页面失败清理
- macOS 控制失败不误报成功；音乐服务异常响应、取消和长时间扫描采用不同处理

这不是渗透测试或无漏洞保证。桌面依赖仍有未解决的上游公告；根许可证与已组合 GPL 模块的分发义务尚待明确，不擅自重新许可。

## 发布门槛

最终提交的构建与各层测试结果、真实账号授权验收、macOS／Windows 安装与原生行为、依赖风险及许可澄清缺一不可。CI 定义已添加不代表远端已绿。README 分开标注旧版截图、本轮真实夹具预览截图与代码渲染的五伙伴图；后两者也不构成原生平台证据。新增场景与伙伴为原创代码绘制，不使用 Steam 资产。
