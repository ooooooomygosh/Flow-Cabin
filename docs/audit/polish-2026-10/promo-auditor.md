# promo-auditor · 宣传网页专项审查（2026-10 打磨轮）

- 专项：`promo.html` + `src/promo/promo.css` + `src/promo/promo.js` + `public/promo/**`
- 仓库：`/workspace/Flow-Cabin`　基线提交：`7423860de4657ac1da5dcab8f2e874f40855911e`（v1.21.4）
- 边界：只动上面这四类文件；README / scripts / 其它 src 一律只读，越界问题写在第 7 节。
- 结论：**已修 11 个真问题**（含 2 个 P0），浏览器回归 18/18 通过，`npm test` 与 `npm run build` 全绿。

---

## 1. 审查范围

| 文件 | 行数 / 体积 | 看了什么 |
| --- | --- | --- |
| `promo.html` | 590 行 / 40KB | 首屏 hero、六个章节骨架、OG/Twitter/JSON-LD、下载 CTA 与页脚 |
| `src/promo/promo.css` | 3767 行 / 69.1KB | 断点体系（1120 / 900 / 620）、层叠与 @layer、动效与 reduced-motion 降级、字体加载、像素网格 |
| `src/promo/promo.js` | 926 行 / 35KB | 房间 / 昼夜 / 天气 / 猫 / 唱机 / 番茄钟 / AI 歌单 / 来信 / 手记 的全部状态与事件 |
| `public/promo/**` | 17 个文件 | 图标、社交卡片、房间图、专辑封面、产品截图的格式与尺寸 |
| 参考 | — | `docs/audit/polish-2026-10/CONTRACT.md`、`docs/art-direction.md`、`README.md`、`scripts/promo-smoke.mjs`、`src/css-lint.test.mjs` |

审查方法：静态阅读 + Playwright 实跑（1920 / 1440 / 1024 / 768 / 414 / 375 六档截图、元素盒重叠检测、
资源字节统计、键盘遍历、reduced-motion 模拟、逐条复刻 `scripts/promo-smoke.mjs` 的 18 项交互断言）。

---

## 2. 问题清单（文件:行号 + 判断依据）

### 2.1 真问题（已修）

