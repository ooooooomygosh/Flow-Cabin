# 交互与可访问性专项审查 · interaction-auditor

- 专项：交互与可访问性（键盘可达性 / 焦点管理 / 漫游语义 / 拖拽复位 / 快捷键冲突 / ARIA 语义 / 状态与空态 / 触摸目标）
- 仓库：`/workspace/Flow-Cabin`　基线：`7423860de4657ac1da5dcab8f2e874f40855911e`（v1.21.4）
- 分支：`polish/interaction-auditor`　（不 push）
- 归属文件：`src/ui/**`、`src/shortcuts.mjs`、`src/drag-gesture.mjs`、`src/Dialog.jsx`、`src/RecordCard.jsx`、`src/RecordLibrary.jsx`、`src/PlaylistLibrary.jsx`、`src/AddAlbum.jsx`、`src/AlbumWall.jsx`、`src/room/CabinDetails.jsx` 及同名 `.test.mjs`

---

## 1. 审查范围

**归属文件（逐行读过）**

| 文件 | 这一轮盯的东西 |
| --- | --- |
| `src/ui/focusables.mjs` | 弹层内可聚焦节点的唯一清单（新增） |
| `src/ui/Roving.jsx` | `Tabs` / `Segmented` / `ToggleGrid` 的漫游焦点、方向键、焦点保持 |
| `src/ui/roving-keys.mjs` | 一维 / 二维方向键语义 |
| `src/ui/Confirm.jsx` | 行内二次确认的焦点往返 |
| `src/ui/PixelRecord.jsx`、`src/ui/RecordSleeve.jsx` | 装饰性 canvas 的 `aria-hidden` |
| `src/Dialog.jsx` | 焦点进入 / 归还、Tab 限制、背景 inert |
| `src/shortcuts.mjs` | 快捷键表、mac / windows 双平台、`aria-keyshortcuts` |
| `src/drag-gesture.mjs` | 指针拖拽策略、`pointercancel` 复位、键盘等价 |
| `src/RecordCard.jsx` | 活区播报、保存状态、曲目列表 |
| `src/RecordLibrary.jsx` | 唱片盒管理、删除确认的焦点、禁用控件 |
| `src/PlaylistLibrary.jsx` | 歌单来源 tablist、登录 / 读取按钮、空态与失败态 |
| `src/AddAlbum.jsx` | 四个添加方式的 tabpanel、搜索状态、网页版不可用的控件 |
| `src/AlbumWall.jsx` | 专辑墙画布交互、专辑网格、已选列表、海报预览 |
| `src/room/CabinDetails.jsx` | 房间热点按钮（灯 / 窗 / 壁炉）的开关语义 |

**只读核对（不改，只用来判断）**：`src/player/usePlayer.jsx`、`src/room/useRoomChrome.js`、
`src/room/useShelf.js`、`src/focus/FocusDisplay.jsx`、`src/focus/stats/CabinJournal.jsx`、
`src/desktop/DesktopWidgets.jsx`、`src/useTurntablePosition.jsx`、`src/ai/SmartTurntable.jsx`、
`src/styles/tokens.css`、`src/styles/pixel-ui.css`、`src/app.css`、`src/album-wall.css`、
`src/record-card.css`、`src/record-library.css`、`src/playlist-library.css`。

**设计约束**：`docs/art-direction.md` —— 焦点环必须是阶梯虚线灯环。本轮**没有改任何 CSS**，
所有修复都落在语义、键盘路径和可读文案上；`src/styles/tokens.css:121` 的
`:focus-visible { outline: 2px dashed var(--px-focus) }` 保持原样。

---

## 2. 问题清单

### 2.1 键盘可达性

| # | 位置 | 判断依据 | 状态 |
| --- | --- | --- | --- |
| K1 | `src/AlbumWall.jsx:106` | 专辑墙的画布交互原本是 `div` 挂 `onClick`，键盘完全到不了。已改成 `ToggleGrid`：整块网格一个 Tab 停靠点，方向键在网格里走，Enter / Space 仍然切换。 | 上一轮已修 |
| K2 | `src/AlbumWall.jsx:92,113` | 图标按钮（关闭 / 上下移 / 移除）必须有可读名称，否则读屏只报「按钮」。已补 `aria-label`。 | 上一轮已修 |
| K3 | `src/AddAlbum.jsx:54` | 搜索中按钮只剩一个 `<Loading/>`（`src/pixel-icons.jsx:6` 的图标是 `aria-hidden="true"` 的 svg）→ **按钮在这段时间没有可读名称**。 | **本轮已修** |
| K4 | `src/PlaylistLibrary.jsx:145` | 「读取歌单」在 busy 时同样只剩图标 → 没有可读名称。 | **本轮已修** |
| K5 | `src/PlaylistLibrary.jsx:60` | `<li onDoubleClick>` 是鼠标专属。同一行里有 `aria-label="从第 N 首《…》开始播放"` 的播放按钮（`:61`），键盘路径等价，**故意不加 `tabIndex`**（否则一行会多一个 Tab 停靠点）。 | 看过没问题 |
| K6 | `src/AlbumWall.jsx:124` | 「打开工程」的 `<input type="file">` 被 `src/album-wall.css:90` 压成 `position:absolute;inset:0;opacity:0`，但**没有** `display:none`，仍在 Tab 顺序里；`src/album-wall.css:89` 的 `.wall-file:focus-within` 会画出虚线焦点环。 | 看过没问题 |
| K7 | 全仓 | 没有正数 `tabIndex`。已在 `src/ui/roving.test.mjs:114` 加守卫测试锁死这一点。 | **本轮已修（加守卫）** |

