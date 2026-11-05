# 心流小屋 3.1 · 桌面实物设计规范

> 这一版的方向来自 [DEsk](https://github.com/fyzugx/DEsk)（MIT，© 2026 The DEsk authors）：**桌子是一个地方，不是一层皮**。屏幕上看不到网页式按钮，每个入口都是房间里的一件东西——有材质、有光、有声音。许可文本在 `public/licenses/DEsk-MIT.txt`，移植的文件头部都写了出处。

## 规则

1. **不加按钮，问「桌上的这件东西会怎么做」。** 入口是铜牌、纸、LED、信、书。每件实物仍是真实的 `<button>`、`role=slider`、`role=switch`，名称不变；键盘、读屏、手机触控一样可用。
2. **一盏灯。** 所有东西的阴影都背着同一个灯位。
   - 全局变量：`--sx` / `--sy`（高 1px 的东西在窗口中心的投影，元素乘以自己的高度），`--lamp-k`（0–1，夜里强、白天弱、调暗时更弱）。由 `src/props/lamp.mjs` 的 `installLamp()` 写到 `<html>`。
   - 写法：`box-shadow: calc(var(--sx,2) * 12px) calc(var(--sy,3) * 12px) 24px rgba(15,10,8,calc(.34 * var(--lamp-k,.6)))`。
3. **动作有物理。** 弹簧而不是三次曲线：`src/props/motion.mjs` 的 `drawerEase`（ζ .80，ωn 12，拉出来的东西）和 `lookEase`（ζ .74，ωn 8.5，镜头）；CSS 里用 `var(--ease-drawer)` / `var(--ease-look)`（`linear()` 采样）。时长乘 `var(--pace)`（利落 .76 / 正常 1 / 从容 1.45）。减少动态时一律直接切换（`guards` 层已经关掉过渡）。
4. **声音是合成的。** `src/props/sfx.mjs` 的 `playSfx(name, { pan, rate, when })`，43 种实物声（纸、抽屉、活页夹、旋钮、拨杆、按键、信件、铅笔……）。第一次用户操作之前不会创建 AudioContext；设置里可关、可调音量。
5. **材质**
   - **纸**：`.paper` 作用域把 `--ui-*` 和旧的 `--px-*` 调色板整个换成纸墨色（纸 `#efe6d3`、墨 `#2e2318`、铜 `#7d5019`、红 `#a3301d`），里面所有按钮、输入框、分段控件自动变成纸上的样子。所有 `Dialog`（非 `is-full`）默认就是纸：折角、双线标题、灯向阴影。
   - **黄铜**：`BrassPlate`（`src/props/BrassPlate.jsx`）或给按钮加 `brass-plate` 类。深色刻字，两颗螺丝。
   - **LED**：`src/props/Led.jsx` 的 `LedGlass` / `LedDigits` / `LedLetters` / `LedDots` / `LedBlocks`；亮段 `#ff3b2f`，未亮的段淡淡留着。
   - **木**：顶部后沿的胡桃木（`home/desk.css` 的 `--wood-grain`）。
   - **便签**：六色 `#FCE066 #FAADBD #9ED1F5 #BAE394 #FCBD73 #CCB8F0`，手写字体（楷体）。
6. **字体按角色。** 印刷（纸上标题）= 系统宋体 `--ui-font-display`；刻字（铜牌、表盘）= `--ui-font`；手写（便签、随手记）= 楷体 `'Kaiti SC','STKaiti','KaiTi','LXGW WenKai'`；LED 是 SVG。像素字体只留给伙伴和像素画。
7. **纸上的字要读得清。** 墨、铜、红在每一种纸面上都要达到 AA（`src/props/props-model.test.mjs` 检查）。别在纸里写死浅色。
8. **画质档位是同一份代码少做事。** `html[data-perf='low']` 去掉滤镜和阴影模糊；`prefers-reduced-transparency` 不用透明。

## 怎么做一件新实物

- 样式表放在自己的目录里（`src/shelf/`、`src/console/`……），第一行必须是 `@layer guards, reset, features, skin, overrides;`，规则都放进 `@layer overrides { … }`。圆角用 `var(--ui-radius*)` 或 `0`/`50%`，磨砂用 `blur(var(--ui-blur))`（`home/` 目录下的样式表不受圆角限制，但仍要用令牌）。
- 想让纸上的东西不像网页：去掉 `border-radius: pill`，用 1px 墨线、卡片按钮（`.pixel-button`）、下划线输入框；不要深色底的卡片，除非它本来就是一台机器（黑色 LED 窗、控制台面板）。
- 全屏的大实物（索引本、控制台）用 `Dialog variant="full"` 自己画外壳，并提供「放回」：Esc、点空白处、右上角折角，三种方式都要能关。
- 保留测试依赖的角色和名称（见各回归脚本），要改名就同时改测试，并在提交说明里写出来。
- 低配和减少动态必须正常：没有 `filter`、没有过渡也看得懂。

## 灯位、阴影、尺寸

- 尺寸按 pt 想：1440×900 是 1×，大屏看到更多桌面而不是更大的东西。
- 抬得越高阴影越长：纸 12–16、铜牌 3、浮起的便签 8、抽屉 20。

## 已有的实物

| 实物 | 文件 | 说明 |
| --- | --- | --- |
| 纸（对话框） | `src/Dialog.jsx`、`src/props/props.css` | 折角就是关闭按钮 `.cabin-dialog-close`，悬停 0.12 秒后掀起，背面印着「放回」 |
| 提示纸条 | `src/ui/Toasts.jsx`、`props.css` | 纸条带「撤销」，轻微倾斜 |
| 铜牌 | `src/props/BrassPlate.jsx` | `arrow` 指出去哪里 |
| LED 台钟 | `src/home/DeskClock.jsx` | 空闲显示时间，专注时显示倒计时；它就是「专注」入口，保留 `.focus-badge` |
| 后沿（顶栏） | `src/home/desk.css` | 胡桃木、铜牌、台钟、铜钮；安全区下木板延伸到状态栏下 |
| 便签（问候） | `src/home/desk.css` | `.home-room-caption p` |
| 合成声音 | `src/props/sfx*.mjs` | 设置 › 桌面 里可关、可调音量、可选动作快慢 |
| 书柜与索引本（唱片架） | `src/listen/RecordShelf.jsx`、`src/shelf/*` | 活页夹按唱片盒分类，深蓝皮 A–Z 索引本（打字搜索、拇指索引），专辑墙是柜上的画框 |
| 电子管控制台（唱机旁、播放条） | `src/console/*`、`src/listen/NowPlayingBar.jsx` | VU 表、音量旋钮、拨杆、音源旋钮、LED 进度；底部播放条是同一台机器的小号 |
| LED 台钟近景 · 台历手帐 · 推子 · 便签本（专注） | `src/focus/FocusDock.jsx`、`src/focus/desk/*` | 台历可把便签拖到某一天 |
| 抽屉 · 相册 · 工具箱（小屋日常、选择小屋、布置小屋） | `src/home/drawer/*` | 绿呢绒抽屉里摆着实物 |
| 文件夹（设置） · 信（新手引导） | `src/onboarding/SettingsHub.jsx`、`settings-folder.css`、`Letter.jsx` | 标签页、线圈本、六色便签索引 |
| 真皮日记本（唱片日记） · 邮筒（信箱） · 伙伴册 · 卡片盒（词书） | `src/focus/stats/*`、`src/focus/CatPanel.jsx`、`src/study/StudyPanel.jsx` | |
| 灯、弹簧、纸纤维 | `src/props/lamp.mjs`、`motion.mjs`、`paper-noise.mjs` | |

## 原版首页已移除

3.1 起生活小屋（`src/CabinRoom.jsx` → `src/home/CabinHome.jsx`）是唯一的首页：`ClassicCabinRoom`、`InterfaceDialog`、设置里的「经典首页」开关和各平台的「重启换首页」命令都已删除。旧版本保存的首页选择（`flow-cabin-interface-v1`）在启动时被忽略并清除（`src/interface-mode.mjs`）。唱片墙的浏览功能在 **唱片架**（书柜近景）里；旧的房间场景代码（`RoomScene`、`CabinAtmosphere`、`StudyWriting`……）只剩「沉入桌面」的动态壁纸（`wallpaper.html`）在用。

测试对应关系：原版唱片架的分页、拖唱片到唱机、九格月夜书架、顶栏布局等检查随它一起删除；其余检查改用 `scripts/settings-actions.mjs` 与 `desktop/test/ui-fixture.cjs` 里的共用函数（`openLibrary`、`takeBinder`、`playRecord`、`openRecordCard`、`openAddToShelf`、`openConsole`、`chooseSource`）驱动小屋。