| # | 位置 | 问题 | 判断依据 |
| --- | --- | --- | --- |
| **P0-1** | `public/promo/icon-32.png`（上一轮新增） | **PNG 文件本身损坏**：三个 chunk 的 CRC 全部校验失败，浏览器把**页头与页脚的品牌图标渲染成裂图占位** | PIL 直接报 `cannot identify image file`；逐 chunk CRC 比对 `IHDR / IDAT / IEND` 全部 `CRC-BAD`；六档截图页头左上角与页脚都是浏览器默认的裂图图标 |
| **P0-2** | `src/promo/promo.css:41-67`（改前） | **首屏要下 16.4MB 字体**：正文用 HarmonyOS Sans SC 原版 TTF，Regular 8.26MB + Bold 8.16MB | 实测首屏传输 **17,983,932 B**，其中 16,420,124 B 是这两个 TTF（占 91%）；`public/fonts/pixel/README.md` 与 `src/styles/tokens.css:39` 写明捆绑的是「未经修改的原文件」，`public/fonts/LICENSE.txt` 第 2 条禁止修改，因此不能子集化，只能换字体来源 |
| **P1-3** | `src/promo/promo.css`（改前 `.hero-copy{width:min(700px,53vw)}` + `.hero h1{font:900 clamp(48px,6.1vw,94px)}`） | **宽屏标题折成三行**：1920px 下「留在一间小屋里。」放不下 700px 文案栏，最后一行只剩「里。」 | 1920 截图标题断成「把一天，/ 留在一间小屋 / 里。」；算式 8 字 × 94px × (1−0.055 letter-spacing) ≈ 710px > 700px |
| **P1-4** | `promo.html:71 / 94 / 551 / 556` + `:40` | **版本号四处硬编码**：`v1.21.4` 出现在三个可见标签 + JSON-LD；而 `src/promo/promo.js:4` 的注释却写着「静态版本号只写在 promo.html 一处」 | 逐行比对；`applyLatestVersion()` 只有拿到 GitHub 响应后才会纠正，离线时四处各说各话，改版本漏一处就前后不一致 |
| **P1-5** | `src/promo/promo.css`（改前 `.hero-cat{bottom:328px;transform:scale(.88)}`） | **窄屏奶糖压住事实行**：375 / 360 下 `.hero-cat` 与 `.hero-facts` 盒重叠；`scale(.88)` 还会把气泡里的 12px 字缩到 10.6px | 浏览器实测：375×667 `cat∩facts = true`（cat 379..492 / facts 423..444），360×740 同样 `true` |
| **P1-6** | `src/promo/promo.js`（改前 `[data-promo-click]` 处理器） | **演示按钮篡改玩家选择**：点一下鼠标会把 `state.catPinned` 永久改成 `click`，「陪你点鼠标」胶囊随之高亮；而同一节的打字演示是临时的、播完就还原 | 改前代码 `setCat('click', { pinned: true })` + 720ms 后 `setCat(state.catPinned)`（此时 `catPinned` 已被自己改成 `click`，等于没还原）；同文件打字演示用的是 `temporaryCat` |
| **P1-7** | `src/promo/promo.js`（改前 `updateTime()` 末行、`toggleFocus()`、`toggleVinyl()`、打字与点击的超时回调） | **气泡与姿势对不上**：奶糖被固定成「一起听歌」后，一换时刻气泡就变成「夜深了，做完这一点就休息。」 | 改前这些位置一律 `setCatBubble(times[state.time].bubble)`，不看当前姿势 |
| **P2-8** | `src/promo/promo.css:3208`（改前 ≤900 `.hero-clock time{font-size:20px}`） | **Silkscreen 字号不在 8px 网格上**（20 % 8 = 4），违反 `docs/art-direction.md` 的像素网格 | 规则原文 + art-direction「Silkscreen 为 8 的倍数」 |
| **P2-9** | `promo.html:13 / 25 / 17 / 24` | **分享卡片字段不全**：缺 `og:locale`、缺 `twitter:image:alt`；`og:image` / `twitter:image` 还指着旧版 `?v=2` | 逐条比对 OG / Twitter 卡片规范 |
| **P2-10** | `promo.html:354 / 360 / 366 / 372 / 378 / 384 / 390`（改前） | **静态 AI 歌单封面没有 width/height**：脚本重绘歌单列表时会跳一下 | JS 渲染的同名元素写了 `cover.width/cover.height`（`promo.js:417-418`），静态版本漏了 |
| **P2-11** | `promo.html:480-482`（信箱标签）+ `src/promo/promo.js` | **标签页只能用鼠标切换**：`role="tablist"` 没有方向键导航，也没有漫游 tabindex | WAI-ARIA Tabs 模式；实测未做方向键支持，三个标签只能靠 Tab 逐个走到 |

### 2.2 看过、确认没问题（未改）