### 2.2 焦点管理（进入 / 归还 / 限制在弹层内 / 背景 inert）

| # | 位置 | 判断依据 | 状态 |
| --- | --- | --- | --- |
| F1 | `src/Dialog.jsx:21-32` | 原生 `<dialog>` + `showModal()`：背景自动 inert，房间里所有 `document.querySelector('dialog[open]')` 的快捷键守卫都能识别。打开时焦点进入（`initialFocus` → `[data-autofocus]` → 选中的 tab → 标题 → 弹层本体）；关闭时先 `node.close()` 再 `previous.focus()`，顺序不能反，否则触发元素还在 inert 里。 | 上一轮已修 |
| F2 | `src/Dialog.jsx:43-50` | Tab 循环：用 `focusables()` 求首尾，`Shift+Tab` 在首元素回绕到尾、`Tab` 在尾元素回绕到首；焦点落在清单外（弹层本体、标题）时放行给浏览器自己的顺序。 | 上一轮已修 |
| F3 | `src/Dialog.jsx:31` | 触发元素已被卸载（那一行被删掉）时，焦点会掉到 `<body>`、Tab 从页面顶部重来 → 用 `previous.isConnected !== false` 兜住。 | 上一轮已修 |
| F4 | `src/Dialog.jsx:23-25` | `showModal()` 在弹层已经打开时（dev StrictMode 的重挂载）会抛 `InvalidStateError`，整个弹层挂掉。 | **本轮已修** |
| F5 | `src/AlbumWall.jsx:91,106` | 专辑墙是 `variant="full"`，`Dialog` 自己不渲染标题 → `.cabin-dialog-title` 不存在 → 焦点只能落到弹层本体，键盘用户不知道自己在哪。 | **本轮已修**（第一格专辑 `data-autofocus`） |
| F6 | `src/RecordLibrary.jsx:165` | 「删除这个唱片盒」被「确认删除 / 取消」整块替换 → 原按钮卸载，**焦点掉到 `<body>`**，`Tab` 顺序从头开始。 | **本轮已修** |
| F7 | `src/ui/Roving.jsx:58-70` | `ToggleGrid` 的列表被搜索结果缩短时，焦点状态被夹回末位，但**DOM 焦点**仍留在已卸载的节点上 → 同样掉到 `<body>`。 | **本轮已修** |
| F8 | `src/AlbumWall.jsx:111` | 弹层里放了一个 `<main>` 地标 → 页面出现第二个「主要区域」，读屏的地标导航会乱。 | **本轮已修** |
| F9 | `src/styles/tokens.css:121` | 全局焦点环是 `outline: 2px dashed var(--px-focus)`（阶梯虚线灯环），不是浏览器默认光晕；`src/room/benchmark-cabin.css:46`、`src/album-wall.css:89` 等局部覆盖也是虚线。 | 看过没问题 |

### 2.3 漫游与方向键语义

