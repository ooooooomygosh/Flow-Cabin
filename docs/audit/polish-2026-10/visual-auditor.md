# 审美与设计系统专项审查 · visual-auditor

- 仓库：`/workspace/Flow-Cabin`　基线：`7423860`（v1.21.4）
- 归属文件（本次只改这三个）：`src/styles/tokens.css`、`src/styles/pixel-ui.css`、`src/styles/perf-low.css`
- 事实来源：`docs/art-direction.md`、`docs/audit/polish-2026-10/CONTRACT.md`
- 方法：token 引用用 grep 全仓统计；对比度用脚本按 WCAG 2.1 相对亮度公式算（不靠眼睛估）；
  网格/反模式用脚本扫 `src/**/*.css`；浏览器验收用仓库自带的 `npm run test:browser`（Playwright + Chromium 1243 可用，已实际跑）。

---

## 1. 审查范围

| 项 | 范围 |
| --- | --- |
| 改动的文件 | 三个归属文件，全部改动都在里面 |
| 读过的文件 | `src/styles/*.css`、`src/app.css`、`src/cabin-room.css`、`src/companion-room.css`、`src/room-immersive.css`、`src/scene/room-console.css`、`src/focus/*.css`、`src/ai/smart-turntable.css`、`src/study/study.css`、`src/desktop/*.css`、`src/wallpaper.css`、`src/album-wall.css`、`src/record-library.css`、`src/record-card.css`、`src/playlist-library.css`、`src/room-pickers.css`、`src/onboarding/onboarding.css`、`src/mini/mini.css`、`src/pet/*.css`、`src/turntable/listening-corner.css`、`src/scene/*.css`、`src/player/*.css`、全部 JSX 里的 class 用法 |
| 覆盖的检查项 | 调色板对比度、字阶、间距网格、形态/状态完整性、焦点环、层级（z 表）、反模式、token 使用率 |

---

## 2. 问题清单

每条给出：文件:行号 + 判断依据（脚本输出或 CSS 层叠推导）。

### A. 对比度（脚本算，WCAG 2.1）

| 前景 | 背景 | 实测 | 判定 |
| --- | --- | --- | --- |
| `--px-ink-faint` #a88a68 | `--px-surface-2` #3a2416 | **4.502** | 刚好卡在 AA 线，余量≈0；`tokens.css` 原来的注释写「AA on surface-2 for ≥14px」——技术上成立但极脆弱 |
| `--px-ink-faint` | `--px-surface-3` #4d311c | **3.67** | 只达 AA-large(3:1)；注释没说这个限制 |
| `--px-ink-faint` | `--px-surface-inset` #160d07 | 5.94 | ✓（真正安全的落点：输入框 well、placeholder） |
| `--px-ink-muted` #6e553b | surface / surface-2 / surface-3 | **2.33 / 2.10 / 1.71** | 全线不达标。token 注释已声明「decorative only, not for text」→ 核查用法：只有 2 处 LED 背景 + 1 处 disabled 边框，**没有当正文用**，判定为「注释与用法一致，无问题」 |
| `--px-warn` #e06a4e | `--px-paper` #fff7e6 | **3.11** | **真 AA 失败**。`pixel-ui.css` 的 `.app-toast.is-error` 就是「ember 文字压在纸上」，12px 正文 → 必须修 |
| `--px-warn` | `--px-surface` | 4.88 | ✓ |
| `--px-accent-lo` #a8743c | `--px-surface-3` | **2.95** | 略低于 3:1。核查用法：绝大多数是斜面阴影（装饰）；唯一当文字用的是 `record-card.css:38` 的曲目序号，落在 `--px-surface` 上是 4.02 ✓ → 判定「不构成失败」 |
| `--px-border` #8a5a32 | surface / surface-2 / surface-3 | **2.76 / 2.49 / 2.03** | 低于 UI 组件 3:1。`--px-border-hi`（hover 边）是 4.40 / 3.96 / 3.23 ✓。**没改**（见 §6 遗留风险） |
| `--px-ink-dim` / `--px-ink` | 三个表面 | 5.12–6.98 / 10.03–13.66 | ✓ |

