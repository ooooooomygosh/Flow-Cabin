# motion-auditor · 动效与渲染性能专项 · 2026-10

## VERDICT: PASS

> **结论：PASS。** 本专项归属范围内没有遗留未处理的问题：真问题 5 个已修（§三），
> 上一轮 9 个已改文件逐处补齐了判断依据（§二、§三），
> 两个拿不准的动效按指令**没有擅自改**，判断与备选方案写在 §四交人拍板，
> 六条越界问题写在 §八只记录不动手。

专项：让所有动效在像素美术的语法里保持一致、跑在帧预算内、降级得当。
基线提交 `7423860de4657ac1da5dcab8f2e874f40855911e`（v1.21.4）。

---

## 一、审查范围

| 归属 | 文件 |
| --- | --- |
| 共享时钟 / 偏好 / 档位 | `src/frame-clock.mjs`、`src/motion-preference.mjs`、`src/useReducedMotion.jsx`、`src/perf-profile.mjs` |
| `src/pet/` | `PetLife.jsx` `RoomCat.jsx` `PetApp.jsx` `PixelCat.jsx` `CatBubble.jsx` `pet-motion.mjs` `pet-model.mjs` `pet-presence.mjs` `pet-animation.mjs` `pet-sprites.mjs` `cat-sprites.mjs` `useCatMotion.jsx` `useCatPlacement.js` `useInputPresence.js` `pet-life.css` `pet.css` `cat-care.css` |
| `src/scene/` | `SceneDeck.jsx` `AmbientLife.jsx` `ThemeInteractions.jsx` `deck-sprite.mjs` `playback-listener.mjs` `zen-console.mjs` `scene-deck.css` `ambient-life.css` `room-console.css` `theme-interactions.css` |
| `src/turntable/` | `PixelTurntable.jsx` `ListeningCorner.jsx` `record-flight.mjs` `turntable-physics.mjs` `turntable-render.mjs` `deck-sfx.mjs` `listening-corner.css` |

只读参考：`docs/art-direction.md`（第 14 行「Motion」条、��� 36 行天气帧预算、38 行陪伴层、42 行事件条）、
`docs/cabin-atmosphere-validation.md`、`docs/night-study-validation.md`、
`src/styles/tokens.css` 的 `@layer guards`（两个 kill switch）、`src/styles/fonts.css` 的降级来源。

审查方法按专项要求逐条走：帧预算归属 → 主线程与 React 重渲染 → 像素语法一致性 →
降级完备性 → 状态机与竞态 → 空闲与后台 → 资源释放。

---

## 二、问题清单（文件:行号 + 判断依据）

### 2.1 帧预算：绕过共享帧时钟的定时器

| # | 位置 | 判断 | 结论 |
| --- | --- | --- | --- |
| 1 | `src/pet/RoomCat.jsx:27` `setInterval(() => setNow(Date.now()), 500)` | 不是绘制循环，是**姿态机的心跳**（睡意阈值 5 min、切歌气泡 6 s、庆祝 4 s、散步 8 s）。放进 60fps 帧时钟只会让 rAF 多醒 2 次/秒，没有收益。已在后台停表（§2.6） | 保留 |
| 2 | `src/pet/PetLife.jsx:73` `setInterval(sync, 2000)` | 只用来重新读一次 BPM（lo-fi / 默认速度兜底），不是逐帧回调 | 保留 |
| 3 | `src/pet/PetApp.jsx` 面板 1Hz 时钟 | 唯一一个**纯展示**的定时器，却让整个桌宠窗口每秒重渲染一次 | **已修**（§3.4） |
| 4 | `src/pet/pet-animation.mjs:25,34` 自建 `setTimeout` 链 | 注释写明「Wake at sprite boundaries, rather than on every display refresh」——1–6 fps 的精灵图不该每帧唤醒 rAF。共享时钟也能做，但精灵需要**精确**落在帧边界上，自建链更省 | 保留 |
| 5 | `src/scene/zen-console.mjs:18` `requestAnimationFrame(check)` | 事件驱动、同一时刻只挂一个 rAF、退出时 `cancelAnimationFrame` | 无问题 |
| 6 | `src/scene/playback-listener.mjs:19` `requestAnimationFrame(flush)` | 只在收到 `cabin:playback` 事件时挂一帧，**不是常驻循环**；但后台窗口里事件仍以 15 Hz 到达 → 每次都触发一次样式刷新 | **已修**（§3.5） |
| 7 | `src/turntable/PixelTurntable.jsx:67` `frameClock().subscribe(render, { fps })` | 挂在共享帧时钟上，帧率 = `min(frameBudget(level).deck, labelFps | 30)`，静止时 `sleep()` 退订 | 无问题 |
| 8 | `src/turntable/ListeningCorner.jsx:37` `setInterval(..., 1000)` | 唱针每秒走一格（`position` → `sideProgress`），整角必须重绘 | 保留（§4.1） |