| 检查项 | 结论与依据 |
| --- | --- |
| **XSS 面** | `src/promo/promo.js` 全文没有 `innerHTML` / `outerHTML` / `insertAdjacentHTML` / `eval` / `document.write`；来信正文走 `richParagraph()`（`promo.js:670-684`）只认自家模板里的 `<b>`，其余一律 `textContent` / `createElement`。将来接动态数据也注不进去 |
| **中文全角标点** | 脚本逐行扫 `promo.html` 与 `src/promo/promo.js`，中文旁的半角 `, . ; : ? !` **0 处**；引用统一用「」（正文引用设置路径 / 计划）与“”（引语），`设置 › 音源` 的 `›` 与 README、docs 一致 |
| **术语统一** | 唱片架 / 唱机 / 小屋 / 手记 / 来信 / 奶糖 全页统一，无「唱片机」「信件」「猫咪」之类混用 |
| **口径与 README 一致** | 6–14 首完整歌单、4 档专注节奏（15/5、25/5、50/10、90/20）、15 本词书 258 词、6 间小屋、macOS + Windows、数据只存本机、导出/导入 v4 备份（`src/backup-model.mjs:15` `BACKUP_VERSION = 4`）、Codex CLI 仅桌面版 —— 逐条对齐 `README.md` 与 `docs/limitations.md` |
| **CTA 数量** | 下载 CTA 共 3 处（页头 / 首屏 / 底部）＋ 1 个「在 GitHub 看源码」＋ 页脚 3 个链接；页头常驻、底部收口，不多不少 |
| **下载链接** | 页头、首屏、底部三处均为 `https://github.com/ooooooomygosh/Flow-Cabin/releases/latest`（上一轮已从 `album-web` 改过来），`promo.js:3` 的版本查询端点同样是 `Flow-Cabin` |
| **断点体系** | 1120 / 900 / 620 三档 + 基线；375 / 414 / 768 / 1024 / 1440 / 1920 六档实测 `scrollWidth <= innerWidth` 全部成立，**无横向滚动**；`.time-row` 的 `minmax(390px,1fr)` 在 ≤900 被 `minmax(0,1fr)` 覆盖，没有 min-width 造成的溢出 |
| **CSS 无用选择器** | 159 个 class 全部在 `promo.html` / `promo.js` 里真实渲染过，**0 个无用选择器**；反向检查只有 3 个「HTML 里有、CSS 没定义」的语义钩子（见第 6 节） |
| **reduced-motion** | CSS 守卫把动画时长压到 0.01ms、暂停 `.vinyl/.cat-sprite/.ticker`；`html` 的 `scroll-behavior` 变 `auto`；JS 三处 `scrollIntoView` 走 `behavior:'auto'`；翻牌动画在 `reduceMotion.matches` 时跳过。实测：猫照常渲染、专注钟照常走秒（14:59）、无 page error |
| **首屏资源优先级** | 房间大图 `preload as=image fetchpriority=high` ✓；封面/截图有 `width/height` 与 `loading="lazy"` ✓；社交卡片 1200×630 ✓ |

---

## 3. 实际改动

### 3.1 `public/promo/icon-48.png`（新增）／`public/promo/icon-32.png`（删除）

- 用 `public/promo/icon.png`（192×192 有效 PNG）按 **4× 像素网格 NEAREST** 还原成 48×48 的真实像素稿
  （实测中央区域 4×4 色块一致率 78%，即原稿是 48×48 放大 4 倍），再由 PIL 写出合法 PNG。
- 逐 chunk CRC 校验：`IHDR / IDAT / IEND` 全部 `crc-ok`；PIL 可正常 `load()`。
- 旧 `icon-32.png`（CRC 全错）删除；`promo.html:66`（页头）、`promo.html:571`（页脚）改用新图。
- **为什么是 48px**：48×48 的像素稿只有 48 / 24 / 16 这种整数倍才是无锯齿的，
  所以页头显示 48px、页脚显示 24px（`promo.css:223-227`、`:3036-3040`），
  旧代码 34px / 30px 配 32px 素材属于缩放取整，画质本来就毛。

### 3.2 `src/promo/promo.css`