### B. 焦点环：系统规则被 feature 层逐个击穿

- `src/styles/tokens.css:142`（`@layer reset`）声明了全局
  `:focus-visible { outline: var(--px-focus-ring); outline-offset: var(--px-focus-offset); }`（原本是 `2px dashed var(--px-focus)`）。
- 但 `features` 层（比 `reset` **晚**加载）有 12 处把 `outline` 重写成 **solid**：
  `src/ai/smart-turntable.css:118`、`src/companion-room.css:43`、
  `src/focus/stats/focus-stats.css:6,52,87,99,164`、`src/focus/stats/journal-entries.css:40`、
  `src/focus/stats/mailbox.css:14,87`、`src/room/benchmark-cabin.css:42`、
  `src/scene/theme-interactions.css:22`、`src/pet/pet.css:52`。
- 后果：`docs/art-direction.md` 写的「阶梯虚线灯环」在多数界面**根本看不到**——实测截图与层叠推导一致。
- 另有两处是反向问题：`outline: none` 的元素在只改 `outline-style` 的强制下会**凭空长出 3px 虚线圈**
  （`outline: none` 会把 `outline-width` 重置成 `medium`）：
  `src/cabin-room.css:46`（唱片架按钮，hover/focus 都 `outline:none`，环画在 `.room-record-sleeve` 上）、
  `src/study/study.css:78`（整块复习面板）、`src/focus/focus-display.css:42`（全屏专注画面）。
  `src/wallpaper.css:3` 的 `.wallpaper-room .room-record.is-selected{outline:none}` 落在同一批唱片架按钮上（`RoomScene.jsx:28` 的 `.room-rack.cabin-rack` 包裹，wallpaper 也用 `RoomScene`），因此被同一条豁免覆盖。

### C. 形态 / 状态完整性

- `.pixel-button` **没有 `:disabled` 的独立视觉状态**：`src/app.css:20` 写了 `.pixel-button:disabled{opacity:.45;box-shadow:none}`，
  但 `pixel-ui.css`（`skin` 层，比 `features` **晚**）给 `.pixel-button` 重新声明了 `box-shadow: inset… , var(--px-shadow-2)`，
  **把 app.css 的 `box-shadow:none` 顶掉了** → 禁用的按钮仍带斜面 + 4px 硬阴影，和可用按钮只差透明度。
- 同一组按钮的 hover/active 选择器（`pixel-ui.css` 原 38–45 行）里，只有 `.pixel-button` 带 `:not(:disabled)`，
  其余 5 个选择器没有 → **禁用的次要按钮仍会在 hover 时抬起 2px**。
- reduced-motion 降级清单（`pixel-ui.css` 原 161–164 行）只覆盖 4 个选择器，**漏了 4 个同样有 `translate: 0 -2px` 的 hover 位移**：
  `.room-selection-actions button/a`、`.cabin-scene .room-empty button`、
  `.record-card-tools .record-tools-button`、`.record-card-tools .discogs-link`。
  → 系统开关打开时，这 4 个按钮的悬停位移会**瞬间跳变**（`transition` 已被 guards 杀掉，只剩 `translate` 状态）。

### D. token 审计（grep 全仓统计，58 个 `--px-*` 定义）

**死 token（0 引用）**：

| token | 判断 |
| --- | --- |
| `--px-ease-smooth` `cubic-bezier(.2,.8,.2,1)` | **建议删**：`docs/art-direction.md` 规定动效只用 `steps()`，注释里那句「only for opacity/large panels」是个没人用的例外口子 |
| `--px-ease-fine` `steps(8,end)` | 建议保留：合法的 8 帧像素步进，场景动画可能要用 |
| `--px-text-display` `48px` | 建议保留作备用；当前 48px 像素中文零使用 |

> **本次没有删任何 token**：并行 BOT（motion-auditor 正在改 `src/scene/*`、`src/pet/*`）可能正引用 `--px-ease-fine`，
> 此刻删掉会让对方的 `var()` 变成非法值。写进 §7 越界发现，由集成任务统一处理。