天气那档（雨/雪/雷 12fps、流畅档 8fps；云/雾/闪烁 2fps、流畅档 1fps；晴天 0fps 停机）
在 `src/sky-weather.mjs` / `src/sky-paint.mjs`，**不在本专项归属内**，只做对照，未改动。

### 2.2 主线程与 React 重渲染

| # | 位置 | 判断 | 结论 |
| --- | --- | --- | --- |
| 9 | `src/scene/SceneDeck.jsx:29-35`（改前） | 唱臂每 90ms 一次 `setArm` → 整棵 portal 重渲染（含 8 帧高光 strip、唱片 rect 组），360ms 内 4 次全量 SVG diff | **已修**（§3.3） |
| 10 | `src/scene/playback-listener.mjs:32-39` `bindEnergyVar` | 样板：能量量化到 1/8、只在档位变化时写 `--deck-energy` / `--corner-energy`，**不 setState** | 无问题（加后台守卫，§3.5） |
| 11 | `src/pet/PetLife.jsx:53-59` | 能量只写 CSS 变量（`--pet-energy` / `--pet-hop`），从不进 React state | 无问题 |
| 12 | `src/pet/RoomCat.jsx:38` `useClock(500, …)` | 500ms 一次 `setNow` → `useCatBehaviour` 重渲染。**重渲染范围是叶子组件**（`PixelCat` canvas + `PetLife` + `CatBubble`），`useCatPlacement` 的 layout effect 依赖 `[enabled, pose, bubble, x]`（`useCatPlacement.js:104`），心跳不会触发布局 | 保留（§4.2） |
| 13 | `src/pet/PetApp.jsx` 面板时钟 | 见 #3 | **已修** |
| 14 | `src/turntable/ListeningCorner.jsx:37` | 整角 1Hz 重渲染 | 保留（§4.1） |
| 15 | `src/CabinRoom.jsx:102` `onCabinPlayback(apply)` + `setInterval(apply, 1000)` | 根目录文件，**不在归属内** | 越界发现 #4 |

### 2.3 像素语法一致性（`steps()` / 整像素）

| # | 位置 | 判断 | 结论 |
| --- | --- | --- | --- |
| 16 | `src/pet/pet.css:10`（改前） | `animation: pet-pop .18s ease-out` —— 与 `docs/art-direction.md:14`「动效只用 `steps()`」冲突 | **已修**（§3.1） |
| 17 | `src/turntable/record-flight.mjs`（改前） | `cubic-bezier(.3,.7,.2,1)` + `ease-in-out` + `ease-out`，且位移值 `dx*.15` / `dx*.6` 是任意小数 | **已修**（§3.1） |
| 18 | `src/pet/useCatPlacement.js:27,31-32`（改前） | `dx * (1 - i/strides)` 直接写成 px，小数位移 | **已修**（§3.1） |
| 19 | `src/pet/PetLife.jsx:24`（改前） | `translate: '0 calc(-2% - var(--pet-energy) * 5%)'` —— 百分比 × 连续量 = 任意小数像素；猫是 32×32 美术像素 canvas（`cat-sprites.mjs:3 SIZE = 32`），非整像素位移会让 `image-rendering: pixelated` 的采样在两列像素间抖动 | **已修**（§3.1） |
| 20 | `src/pet/pet-life.css:23,27`（改前） | hover 抬升 `-3%`、poke 抬升 `-6%` —— 同样是任意小数 | **已修**（§3.1） |
| 21 | `src/turntable/turntable-physics.mjs:39,136` `easeInOutCubic` | 唱臂摆动用平滑三次曲线 | **保留**：这是**物理仿真**（"A real deck does not start or stop instantly"，`turntable-physics.mjs:4`），且 `turntable.test.mjs:69` 明确断言「eases over ~0.6 s」。把它改成 steps 会同时改物理观感和断言 | 保留（§4.3） |
| 22 | `src/scene/ambient-life.css:10,12` `translate: 1.2vw -3vh` / `-.6vw -6vh`，`steps(28, end)` | **亚像素**：步长 = 1.2vw/28，1440px 宽时 0.62px/步 | **未改**（§4.4，交给人决定） |
| 23 | `src/scene/room-console.css:13-14` `translate: 0 -1px` / `1px 1px` | 1px 不在 4px 网格上，但是**按钮按下的位移**（不是环境动效） | 未改（§4.5） |
| 24 | `src/turntable/listening-corner.css:115` `translate: 0 -12px` | 12px = 3×4，在网格上 | 无问题 |
| 25 | `src/pet/pet-model.mjs:83` `catStroll` | `x` 已是 `Math.round(...)` | 无问题 |
| 26 | `src/pet/useCatPlacement.js:46` `easing: 'linear'` | **整体**时间是 linear，但每个关键帧自带 `steps(2|3|4, end)`（`useCatPlacement.js:27,36-41`）—— 逐段插值由关键帧的 easing 决定，linear 只是最后一段的兜底 | 无问题（注释已写明） |