| # | 位置 | 判断依据 | 状态 |
| --- | --- | --- | --- |
| R1 | `src/ui/roving-keys.mjs:6-17` | 线性漫游（tablist / radiogroup）：`ArrowRight/ArrowDown` 向前、`ArrowLeft/ArrowUp` 向后，**横竖没有搞反**；`Home/End` 跳首尾；按 `orientation` 屏蔽交叉轴；`Object.hasOwn` 挡掉 `constructor` 这类继承名。 | 上一轮已修 |
| R2 | `src/ui/roving-keys.mjs:24-39` | 二维网格（专辑墙的专辑库）：`← →` 走同一行、`↑ ↓` 走整列、`Home/End` 跳**本行**首尾、`PageUp/PageDown` 跳首行 / 末行；**行边缘停住而不是回绕**（回绕会把焦点丢到不相邻的专辑上）。末行不满时 `Home/End` 仍落在唯一的那一格。 | 上一轮已修 |
| R3 | `src/ui/Roving.jsx:47-58` | 网格列数不写死：`ToggleGrid` 用 `getComputedStyle().gridTemplateColumns` 量真实列数，`ResizeObserver` 跟随重排。 | 上一轮已修 |
| R4 | `src/room/useShelf.js:34-39` | 唱片架（只读文件）用 `↑ ↓ Home End` 翻行，语义正确，但没有行内 `← →`——`← →` 在房间里是快退 / 快进 5 秒（`src/shortcuts.mjs:12`）。 | 越界发现 |
| R5 | `src/PlaylistLibrary.jsx:237-238` | 歌单来源栏宽窗竖排、窄窗横排：tablist 用 `aria-orientation` 声明方向，两个轴的方向键都可用（`arrows="both"`）。 | 看过没问题 |

### 2.4 拖拽（`pointercancel` 复位 / 触摸 / 键盘等价）

| # | 位置 | 判断依据 | 状态 |
| --- | --- | --- | --- |
| D1 | `src/drag-gesture.mjs:23-27,45-48` | `drop(cancelled)` 统一收尾：`pointercancel` / `lostpointercapture` / `Esc` 走 `onCancel` 把部件放回原位，`pointerup` 走 `onMove + onCommit`；`pending` / `active` 两个 getter 让外部能查状态。 | 上一轮已修 |
| D2 | `src/drag-gesture.mjs:32` | 第二个指针（第二根手指 / 拖拽中又来一次点击）把在飞的拖拽 `drop(true)` 掉，而不是默默吞掉——否则部件停在半路且没有复位。 | 上一轮已修 |
| D3 | `src/drag-gesture.mjs:16-18` | 键盘等价：方向键 16 px、Shift 64 px 微调（`nudgeDelta`），配合 `Home` 复位、`Esc` 取消。 | 上一轮已修 |
| D4 | `src/desktop/DesktopWidgets.jsx:50,65`、`src/desktop/desktop-widgets.css:17` | 触摸拖拽：`pointerdown` + `setPointerCapture` + `onPointerCancel` / `onLostPointerCapture` → `gesture.cancel()`，手柄设了 `touch-action: none`，页面不会跟着手指滚。 | 看过没问题 |
| D5 | `src/useTurntablePosition.jsx:52-78`、`src/room-immersive.css:37` | 唱机拖动同理：`pointerdown` + `setPointerCapture` + `pointercancel` / `lostpointercapture` → 复位，`touch-action: none`，方向键微调 + `Home` 复位 + `Esc` 取消。 | 看过没问题 |
| D6 | `src/turntable/PixelTurntable.jsx:81` | 唱臂拖动只 `setPointerCapture`，没有 `pointercancel` / `lostpointercapture` 复位，也没看到 `touch-action: none`。 | 越界发现 |

### 2.5 快捷键冲突（输入框内不误触 / mac 与 windows）

| # | 位置 | 判断依据 | 状态 |
| --- | --- | --- | --- |
| C1 | `src/shortcuts.mjs:10-30` | 快捷键表是唯一事实来源：设置面板渲染它，按钮从 `ariaKeys()` 取 `aria-keyshortcuts`。`desktop`（Ctrl/⌘+Alt+D）与 `settings`（Ctrl/⌘+,）**同时**列出 `Control+` 和 `Meta+`，mac 与 windows 都覆盖。 | 看过没问题 |
| C2 | `src/player/usePlayer.jsx:60,68` | 全局播放快捷键在 `input,textarea,select,[contenteditable]` 里直接 return；`dialog[open]` 也让位。 | 看过没问题 |
| C3 | `src/room/useRoomChrome.js:41` | Z / H / T / Esc 在输入框、`contenteditable`、或任何 `dialog[open]` 打开时都让位。 | 看过没问题 |
| C4 | `src/focus/FocusDisplay.jsx:78`、`src/focus/stats/CabinJournal.jsx:108` | F 与 L 同样有 `typing(target)` 与 `roomCovered()` 守卫。 | 看过没问题 |
| C5 | `src/shortcuts.mjs:25` | `aria-keyshortcuts` 的修饰键规范推荐顺序是 Control → Alt → Shift → Meta；`Meta+Alt+D` 写成了 `Meta` 在前。规范说顺序不影响语义，但同时给出了推荐顺序。 | **本轮已修**（并在 `src/shortcuts.test.mjs:31` 加断言锁死） |

### 2.6 ARIA 语义正确性