| 位置 | 改动 | 为什么 |
| --- | --- | --- |
| `:26-62`（改前 41-67） | 删掉 4 段 HarmonyOS Sans SC TTF 的 `@font-face`，`--body` 改成系统中文字体栈 `"PingFang SC", "HarmonyOS Sans SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif` | 原文件每个字重 8MB+，且许可证不允许裁剪；像素标题仍用 OFL 的 Fusion Pixel / Silkscreen。实测首屏传输 17.98MB → 1.57MB（−91%） |
| `:150-154` | 新增 `[data-latest-version]{display:inline-block;min-width:48px}` | 版本号由脚本填充，先占住宽度，按钮不跳 |
| `:402-413` | `.hero-meta` 颜色 .68 → .78，并加 `text-shadow: 0 2px 0 rgba(4,8,6,.6)` | 这块压在唱片封面上，原来半透明灰字在亮封面上几乎读不出来；硬阴影比半透明底板更贴像素风 |
| `:462-467` | `.hero-copy` 宽度 `min(700px,53vw)` → `min(820px,56vw)` | 给标题第二行让出宽度 |
| `:495-502` | `.hero h1` 的 `clamp(48px,6.1vw,94px)` → `clamp(48px,6.1vw,88px)` | 88px 时「留在一间小屋里。」≈ 665px，稳稳一行；94px 时 ≈ 710px 会挤断 |
| `:3208-3210` | ≤900 的 `.hero-clock time` 20px → 16px | Silkscreen 回到 8px 网格 |
| `:3228-3233` | ≤900 的 `.hero-cat` `bottom:328px` → `296px` | 气泡不再压到事实行 |
| `:3450-3482` | ≤620 的 `.hero-cat` 改成 `right:26px; bottom:268px; width/height:104px; transform:none`，`.cat-sprite` 96px，`.cat-bubble` 改挂到猫的左边（箭头改成指向右），`max-width: min(168px, calc(100vw - 150px))` | 窄屏竖向只剩一条窄缝：气泡压不住按钮也压不住事实行；去掉 `scale(.88)` 后气泡里的字保持 12px 不再缩到 10.6px |
| `:3036-3040` | `.footer-mark img` 30px → 24px | 48×48 素材的整数倍缩放，像素不毛边 |

> **没有改任何 class 名**（见第 6 节的「class 一一对应」自查）。

### 3.3 `src/promo/promo.js`

| 位置 | 改动 | 为什么 |
| --- | --- | --- |
| `:4-7` | 新增 `staticVersion`：从 `<meta name="promo-version">` 读，兜底再读第一个 `[data-latest-version]` 的文本 | 版本号单一来源（见 3.4） |
| `:310-319` | 新增 `catBubbleByAction` 与 `setCatBubbleFor(action)` | 气泡跟着姿势走 |
| `:291` | `updateTime()` 末行 `setCatBubble(time.bubble)` → `setCatBubbleFor(state.catPinned)` | 换时刻时别让「夜深了休息」配上一只在跳舞的猫 |
| `:347 / 542 / 623 / 768 / 790 / 851 / 916` | 7 处「回到固定姿势」的路径改用 `setCatBubbleFor(state.catPinned)` | 修 P1-7 |
| `:341-349` | `temporaryCat()` 的还原路径改用 `setCatBubbleFor` | 同上 |
| `:783-790` | 打字输入框的还原路径改用 `setCatBubbleFor` | 同上 |
| `:793-798` | 「点一下鼠标」由 `setCat('click',{pinned:true})` 改为 `temporaryCat('click','你点一下，我也拍一下。',1100)` | 修 P1-6：演示不再篡改玩家选的动作 |
| `:694-699` | `updateLetter()` 同步 `aria-selected` 时一并写 `tabIndex`（当前页 0，其余 −1） | 漫游 tabindex |
| `:861-878` | 信箱标签新增键盘导航：`←/→/↑/↓` 循环切换、`Home`/`End` 跳首尾，并同步 `aria-selected`、内容与焦点 | 修 P2-11，符合 WAI-ARIA Tabs 模式 |
| `:918` | `applyLatestVersion(fallbackLatestVersion)` → `applyLatestVersion(staticVersion)` | 版本号单一来源 |

### 3.4 `promo.html`