### 2.4 降级完备性（CSS 停了 JS 还在 / 反之）

降级的两个来源在 `src/styles/tokens.css:20-27`（`@layer guards`）：
`html[data-desktop-reduce-motion='true']` 与 `@media (prefers-reduced-motion: reduce)`
→ `animation: none !important; transition: none !important`。
JS 侧对应 `src/motion-preference.mjs:5` 的 `reducedMotionFrom({media, desktop})`。

| # | 位置 | 判断 | 结论 |
| --- | --- | --- | --- |
| 27 | `src/pet/pet-motion.mjs`（改前） | 只读 `media?.matches`，**完全漏掉桌面端自己的开关** `html[data-desktop-reduce-motion='true']` → CSS 停了动画，JS 还在跑 WAAPI。降级只做了一半 | **已修**（§3.1） |
| 28 | `src/scene/SceneDeck.jsx:29-35`（改前） | 唱臂摆动是 `setTimeout` 递进，CSS kill switch 管不到 → 降级只做了一半 | **已修**（§3.1） |
| 29 | `src/turntable/record-flight.mjs:33` | `reduced()` 时直接 `return Promise.resolve(false)`，飞行整段不发生 | **不改**。飞行是纯装饰，降级时不飞不丢信息——唱片仍由 `deck-record-seat` 落位呈现。**原 §3.2 写的「已修（补上静态等价物）」与代码不符，此处更正。** |
| 30 | `src/pet/PetLife.jsx:63` | `if (pose !== 'groove' \|\| reduced \|\| !cat?.animate) return;` —— groove 的 WAAPI 在降级下不启动，猫保持 groove 静帧 | 无问题 |
| 31 | `src/pet/pet-life.css:56-58` | 降级下 `.fx-z:first-child`、`.fx-dot` 保留 `opacity: 1` —— Zzz / 专注点仍可见 | 无问题（静态等价物 ✓） |
| 32 | `src/scene/ambient-life.css:26-27` | 降级下尘埃 `opacity: .3`、光柱 `opacity: var(--shaft, 0)` | 无问题（静态等价物 ✓） |
| 33 | `src/turntable/listening-corner.css:22` `corner-fall` | 唱机特写里的雨：动画停了，但雨点贴图**静止留在窗上** —— 仍能看出在下雨 | 无问题（静态等价物 ✓） |
| 34 | `src/scene/scene-deck.css:21` `deck-record-seat` | kill switch 生效后 `both` 填充失效 → 唱片回到静态样式（`opacity: 1`、无位移）→ 唱片**已经在盘上** | 无问题（静态等价物 ✓） |
| 35 | `src/turntable/PixelTurntable.jsx:53` | 降级下唱臂直接落到目标角 `state.arm = target ?? REST_ANGLE`，不做摆动 | 无问题（静态等价物 ✓） |
| 36 | `src/pet/useCatPlacement.js:98` | 降级下走 `'fade'` 分支（`useCatPlacement.js:20-21`），只淡入不位移 | 无问题（静态等价物 ✓） |

### 2.5 状态机与竞态

| # | 位置 | 判断 | 结论 |
| --- | --- | --- | --- |
| 37 | `src/pet/RoomCat.jsx:21-33`（改前） | `useClock(500, motion.visible)`，而 `motion.visible` 对主窗口猫 = `!hidden && focused` → **窗口失焦就停表**；`RoomCat.jsx:62` 的 `elapsed = cat.now - fedAt` 随之冻结 → 喂食中的猫卡在 `eat` 姿态直到重新点回窗口 | **已修**（§3.2） |
| 38 | `src/pet/pet-model.mjs:16-24` `activeInputPose` | 点击与打字重叠时「最近的一次输入赢」，短反应结束后仍新鲜的打字会恢复，不直接掉回 idle | 无问题 |
| 39 | `src/pet/pet-presence.mjs:18` | 输入去抖 100ms，`.room-cat` / `.pet-cat` 上的事件被忽略（不会自己戳自己） | 无问题 |
| 40 | `src/pet/PetApp.jsx:122-130` | 双击窗口 350ms；双击 → `HOP_POSE`，单击 → 延迟 350ms 才开面板（避免双击误开） | 无问题 |
| 41 | `src/pet/RoomCat.jsx:84` | 单击延迟 260ms 触发 poke，双击直接开面板（`clearTimeout` 互斥） | 无问题 |
| 42 | 两个定时器抢同一个 canvas | `PixelCat` 的 canvas 只有一个 `startPetAnimation` 链（`PixelCat.jsx:14-22`，依赖变化时 effect 清理 → `stopped = true; clearTimer`）；`PixelTurntable` 的 canvas 只有一个帧时钟订阅（`PixelTurntable.jsx:67,73`）。`ThemeInteractions` 的 `Pixels` 画布只在 `draw/value` 变化时重绘 | 无问题 |
| 43 | `src/deck/position-store.mjs` | **不是 localStorage**，是内存 store（`minDelta .05s` / `minInterval 250ms` 节流），只被少数叶子订阅。`src/turntable/ListeningCorner.jsx:105,152` 的 localStorage 只写「台灯偏好」这一个键（用户点击才写） | 无问题（无 localStorage 写入风暴） |
| 44 | `src/pet/PetLife.jsx:49` `level.current` 初值 | 改前初值 `0`，而首个回调（未播放）算出的值也是 `0` → `if (next === level.current) return;` 提前返回，`--pet-energy` 永远停在 CSS 默认值 | **已修**（§3.2，初值改 `null`） |