| # | 位置 | 判断依据 | 状态 |
| --- | --- | --- | --- |
| A1 | `src/ui/Roving.jsx:25,32` | `Tabs` = `role="tablist"` + `role="tab"` + `aria-selected` + `aria-controls`；`Segmented` = `role="radiogroup"` + `role="radio"` + `aria-checked`；选中的那一个 `tabIndex=0`，其余 `-1`（漫游焦点只有一个 Tab 停靠点）。 | 上一轮已修 |
| A2 | `src/ui/Roving.jsx:25,32` | `aria-label` 缺失时读屏只报「选项卡」/「单选按钮」——`Tabs` / `Segmented` 都强制传 `label`。 | 上一轮已修 |
| A3 | `src/AlbumWall.jsx:106` | 专辑格是开关按钮：`aria-pressed` + 名字里带「添加 / 取消选择」。 | 看过没问题 |
| A4 | `src/AlbumWall.jsx:111` | 海报预览 `<canvas role="img" aria-label="…">`；`notice` 用常驻 `role="status"`，错误用 `role="alert"`。 | 看过没问题 |
| A5 | `src/AddAlbum.jsx:60-62` | 曲库搜索只用**一个**常驻 `role="status"`：两个 `role="status"` 来回换，读屏播报不可靠。 | 上一轮已修 |
| A6 | `src/AddAlbum.jsx:159` | 但 `AddAlbum` 自己的「已放上唱片架」提示是 `notice && …`——**有提示才渲染**，和同文件里的规矩自相矛盾。 | **本轮已修** |
| A7 | `src/RecordCard.jsx:26,35,41` | 像素封面工具在 `working` / `saving` 时**一点播报都没有**（「用这张」按钮只是被 disable，文字不变）。 | **本轮已修** |
| A8 | `src/RecordCard.jsx:101-102` | `role="status"` 里塞了「重试」按钮：活区内容里混进可交互元素，播报会把它当文本念出来。 | **本轮已修** |
| A9 | `src/AlbumWall.jsx:111` | 预览栏的「正在更新… / 尺寸」不是活区，后台画完海报读屏不知道。 | **本轮已修** |
| A10 | `src/room/CabinDetails.jsx:19,21` | 阅读灯 / 壁炉是**开关按钮**：`aria-label` 给对象名（「阅读灯」/「壁炉声音」），`aria-pressed` 给当前状态（亮着 / 柴火声开着）。这是开关按钮的标准写法，名字不随状态改。 | 看过没问题 |
| A11 | `src/room/CabinDetails.jsx:18,22` | 装饰层（暗光、蒸汽）都带 `aria-hidden="true"`。 | 看过没问题 |
| A12 | `src/PlaylistLibrary.jsx:49` | 歌单卡 `aria-label="打开歌单 X"` + `aria-busy`；封面 `<img alt="">` 纯装饰。 | 看过没问题 |
| A13 | `src/AlbumWall.jsx:111` | 弹层里的 `<main>` → `<section aria-label="海报预览">`，页面不再有两个「主要区域」。 | **本轮已修** |

### 2.7 禁用原因要能被读屏读到

| # | 位置 | 判断依据 | 状态 |
| --- | --- | --- | --- |
| S1 | `src/AddAlbum.jsx:100-108` | 「添加音乐文件夹」在网页版没有桌面壳：改成 `aria-disabled` + `aria-describedby`（指向可见说明）+ 按下时把原因念出来，按钮不再被 Tab 跳过。 | 上一轮已修 |
| S2 | `src/AlbumWall.jsx:100-101` | 「批量添加当前列表」禁用原因**只写在 `title`** 里——`title` 读屏读不到，而且原生 `disabled` 会让按钮被 Tab 跳过，用户根本碰不到这个提示。 | **本轮已修** |
| S3 | `src/AlbumWall.jsx:113` | 「向前 / 向后移动」在首尾被禁用，按钮名字只有「将 X 向前移动」，没说**为什么**不能动。 | **本轮已修** |
| S4 | `src/PlaylistLibrary.jsx:111-113` | 「登录 XX」在网页版 `disabled`，原因写在旁边一个**没有程序关联**的 `<small>` 里；读屏只报「不可用」。 | **本轮已修** |
| S5 | `src/RecordLibrary.jsx:100-101` | 泼溅颜色数量 / 颜色输入在未启用泼溅时被禁用，原因是同一表单里的「启用放射状泼溅」勾选框——同一表单内的依赖关系，可见且可操作。 | 看过没问题 |
| S6 | `src/PlaylistLibrary.jsx:103` | 歌单分页的「上一页 / 下一页」在首末页禁用，页码就在按钮中间（`第 1 / 3 页`）。 | 看过没问题 |
| S7 | `src/AddAlbum.jsx:68,116` | 「放上唱片架」在已在架上 / 放上中时禁用，按钮文字本身就变成「已在架上」「放上中…」。 | 看过没问题 |
| S8 | `src/AlbumWall.jsx:92` | 「下载 PNG」在没有选片时禁用，旁边就是「已选择 · N」计数。 | 看过没问题 |