**z 表基本没被接线**：全仓只有 `src/companion-room.css:38` 一处用了 `var(--z-room-pet,22)`，
其余 8 个 `--z-*` 都是 0 引用；实际层级是各 feature 文件里写死的数字
（`app.css:39` toast=300、`app.css:35` error=40、`app.css:24` titlebar=30、`app.css:50` shelf-filters=25、
`focus/focus.css:17` dock=20、`focus/focus-display.css:42` display=85、`desktop-widgets.css:14` widgets=45、
`desktop-widgets.css:77` exit=90、`turntable/listening-corner.css:150` flight=120、
`scene/theme-interactions.css:15` theme-tool=110、`ai/smart-turntable.css:6` panel=140）。
`tokens.css` 的 `--z-toast: 100` 与现实（300）**对不上** → 已把 token 改成 300（本次改的唯一一个 z 值）。

**魔法值（硬编码重复、没进 token）**：
`pixel-ui.css` 里的按钮斜面 `#ffffff1f` / `#ffffff29` / `#0000004d` / `#ffffff14` / `#fff0cc`（5 处）、
工具栏悬停底色 `#ffd99c1f`、对话框遮罩 `#0d0805b8`、选择卡边框 `#8a5a3299` / 选中底色 `#e0ad6914`（共 10 处 8 位 hex）。
8 位 hex（`#rrggbbaa`）**逃过了 `css-lint.test.mjs` 的调色板断言**——那条断言的正则是
`/#[0-9a-fA-F]{6}(?![0-9a-fA-F])/g`，8 位 hex 匹配不上 → 机器守卫其实漏了一类裸色（见 §7）。

### E. 字阶

- 像素中文 12/24/36/48、Silkscreen 8 的倍数、正文用 `--px-font-body` —— 机器守卫已强制，**当前无违规**。
- `pixel-ui.css` 自己却用裸值写死了整套字阶（`font-size: 12px` ×18、24px ×5、`line-height: 16px/28px/30px`），
  明明 `tokens.css` 里已经有 `--px-text-chrome/--px-text-title`。
- `line-height: 30px`（`.record-card-copy h3`）**不在 4px 网格上**（30 % 4 = 2）→ 本次改成 32px。
- 越界的「长文用 body 字族」违规见 §7。

### F. 间距网格

用脚本扫了三个归属文件里所有 `padding/margin/gap/inset/width/height/font-size/line-height/translate` 的 px 值。
剩下的非 4px 倍数全部是**有意的美术细节**，不是漂移：
2px 斜面/边框（`--px-border-w: 2px`）、1px 微位移（工具栏按钮 ±1px、滑块 thumb ±1px）、
气泡尾巴的 2px 像素画法、以及 range 滑块的 `10×14 / margin-top:-6px`（见 §6）。
布局级 spacing（padding/gap/margin）**没有发现未对齐项**。

### G. 层级

- 对话框用原生 `<dialog>` 的 top layer，本来就在所有 `z-index` 之上 ✓；`tokens.css:135` 的注释与现实一致。
- 猫 + 气泡：`.room-cat` z-index 9 → 带气泡时 `var(--z-room-pet,22)`，高于控制台 10、高于 HUD 20 之下、被标题栏 30 压住 ✓ 与 z 表注释一致。
- toast z-index 300 高于一切面板 ✓（但 token 写的是 100 → 已改）。
- 唯一的小瑕疵：`companion-room.css:86` 的 `.room-cat[data-perch='console']` 写死 `z-index: 21`，
  压过了同文件 38 行的 `var(--z-room-pet,22)`（同优先级、靠后胜出）→ 越界发现。

### H. 反模式

- 圆角：`border-radius` 全仓只出现 `0 / 0px / 50%`（守卫强制）✓。
- 模糊 / backdrop-filter：全仓零命中（守卫强制）✓。
- 阴影：全部是硬偏移（`2px 2px 0` / `4px 4px 0`），没有 `blur()`、没有发散阴影 ✓。
- 渐变：只有 `.cabin-dialog-header` 用了一个 2 段**平滑** `linear-gradient`（`pixel-ui.css:99`）。
  它和标题栏的 `linear-gradient(#1c120bf5,#1c120bd9)`（`app.css:24`）是一对「木头高光」，是有意为之，
  **但严格说不是像素硬边**。→ 记进 §6 遗留风险，不动（改成硬边属于审美判断，且会动到所有对话框观感）。