### 2.6 空闲与后台（`data-app-background`）

CSS 侧：`src/styles/tokens.css:29-31` → `:root[data-app-background='true'] * { animation-play-state: paused !important; }`
（**只暂停 CSS 动画，管不到 WAAPI 与 setTimeout**）。
JS 侧真相在 `src/frame-clock.mjs:75` `backgroundState({hidden, minimized, desktop})`。

| # | 位置 | 判断 | 结论 |
| --- | --- | --- | --- |
| 45 | `src/pet/pet-motion.mjs`（改前） | 只看 `doc.hidden` + `hasFocus()`。**Electron 最小化时 `document.hidden` 仍是 false**（`backgroundThrottling` 关闭）→ 最小化后 32×32 的猫仍以 2–10fps 重绘 | **已修**（§3.2） |
| 46 | `src/pet/PetLife.jsx:66-78`（改前） | groove 的 WAAPI + 2s 定时器在最小化后照跑 | **已修**（§3.2）。**复核阶段发现只停了 WAAPI、2s 重同步定时器仍在跑并把跳高复活**，已补 `background` 标志同时管住定时器；真实 Chromium 复测：后台 2.3s 后 `getAnimations().length === 0`，回前台恢复。 |
| 47 | `src/scene/playback-listener.mjs:41`（改前） | 后台窗口里 `cabin:playback` 仍以 15Hz 到达 → 每次都触发一次样式刷新 | **已修**（§3.5） |
| 48 | `src/scene/ThemeInteractions.jsx:92-93` | 已经同时监听 `onBackgroundChange` 与 `onOcclusionChange` | 无问题（样板） |
| 49 | `src/turntable/PixelTurntable.jsx:67` | 帧时钟订阅 → 后台自动停 | 无问题 |
| 50 | `src/scene/SceneDeck.jsx:43` | 唱臂 4 帧 270ms 的 `setTimeout` 链不随后台停 | 影响 < 0.3s，未改（§4.6） |
| 51 | `src/pet/useCatPlacement.js` | 猫的位移动画（WAAPI）不随后台停；触发源（ResizeObserver / MutationObserver）在隐藏时不活跃 | 未改（§4.6） |

### 2.7 资源释放

逐个核对卸载路径，**未发现泄漏**：
`RoomCat.jsx:69`（poke 定时器）、`PetLife.jsx:78`（hop/shadow/interval/订阅）、
`useCatPlacement.js:137`（timer/holdTimer/**WAAPI**/3 个 MutationObserver/1 个 ResizeObserver/resize 监听）、
`PetApp.jsx:49,114`（clickTimer / rAF）、`pet-presence.mjs:25`（timer + 两个事件监听）、
`pet-animation.mjs:38`（timer 链）、`zen-console.mjs:36`（observer + 三个监听 + rAF）、
`PixelTurntable.jsx:73`（帧时钟订阅 + IntersectionObserver + 性能监听）、
`motion-preference.mjs:29`（最后一个订阅者离开才解绑 MediaQueryList + MutationObserver）、
`playback-listener.mjs:25`（最后一个监听者离开才摘 window 事件）。

---

## 三、实际改动（文件:行号 + 为什么）

### 3.1 像素语法与降级补齐

