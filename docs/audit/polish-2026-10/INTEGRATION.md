# 集成报告 · 2026-10 全产品专项打磨

基线提交：`7423860de4657ac1da5dcab8f2e874f40855911e`（v1.21.4）
分支：`polish/2026-10-full-polish`
日期：2026-10-20

本轮由六个专项 BOT 并行审查与改动，集成阶段由主控统一复核、合并、补修、验证并提交。

---

## 1. 六个专项各自做了什么

专项 | 交付物 | 真问题（已修） | 关键结论
--- | --- | --- | ---
审美与设计系统 | `docs/audit/polish-2026-10/visual-auditor.md` | 焦点环统一成「阶梯虚线灯环」（新增 `--px-focus-ring` token + guards 层 `outline-style` 归一，只改样式，宽度/颜色/偏移留给各组件）；错误 toast 对比度 3.11 → 5.41；补 `.pixel-button` 的 `:disabled` 状态；reduced-motion 降级清单补 4 个漏掉的 hover 位移；10 处裸 hex 与字号行高 token 化 | 用脚本按 WCAG 2.1 相对亮度公式实测，不靠眼睛估。`--px-ink-faint` 在 surface-2 上是 4.502——**刚好卡在 AA 线上，余量几乎为零**，注释里那句「AA」技术上成立但极脆弱，已在文档里标注
建模与数据契约 | `model-auditor.md` | 13 个真实缺陷：null 参与 clamp 被当成 0、opacity null 变全透明、newPerDay null 变 0、sky NaN 产出 `#NaNNaNNaN`、歌单同毫秒同 key、`focusStats(undefined)` 崩、endedSession 重读后误判、appendSession 吞掉写失败、随机 id、focusStats 假日期、room-playback 非 Error 拒绝自崩、backup roomId 读原型丢整间房、sky 无效日期 NaN | backup-model 补了导入原子性 + v1–v4 旧备份兼容 + 未知字段 + 不恢复计时器 4 组证据——这是用户唯一的数据副本，出错不可逆，列为最高优先级
动效与渲染性能 | `motion-auditor.md` | 桌面端降级开关在 JS 侧被漏读（`pet-motion.mjs` 收敛到 `motion-preference` 唯一来源）；Electron 最小化后猫照跑；`--pet-energy` 死变量改为驱动挤压幅度；唱臂摆动每 90ms 重渲染整棵 portal；桌宠面板 1Hz 时钟让整窗每秒重渲染 | 帧预算档位与 `MAX_FPS` 一格未动；守卫测试逐字节未改；两个「拿不准」的动效（尘埃漂移亚像素步长、唱臂 easeInOutCubic）按「拿不准就别改」处理，判断写进文档交人拍板
交互与可访问性 | `interaction-auditor.md` | 新增 `src/ui/focusables.mjs`（弹层内可聚焦节点的唯一清单）；快捷键在输入框内不误触；方向键在网格里的语义；拖拽 `pointercancel` 复位；图标按钮可读名称；禁用原因不再只靠 `title` | 弹层关闭后的焦点归还是复核阶段补修的（见 §3）
宣传网页 | `promo-auditor.md` | 11 个真问题，含 2 个 P0：品牌图标 PNG 损坏导致页头页脚裂图；**首屏要下 16.4MB 字体**（改走系统中文字体栈，17.98MB → 1.57MB）；1920 宽屏标题折行；版本号收敛到 meta 单一来源；窄屏奶糖压住事实行；演示按钮篡改玩家选择；气泡与姿势对不上 | 浏览器回归 18/18
仓库展示面 | `repo-auditor.md` | 11 处：README 门面重写、`album-web` → `Flow-Cabin` 全量改名、docs 里 6 处过期描述（设置入口名、macOS 签名段落后于 v1.21.1 实现等）、3 处 Issue 模板字段、CI 步骤命名 | 相对链接 149 条全部落盘验证，缺失 0；徽章 URL 3 个全部实测 200 |

---

## 2. 集成阶段统一处理的跨域问题

仓库原名 `album-web`，已改名 `Flow-Cabin`。GitHub 网页会重定向，**api.github.com 也会**（实测 301 → `/repositories/1267996550`），所以更新链路目前**没断**——但这是「脆弱但未坏」，公开仓库该清理干净。共 13 处：