| 位置 | 改动 | 为什么 |
| --- | --- | --- |
| `:29` | 新增 `<meta name="promo-version" content="v1.21.4">` | **版本号的唯一来源**；改版本只改这一处（JSON-LD 仍需字面量给爬虫） |
| `:578-587` | body 末尾新增一段 6 行内联脚本：首帧前用 `meta` 的值填好所有 `[data-latest-version]` | 避免首帧闪出空的版本号；外部模块随后再与 GitHub 的最新 release 对齐 |
| `:77 / 100 / 557 / 562` | 四处 `data-latest-version` 的静态文本改为空 | 版本号不再在 HTML 里重复四遍 |
| `:13` | 新增 `<meta property="og:locale" content="zh_CN">` | 补齐 OG 字段 |
| `:25` | 新增 `<meta name="twitter:image:alt" ...>` | 补齐 Twitter 字段 |
| `:17 / 24` | `social-card.jpg?v=2` → `?v=3` | 卡片内容重生成过，需要破缓存 |
| `:33` | 新增 `<link rel="preload" as="font" type="font/woff2" href="/fonts/pixel/fusion-pixel-12-zh_hans.subset.woff2" crossorigin>` | 标题用的像素中文字体先取到，首屏大字不先闪一遍系统字 |
| `:111 / 243` | 两处 `.cat-bubble` 加 `aria-live="polite"` | 奶糖换台词时读屏能听到 |
| `:354-390` | 7 张静态 AI 歌单封面补 `width="48" height="48" decoding="async"` | 与脚本渲染的版本一致，避免重绘时跳动 |
| `:66 / 571` | 品牌图标换成 `/promo/icon-48.png` | 修 P0-1 裂图 |

### 3.5 文案改动的完整前后对照

| 位置 | 改前 | 改后 | 理由 |
| --- | --- | --- | --- |
| `promo.html:104`（首屏事实行） | `macOS · Windows` | `macOS / Windows 桌面应用` | 三秒内要让人知道「这是什么」：光写两个平台名会以为又是一个网页；补「桌面应用」才是产品形态 |
| `promo.html:105` | `无账号也能开始` | `不用注册账号` | 与 README「收藏、专注、环境音不用注册账号」同一句式；`无账号也能开始` 容易被读成「有账号也不行」 |
| `promo.html:106` | `数据保存在本机` | `数据只存在本机` | 「只」更明确地对上 README 的「只保存在本机」 |
| `promo.html:17 / 24` | `social-card.jpg?v=2` | `social-card.jpg?v=3` | 卡片重生成，破缓存 |
| 事实行之外的正文 | 未改 | 未改 | 上一轮已经打磨过（`hero` 导语、五个章节小标题、房间与歌单文案），逐句读过，没有空喊、没有错别字、中英夹杂自然，**不制造无意义 diff** |

### 3.6 `public/promo/social-card.jpg`（重生成）

用仓库自带的 `npm run screenshots:social`（`scripts/promo-social-card.mjs`，只读未改）按新首屏重拍，
1200×630 JPEG、237,632 B，含新的品牌图标、新的事实行与两行标题。

---

## 4. 跑过的命令与结果