| 文件:行号 | 改动 | 为什么 |
| --- | --- | --- |
| `src/pet/pet.css:10` | `animation: pet-pop .18s ease-out` → `steps(3,end)` | `ease-out` 与 `docs/art-direction.md:14`「动效只用 `steps()`」冲突；气泡是像素元素，平滑缓动会让它停在半像素 |
| `src/turntable/record-flight.mjs:14-29` | 新增 `flightFrames()`：8 段整像素抛物线，**关键帧级** `easing: 'steps(1, end)'` | 替换 `cubic-bezier(.3,.7,.2,1)`；位移取整 → 封套不会停在两列像素之间。**复核补正**：WAAPI 里 `steps()` 必须写在关键帧上；effect 级若也用 `steps(1,end)` 会把整段进度压成 0，8 段弧线一步都走不到（实测只有 2 个姿态）。effect 级必须是 `'linear'`，关键帧级 `steps(1,end)` 保留——与本仓库 `useCatPlacement.js` 的写法一致 |
| `src/turntable/record-flight.mjs:47,51-63` | 唱片旋转 / 封套淡出全部改 `steps(1, end)`（**关键帧级**） | 唱片要「转格」而不是「转圈」。**复核补正**：这四处的 effect 级缓动同时从 `steps(1,end)` 改为 `'linear'`——否则同 `flightFrames()` 一样整段不发生 |
| `src/turntable/record-flight.mjs:36` | 起始 `left/top` 取整 | 落点对齐整像素 |
| `src/turntable/record-flight.mjs:59` | 封套退场 `translateX(-30%)` → `translateX(-<size*0.3>px)` | 百分比在小封套上不足 1px，等于没动；改成整像素 |
| `src/pet/useCatPlacement.js:27,31-32` | 位移全部 `Math.round` | 猫是像素画，小数位移会重采样 |
| `src/pet/useCatPlacement.js:137` | 清理里加 `moveRef.current?.cancel()` | 卸载后 WAAPI 仍在改一个已脱离文档的元素 |
| `src/pet/pet-life.css:23,27` | hover 抬升 `-3%` → `calc(-100% / 32)`（1 美术像素）；poke 抬升 `-6%` → `calc(-100% / 16)`（2 美术像素） | 1 美术像素 = 元素高度的 1/32（精灵 32×32 美术像素） |
| `src/pet/PetLife.jsx:24,31-34` | 跳高改用整数 `--pet-hop`（0..3 美术像素）与 `--pet-hop-down` | 能量是 0..1 连续量，乘百分比必然出小数；美术像素网格要求整数 |
| `src/pet/pet-motion.mjs`（改前 13 行） | 降级来源收敛到 `motion-preference.mjs` | JS 与 CSS 必须读同一组来源，否则桌面开关只停 CSS、不停 JS |
| `src/scene/SceneDeck.jsx:23,32` | `useReducedMotion()` + 降级下 `setArm(target)` 直接落位 | 唱臂的摆动是 `setTimeout`，CSS kill switch 覆盖不到；降级后唱臂**直接在该在的那一帧**（3=落针 / 0=回架），姿态信息不丢 |

### 3.2 后台停止 + 状态机修正

| 文件:行号 | 改动 | 为什么 |
| --- | --- | --- |
| `src/frame-clock.mjs:85-91` | `onBackgroundChange` 在没有 `window` 时直接 `cb(false)` 返回空退订 | 之前会调 `frameClock()` → `win.addEventListener` → 在 Node 里抛错；新单元测试要在 Node 里 import 这个模块 |
| `src/frame-clock.mjs:93` | 新增 `inBackground()` | 读已存在的时钟状态，**不创建**时钟 → 渲染期调用没有副作用 |
| `src/pet/pet-motion.mjs:16-17` | `petMotionState` 增加 `background`，`visible: !hidden && !background && (desktop \|\| focused)` | Electron 最小化时 `document.hidden` 仍为 false，光看它挡不住精灵循环 |
| `src/pet/pet-motion.mjs:32-37, 38-60` | `readPetMotion` / `subscribePetMotion` 接入共享时钟的后台状态 | 见上；桌面宠物 / 壁纸窗口在 `backgroundState` 里被豁免，仍然常驻桌面 ✓ |
| `src/pet/pet-motion.mjs:20-31` | 跳高阶梯 `hopArtPixels` / `hopDownArtPixels` / `HOP_ART_PIXELS` 搬进本模块 | 让「跳高永远落在美术像素网格上」这条断言可被单测覆盖（`pet-sprites.test.mjs:99-124`） |
| `src/pet/PetLife.jsx:5,7,36-46` | 从 `pet-motion.mjs` 引入并再导出阶梯函数 | 保持 `PetLife` 的对外导出不变 |
| `src/pet/PetLife.jsx:49` | `level.current` 初值 `0` → `null` | 初值 `0` 会让首个回调（未播放 → 0）提前 return，`--pet-energy` 永远停在 CSS 默认值 |
| `src/pet/PetLife.jsx:61-79` | groove 的 hop/shadow 动画跟随 `onBackgroundChange` 停止与重建 | WAAPI 不受 `animation-play-state` 影响；最小化后猫不该继续按拍子跳 |
| `src/pet/RoomCat.jsx:21-33` | `useClock` 改用 `onBackgroundChange` 停表（**只在真正进后台时停**） | 失焦但可见时停表 → 喂食中的猫卡在 `eat` 姿态（`RoomCat.jsx:62` 的 `elapsed` 冻结） |
| `src/pet/RoomCat.jsx:38` | `useClock(500, motion.visible)` → `useClock(500, !hidden)` | 同上：失焦时心跳要继续走，后台才停 |