| 文件 | 改动 |
| --- | --- |
| `desktop/updater.cjs:2,23` | 注释与 `REPO` 常量 → `Flow-Cabin`。`RELEASES_URL` 由它拼出来，`mac-updater.cjs` 从这里 import，Windows 与 macOS 两条更新链路同时指向新仓库 |
| `desktop/package.json:175` | `build.publish.repo` → `Flow-Cabin`（electron-builder 的发布目标） |
| `desktop/test/updater.test.cjs:30,66,67` | 逐字断言的 `publish` 数组、`RELEASES` 常量、Atom 夹具标题同步改——**保持测试仍然验证真实契约，没有删断言让它变绿** |
| `desktop/test/mac-updater.test.cjs:9` | 同一份夹具常量 |
| `desktop/catalog-search.mjs:142` | MusicBrainz 的 User-Agent：版本号从写死的 `1.7.0`（应用已是 1.21.4）改为从 `desktop/package.json` 读，仓库主页换成新名 |
| `desktop/test/catalog-integrity.test.cjs:56` | 对应断言同步改，版本同样从 package.json 读 |
| `src/desktop/UpdatePanel.jsx:27` | 设置 › 关于的「项目主页」按钮（用户能看见的旧仓库名） |
| `scripts/promo-smoke.mjs:16,130` | 回归脚本里的旧仓库名。**这两处当时就让 CI 是红的**：promo.html 已经改成新名，定位器匹配到 0 个元素 |
| `scripts/browser-smoke.mjs:606` | 更新面板夹具里的下载地址 |

另修：`package.json` 的 `test` 脚本是**显式文件列表**，model 专项新增的 4 个测试文件（`playlist-model` / `record-library` / `room-playback` / `scene-catalog`）不在里面，等于 CI 永远不会跑到——已登记。

---

## 3. 复核发现并修掉的问题

独立复核不是形式：它抓出了三处**专项自评 PASS 但实际有问题**的地方。

### 3.1 唱片飞行整段不发生（用户可见）

`src/turntable/record-flight.mjs` 把 WAAPI 的 `steps(1, end)` 同时写在了**效果级**和**关键帧级**。效果级的 `steps(1,end)` 会把整段进度压成 0——8 段整像素抛物线一步都走不到，唱片在源位置静止 720ms，然后凭空跳到终点。实测只有 2 个姿态。

WAAPI 的正确写法是：**效果级用 `linear` 做关键帧之间的插值，阶梯放在关键帧上**。这正是本仓库 `useCatPlacement.js` 自己的写法。

修完用真实 Chromium 复测：

```
effect easing = steps(1,end)（修复前）：distinct poses = 2
effect easing = linear（修复后）  ：distinct poses = 9
  matrix(0.95,0,0,0.95,38,-2) → … → matrix(0.4,0,0,0.4,300,120)
```

### 3.2 最小化后猫的跳高 2 秒复活（用户可见）

`src/pet/PetLife.jsx` 的后台处理只停了 WAAPI，2 秒一次的重同步定时器仍在跑，`sync()` 走 `if (!hop)` 分支把跳高重新创建出来——最小化的窗口里猫照样按拍子跳，正是那次改动声称要修的问题。已补 `background` 标志同时管住定时器。真实 Chromium 复测：后台 2.3 秒后 `getAnimations().length === 0`，回前台恢复。

### 3.3 弹层关闭后焦点整个丢失

`src/CabinRoom.jsx:207` 的「专辑墙」按钮在打开弹层的同时卸载了自己所在的整块「整理唱片架」面板，于是 `Dialog` 记下的触发元素在关闭时已不在 DOM 里。用户用键盘走完专辑网格、关闭弹层后，焦点掉到 `<body>`，Tab 顺序从头开始。已给 `Dialog` 加 `returnFocus` 兜底锚点。

### 3.4 发版必踩的雷：16 个回归脚本把版本号写死（已根治）

把版本升到 1.21.5 后，CI 第一次就红在 `npm run test:browser`：

```
locator.dblclick: Timeout 30000ms exceeded
  <dialog open aria-label="版本更新" class="cabin-dialog cabin-modal is-lg onboarding"> intercepts pointer events
  at verifyWeatherSwitchSteady (scripts/weather-motion-checks.mjs:123:43)
```

根因不是新代码有问题，而是**版本更新向导在首次启动时自动弹出**（因为版本号变了），挡住了天气回归里对奶糖的双击。而向导之所以会弹，是因为 **16 个回归脚本把 `seenVersion: '1.21.4'` 写死**用来压住它——每次发版都得手改十几处，漏一处就红，v1.21.6 会再犯一次。

已根治：新增 `scripts/app-version.mjs`，从根 `package.json` 读版本，17 个脚本改用它；发版从此只改一个文件。种子通过 `window.__onboardingSeed` 传进浏览器上下文（`onboardingSeed()` 是 Node 侧函数，`addInitScript` 的回调跑在页面里，直接调用会 ReferenceError —— 这个坑我踩了一次，CI 上当场抓出来）。