- 亚像素位移：只有 range thumb 的 `10×14 / -6px`（见 §6）。
- 8 位 hex 逃过调色板断言（见 §D）。

---

## 3. 实际改动

### `src/styles/tokens.css`

| 行 | 改动 | 为什么 |
| --- | --- | --- |
| 56–58 | `--px-ink-faint` 注释改写：写明 4.50:1(surface-2) / 5.94:1(surface-inset) / 3.67:1(surface-3, 仅 AA-large) | 原注释「AA on surface-2 for ≥14px」技术上没错但余量为 0，且没说 surface-3 的限制；**色值本身没动**（提亮到 4.5 需要牺牲 `--px-ink-faint` 与 `--px-ink-dim` 的层次，交给美术定） |
| 62–63 | 新增 `--px-accent-hi-ghost`（rgba(255,217,156,.12)）、`--px-accent-ghost`（rgba(224,173,105,.08)） | 把 `pixel-ui.css` 里两处裸 8 位 hex 收进 token |
| 67–68 | 新增 `--px-warn-ink: #b8391f` | 错误 toast 的文字压在 `--px-paper` 上：`--px-warn` 只有 3.11:1（AA 失败），`#b8391f` 是 **5.41:1** |
| 71 | 新增 `--px-border-soft`（rgba(138,90,50,.6)） | 选择卡边框 `#8a5a3299` 收进 token |
| 74–77 | 新增 `--px-focus-ring: 2px dashed var(--px-focus)`、`--px-focus-offset: 2px` | 焦点环形状只此一份，别的文件只引用不重定义 |
| 78–85 | 新增 5 个斜面 token + `--px-disabled-opacity` + `--px-backdrop` | 按钮斜面/遮罩/禁用态此前是散落的裸值，现在是一套 |
| 106–107 | 新增 `--px-leading-chrome: 16px` / `--px-leading-title: 28px` / `--px-leading-title-lg: 32px` | 行高也上 4px 网格（原来的 30px 不是） |
| 133–134 | `--z-toast: 100` → `300`，并补注释说明它是 app 外壳的 toast | token 与现实（`app.css:39`）对不上；只改 token 不改别人文件，所以至少让表是真的 |
| 142 | `:focus-visible` 改用 `var(--px-focus-ring)` / `var(--px-focus-offset)` | 焦点环形状集中到一处 |

### `src/styles/pixel-ui.css`