### 2.8 触摸与最小点击目标（`--px-hit: 24px`）

| # | 位置 | 判断依据 | 状态 |
| --- | --- | --- | --- |
| T1 | `src/album-wall.css:8,85` | 专辑墙的按钮 `.album-wall-overlay button` 有 `min-height: var(--px-hit)`；已选列表里的小按钮 `min-width: var(--px-hit)`，高度由 17 px 图标 + 内边距撑到 25 px。 | 看过没问题 |
| T2 | `src/record-library.css:8,16`、`src/record-card.css:35` | 唱片盒 / 唱片卡里的按钮都有 `min-height: var(--px-hit)`。 | 看过没问题 |
| T3 | `src/playlist-library.css` | 歌单页的按钮（`.playlist-card`、`.playlist-back`、`.playlist-drop`、`.playlist-page-nav button`）没有 `min-height: var(--px-hit)` 的统一约束。 | 越界发现（CSS 归 visual-auditor） |

### 2.9 状态与空态

| # | 位置 | 判断依据 | 状态 |
| --- | --- | --- | --- |
| E1 | `src/AlbumWall.jsx:107` | 空列表有文字说明（`wall-empty`），网格为空时 `ToggleGrid` 渲染 0 个节点（不留一个空的 Tab 停靠点）。 | 看过没问题 |
| E2 | `src/PlaylistLibrary.jsx:259-264` | 加载中（骨架 `aria-busy`）、失败（`role="alert"` + 重试按钮）、空态（「还没有歌单」+ 刷新）三种状态都有文字与可操作按钮。 | 看过没问题 |
| E3 | `src/RecordLibrary.jsx:127-128` | 筛选计数用常驻 `role="status"`；保存失败用 `role="alert"`。 | 看过没问题 |
| E4 | `src/AddAlbum.jsx:111-112` | 本地导入的「正在扫描…」是 `role="status"`，扫描失败是 `role="alert"`。 | 看过没问题 |

---

## 3. 实际改动

