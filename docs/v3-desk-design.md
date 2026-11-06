# 心流小屋 3.1 · 书桌设计

> 3.1 的界面整个照 [DEsk](https://github.com/fyzugx/DEsk)（MIT，© 2026 The DEsk authors）来做：一张从上往下看的胡桃木书桌，一盏灯，两种视角。画面、材质、转场、声音和文案语气照 DEsk；内容是我们的——唱片、专注、唱片日记、伙伴。拿不准的时候，照 DEsk 的做法，不自己发明。许可文本在 `public/licenses/DEsk-MIT.txt`，移植的文件头部都写了出处。

## 两种视角，没有 3D 布局

- **低头**：俯视的书桌（`src/desk/DeskHome.jsx`）。
- **抬头**：正面看一件东西——书柜（`ShelfView.jsx`）、控制面板（`views/ConsoleView.jsx`）、邮筒（`PostLetters.jsx`）。抬头和低头之间播放 DEsk 渲染好的胶片帧（`film-*.webp`，`layout.mjs` 的 `filmStep`）。

每个视角都是一张 1440×900 的预渲染图，交互件按这张图上的固定坐标放（`src/desk/plates.json`，由 `scripts/desk-plates.py` 从 DEsk 网站的 tryit 素材生成）。窗口变化时只做一次缩放：桌面按宽度缩放（`deskLayout`，`s = clamp(W/1440, .5, 1.5)`），后沿三件东西分别贴左、中、右；抬头的视角按 cover 铺满（`viewLayout`），手机上可以左右平移。不需要遮挡、透视和摆放——这是 3.1 第一版（在等距房间上贴实物）失败的原因，见 [3.1 书桌记录](v3.1-desk.md)。

## 桌面上有什么

| 位置 | 东西 | 做什么 | 键 |
| --- | --- | --- | --- |
| 后沿左 | 控制面板一角 + 铜牌「唱机」 | 抬头看控制面板（播放器） | C |
| 后沿中 | 红色 LED 台钟 + 四个按键 | 时钟 / 日期 / 音乐 / 专注；点钟面开始专注 | — |
| 后沿右 | 红色邮筒「信箱」 | 抬头看信箱；有信时露出信角 | N |
| 右上角 | 铜牌「唱片架」 | 抬头看书柜 | A |
| 桌面左 | 唱片封套（`RecordDesk.jsx`） | 一叠十二张；单击选中，双击 / 回车 / 拖到唱机上播放 | 方向键、PageUp/PageDown |
| 桌面右 | 唱机（`Turntable.jsx`）+ 纸条 | 点唱机播放 / 暂停；纸条上一首、暂停、下一首和进度 | — |
| 前沿 | 抽屉（`desk-model.mjs` 的 `DRAWER`） | 唱片日记、伙伴、随手记、天气、备份、设置；实验室打开后有词书、明信片、场景配方、睡前模式 | D |

手机（宽度 < 700）：台钟在上，唱机 / 信箱 / 唱片架三块铜牌一排（不小于 44 px 高），唱机在中间，封面两列往下滚，抽屉常驻底部。

收起工具（H）时桌上只留唱机、纸条和后沿；封面、抽屉和纸包收起来。

## 规则

1. **一屏一种画风。** 只用 DEsk 的预渲染图和照它的画法画的东西。不要深色胶囊、浮动标签、网页卡片。
2. **不加按钮，问「桌上的这件东西会怎么做」。** 每件东西仍是真实的 `<button>`、`role=slider`、`role=switch`，有读屏名称，可以 Tab 到；键盘、读屏、手机触控一样可用。
3. **一盏灯。** DEsk 的台灯在桌面右下方（tryit 的 lamp：1080, 737），所以高光落在东西的右下边，阴影落向左上。CSS 里阴影写成负的 x、y（例如封套的 `-3px -3px 4px`）；纸面板仍用 `--sx` / `--sy` / `--lamp-k`（`src/props/lamp.mjs`）。
4. **纸上只有纸和墨。** 铜和 LED 只出现在世界里的实物上。纸 `#efe6d3`、墨 `#2e2318`、铜 `#7d5019`、红 `#a3301d`；按钮是下划线文字。设置照 DEsk 的 Shell Settings：标签页、线圈本、六色便签。
5. **新物件照 DEsk 的画法。** 渐变画形状和光，`feTurbulence` 画纹理，`feSpecularLighting` 画边缘高光，内阴影画压进去的东西，投影画放在什么上（DEsk `themes/make-icons.py`）。抽屉里的新物件见 `scripts/desk-drawer-art.py`，唱机是 `src/desk/Turntable.jsx`。
6. **底图上烤进去的字要盖掉。** DEsk 的铜牌、台钟按键、信纸上原本的字已在 `desk-plates.py` 里抹成空白，我们的字叠在上面，刻字照 DEsk 亮暗两遍。
7. **动作有物理。** 弹簧（`src/props/motion.mjs` 的 `drawerEase`、`lookEase`），时长乘 `var(--pace)`；减少动态时直接切换。
8. **声音是合成的。** `src/props/sfx.mjs`，第一次用户操作前不创建 AudioContext，设置里可关。
9. **字不小于 12 px，对比度达到 AA。** `src/css-lint.test.mjs`、`src/props/props-model.test.mjs` 检查。

## 怎么加一件东西

- 先在 DEsk 的图里找有没有现成的；有就从图里裁（`desk-plates.py`），没有再照规则 5 画。
- 坐标写在 `plates.json` / `layout.mjs` 里，不写在 CSS 里；`src/desk/desk.test.mjs` 检查后沿不重叠、手机铜牌不小于 44 px、封套和唱机不出界。
- 样式表第一行 `@layer guards, reset, features, skin, overrides;`；圆角只用令牌；`!important` 只在 `guards`；每个写了样式的类都必须真的渲染出来（`css-lint`）。
- 入口路由统一走 `commands.open(action)`（`src/CabinRoom.jsx` 的 `openTool`），测试共用 `scripts/settings-actions.mjs` 与 `desktop/test/ui-fixture.cjs` 里的 `lookUp`、`openDrawerThing`、`openFocus`、`takeBinder`、`playRecord`、`backToDesk`。

## 文件

| 部分 | 文件 |
| --- | --- |
| 素材生成 | `scripts/desk-plates.py`（DEsk tryit → `public/desk/*`、`plates.json`）、`scripts/desk-drawer-art.py`（抽屉新物件）、`scripts/desk-packet.py`（纸包） |
| 坐标与布局 | `src/desk/plates.json`、`layout.mjs`（`deskLayout`、`viewLayout`、`recordDeskLayout`、`filmStep`、`clockFace`） |
| 书桌 | `DeskHome.jsx`、`ClockFace.jsx`、`RecordDesk.jsx`、`Turntable.jsx`、`desk.css`、`record-desk.css` |
| 抬头 | `ShelfView.jsx`、`views/ConsoleView.jsx`、`PostLetters.jsx`、`usePost.js` |
| 纸 | `src/Dialog.jsx`、`sheet-corner.mjs`、`packets.mjs`、`src/props/props.css` |
| 沉入桌面 | `src/WallpaperRoom.jsx`（同一套 `layout.mjs` 和 `ClockFace`，没有可按的东西） |