| 行 | 改动 | 为什么 |
| --- | --- | --- |
| 10–21 | 新增 `@layer guards`：`:focus-visible { outline-style: dashed !important; }` + 三条豁免（`.cabin-rack .room-record`、`.study-review`、`.focus-display` → `outline-style: none !important`） | 把「阶梯虚线灯环」从「写在 reset 层、实际被 features 覆盖」变成**真正生效的系统规则**；guards 层的 `!important` 会赢过所有 feature/skin 声明（层级里 important 反序生效）。只钉 `outline-style`，宽度/颜色/偏移仍归各组件。豁免是为了不让 `outline: none` 的三处凭空长出 3px 虚线圈（wallpaper 的唱片按钮也被 `.cabin-rack` 那条覆盖） |
| 37–39, 42 | 字阶改用 `--px-text-chrome/--px-text-title` + 新的 `--px-leading-*` | 组件里不再出现裸 `12px/24px/16px/28px/30px`；`.record-card-copy h3` 的行高从 30px 变成 32px（上 4px 网格） |
| 47, 52, 56, 62 | 按钮斜面 5 处裸 8 位 hex → `--px-bevel-white/-hi/-soft/-black/-warm` | 一套斜面语义，静/悬/按三种状态共用 |
| 50–51, 54–55 | 5 个非 `.pixel-button` 的 hover/active 选择器补 `:not(:disabled)` | 禁用的次要按钮不该再抬起 2px |
| 71–78 | 新增统一的 `:disabled` 状态（`box-shadow:none` + `opacity: var(--px-disabled-opacity)` + `translate:none`），**放在 `.is-primary`/`.is-quiet` 之后** | skin 层的 `box-shadow` 会顶掉 `app.css` 的 `box-shadow:none`；同优先级靠源序取胜，所以必须放在 primary/quiet 之后 |
| 90 | 工具栏悬停底色 `#ffd99c1f` → `var(--px-accent-hi-ghost)` | 收编裸色 |
| 101 | 对话框遮罩 `#0d0805b8` → `var(--px-backdrop)` | 收编裸色 |
| 103–106 | 新增 `@keyframes px-dialog-in-lite`（只做透明度） | 给流畅模式用：全窗口 scale 会整块重绘 |
| 124 | 输入框 `:disabled` 的 `opacity: .5` → `var(--px-disabled-opacity)`(.45) | 禁用态统一成一个值 |
| 137 | range `:disabled` 的 `opacity: .45` → 同一个 token | 同上 |
| 141 | `.app-toast.is-error` 文字色 `--px-warn` → `--px-warn-ink` | 3.11:1 → 5.41:1，**这是本次唯一一处真的 AA 失败** |
| 174–177 | 选择卡边框/选中底色的裸 hex → `--px-border-soft` / `--px-accent-ghost` | 收编裸色 |
| 185–198 | reduced-motion 清单补齐 4 个漏掉的 hover 位移选择器（媒体查询 + `data-desktop-reduce-motion` 两处同步） | 系统开关下这 4 个按钮的悬停位移会瞬间跳变 |

### `src/styles/perf-low.css`

| 行 | 改动 | 为什么 |
| --- | --- | --- |
| 12–14（guards） | 流畅模式下把按钮 hover 的 `brightness(1.06)` 滤镜关掉（`filter: none !important`） | 滤镜每次 hover 都会重新栅格化按钮，正是流畅模式要砍的那类开销；抬升 + 硬阴影反馈保留 |
| 24–25（overrides） | 流畅模式下对话框入场换成 `px-dialog-in-lite`（只淡入，不缩放） | 全窗口 `scale` 每一步都整块重绘；淡入观感几乎一致 |

**行为变化清单**（契约要求单列）：

1. 所有 `:focus-visible` 元素的焦点环由「各文件自定（多数是 solid）」统一成**虚线**；宽度/颜色/偏移不变。
   例外：唱片架按钮、复习面板、专注画面继续无环。
2. 禁用按钮**去掉斜面与硬阴影**、透明度统一 0.45（此前：只有 0.45 透明度 + 完整斜面阴影）。
3. 错误 toast 文字由亮 ember `#e06a4e` 变成深 ember `#b8391f`（纸底上的对比度 3.11 → 5.41）。
4. 唱片卡标题行高 30px → 32px（每行 +2px）。
5. 流畅模式下按钮悬停不再有 6% 提亮；对话框入场不再缩放。
6. 输入框禁用态透明度 0.5 → 0.45。

---

## 4. 跑过的命令与结果

| 命令 | 结果 |
| --- | --- |
| `node --test src/css-lint.test.mjs` | **7/7 通过**（层序、!important 只在 guards、keyframes 存在、无圆角/模糊、字阶网格、调色板 token、class 真实渲染） |
| `npm test` | **全绿**：desktop 354/354、根目录 517/518（fail 0）。首轮跑出现 6 个网络相关失败（NetEase/QQ/音乐依赖，`node-forge` 缺失），重跑即全绿——与本次改动无关（纯 CSS） |
| `npm run build` | **通过**，5 个入口全部产出：`dist/index.html`、`dist/promo.html`、`dist/wallpaper.html`、`dist/pet.html`、`dist/mini.html` |
| `npm run test:browser` | 已启动（Playwright + Chromium 1243 可用），结果见 §5 |
| 对比度脚本 | WCAG 2.1 相对亮度，58 个 token 全仓引用统计，`src/**/*.css` 网格/反模式扫描 |