| 命令 | 结果 |
| --- | --- |
| `npm test`（`export HOME=/workspace/.home`） | ✅ 桌面端 354/354 通过；根项目 518 项 517 通过 / 0 失败 / 1 跳过（含 `src/css-lint.test.mjs` 设计系统守卫） |
| `npm run build` | ✅ 2m29s，promo 入口正常产出 `dist/assets/promo-CDPe0i-n.css`（53,097 B）+ `dist/assets/promo-BtwlB5KA.js`（24,196 B），`dist/promo.html` 内 `promo-version` 3 处、`?v=3` 2 处俱在 |
| `npm run test:promo` | ⚠️ **实跑过，但在第 4 个断言处失败**：`scripts/promo-smoke.mjs:130` 仍写死旧仓库名 `album-web`（`a[href=".../album-web/releases/latest"]`），而 `promo.html` / `promo.js` 上一轮已改到 `Flow-Cabin`。该脚本不在我可改范围，见第 7 节 |
| 等价浏览器回归（`promo-smoke.mjs` 的逐行复刻版，只把仓库名换成 `Flow-Cabin`，放在计划工作区 `/workspace/.mavis/plans/plan_357f4278/workspace/promo-smoke-mirror.mjs`） | ✅ **18/18 全绿**：静态版本兜底 / 两只猫都渲染 / 六间房 / 下载链接与实时版本 / 昼夜天气 / 来信跟着变 / 图集选房 / 打字点击跳舞摸猫 / 唱机与切歌 / AI 歌单三种场景与保存到唱片架 / 暂停与自动播放 / 番茄钟四档与翻牌 / 信箱标签与手记回信 / 全部图片加载 / 桌面与移动端无横向溢出 / 移动端底部导航 / 零 page error、零 console error、零外部请求 |
| 六档响应式体检（自写脚本，1920/1440/1024/768/414/375） | ✅ 全部 `scrollWidth <= innerWidth`；375/360 的 `cat∩facts` 由 `true` 变 `false`；资源统计 17,983,932 B → 1,570,443 B |
| reduced-motion 模拟 | ✅ 猫照常渲染、专注钟走秒、`scroll-behavior:auto`、ticker 动画被压到 1e-05s、无 page error |
| 键盘遍历 | ✅ 74 个可聚焦元素，焦点环 `outline-width: 3px`；信箱标签方向键切换后 `aria-selected`、内容与焦点三者一致 |
| `npm run screenshots:social` | ✅ 重生成 `public/promo/social-card.jpg`（1200×630，237,632 B） |

---

## 5. 未验证的部分

1. **真实线上环境**：沙箱里 `album-circle.vercel.app` 的 DNS 被污染（CONTRACT 第 0 节），没有对着线上站点跑过一次；
   所有验证都发生在本地 Vite dev server 上。
2. **真实 GitHub release**：沙箱网络对 `api.github.com` 的请求因证书链失败（`ERR_CERT_AUTHORITY_INVALID`），
   版本号的在线同步路径是用 Playwright 路由桩注入 `tag_name` 验证的；真实响应未跑通。
   页面在该错误下的表现是「保留静态版本号、页面照常可用」，已实测无 console error 之外的异常。
3. **真实 iOS / Android 浏览器**：只验证了 Chromium（桌面与移动视口模拟）。Safari 的 `100svh`、
   `overflow: clip`、`text-wrap: balance` 未实测。
4. **Windows 实际字体**：正文现在走系统中文字体栈，Windows 上会落到 Microsoft YaHei，
   只在 Linux 容器里看过渲染效果。
5. **`npm run test:promo` 未绿**：原因在仓库脚本里（见第 7 节），不是页面问题；等价脚本 18/18 已绿。

---

## 6. 遗留风险

1. **`scripts/promo-smoke.mjs` 与页面不同步**（阻塞 `npm run test:promo`）：仓库改名后脚本没跟上，
   需要集成时改两行（见第 7 节）。在那之前，任何人跑 `npm run test:promo` 都会在第 4 个断言处红。
2. **宣传页正文不再用 HarmonyOS Sans**：这是用 16.4MB 传输换来的取舍。
   若之后产品决定「宣传页也要用品牌字体」，正确做法是拿到**允许子集化的**字体（OFL）或让设计接受系统字体；
   直接裁剪 `public/fonts/HarmonyOS_Sans_SC_*.ttf` 违反其许可证第 2 条。
3. **三处「有 class 没有样式」的语义钩子**（既有代码，本次未动）：
   `promo.html:242` 的 `cat-sprite big`、`:452` 的 `flash-face front`（样式由 `.naitang-stage .cat-sprite`、
   `.flash-face` 承担），以及 `promo.js:898-903` 的 IntersectionObserver 写入的 `is-seen`（CSS 里**没有**对应规则，
   章节没有入场动画，这个 observer 目前是空转）。删掉是零收益 diff，做成真的入场动画又会牵扯
   「JS 挂了也要看得见内容」，建议留给交互专项统一决定。