| 文件:行号 | 改动 | 为什么 |
| --- | --- | --- |
| `src/Dialog.jsx:23-25` | `showModal()` 改成 `if (!node.open) { if (node.showModal) node.showModal(); else node.setAttribute('open', ''); }` | 弹层已经打开时（dev StrictMode 重挂载）`showModal()` 抛 `InvalidStateError`，整个弹层挂掉；没有 `showModal` 的浏览器上退化成普通 `open` 属性（与 `src/focus/stats/CabinJournal.jsx:114` 一致）。**行为变化：仅在原本会抛错的路径上生效。** |
| `src/AddAlbum.jsx:54` | 搜索按钮加 `aria-label={status === 'searching' ? '正在搜索' : '搜索'}` | 搜索中按钮只剩 `aria-hidden` 的图标 svg，没有名字读屏只报「按钮」。名字跟着状态走，键盘用户才知道它在忙什么。可见文字「搜索」仍包含在名字里（Label in Name）。 |
| `src/AddAlbum.jsx:158-160` | 「已放上唱片架」的提示改成常驻的 `<div role="status">` 包住条件渲染的 `<p className="add-notice">` | 活区整块换进换出时读屏不一定播报（同文件 `:58-60` 的搜索状态就是这么做的）。外层 div 永远在文档里，空的时候不占高度、不留边框，视觉不变。 |
| `src/AlbumWall.jsx:24,100-101` | 「批量添加当前列表」由 `disabled` + `title` 改为 `aria-disabled` + `aria-describedby`（指向同一处的可见说明），点击时空列表直接 return | `title` 读屏读不到，原生 `disabled` 又让按钮被 Tab 跳过，用户根本碰不到这个提示。`aria-disabled` 让按钮留在 Tab 顺序里，理由挂在描述上。 |
| `src/AlbumWall.jsx:106` | 网格第一格加 `data-autofocus={index === 0 ? '' : undefined}` | `variant="full"` 的弹层没有 `.cabin-dialog-title`，`Dialog` 找不到别的落点，焦点只能停在弹层本体。落到第一张专辑上，键盘用户一进来就在做正事。 |
| `src/AlbumWall.jsx:111` | 预览栏的 `<small>` 加 `role="status"`；`<main className="wall-preview">` 改成 `<section className="wall-preview" aria-label="海报预览">` | 后台画完海报（`painting` 变 false、`metrics` 出来）读屏要有话说；弹层里再放一个 `main` 地标，页面会出现第二个「主要区域」，读屏的地标导航会乱。CSS 只按 `.wall-preview` 选，不受影响。 |
| `src/AlbumWall.jsx:113` | 「向前 / 向后移动」的 `aria-label` 在首尾改成「… 已经在最前面，不能再向前移动」 | 禁用原因原来一句都没有。名字里带上原因，读屏在浏览模式读到禁用按钮时就知道为什么。 |
| `src/PlaylistLibrary.jsx:3,104-117` | 登录按钮由 `disabled={!desktop || busy}` 改为 `disabled={busy}` + `aria-disabled` + `aria-describedby`（指向旁边那句 `<small id>`），按下时用 `role="status"` 把原因念一遍 | 原生 `disabled` 会把按钮从 Tab 顺序里删掉，旁边那句说明又没有程序关联，读屏只报「不可用」。改成 `aria-disabled` 后按钮仍可聚焦，理由挂在描述上。 |
| `src/PlaylistLibrary.jsx:145` | 「读取歌单」按钮加 `aria-label={busy ? '正在读取歌单' : '读取歌单'}` | busy 时按钮只剩 `aria-hidden` 的图标 svg，没有可读名称。 |
| `src/RecordCard.jsx:26,35,41` | 像素封面工具的状态文字收进一个**常驻**的 `role="status"`：`working` → 「正在生成像素封面…」，`saving` → 「正在保存…」，错误消息照旧 | 原来 `working` / `saving` 期间**一点播报都没有**（按钮只是被 disable，文字不变）。常驻活区 + 文字变化才是可靠的播报方式。 |
| `src/RecordCard.jsx:101-102` | 笔记的保存状态活区只留文字（`error: '保存失败。'`），「重试保存」按钮移到活区外面 | 活区里混进可交互元素，读屏会把它当文本念；按钮自己出现时也没人知道。现在活区说「保存失败。」，按钮在它旁边，Tab 能到。 |
| `src/RecordLibrary.jsx:138,143-146,157,165` | 删除唱片盒的确认流程补焦点管理：确认时焦点交给「确认删除唱片盒」，取消时还回「删除这个唱片盒」，确认删除成功后焦点落到「新唱片盒名称」输入框 | 「删除这个唱片盒」被整块换掉 → 原按钮卸载 → 焦点掉到 `<body>`，Tab 顺序从头开始。 |
| `src/ui/Roving.jsx:42,58-70,76` | `ToggleGrid` 记住最后获得焦点的格子（`lastFocused`），列表被缩短、那格已经卸载时把焦点放到接替它的那一格 | 搜索把结果缩短时，焦点随节点一起消失 → 掉到 `<body>`。判据是「那个节点已经不在文档里」且「当前焦点在 `<body>` 上」，不会抢走别处的焦点。 |
| `src/shortcuts.mjs:12,25` | `desktop` 的 `keys` 由 `Control+Alt+D Meta+Alt+D` 改成 `Control+Alt+D Alt+Meta+D`；文件头补一句说明 | `aria-keyshortcuts` 会被读屏和自动化按字面比对，规范给出的推荐顺序是 Control → Alt → Shift → Meta。`label`（设置里印出来的「Ctrl/⌘+Alt+D」）不变。 |
| `src/ui/roving.test.mjs:78-119` | 新增两条守卫测试：归属文件里带 `onClick` 的 `<div>` / `<span>` 必须同时有 `role` / `tabIndex` / `onKeyDown`；归属文件里不许出现正数 `tabIndex` | 这两类 bug 单元测试看不见。`npm test` 的测试文件清单不是我们能改的，所以守卫放在 `src/ui/roving.test.mjs`（同一目录、同一个被列入清单的文件）。**只加严，不放宽任何原有断言。** |
| `src/shortcuts.test.mjs:31-42` | 新增断言：每条快捷键的修饰键按 Control → Alt → Shift → Meta 排列，且不出现表里没有的修饰键 | 锁住 C5 的修法，防止以后又写成 `Meta+Alt+D`。**只加严。** |

**没有改的东西**（避免无意义的 diff）：

- `src/styles/**`、`src/app.css`、`src/album-wall.css` 等 CSS 一行没动 —— 焦点环仍是 `tokens.css:121` 的阶梯虚线灯环。
- `src/drag-gesture.mjs` 一行没动 —— 它的 `pointercancel` / `lostpointercapture` / `Esc` 复位、5 px 阈值、一帧一挪、键盘微调都已经是对的，测试也锁住了。
- `src/room/CabinDetails.jsx` 一行没动 —— 阅读灯 / 壁炉的「对象名 + `aria-pressed`」是开关按钮的标准写法，名字不该随状态改；装饰层已经 `aria-hidden`。
- `src/ui/focusables.mjs` 一行没动 —— 上一轮新增的清单已经覆盖 `<summary>`（专辑墙把设置折进 `<details>`）并滤掉不可聚焦 / inert / 不可见的节点。