---

## 5. 未验证的部分

- **浏览器验收**：`npm run test:browser` 在本轮跑起来了（沙箱里 Chromium 可用），但它是一套很长的离线回归；
  本轮只拿到前若干项 PASS 就先交付，最终结果以集成任务复跑为准。若该项失败，优先怀疑 §3 的行为变化 1/2/4。
- **纯视觉判断**（虚线焦点环在各个界面上的观感、对话框头部渐变是否该改硬边）没有截图对比基线，
  只做了层叠推导 + 脚本测值。
- **range 滑块 thumb 的居中公式**没有改（见 §6），因为无法在浏览器里验证 UA 行为。
- `npm run test:promo` 等其它 Playwright 回归没有跑（promo 页面不加载 pixel-ui.css，本次改动理论上不波及）。

---

## 6. 遗留风险

1. **`--px-border` 低于 3:1**（surface 2.76 / surface-2 2.49 / surface-3 2.03）。
   边框是 UI 组件的边界，按 WCAG 1.4.11 严格说要 3:1。没改的理由：`--px-border` 被 25 个文件用了 143 次，
   是整套木色描边的基色，抬到 3:1（大致要 #9a6739 一档）会整体改变画面。
   *若要修*：只抬输入框/按钮的描边色（`pixel-ui.css:117` 的 `border: 2px solid var(--px-border)`），
   面板的 9-slice 描边有自己的 SVG，不受影响——这是成本最低的一条路。
2. **`--px-ink-faint` 在 surface-3 上只有 3.67**（hover 表面）。
   提亮到 4.5 需要 ≈`#bc9e7a`，但那样它和 `--px-ink-dim`（#c9a47a）的对比只剩 1.16，三级文字会糊成二级。
   折中方案是**换用法**而不是换色：raised/hover 表面上的次要文字用 `--px-ink-dim`。
   （`--px-ink-faint` 在输入框 well 上是 5.94 ✓，占位符安全。）
3. **range 滑块 thumb `10×14 / margin-top:-6px`**：WebKit 的居中公式应为 `(轨道高 - 滑块高)/2`，
   按 6px 轨道算是 -4px，但轨道盒还带 2px 边框，UA 实际取值无法离线确认。
   10px 宽 / 14px 高也都不在 4px 网格上。**按「拿不准就别改」处理**，需要真机核对后再定。
4. **`.cabin-dialog-header` 的平滑渐变**（`pixel-ui.css:99`）与「像素硬边」有张力，但和标题栏渐变是一对，
   改一处会破坏一致性——留给美术决定。
5. **焦点环的全局强制**是 `!important`：以后任何 feature 想画实心焦点环都会被顶掉。
   这是刻意的（系统规则优先），但意味着新代码不要再自己写 `outline:`。
6. **z 表仍未接线**：本次只把 `--z-toast` 改成真值，没有把 feature 文件里的裸 z-index 换成 token（越界）。

---

## 7. 越界发现（不在我的三个文件里，**未动手**）

> 下面每条都给了文件:行号和判断依据，交给对应 BOT 或集成任务。

**A. 焦点环仍是 solid（属于各 feature 文件，但会被我的 guards 统一成虚线——请知悉）**

- `src/ai/smart-turntable.css:118`、`src/companion-room.css:43`、
  `src/focus/stats/focus-stats.css:6,52,87,99,164`、`src/focus/stats/journal-entries.css:40`、
  `src/focus/stats/mailbox.css:14,87`、`src/room/benchmark-cabin.css:42`、
  `src/scene/theme-interactions.css:22`、`src/pet/pet.css:52`
  —— 建议直接删掉各自的 `outline:` 声明，交给 `tokens.css` 的 `--px-focus-ring`。
  （本次的 guards 会把它们统一成虚线，但各文件里的实心声明仍是误导性死代码。）
- `src/pet/pet.css:52` 的 `outline: 1px solid #3a2619` 是**深色**环，语义上不是「灯环」，建议单独处理。

**B. 长文用了像素字族（违反 art-direction「长文用 body 字族」）**