4. **宣传页自己的字号刻度不参与 css-lint**：`promo.css` 用的是本地 token `--pixel-cn / --pixel-en / --body`，
   而 `src/css-lint.test.mjs` 只认 `--px-font-cn / --px-font-en`，所以 hero 的 88px、章节的 72px 这类
   「非 12/24/36/48 网格」的字号不会被守卫拦下。宣传页是独立落地页、且基线本来如此，
   本次只修掉了明显破网格的 20px 时钟，没有整体重排字号刻度（那属于重做视觉，超出「打磨」范围）。
5. **房间切换时 `background-image` 不会过渡**：`promo.css:334` 写了 `transition: background-image .45s`，
   但 `background-image` 不可插值，实际是瞬间换图。这条既有声明是无效的，不影响功能，未改。

---

## 7. 越界发现（不在我可改范围，交 repo-auditor / 集成处理）

1. **`scripts/promo-smoke.mjs:16` 与 `:130` 仍写死旧仓库名 `album-web`**
   （仓库已改名为 `Flow-Cabin`）。后果：`npm run test:promo` 在第 4 个断言
   「header, hero and bottom download actions must use the latest release URL」处失败；
   同时 `latestReleaseUrl` 桩不匹配，页面向 GitHub 发的版本查询会被判为「意外外部请求」，
   最后的 `assert.deepEqual(report.unexpectedRequests, [])` 也会失败。
   **建议补丁（2 行）**：

   ```diff
   - const latestReleaseUrl = 'https://api.github.com/repos/ooooooomygosh/album-web/releases/latest';
   + const latestReleaseUrl = 'https://api.github.com/repos/ooooooomygosh/Flow-Cabin/releases/latest';
   ...
   - const downloadLinks = await page.locator('a[href="https://github.com/ooooooomygosh/album-web/releases/latest"]').evaluateAll((links) => links.map((link) => link.href));
   + const downloadLinks = await page.locator('a[href="https://github.com/ooooooomygosh/Flow-Cabin/releases/latest"]').evaluateAll((links) => links.map((link) => link.href));
   ```

   我没有改这个文件（专项边界只允许动 `promo.html` / `src/promo/promo.css` / `src/promo/promo.js` / `public/promo/**`），
   改用**逐行复刻版**在计划工作区跑完了同样的 18 项断言，结果 18/18。
2. **README 侧的版本号仍是手工维护**：README 第 12 行「下载最新版 ↓」旁边没有版本号，
   但 `docs/limitations.md` / `docs/product-plan.md` 里多处写死 `v1.21.4`。
   建议由 repo-auditor 统一成「以 Releases 页为准」或加一处自动同步，避免宣传页（已收敛到单一来源）
   与 README 再次出现两套口径。
3. **`public/fonts/` 里的 HarmonyOS 六个 TTF 共约 49MB 仍随站点发布**：
   `dist/` 里有 `fonts/HarmonyOS_Sans_SC_*.ttf`，推广页已经不引用，但网页版（`index.html`）还在用。
   这属于仓库展示面 / 性能预算，由 repo-auditor 与集成决定是否改成子集或按需加载。
4. **`dist/` 目录被提交进仓库**（本次构建后 `dist/` 共 63MB，其中字体占 49MB）。
   建议在 `.gitignore` 里排除 `dist/`，避免每次构建都把 49MB 字体写进版本库。

---

## 8. class / 选择器一一对应自查

本次**没有新增、删除或重命名任何 class**，只改了属性选择器 `[data-latest-version]` 与元素选择器。
按专项要求自查（`promo.css` ↔ `promo.html` + `promo.js`）：

```
CSS 类总数: 159 | CSS 里没有对应渲染的: 无
HTML 用到但 CSS 未定义的 class: ['big', 'front']   ← 既有语义钩子，样式由后代选择器承担（见第 6 节）
JS 动态 class: is-active ✓ is-flipping ✓ is-poked ✓ is-visible ✓ smart-order ✓ smart-pick ✓ smart-tag ✓
                is-seen ✗ ← 既有空转 observer（见第 6 节）
```

`src/css-lint.test.mjs` 的「每个 class 都必须真实渲染过」一项在 `npm test` 中通过。