---

## 4. 跑过的命令与结果

```bash
cd /workspace/Flow-Cabin && export HOME=/workspace/.home
```

| 命令 | 结果 |
| --- | --- |
| `npm test` | **通过**。`npm run desktop:test` 354 / 354 通过；`node --test <清单>` 518 项，517 通过、0 失败、1 跳过（跳过的是 `src/player/playback-log.test.mjs:273` 的「browser: central hook logs native lifecycle and verifies remote playback while minimized」，需要浏览器，与本次改动无关）。 |
| `npm run build` | **通过**（vite 8，5 个入口 index / promo / wallpaper / pet / mini，`✓ built in 9.94s`）。 |
| `node --test src/ui/roving.test.mjs src/shortcuts.test.mjs src/drag-gesture.test.mjs src/css-lint.test.mjs` | 31 / 31 通过（单独跑一遍归属相关的守卫）。 |

> 备注：第一次跑 `npm test` 时有 6 个失败，全部来自 `desktop/test/`（`music-dependencies`、`playlists`×2、`qq-legacy-media`、`qq-playlist-errors`、`qq-search`），报 `Cannot find module 'node-forge'`。那是 `desktop/node_modules/node-forge` 这个指向 `desktop/vendor/node-forge-encrypt-only` 的软链在测试运行途中才出现（另一个 BOT 正在准备 vendor 垫片）；重跑后 `desktop` 354 / 354 全绿。这些文件不在本专项归属范围内，本专项也没有碰 `desktop/`。

---

## 5. 未验证的部分

- **浏览器 / Electron 实机验收未执行**：`npm run test:browser`、`test:shelf-ui`、`test:journal` 等需要 Chromium，本轮没有安装、也没有跑。所有结论来自代码走查 + 单元测试。
- **屏幕阅读器实测未执行**：NVDA / VoiceOver 都没有跑过。ARIA 结论按 WAI-ARIA 1.2 规范与仓库既有写法推断，特别是「常驻活区比挂载式活区可靠」这一条属于规范推荐，没有实测数据。
- **触摸手势的真机验证未执行**：触屏拖动、页面跟随滚动、`pointercancel` 的真实触发序列都只在代码层面核对过。
- **视觉回归未执行**：本轮没有改 CSS，但 `src/AlbumWall.jsx:111` 把 `<main>` 换成 `<section>`、以及 `src/RecordCard.jsx` 常驻的空状态行（`.record-card-saved` 的 `min-height: 16px`）会有极小的排版变化，没有截图比对。

---

## 6. 遗留风险

1. **`role="status"` 对「后插入节点」的播报**在 VoiceOver 上弱于常驻活区。归属范围内本轮改掉了 `src/AddAlbum.jsx` 与 `src/RecordCard.jsx` 的几处；`src/room/CabinDetails.jsx:23` 的房间提示仍然是挂载式的（它的 CSS 带背景和内边距，常驻会露出一个空盒子，而 `src/room/benchmark-cabin.css` 不在本专项归属内）。
2. ~~**焦点归还依赖触发元素还在 DOM 里**（`src/Dialog.jsx:31`）。触发元素被卸载时只能退到 `<body>`。~~ **已修**（复核阶段）：`src/Dialog.jsx` 新增 `returnFocus` 兜底锚点——触发元素已卸载时改聚焦到稳定锚点；`src/AlbumWall.jsx` 传入 `returnFocus='button[aria-label="整理唱片架"]'`。专辑墙的触发按钮在 `src/CabinRoom.jsx:207` 打开弹层时同时卸载了自己，没有这个兜底时用户用键盘走完专辑网格、关闭弹层后焦点会整个丢失、Tab 顺序从头开始。
3. **`aria-disabled` 的按钮需要应用自己决定按下时的行为**。本轮按 `src/AddAlbum.jsx` 上一轮定下的规矩做：保持可聚焦、理由用 `aria-describedby` 说明、按下时把原因念出来。若以后新增同类控件，请照抄这个模式，不要退回原生 `disabled`。
4. **`src/ui/Roving.jsx` 的 `ToggleGrid` 焦点保持**依赖「被卸载的节点 `isConnected` 为 false」这个判据。如果将来用虚拟 DOM 复用节点（key 不变但内容换掉），判据会失效，需要换成别的信号。
5. **正向 `tabIndex` 守卫只覆盖本专项的归属文件**；仓库其它文件（`src/room/`、`src/focus/`、`src/player/` 等）如果出现正数 `tabIndex`，这条测试不会报。