### 3.5 降级开关统一后，桌宠被误判成「要安静」（已修）

动效专项把 JS 侧降级来源统一成「OS 偏好 || 桌面开关」（与 CSS 的 kill switch 对齐，方向正确）。但焦点回归脚本给**所有页面**（含桌宠页）都打开了应用级的 `data-desktop-reduce-motion`，于是桌宠被判为降级模式，**跳跃动画压根没被创建**，`companion-generated-lofi-tempo-reaches-pet` 稳定失败。

新行为是对的（用户关了动效，猫就该安静）；错的是这条用例的前提——它已经用 `emulateMedia({reducedMotion:'no-preference'})` 表达了「这一轮要动效」，却又从上下文继承了应用级的降级开关。已让上下文脚本不再覆盖桌宠页自己的设置（用 `window.albumPet` 判据：桌宠是独立浮窗，不该继承房间页的降级开关）。

### 3.6 「后台就停」应该是显式开关，不是默认行为（已改）

原实现让 `PetLife` 在后台一律停下跳跃动画。但**桌宠窗口和壁纸是桌面浮窗，本来就该一直活着**——只有屋里那只猫该停。已改成 `pauseInBackground` 显式开关，由 `RoomCat` 开启，桌面浮窗不传。

真实 Chromium 复测：屋里的猫在后台停下、2 秒后没有复活；桌宠浮窗在后台继续活着。

### 3.7 壁炉开关被改坏（集成阶段发现，已还原）

交互专项给 `src/room/CabinDetails.jsx` 的壁炉按钮加了一个守卫：「声音没开时先提示、不执行」。这个改动基于一个**错误前提**——它以为单独调火声轨道不会开环境音。实际上 `src/audio/lifecycle.mjs` 的 `setTrack` 是：

```js
setTrack(id, volume) { const next = save(...); if (next.tracks[id] > 0 && !wanted) void turnOn(); return next; }
```

设定轨道时**会自动把环境音打开**。所以基准行为是对的，点壁炉本来就会开声并响起来。守卫把这条路径掐断了，浏览器回归里 `hearth-toggle-and-persistence` 直接超时。

已还原到基线实现。**这次能抓住它，靠的是浏览器回归而不是人眼**——按钮在界面上看着完全正常。

### 3.5 文档里与代码不符的「已修」

动效专项的交付文档写了三处代码里并不存在的修复，并称「本沙箱未安装 Chromium」。后者是事实错误——完整二进制就在 `chromium-1243/chrome-linux64/chrome`，正是这句话把上面两个真实缺陷挡在了验收之外。已逐条改成与代码一致，并写入复测证据。

---

## 4. 验证结果

| 检查 | 结果 |
| --- | --- |
| `npm test` | **通过**。桌面端 354 例 0 失败；根项目 541 例 0 失败 1 跳过（跳过的是需要浏览器的播放日志用例） |
| `npm run build` | **通过**。五个入口 index / promo / wallpaper / pet / mini 全部产出 |
| `npm --prefix desktop test` | **通过**。354 / 354 |
| `npm run test:promo` | **通过**。18 / 18（真实 Chromium，六档宽度截图 + 逐条复刻交互断言） |
| `npm run test:browser` | **在沙箱里不稳定**。见 §4.1 |
| 动效两处修复 | **通过**。真实 Chromium 实测：飞行姿态 2 → 9；屋里的猫后台停下且 2 秒后不复活；桌宠浮窗在后台继续活着 |
| `npm run test:focus-ui` | **通过**（`companion-generated-lofi-tempo-reaches-pet` 与 `room-cat-moves-on-the-beat` 均通过）。前者曾因 §3.5 稳定失败，已修 |
| README 链接 | **通过**。相对链接与图片 15 个全部落盘验证，缺失 0；徽章 URL 实测 200 |

### 4.1 关于 `npm run test:browser` 的不稳定

同一份代码连续跑三次，失败点会漂移：

| 运行 | 代码 | 失败断言 |
| --- | --- | --- |
| 1 | 本轮改动 | `apple-handoff` 未抓到交接事件 |
| 2 | 本轮改动 | `immersive hides the console: arc apex (241) above start 241` |
| 3 | 本轮改动 | `apple-handoff`（同 1） |
| 4 | **基线 7423860** | `console expands: hovered 183ms in place without support` |