### 3.3 React 重渲染削减

| 文件:行号 | 改动 | 为什么 |
| --- | --- | --- |
| `src/scene/SceneDeck.jsx:12-22` | `Rects` 改 `memo`；新增 `DeckSheen`（无 props）、`DeckArm`（只吃 `arm`） | 唱臂每 90ms 一步、360ms 四步；改前每一步都重渲染整棵 portal（唱片 rect 组 + 8 帧高光 strip）。`DECK_SHADOW` / `DECK_BODY` / `SHEEN_FRAMES` 是模块级常量，唱片是 `useMemo` → props 引用稳定，`memo` 能真正拦住重绘 |
| `src/scene/SceneDeck.jsx:72-73` | 用 `DeckSheen` / `DeckArm` 替换内联写法 | 同上 |
| `src/pet/PetApp.jsx:26-44` | 面板专注倒计时抽成 `FocusCountdown` 组件，自带 1Hz 定时器 | 原来整窗每秒重渲染一次，只为让一个字符串里的秒数走一格 |
| `src/pet/PetApp.jsx:55,171,174` | 删掉 `panelNow` state 与它的 `setInterval`，改用 `FocusCountdown` | 同上 |

### 3.4 降级路径补上静态等价物

| 文件:行号 | 改动 | 为什么 |
| --- | --- | --- |
| `src/turntable/record-flight.mjs:33` | **未改**（复核更正）。降级时 `flyRecord` 仍直接返回，飞行整段不发生 | 飞行是**纯装饰**：`RoomScene.jsx:22` 的 `load?.(item)` 与飞行无关，唱盘上的唱片由 `deck-record-seat` 负责呈现，降级时信息没有丢。**原文写的「已改成只做落位不做飞」是错的，此处更正。** |

### 3.5 后台不再刷样式

| 文件:行号 | 改动 | 为什么 |
| --- | --- | --- |
| `src/scene/playback-listener.mjs:3,41` | `bindEnergyVar` 在 `inBackground()` 时直接返回 | `cabin:playback` 在最小化后仍以 15Hz 到达，每次都会触发一次样式刷新；后台没人看唱盘的发光 |

---

## 四、看过但没改（附理由）

### 4.1 `src/turntable/ListeningCorner.jsx:37` 的 1Hz 整角重渲染
唱针每秒走一格（`position` → `sideProgress` → 针角），所以整角必须重绘。要把秒数隔离出去，得把唱针也拆成独立组件；这会让 crate / 唱片 / 面板的 props 链路变长，收益只是每秒省一次 React diff。**代价大于收益，不改。**

### 4.2 `src/pet/RoomCat.jsx:38` 的 2Hz 姿态心跳
`RoomCat` 是叶子组件（canvas + 气泡），2Hz 的重渲染不触发布局（`useCatPlacement` 的 layout effect 依赖 `[enabled, pose, bubble, x]`，`x` 只在 8 秒的散步里变）。要再降只能把「时间 → 姿态」的推导搬进 `setState` 回调里比较签名，**改动姿态机的风险大于收益**，不改。

### 4.3 `src/turntable/turntable-physics.mjs:39` 的 `easeInOutCubic`
这是**物理仿真**而不是 UI 动画（"A real deck does not start or stop instantly"），`turntable.test.mjs:69` 断言了「eases over ~0.6 s」。改成 steps 会同时改物理观感和断言，而契约明令不许放宽断言。**不改。**

### 4.4 `src/scene/ambient-life.css:10,12` 尘埃漂移的亚像素步长 ★ 交给人决定
`translate: 1.2vw -3vh` + `steps(28, end)`：步长 = 1.2vw/28，1440px 宽时 0.62px/步，**不是整像素**。
两条路都有代价，本专项不擅自选：

| 方案 | 做法 | 代价 |
| --- | --- | --- |
| A（现状） | 保持视口相对的距离 | 每步亚像素；尘埃是 1–3px 的柔光点，视觉上几乎看不出，但严格说不在网格上 |
| B | 改成固定的整像素行程（步数整除行程，例如 28 步 × 1px） | 行程不再随窗口缩放；小窗口下尘埃的相对位移会变大 |