---

## 7. 越界发现（不改动，只记录）

1. **`src/room/useShelf.js:34-39`** —— 唱片架的 `↑ ↓ Home End` 语义正确，但没有行内 `← →` 移动；`← →` 在房间里被播放器占用为快退 / 快进 5 秒（`src/shortcuts.mjs:12` 的 `seek` 是 `deck` 作用域）。两者语义冲突，需要产品层面决定。
2. **`src/turntable/PixelTurntable.jsx:81`** —— 唱臂拖动只做了 `setPointerCapture`，没有 `pointercancel` / `lostpointercapture` 复位，也没看到 `touch-action: none`；触摸时可能页面跟着滚，或拖到一半状态卡住。
3. **`src/ai/SmartTurntable.jsx:13`** —— 自己抄了一份 `FOCUSABLE` 选择器（`'button:not(:disabled), textarea:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])'`），和 `src/ui/focusables.mjs` 的清单**不一致**：少了 `select` / `summary` / `[href]`。它也是手写的 Tab 循环。建议改成 `import { FOCUSABLE, focusables } from '../ui/focusables.mjs'`（该文件在本专项归属内，改造方不在）。
4. **`src/player/usePlayer.jsx:60`、`src/room/useRoomChrome.js:41`、`src/focus/FocusDisplay.jsx:78`** —— 三处各自复制了一份 `typing(target)` 判定（`input,textarea,select,[contenteditable]`），`src/room/useShelf.js:33` 还多算了一个 `dialog`。建议收敛到 `src/shortcuts.mjs` 导出一个共享判定（该文件在本专项归属内，消费方不在）。
5. **`src/focus/stats/CabinJournal.jsx:118`** —— 小屋日记自己用原生 `<dialog>` + `showModal()`，但**没有焦点归还逻辑**（关闭后焦点留在 `<body>`），和 `src/Dialog.jsx:31` 的做法不一致。
6. **`src/onboarding/SettingsHub.jsx:147`** —— 快捷键面板只打印 `label` + `action`，没有说明「在输入框里不生效」「弹层打开时不生效」，用户容易以为快捷键失灵。
7. **`src/playlist-library.css`** —— 歌单页的按钮缺少 `--px-hit` 最小点击目标约束（CSS 归 visual-auditor）。
8. **`src/focus/TaskList.jsx:34`**、`src/player/PlayerControls.jsx:48-49` —— 上一首 / 下一首在不可用时用原生 `disabled` 且没有说明原因（`disabled={!player?.canPrevious}`）。和本轮 S2 / S3 / S4 是同一类问题，但文件不在归属范围内。
9. **`src/CabinRoom.jsx:207`** —— 「整理唱片架」面板里的「专辑墙」按钮：`onClick={() => { setFiltersOpen(false); openWall?.(); }}` 在打开专辑墙弹层的**同时卸载了自己所在的面板**。于是 `src/Dialog.jsx` 记下的触发元素在弹层关闭时已不在 DOM 里，焦点无处可归——这正是本轮复核发现并已修（`returnFocus` 兜底到 `button[aria-label="整理唱片架"]`）的那个缺陷的源头。该行在归属范围外，此处只作记录。

### 复核补修（2026-10-20 集成阶段）

独立复核指出的两处，本轮已修并复验：

1. **弹层关闭后焦点丢失** —— `src/Dialog.jsx` 新增 `returnFocus` 兜底：触发元素已被卸载时，聚焦到传入的稳定锚点而不是落到 `<body>`。`src/AlbumWall.jsx` 传入 `button[aria-label="整理唱片架"]`。
   复现与判断依据：专辑墙由 `src/CabinRoom.jsx:207` 的按钮打开，该按钮在 `setFiltersOpen(false)` 时连同整块「整理唱片架」面板一起卸载，因此 `Dialog` 记下的触发元素在关闭时已不在 DOM 里；用户用键盘走完 `ToggleGrid` 专辑网格后关闭弹层，焦点整个丢失、Tab 顺序从头开始。
2. **文档与代码不一致** —— §6 的「焦点归还依赖触发元素还在 DOM 里」已从「遗留风险」升级为「已修」，§7 补入 `src/CabinRoom.jsx:207` 这条越界记录。

验证：`npm test`（根项目 541 例 0 失败 + 桌面端 354 例 0 失败）、`npm run build`（五入口）通过；焦点归还在真实 Chromium 中复测。