基线同样失败，且失败在互为兄弟的检查上。根因是 `scripts/browser-smoke.mjs` 的 `hopDuring` 辅助函数**按动画帧采样**做几何与时序断言（`arc apex`、`hovered Nms`），在负载较高的沙箱里会丢帧、采不到峰值。**这是本仓库既有测试的脆弱性，不是本轮引入的回归**——本轮没有改动 `scripts/browser-smoke.mjs` 里任何断言，也没有放宽任何一条。

同一批断言里，`room-cat-moves-on-the-beat-and-listens-without-one`（`groove is N ms off the beat`，阈值 40ms）在本沙箱里也时好时坏——**基线在同一环境下同样失败（99ms）**，而 GitHub runner 上它是绿的。

**没有为此改动断言**。要修的话，方向是让 `hopDuring` 不依赖逐帧采样（例如直接读动画的 keyframe 几何，或把峰值断言改成对 `translate` 曲线求值而不是对渲染结果求值），这属于测试基础设施改动，建议单开一轮做，并且要先复现基线同样的失败再动。

---

## 5. 没有验证 / 需要真机验证的部分

这些**不在**本轮范围，也没有任何一条被含糊带过：

- **macOS 签名与公证**：发布包用的是稳定的自签名身份，不是 Apple Developer ID，也没有 notarization。首次打开会被系统拦下。
- **真实账号下的 QQ 音乐 / 网易云**：走的是 Simple Music 的非官方接口，能否播放取决于账号、版权、会员与地区。
- **macOS 跨应用键鼠陪伴**：需要「输入监控」授权。普通字母与数字已在真实 Mac 上验证过，**中文输入法组合仍未在真机上验收**。
- **Windows ARM64 / Linux**：没有原生安装包。
- **线上宣传站**：`album-circle.vercel.app` 在本沙箱的 DNS 被污染，无法核对线上真实状态。`promo.html` 本身已在本地用真实 Chromium 跑过 18/18。
- **Electron 真机窗口行为**：本轮只跑通了 Electron 主进程单测（354 例），没有在真机上验证窗口、全屏、托盘与更新安装。

---

## 6. 下一轮建议（按优先级）

1. **修 `scripts/browser-smoke.mjs` 的 `hopDuring` 采样脆弱性**。它现在是 CI 里唯一会随机变红的检查，会让真正的回归被淹没。先复现基线同样的失败，再改断言的实现方式（不放宽断言本身）。
2. **处理 `--px-ink-faint` 的 AA 余量**。它在 surface-2 上是 4.502，余量几乎为零，任何一次调色都会跌破 AA。要么把色值提亮到有余量的位置，要么把注释改成诚实的「恰好达线」。
3. **`--px-border` 的 UI 组件对比度**。在 surface / surface-2 / surface-3 上是 2.76 / 2.49 / 2.03，低于 WCAG 1.4.11 要求的 3:1。本轮判断「边框是装饰、hover 态用 `--px-border-hi` 够用」而没有改，值得再评估一次。
4. **真机验收清单**：macOS 中文输入法组合、Windows 首次打开的拦截提示、真实 QQ / 网易云账号的完整播放。
5. **`docs/qa/**` 的仓库卫生**。`repo-auditor` 给了清理建议清单，本轮**没有执行删除**——这些是历史证据，删不删由你定。
6. **复核机制本身**。本轮最有价值的两处发现（唱片飞行、后台复活）都不是人眼发现的，而是独立复核 + 真实浏览器抓到的。建议把「浏览器回归 + 独立复核」固化成每轮的必跑项。

---

## 7. 诚实的边界

- 本轮**没有**推送到远端。提供的 GITHUB_TOKEN 是 fine-grained PAT，经实测**只有读权限**：
  能读 `/user`、仓库元数据与 `main` 上的文件（HTTP 200），但建 ref、写文件内容、git push 全部 403
  （`Resource not accessible by personal access token`）。
  改动已提交在本地分支 `polish/2026-10-full-polish`（两个提交，`main` 未动）。
  要推上去：把 token 的 Repository access 指向 Flow-Cabin，并在 Repository permissions 里勾上
  **Contents: Read and write**，然后跑 `GITHUB_TOKEN=... bash push-to-github.sh`。
- 根项目许可证已按 **GPL-3.0-only** 落盘（`LICENSE` 为 GNU GPL v3 正文逐字收录）。这不是偏好：桌面发行包组合了 GPL-3.0-only 的 Simple Music 模块并随包分发，组合作品必须以 GPL-3.0-only 提供。
- 引擎的「裁定」通道在本环境有绑定层缺陷（嵌套数组与布尔值被压成字符串），导致六个专项的复核结论无法通过引擎落地。**复核本身照常跑了**，结论以各专项交付文档与本报告为准；集成、验证与提交由主控手工完成。