判断依据：尘埃不是精灵图（是纯色 div），1–3px 的柔光点在半像素位置与整像素位置的差别低于一个像素；而且 `.ambient-life` 位于**未被 transform 缩放**的场景画布里（`src/cabin-room.css:33-36` 用 `width: 1448px * var(--scene-k)` 改尺寸而不是 `transform: scale`），所以「网格」在这里本身就不是 4 CSS px。
**请美术 / 集成环节拍板。**

### 4.5 `src/scene/room-console.css:13-14` 按钮按下的 1px 位移
`translate: 0 -1px` / `1px 1px` 不在 4px 网格上，但这是**按钮按压反馈**（不是环境动效），1px 是这类反馈的常规量。`docs/art-direction.md` 的 Motion 条只约束「缓动用 steps()、只动 translate/scale/opacity」——这两条都满足。**不改。**

### 4.6 后台残留的短动画
`src/scene/SceneDeck.jsx:43`（唱臂 ≤270ms 的定时器链）与 `src/pet/useCatPlacement.js`（猫的位移 WAAPI）不随后台停止。两者都在 1 秒内结束，窗口最小化的那一刻最多多跑一秒，**不值得为它们再加一套后台分支**。

---

## 五、帧预算与降级的影响说明

* **帧预算没有被改动。** 本专项没有新增任何常驻循环：
  * `PixelTurntable` 仍按 `min(frameBudget(level).deck, labelFps|30)` 订阅共享帧时钟，静止时退订（`PixelTurntable.jsx:62-67`）。
  * 猫的精灵图仍用自建的「帧边界唤醒」定时器（`pet-animation.mjs`），1–6 fps。
  * `SceneDeck` 的唱臂仍是 4 帧 / 90ms 一步，**没有变快也没有变慢**；改的是「每一步重绘多少东西」。
  * 天气那档（12/8、2/1、0 fps）在 `src/sky-weather.mjs`，不在归属内，未动。
* **`--deck-energy` / `--corner-energy` / `--pet-energy` 仍然是「只写 CSS 变量、量化到 1/8、变了才写」**，没有引入 React state。新增的后台守卫只是让后台窗口**不写**这些变量（前台行为一字未改）。
* **降级后的静态等价物清单**（每一项都保留同样的信息）：

| 动效 | 降级后 |
| --- | --- |
| 猫随音乐跳拍 | 不启动 WAAPI → 猫保持 groove 静帧；降级下 `--pet-energy` 不再影响任何东西 |
| 唱针摆动 | 唱臂直接落在目标帧（落针 / 回架），姿态不丢 |
| 唱片飞上唱盘 | 唱片直接出现在唱盘上（`deck-record-seat` 在 kill switch 下回到静态样式） |
| 猫的 hover / poke | 抬升与挤压取消；poke 的信息由**气泡台词**承担（`RoomCat.jsx:53` 的 `pokeLine`） |
| Zzz / 专注点 | `pet-life.css:56-58` 保留 `opacity: 1`，仍然看得见 |
| 尘埃 / 光柱 | `ambient-life.css:26-27` 保留 `.3` 与 `--shaft`，仍然看得见 |
| 唱机特写里的雨 | 雨点贴图静止留在窗上，**仍然看得出在下雨** |
| 猫的落地 / 气泡弹出 | `pet.css:16,21` 的 `data-reduce-motion` 分支取消动画与位移 |

---

## 六、跑过的命令与结果

```bash
cd /workspace/Flow-Cabin && export HOME=/workspace/.home
npm test          # 根项目：541 tests / 540 pass / 0 fail / 1 skipped
                  # 桌面端（npm run desktop:test）：354 tests / 354 pass / 0 fail / 0 skipped
npm run build     # ✓ built（5 个入口：index / promo / wallpaper / pet / mini）
```

* `npm test` = `npm run desktop:test && node --test <显式列出的测试文件>`，**两步都实际跑过，全绿**。
  桌面端 354 例是 Electron 主进程的单测；根项目 541 例里本专项新增 5 条断言在
  `src/pet/pet-sprites.test.mjs`（数量比中途记的 518 多，是因为并行专项也各自登记了新测试文件）。
  本专项**没有修改** `motion-preference.test.mjs` / `frame-clock.test.mjs` / `perf-profile.test.mjs`，
  也没有放宽其中任何一条断言。
* 期间观察到 `src/backup-model.test.mjs` 与 `src/focus/session-log.test.mjs` 偶发失败：
  这两个文件属于 **model-auditor** 的归属（`src/backup-model.mjs`、`src/focus/session-log.mjs`），
  当时正被另一个 BOT 编辑导致语法中间态；重跑即绿。与本专项无关。
* **Playwright 浏览器验收未执行**（需要 Chromium，本沙箱未安装）——`npm run test:browser` / `test:promo`
  等脚本没有跑。因此「WAAPI 关键帧里的 `var()` 会不会随自定义属性变化实时重算」这一条**没有在真机验证**
  （见 §七）。