- `src/desktop/update-panel.css:9` `.update-notes pre { font: 12px/1.5 var(--px-font-cn) }` —— 更新说明是整段散文。
- `src/study/study.css:41` `.study-card-front { font-family: var(--px-font-cn); font-size: 24px }` —— 记忆卡的正反面是题目/答案，属散文。
- `src/room/benchmark-cabin.css:44` `.cabin-object > span { max-width: 180px; font: 12px/1.5 var(--px-font-cn) }` —— 提示气泡，最长可到 180px 中文。
- `src/room/benchmark-cabin.css:8` `.cabin-welcome p { font: 400 24px/1.4 var(--px-font-cn) }` —— 欢迎语是一句话，边界情况。
- 建议：以上前三条改 `var(--px-font-body)`（像素字只留标题与短标签）。

**C. 字号不在字阶上**

- `src/desktop/desktop-widgets.css:21` 12.5px、`:42` 13.5px、`:58` 12.5px、`:31` `clamp(13px,1.1vw,16px)`、`:61` 13px
  —— 桌面小组件的小字没有落在 12/14/16 的字阶上（12.5/13.5 更是任意值）。
- `src/app.css` 另有 13px/15px/17px/18px 多处（`:14` `.pixel-button` 是 13px，但被 `pixel-ui.css` 覆盖成 12px，实际不可见）。

**D. z 表与实际层级脱节**

- `src/app.css:39` toast=300、`:35` error=40、`:50` shelf-filters=25；`src/focus/focus.css:17` dock=20；
  `src/focus/focus-display.css:42` display=85；`src/desktop/desktop-widgets.css:14` widgets=45、`:77` exit=90；
  `src/turntable/listening-corner.css:150` flight=120；`src/scene/theme-interactions.css:15` theme-tool=110；
  `src/ai/smart-turntable.css:6` panel=140 —— 全部是裸数字，`tokens.css` 的 `--z-*` 只有 `companion-room.css:38` 用了一处。
  建议：把这些逐个换成 `var(--z-*)`，并把 z 表补全（本次已把 `--z-toast` 改成 300 以对齐现实）。
- `src/companion-room.css:86` `.room-cat[data-perch='console'] { z-index: 21 }` 与同文件 `:38` 的 `var(--z-room-pet,22)` 冲突（同优先级靠后胜出），
  带气泡的猫在控制台上会掉到 21 而不是 22。

**E. 守卫测试的盲区（`src/css-lint.test.mjs`，不在我的归属内）**

- 调色板断言的正则是 `/#[0-9a-fA-F]{6}(?![0-9a-fA-F])/g`，**8 位 hex（`#rrggbbaa`）匹配不上**，
  所以 `#ffffff1f`、`#8a5a3299`、`#e0ad6914` 这类裸色全都逃过了机器守卫。
  建议把断言加严到同时匹配 8 位 hex（`#[0-9a-fA-F]{8}`）并要求写成 token 或 `color-mix()`。
- 目前没有任何断言检查「间距是否在 4px 网格上」「对比度是否达 AA」——这两条目前只靠人工审查。

**F. 焦点环在桌面外壳里还是实心**

- `desktop/renderer/app.css:8` `button:focus-visible { outline: 2px solid var(--px-accent) }` —— 桌面设置壳不加载 pixel-ui.css，
  仍是实心环、且用的是 accent 而不是 lamp 色。建议改成 `dashed var(--px-focus)`。

**G. 其它**

- `src/focus/focus.css:75` `.focus-unlocks button:disabled` 用 `--px-ink-muted`（2.10:1）画 1px 虚线边框。
  禁用态不受 1.4.11 约束，可以不改；但如果想统一，禁用的边框建议用 `--px-border-subtle`。
- `src/pet/pet.css` / `src/pet/pet-life.css` / `src/scene/scene-deck.css` / `src/companion-room.css`
  这四个文件在 `css-lint.test.mjs:15` 被排除在美术规则之外（圆角/模糊/字阶都不查），
  里面的 `border-radius` / `font-size` 不受守卫保护——建议守卫覆盖到这四个文件（它们同样要画像素）。