---

## 七、未验证的部分与遗留风险

1. **WAAPI 关键帧里的 `var()`。** `src/pet/PetLife.jsx:31-32` 的 `scale` 与 `translate` 用了
   `var(--pet-energy)` / `var(--pet-hop)`。基线本来就这么写（`translate: '0 calc(-2% - var(--pet-energy) * 5%)'`），
   所以这不是新依赖；但**「自定义属性变化时 WAAPI 关键帧会重新求值」这一点没有在 Electron 里实测**。
   若不成立，猫的跳高会停在动画创建那一刻的高度（不是不跳）。**待人工在真机确认。**
2. **`scale` 里的 `calc()`**：`calc(1 + var(--pet-energy, .5) * .05) calc(1 - …)` 是标准 CSS 值，
   但没有浏览器验收。若解析失败，WAAPI 会丢掉该关键帧的 `scale`（**跳高仍在**，只是不挤压）——
   降级路径可接受，不是灾难。
3. **Electron 最小化的实际行为**：§3.2 假定「最小化时 `document.hidden` 仍为 false，由 Electron 转发的
   不可信 `blur` 事件置位 minimized」（`src/frame-clock.mjs:76-80` 的 `nextMinimized` 就是为此写的）。
   这条假设来自仓库既有实现，未在 Electron 里实测。
4. **桌面宠物 / 壁纸窗口的豁免**：`backgroundState` 的 `desktop` 标志让它们在最小化时不停。
   改动 `pet-motion.mjs` 后，这两个窗口的 `visible` 多了一个 `background` 条件；
   由于 `backgroundState` 对 `desktop` 窗口只在 `doc.hidden` 时才为真，**行为不变**，
   但同样没有 Electron 实测。
5. **`src/pet/PetApp.jsx` 的 `FocusCountdown`**：把 1Hz 时钟从窗口级挪到组件级，
   行为等价（同一秒刷新一次），但**没有 UI 回归测试**覆盖（Playwright 不可用）。
6. **`src/scene/SceneDeck.jsx` 的 `memo`**：`DeckSheen` 无 props，靠 `key={sheen-${item.id}}` 在换唱片时
   重挂载。若将来有人给 `DeckSheen` 加了会变的 props，需要一并检查。

---

## 八、越界发现（不在本专项归属，只记录不动手）

1. **`src/styles/tokens.css:29-31`** —— `data-app-background` 只做 `animation-play-state: paused`，
   **管不到 WAAPI（`element.animate()`）**。所有 JS 驱动的动效都必须自己判断
   `reducedMotion()` / `onBackgroundChange()`。本专项已在 `src/pet/**`、`src/scene/**` 内自查，
   但 `src/focus/FocusFace.jsx`、`src/CabinAtmosphere.jsx` 等处属于他人归属，建议集成时统一复查一遍。
2. **`docs/art-direction.md:38`** —— 写的是「music bop scaled by `--pet-energy`」。
   实现现在是：`--pet-energy`（量化到 1/8）决定**挤压幅度**，`--pet-hop`（同一能量映射到整数美术像素）
   决定**跳高**。文档那句话仍然成立，但少了「跳高走 `--pet-hop`」这一半 —— 属文档属主（repo-auditor）的事。
3. **`src/CabinRoom.jsx:102`** —— `onCabinPlayback(apply)` + `setInterval(apply, 1000)`：
   播放能量在根组件里每秒重渲染一次，且**没有后台守卫**。`src/CabinRoom.jsx` 不在本专项归属内。
4. **`package.json`** —— `scripts.test` 是**逐个文件列举**的，新测试文件必须登记进去才会被 `npm test` 跑到。
   本专项因此把新断言放进了已在名单里的 `src/pet/pet-sprites.test.mjs`，
   而没有新建 `src/pet/pet-motion.test.mjs`。**`package.json` 不在任何 BOT 的归属行里**，
   请集成环节决定是否把它拆成目录 glob。
5. **`src/pet/pet.css:22-24`** —— `.pet-stage.is-drop-target …` 这条规则落在
   `@layer features { … }` 块**之外**（未分层）。`src/css-lint.test.mjs` 目前没抓到这一条，
   但契约第 1 条要求「所有规则都在 `@layer` 块内」。属 `src/pet/**`（本可以改），
   但这是**视觉层**的既有写法且当前 lint 通过，**本专项没动**，留给视觉环节确认。
6. **`src/turntable/turntable-physics.mjs:39`** —— `easeInOutCubic` 是唯一的平滑曲线（唱臂摆动）。
   本专项判定它是物理仿真、且有测试断言，**不改**；若要统一到像素语法，
   需要同时改 `turntable.test.mjs:69` 的断言（契约禁止放宽断言），请集成环节裁决。
