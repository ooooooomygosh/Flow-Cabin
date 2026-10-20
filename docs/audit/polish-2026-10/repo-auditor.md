# 仓库展示面审查 · repo-auditor

> **VERDICT: PASS** — 职责范围内 11 个真问题全部修掉，149 条相对链接 0 缺失，徽章与口径逐项核对通过，仓库卫生给出建议清单未删文件，`desktop/**` / `src/**` / `scripts/**` 的 13 处越界残留逐条给了改法。唯一的红灯在越界文件 `scripts/promo-smoke.mjs`，已定位到确切两行并验证过修法。

日期：2026-10-20。基线提交：`7423860de4657ac1da5dcab8f2e874f40855911e`（v1.21.4）。
负责范围：`README.md`、`CONTRIBUTING.md`、`.github/**`、`docs/**`（不含 `docs/audit/polish-2026-10/` 下他人产物）。
`src/**`、`desktop/**`、`promo.html` 只读。

---

## 1. 审查范围

| 面向 | 检查了什么 |
| --- | --- |
| 改名遗留 | 全仓库 `album-web` 逐处盘点（18 个文件 / 28 处），按「我负责 / 越界 / 历史记录」分类 |
| README 首屏 | 图标、一句话定位、关键事实、下载入口、首图、徽章 |
| README 内容 | 「小屋里能做什么」是否按用户能力组织；截图是否对应当前版本；文档链接是否都存在 |
| 口径一致性 | 版本号、支持平台、功能名（唱片架 / 唱机 / 专注 / 词书 / 手记 / 小屋来信 / 小屋日记 / 奶糖 / 智能唱片机）与界面是否一致 |
| 诚实性 | 未签名未公证、QQ / 网易云非官方接口、macOS 授权、网页版功能更少——四条边界是否保留；有没有写超出的断言 |
| 快速开始 | clone → npm ci → npm --prefix desktop ci → npm run desktop:dev 是否真能跑；Node 版本与 `engines` 是否一致；`npm run check` 到底跑了什么 |
| 贡献路径 | CONTRIBUTING 里的问题模板链接与 `.github/ISSUE_TEMPLATE/` 实际文件名是否一致；模板有没有索取不该索取的东西 |
| CI 呈现 | `.github/workflows/ci.yml` 的 job 名与步骤能不能让贡献者一眼看懂 |
| 仓库卫生 | `docs/` 里的审计与 QA 产物哪些是「对外可见的证据」，哪些是过程垃圾 |

**没有做的事**：没有改 `src/**`、`desktop/**`、`promo.html`、`scripts/**`；没有执行任何 git 命令；没有删任何文件。

---

## 2. 问题清单

### 2.1 真问题（本轮已修）

| # | 位置 | 问题 | 判断依据 |
| --- | --- | --- | --- |
| 1 | `docs/desktop.md:73` | 更新来源写的是旧仓库名 `ooooooomygosh/album-web` | 仓库已改名 `Flow-Cabin`；这行是「更新只来自 GitHub Releases」的唯一出处 |
| 2 | `docs/desktop.md:83` | 仍描述 macOS 安装包是 ad-hoc 签名（`identity: "-"`），并说「ad-hoc 签名每次构建都会变，更新后 macOS 可能会再次询问『自动化』权限」 | `desktop/package.json:164` 的 `mac.identity` 已是 `Flow Cabin Local Signing`；`.github/workflows/desktop-release.yml:91-108` 发布包强制用稳定证书并校验证书根；`desktop/mac-updater.cjs:17-19` 明确写「ad-hoc builds were tied to a changing CDHash and asked again every time」。文档落后于 v1.21.1 的实现 |
| 3 | `docs/desktop.md:90` | 「不证明 ad-hoc 签名发布者身份」，漏掉了实际存在的证书根指纹校验 | `desktop/mac-updater.cjs:178` 会把签名要求的证书根 SHA-1 与 `FLOW_CABIN_SIGNING_FINGERPRINT` 比对，不一致就停止安装 |
| 4 | `docs/entry-map.md:41` | 设置入口写成「显示与字体 › 键鼠跟随」，路径和功能名都过时 | `src/onboarding/SettingsHub.jsx:25` 的分区是 `{ id: 'companion', label: '键鼠陪伴' }`；界面上一律叫「键鼠陪伴」，「显示与字体」只是打开系统显示设置的一行 |
| 5 | `docs/product-plan.md:36` | v1.21.1 那行仍写「键鼠跟随」 | 同上，界面名是「键鼠陪伴」；同表 v1.20.0 那行保留原名，因为它记的是当时的版本 |
| 6 | `README.md:70` | 写「普通字母、数字和中文输入法里的按键都会触发」 | `docs/limitations.md:74` 明确写着「macOS 输入法组合……尚未完成验收」；`docs/limitations.md:15` 只说「macOS 普通英文 / 数字与鼠标点击已完成真实设备验收」。README 把没验收的事写成了既定事实 |
| 7 | `README.md:68` | 写「奶糖也不会生病、掉级或离开」 | `docs/cat-care.md:9`：心情每小时降 1 点，降到 30「无精打采」就停住——档位是会掉的；`src/cat/cat-care.mjs:3` 的原话是「never gets sick or leaves」。原句把「不会掉级」一起说成了不会，误导 |
| 8 | `README.md:66` | 「统计、日记、来信」与界面名不一致 | 界面是「小屋日记」（`src/focus/stats/CabinJournal.jsx:225`）和「小屋来信」（同文件 :157） |
| 9 | `README.md:45` | 能力条目标题「把日子收成一本年鉴」是自造词 | 同一条正文里的功能名是「小屋日记」「小屋来信」；标题应使用界面里的名字 |
| 10 | `README.md:96-100` | 「快速开始」直接说「需要 Node.js 24.x」，没区分「用软件」和「改代码」 | 只想用软件的人下完安装包就看到 Node 要求，容易以为装不上就不能用 |
| 11 | `README.md:78-81` | 下载表只有平台，没有告诉人怎么按文件名挑，也没有说明没有 ARM64 / Linux 包 | `docs/getting-started.md:9-15` 给了确切文件名和缺口的说明，README 没指过去 |

### 2.2 看过但没问题

| 位置 | 结论 |
| --- | --- |
| `README.md` 首屏结构 | 图标 + 一句话定位 + 关键事实（平台 / 不用注册账号 / 数据在本机）+ 下载按钮 + 首图，五要素齐全，顺序合理 |
| `README.md` 的 11 条能力 | 每条都是「动词 + 具体结果」，且逐条与 `docs/limitations.md`、`docs/getting-started.md` 对得上；四档节奏 15/3、25/5、50/10、90/20 与 `docs/assets/screenshots/focus-timer.png` 一致 |
| `README.md:87-90` 四条诚实边界 | 全部保留，顺序是先说清楚再下载，字数没缩水 |
| `README.md:122` 许可说明 | 「根项目的许可证目前还没有定下来，仓库里也没有 LICENSE 文件」——已用 GitHub API 核对：`"license": null`，仓库根目录确实没有 LICENSE。Simple Music 的 GPL-3.0-only 与来源文件都在 |
| `README.md:114` 技术栈 | React 19.2.1 / Vite 8.1.0 / Electron 44.6.0 / Tone.js 15 / ts-fsrs 4.7 / `node:test` / Playwright，与 `package.json`、`desktop/package.json` 一致 |
| `README.md:76` 版本 | v1.21.4，与 `package.json`、`desktop/package.json`、`desktop/package-lock.json`、`desktop/RELEASE-NOTES.md`、`promo.html` 的 `softwareVersion`、GitHub Releases 最新 tag 全部一致 |
| `README.md:103-109` 快速开始命令 | 顺序正确：clone → `npm ci` → `npm --prefix desktop ci` → `npm run desktop:dev`；`npm run dev` 单独说明只跑渲染层 |
| `README.md:114` `npm run check` 说明 | 与 `package.json` 的 `"check": "npm test && npm run build"`、`"test": "npm run desktop:test && node --test …"` 一致，五个构建入口（index / promo / wallpaper / pet / mini）也对 |
| `README.md` 文档链接 | 8 个文档链接 + 2 个锚点 + 2 个 vendor 文件 + 5 张截图，逐个落盘核对全部存在（见第 4 节） |
| `CONTRIBUTING.md:9-10` 模板链接 | `?template=bug_report.yml` / `?template=idea.yml` 与 `.github/ISSUE_TEMPLATE/` 里的实际文件名完全一致 |
| `.github/ISSUE_TEMPLATE/bug_report.yml` | 只问「系统与版本」和「怎么遇到的」两项必填，第三项截图明确写「请移除账号、路径、Cookie、令牌与签名音频链接」，没有索取私人路径 |
| `.github/ISSUE_TEMPLATE/idea.yml` | 只有「什么时候需要它」必填 + 「你希望它怎么表现」选填，不要求实现方案，合理 |
| `.github/workflows/ci.yml` | 顶部注释按顺序写清这串检查证明了什么；job 名 `Unit tests, production build and browser regressions`；13 个步骤名是人话（`Run silent playback regressions`、`Run cat beat-sync regressions (click tracks, tone, seek, skip)`…），贡献者能直接看懂 |
| `.github/pull_request_template.md` | 三段式（问题与变化 / 验证 / 影响），要求「区分夹具与真实设备验证，写明尚未运行的部分」，与项目的诚实原则一致 |
| `docs/desktop.md`、`docs/architecture.md` 里的 `album-circle` | **不是仓库改名残留**。`docs/architecture.md:7` 说明 `desktop/site-router.cjs` 把主界面虚拟来源固定为 `https://album-circle.vercel.app` 以保住旧 storage origin；`album-circle-*` 是既有 localStorage 键名。改名会让老用户数据消失，**不能动** |

---

## 3. 实际改动

### 3.1 README 结构前后对照

上一轮已经重写过 README（首屏、下载、诚实边界、快速开始都已成型）。本轮只做定点修正，**结构没变**，逐段对照如下：

| 段落 | 改前 | 改后 | 为什么 |
| --- | --- | --- | --- |
| 首屏（1-33 行） | 不动 | 不动 | 图标 / 定位 / 关键事实 / 下载 / 首图 / 徽章都已到位 |
| 能力条目（35-47 行） | 第 9 条标题「把日子收成一本年鉴」 | 「把日子收进小屋日记」 | 用界面里的功能名，不用自造词 |
| 截图表（49-58 行） | 不动 | 不动 | 6 张图逐张核对过文件存在、内容对应当前版本 |
| 奶糖段落（60-70 行） | 「统计、日记、来信」；「不会生病、掉级或离开」；「中文输入法里的按键都会触发」 | 「统计、小屋日记、小屋来信」；「不会生病也不会离开，等级更不会掉；只是心情会慢慢降到『无精打采』停在那里」；「普通字母和数字已在真实 Mac 上验证过；中文输入法组合还没有在真机上验收」 | 功能名对齐界面；两处把未验收 / 会发生的事写成了不会发生 |
| 下载（72-81 行） | 平台表后直接结束 | 表后加一句：不确定挑哪个文件就照[安装说明]对文件名；目前没有 Windows ARM64 原生包，也没有 Linux 安装包 | 给 30 秒扫读者一条明确的下一步，也把缺口的平台说清楚 |
| 诚实边界（83-92 行） | 四条 | 四条不动 | 边界本身没问题，只是不动它 |
| 快速开始（94-110 行） | 「需要 Node.js 24.x」 | 先加「只想用软件的话，下载上面的安装包就够了，不用装 Node」，再写「想改代码或自己跑起来，需要 Node.js 24.x」 | 区分使用者和开发者 |
| 文档与贡献（112-118 行） | 不动 | 不动 | 链接全部有效 |
| 许可与致谢（120-126 行） | 不动 | 不动 | 已用 API 核对「无 LICENSE」是事实 |

### 3.2 改动清单

| 文件 | 行 | 改动 |
| --- | --- | --- |
| `README.md` | 45 | 能力条目标题 → 「把日子收进小屋日记」 |
| `README.md` | 66 | 「统计、日记、来信」→ 「统计、小屋日记、小屋来信」 |
| `README.md` | 68 | 补上心情会降到「无精打采」的真实行为，去掉「不会掉级」的错话 |
| `README.md` | 70 | 中文输入法改成「还没有在真机上验收」 |
| `README.md` | 82-83 | 下载表后加挑文件指引与平台缺口说明 |
| `README.md` | 96-100 | 快速开始区分「用软件」与「改代码」 |
| `docs/desktop.md` | 73 | `ooooooomygosh/album-web` → `ooooooomygosh/Flow-Cabin` |
| `docs/desktop.md` | 83 | macOS 签名段改写为「稳定的本地自签名身份」，补上 TCC 授权不再重复索要的原因，并说明只有 PR 冒烟用 ad-hoc |
| `docs/desktop.md` | 90 | 「不证明 ad-hoc 签名发布者身份」→ 「不证明发布者身份」，补上证书根指纹校验 |
| `docs/entry-map.md` | 41 | 「键鼠跟随」（显示与字体 › 键鼠跟随）→「键鼠陪伴」（设置 › 键鼠陪伴） |
| `docs/product-plan.md` | 36 | v1.21.1 行的「键鼠跟随」→「键鼠陪伴」 |

没有新增文件，没有删除文件。

---

## 4. 链接核对结果

用 `outputs/v-repo/check-links.mjs` 扫全仓库 Markdown，把 Markdown 链接语法和 HTML `href` 属性里的相对链接拆成「文件部分 + 锚点」，逐个 `fs.existsSync` 到磁盘。

| 文件 | 相对链接数 | 缺失 |
| --- | --- | --- |
| `README.md` | 18 | 0 |
| `CONTRIBUTING.md` | 5 | 0 |
| 仓库全部 `.md`（含 `docs/**`、`desktop/**`、`.github/**`） | 149 | 0 |

README 里写下的每一个相对链接，逐条核对结果：

| README 位置 | 链接 | 落到磁盘 |
| --- | --- | --- |
| :3 | `public/icons/icon-192.png` | ✓ 存在，9112 B |
| :14, :116 | `docs/getting-started.md` | ✓ 存在 |
| :31 | `docs/assets/screenshots/cabin.jpg` | ✓ 存在，315460 B |
| :51 | `docs/assets/screenshots/focus-timer.png` | ✓ 存在，101193 B |
| :52 | `docs/assets/screenshots/journal/journal-overview-1440x900.png` | ✓ 存在，196675 B |
| :55 | `docs/assets/screenshots/personalization.jpg` | ✓ 存在，208722 B |
| :56 | `docs/assets/screenshots/smart-turntable.jpg` | ✓ 存在，554863 B |
| :63 | `docs/assets/screenshots/pet-panel.png` | ✓ 存在，59655 B |
| :76, :116 | `desktop/RELEASE-NOTES.md` | ✓ 存在 |
| :87 | `docs/getting-started.md#安装与首次打开` | ✓ 文件存在；锚点对应 `docs/getting-started.md:5` 的 `## 安装与首次打开` |
| :92, :116 | `docs/limitations.md` | ✓ 存在 |
| :110, :116 | `desktop/README.md` | ✓ 存在 |
| :116 | `docs/architecture.md` | ✓ 存在 |
| :116 | `docs/player.md` | ✓ 存在 |
| :116 | `docs/art-direction.md` | ✓ 存在 |
| :116 | `docs/entry-map.md` | ✓ 存在 |
| :118 | `CONTRIBUTING.md` | ✓ 存在 |
| :122 | `desktop/vendor/simple-music/SOURCE.txt` | ✓ 存在 |
| :122 | `desktop/vendor/simple-music/LICENSE` | ✓ 存在 |
| :122 | `docs/limitations.md#许可与依赖` | ✓ 文件存在；锚点对应 `docs/limitations.md:90` 的 `## 许可与依赖` |

CONTRIBUTING 的 5 条：`README.md` ✓、`docs/limitations.md` ✓、`docs/product-plan.md` ✓、`desktop/README.md` ✓、`docs/showcase-sources.md` ✓。

外链（`https://…`）不在磁盘核对范围，逐个用 HTTP 实测：

| 外链 | 结果 |
| --- | --- |
| `https://github.com/ooooooomygosh/Flow-Cabin/actions/workflows/ci.yml/badge.svg` | 200，`image/svg+xml`，SVG 标题是 `Checks - passing` |
| `https://img.shields.io/github/v/release/ooooooomygosh/Flow-Cabin?label=最新版本` | 200，SVG 内文本 `最新版: v1.21.4`，与 GitHub Releases 的 `tag_name` 一致 |
| `https://img.shields.io/badge/平台-macOS%20%7C%20Windows-informational` | 200，静态 informational 徽章，文案与实际支持平台一致 |
| `https://api.github.com/repos/ooooooomygosh/Flow-Cabin` | 200，`"private": false`，`"license": null`，`"default_branch": "main"` |
| `https://api.github.com/repos/ooooooomygosh/album-web` | **301 → `/repositories/1267996550`**，与 `Flow-Cabin` 是同一个仓库 id（1267996550） |

---

## 5. 口径一致性核对

| 项 | README | 界面 / 配置 | 结论 |
| --- | --- | --- | --- |
| 版本号 | v1.21.4 | `package.json` 1.21.4、`desktop/package.json` 1.21.4、`desktop/package-lock.json` 1.21.4、`desktop/RELEASE-NOTES.md` 1.21.4、`promo.html` 1.21.4、GitHub Releases tag `v1.21.4` | 一致 |
| 支持平台 | macOS（Apple Silicon / Intel）· Windows x64 | `desktop/package.json` 的 `win.target` 只有 `x64`（`desktop/test/updater.test.cjs:26` 断言「Windows builds are x64 only」）；macOS 两个架构 | 一致 |
| 唱片架 / 唱机 / 智能唱片机 | 12 格唱片架、唱机、智能唱片机 | 界面同名（`src/` 内 `唱片架` 89 处、`唱机` 93 处、`智能唱片机` 18 处） | 一致 |
| 专注 | 番茄钟 / 四档节奏 | 冲刺 15/3、经典 25/5、深度 50/10、心流 90/20，与 `focus-timer.png` 一致 | 一致 |
| 词书 | 15 本、258 个原创词条 | `docs/limitations.md:58` 同口径 | 一致 |
| 手记 | 手记 | 界面同名（83 处） | 一致 |
| 小屋来信 / 小屋日记 | 小屋来信、小屋日记 | `src/focus/stats/CabinJournal.jsx:157, :225` | 一致（本轮把 README 里的「日记 / 来信」补全） |
| 奶糖 | 奶糖、键鼠陪伴 | `src/onboarding/SettingsHub.jsx:25` 分区名「键鼠陪伴」 | 一致（本轮修掉 `docs/entry-map.md`、`docs/product-plan.md` 的「键鼠跟随」） |
| 房间 | 像素小屋、琥珀小屋、月夜书桌、林间书屋、海边慢屋、星夜阁楼；五位伙伴 | 与 `personalization.jpg` 截图逐个对得上 | 一致 |
| 音源 | 本地音乐、QQ 音乐 / 网易云、系统正在播放、Music Assistant | `docs/getting-started.md:44-50` 同样四种 | 一致 |

---

## 6. 跑过的命令与结果

| 命令 | 结果 |
| --- | --- |
| `node check-links.mjs /workspace/Flow-Cabin`（全仓库 Markdown） | 149 条相对链接，缺失 0 |
| `node check-links.mjs … README.md CONTRIBUTING.md` | 25 条相对链接，缺失 0 |
| `curl` 核对 3 个徽章 SVG | 全部 200，CI 显示 `Checks - passing`，版本显示 `v1.21.4` |
| `curl` 核对 GitHub API | 仓库公开、`license: null`、默认分支 `main`；`album-web` 返回 301 指向同一仓库 id |
| `npm test` | **绿。** 桌面端 `node --test test/*.test.cjs`：**354 项全部通过，0 失败**（`# tests 354 / # pass 354 / # fail 0`）。根项目 `node --test`：**518 项，517 通过、0 失败、1 项预期跳过**（`# tests 518 / # pass 517 / # fail 0 / # skipped 1`）。整体 `EXIT=0` |
| `npm run build` | **绿。** `EXIT=0`，`✓ built in 1m 55s`。五个入口全部产出：`dist/index.html`、`dist/promo.html`、`dist/wallpaper.html`、`dist/pet.html`、`dist/mini.html` |
| `npm run test:promo` | **失败**（不是本专项的改动造成的，详见第 9.3 节） |

### 环境修复说明（只动 `node_modules`，不涉及仓库文件）

沙箱预装的依赖有两处缺口，第一次跑 `npm test` 直接卡住：

1. `desktop/node_modules/electron/dist/` 是空的，`require('electron')` 会去下载二进制。GitHub 的 zip 在本沙箱只有 ~15 KB/s，改用 `registry.npmmirror.com/-/binary/electron/v44.6.0/electron-v44.6.0-linux-x64.zip`（约 8 MB/s）下载后解到 `dist/`，并写 `path.txt`。
2. `desktop/node_modules/node-forge` 是一条断链（指向 `NeteaseCloudMusicApi/vendor/node-forge-encrypt-only`，而真实目录在 `desktop/vendor/node-forge-encrypt-only`），导致 5 个音乐相关用例报 `Cannot find module 'node-forge'`。把软链重新指向 `../vendor/node-forge-encrypt-only` 后可解析。

这两处都是沙箱装依赖的问题，不是仓库缺陷；`node_modules` 在 `.gitignore` 里，仓库文件未受影响。

---

## 7. 未验证的部分

- **Playwright / Electron 的真机行为**：Chromium 1243 在沙箱里可用（`~/.cache/ms-playwright/chromium-1243`），`npm run test:promo` 与 `npm run test:browser` 可以跑起来；但 Electron 二进制缺 `libgtk-3.so.0`，依赖真实窗口的用例跑不了。`npm run test:browser` 未执行。
- **`album-circle.vercel.app` 的线上存活**：按 CONTRACT 第 0 节，这个域名在本沙箱 DNS 被污染，不用 curl 判死活。README 里的「宣传网站 / 网页版」两个链接沿用仓库 `homepage` 字段的同一地址（`https://album-circle.vercel.app/promo.html`），未改动。
- **真实设备**：macOS / Windows 的安装、签名、键鼠陪伴、QQ / 网易云账号播放全部未验，属于 `docs/limitations.md` 已写明的未验收项。
- **徽章的长期正确性**：`github/v/release` 徽章跟随最新 release，README 正文里写死的 `v1.21.4` 会在下次发版后变旧，需要发版时同步。
- **`docs/qa/**` 的 35 MB 素材**：只统计了体积与引用关系，没有逐张看过全部截图内容。

---

## 8. 遗留风险

1. **`scripts/promo-smoke.mjs` 与 `promo.html` 不同步，`npm run test:promo` 当前是红的**（本轮并行改动造成）。详见第 9 节第 3 条。这是唯一会挡住 CI 的问题。
2. **`docs/audit/**` 与 `docs/qa/**` 里的旧仓库名与旧本地路径还在**。GitHub 网页与 API 都会 301 跟随，链接当前**没断**，属于「脆弱但未坏」：仓库一旦转移或改名规则变化就会失效。
3. **README 里的 `v1.21.4` 是写死的**。发版后如果忘了同步，正文和自动更新的版本徽章会打架。
4. **词书 / 学习没有截图**。`docs/assets/screenshots/` 里没有「学习」标签页的画面，README 的「背几个词」一条只能靠文字。要补需要能跑起来的浏览器环境，本轮做不到。
5. **`desktop/catalog-search.mjs:142` 的 User-Agent 里版本号还是 `FlowCabin/1.7.0`**，而应用已经是 1.21.4。`docs/audit/live-catalog-check.md:65` 记录了当初刻意写「完整应用版本号」的意图。这个字段越界，但属于 `desktop/**`。

---

## 9. 越界发现

### 9.1 `desktop/**` 里所有 `album-web` 残留（完整清单）

以下 9 处分布在 6 个文件。**必须一起改**：第 1 组（发布目标）和第 2 组（更新器常量）互相锁定，第 3 组（User-Agent）被单测逐字断言。

| # | 文件:行号 | 现状 | 改成 | 为什么必须一起改 |
| --- | --- | --- | --- | --- |
| D1 | `desktop/package.json:175` | `"repo": "album-web",` | `"repo": "Flow-Cabin",` | 这是 electron-builder 的 `build.publish` 目标。发布工作流靠它决定把安装包发到哪个仓库。它必须和 D2 一起改，否则 `desktop/test/updater.test.cjs:30` 的断言会失败（那条断言逐字比较整个 `publish` 数组） |
| D2 | `desktop/test/updater.test.cjs:30` | `assert.deepEqual(pkg.build.publish, [{ provider: 'github', owner: 'ooooooomygosh', repo: 'album-web', releaseType: 'release' }]);` | 同上，数组里 `repo` 改 `Flow-Cabin` | **D1 的测试孪生**。改 D1 不改这里 → 用例直接红 |
| D3 | `desktop/updater.cjs:23` | `const OWNER = 'ooooooomygosh', REPO = 'album-web';` | `const OWNER = 'ooooooomygosh', REPO = 'Flow-Cabin';` | 这是真正的功能点。`:24` 的 `RELEASES_URL` 由它拼出来，`desktop/mac-updater.cjs:23` 从这里 `require` 这个常量去拼 `latest-mac.yml` 和 zip 的下载地址。改这一行，Windows 与 macOS 两条更新链路同时指向新仓库 |
| D4 | `desktop/updater.cjs:2` | `// 检查更新. GitHub Releases of ooooooomygosh/album-web are the only source.` | `album-web` → `Flow-Cabin` | 注释里的「唯一更新来源」，跟 D3 是同一个仓库，改一处就得改另一处，否则读代码的人会看到两个仓库名 |
| D5 | `desktop/test/updater.test.cjs:66` | `const RELEASES = 'https://github.com/ooooooomygosh/album-web/releases';` | `.../Flow-Cabin/releases` | 这条常量同时决定断言里抓的 URL（`:76` 的 `${RELEASES}/latest`、`:77` 的 `${RELEASES}.atom`）和伪 feed 里的链接（`:68`）。它必须和 D3 一致，否则测试会断言「更新器去访问一个和它实际访问地址不同的 URL」 |
| D6 | `desktop/test/updater.test.cjs:67` | `<title>Release notes from album-web</title>` | `Release notes from Flow-Cabin` | 同上，Atom feed 夹具的标题，与 D5 同一份夹具 |
| D7 | `desktop/test/mac-updater.test.cjs:9` | `const RELEASES = 'https://github.com/ooooooomygosh/album-web/releases';` | `.../Flow-Cabin/releases` | macOS 更新器的测试夹具。它和 D3 导出的 `RELEASES_URL` 是同一个地址；不改就等于测了一个不存在的仓库 |
| D8 | `desktop/catalog-search.mjs:142` | `'User-Agent': 'FlowCabin/1.7.0 (https://github.com/ooooooomygosh/album-web)'` | `'FlowCabin/<当前版本> (https://github.com/ooooooomygosh/Flow-Cabin)'` | 这是给 MusicBrainz 看的身份串，里面带一个仓库主页地址。**必须和 D9 一起改**，因为 D9 逐字断言这个字符串。顺带：版本号 `1.7.0` 已经过期（应用是 1.21.4），`docs/audit/live-catalog-check.md:65` 写明当初是刻意用「完整应用版本号」的，建议顺手改成实际版本 |
| D9 | `desktop/test/catalog-integrity.test.cjs:56` | `assert.equal(options.headers['User-Agent'], 'FlowCabin/1.7.0 (https://github.com/ooooooomygosh/album-web)');` | 与 D8 改成完全一致 | **D8 的测试孪生**，逐字相等断言 |

补充：`desktop/mac-updater.cjs` 本身**没有** `album-web` 字面量——它从 `desktop/updater.cjs:23` 导入 `RELEASES_URL`（见 `desktop/mac-updater.cjs:23`）。所以改 D3 一行，macOS 的下载地址会跟着走，不需要在 `mac-updater.cjs` 里另改。

### 9.2 `src/**` 里的 1 处（用户可见）

| 文件:行号 | 现状 | 改成 | 说明 |
| --- | --- | --- | --- |
| `src/desktop/UpdatePanel.jsx:27` | `<a className="pixel-button" href="https://github.com/ooooooomygosh/album-web" target="_blank" rel="noreferrer">项目主页</a>` | `href="https://github.com/ooooooomygosh/Flow-Cabin"` | 设置 › 关于里的「项目主页」按钮。网页上会 301 跟随所以点得开，但这是**用户能看见的旧仓库名**。`src/**` 不在本专项的归属范围内，且不归任何一个 BOT 的格子 |

### 9.3 `scripts/**` 里的 3 处 —— 其中 2 处**当前就让 CI 变红**

| 文件:行号 | 现状 | 改成 | 说明 |
| --- | --- | --- | --- |
| **S1** | `scripts/promo-smoke.mjs:130`<br>`await page.locator('a[href="https://github.com/ooooooomygosh/album-web/releases/latest"]')…`<br>`assert(downloadLinks.length >= 3, 'header, hero and bottom download actions must use the latest release URL')` | `a[href="https://github.com/ooooooomygosh/Flow-Cabin/releases/latest"]` | **实测已红。** 本轮 `promo.html`（`promo-auditor` 改，12:07）已把三个下载入口改成 `Flow-Cabin`，这个定位器匹配到 0 个元素，`npm run test:promo` 在 `:131` 抛 `AssertionError: header, hero and bottom download actions must use the latest release URL` |
| **S2** | `scripts/promo-smoke.mjs:16`<br>`const latestReleaseUrl = 'https://api.github.com/repos/ooooooomygosh/album-web/releases/latest';` | `.../repos/ooooooomygosh/Flow-Cabin/releases/latest` | **必须和 S1 一起改。** `src/promo/promo.js:3` 已经改成 `.../Flow-Cabin/releases/latest`。`:79` 的 `url.href === latestReleaseUrl` 匹配不上 → 这个请求落进 `:88` 的 `unexpectedRequests` 分支被 `route.abort('blockedbyclient')` 掐掉，随后 `:311` 的 `assert.deepEqual(report.unexpectedRequests, [])` 和 `:312` 的 `assert.equal(report.latestReleaseRequests.length, 1)` 都会失败。**只改 S1 会从 131 行失败变成 311 行失败** |
| S3 | `scripts/browser-smoke.mjs:606`<br>`downloadUrl: 'https://github.com/ooooooomygosh/album-web/releases/download/v9.9.0/FlowCabin-9.9.0-mac-arm64.dmg'` | `.../Flow-Cabin/releases/download/v9.9.0/…` | 「设置 › 关于」的更新面板夹具。只有按钮文案被断言，URL 本身不影响结果，但它是合成事件里显示给用户的地址 |

**验证过 S1+S2 的修法**：把这两行改掉后重跑 `npm run test:promo`，`download-actions-use-latest-release-and-show-live-version` 由失败转为 PASS（其余 13 个检查也全过；之后卡在 `every-promo-image-loads`，那是 `promo-auditor` 正在改的页面，与仓库名无关）。

`scripts/**` 不在本专项的归属范围，也不在 CONTRACT 的 BOT 归属表里，需要集成任务一并处理。

### 9.4 `docs/` 里**不打算改**的残留

| 位置 | 数量 | 判断 |
| --- | --- | --- |
| `docs/audit/verification-summary.md:3, :22, :28` | 3 行 / 5 处 | 历史 PR #4 / #5 与 Actions run 37869344271 的引用。**历史记录，不改**。链接会 301 跟随 |
| `docs/audit/integration-2026-10-11.md:46, :47, :55` | 3 行 / 5 处 | PR18 / PR19 / PR20 的历史记录，同上 |
| `docs/audit/pr4-integration.md:3` | 1 处 | PR #4 的整合记录，同上 |
| `docs/audit/live-catalog-check.md:65` | 1 处 | 记录了当时定下 User-Agent 字符串的依据，原文保留才是证据 |
| `docs/audit/product-presentation.md:58` | 1 处 | 2026-10-09 那轮的「GitHub 仓库首页设置建议」，带日期的历史记录 |
| `docs/audit/ci-browser-smoke-37869344271.json:4, :12, :130` | 3 处 | 归档的 CI run 元数据，历史证据 |
| `docs/qa/cat-focus/electron-report.json:2`、`integrated-report.json:2` | 2 处 | `"executablePath": "/workspace/album-web/desktop/node_modules/electron/dist/electron.exe"`——仓库改名前的**本地沙箱路径**，对读者零价值。建议按第 10 节的清理建议一并删掉这两个文件 |

### 9.5 改名的实际影响：GitHub 会跟随，但 API 和 updater 不一定

实测（`curl`，非浏览器）：

```
GET https://api.github.com/repos/ooooooomygosh/album-web
→ 301  Location: https://api.github.com/repositories/1267996550

GET https://api.github.com/repos/ooooooomygosh/Flow-Cabin
→ 200  "id": 1267996550, "full_name": "ooooooomygosh/Flow-Cabin", "private": false
```

同一个仓库 id。**GitHub 网页与 api.github.com 都会跟随仓库改名的重定向**，所以：

- 现在这些 `album-web` 链接**没有断**。README、docs 里的旧链接点得开。
- 但 electron-updater 与 `build.publish` 走的是 `api.github.com` / `github.com/…/releases`，**不能假设它永远跟随**——GitHub 的重定向策略随时可能变，而且仓库一旦 transfer 或被删，重定向就没了。
- 因此这批残留的定性是「**脆弱但未坏**」：不是「更新已经坏了」，但也不该留着。文档里按这个口径写，不夸大。

---

## 10. 仓库卫生清理建议清单

仓库总体积（不含 `node_modules` / `.git`）**147 MB**，其中 `docs/` 占 **58 MB**。下面按「建议动作」分四档，**本轮没有删任何文件**，执行由集成任务决定。

### A. 建议删除：过程产物，对外没有证据价值

| 路径 | 体积 | 理由 | 建议动作 |
| --- | --- | --- | --- |
| `docs/qa/cat-focus/electron-report.json`、`docs/qa/cat-focus/integrated-report.json` | ~8 KB | 里面只有本地沙箱路径 `/workspace/album-web/…`，对读者零价值；同目录的 `README.md` 已经写了结论 | 删除。顺带清掉 2 处 `album-web` |
| `docs/audit/ci-browser-smoke-37869344271.json` | 3.8 KB | 归档的是 2026-09 一次 CI run 的元数据，文档自己写着「GitHub 保留至 2026-10-23」，产物早已过期、点不动；同一次运行的结论已经写进 `docs/audit/verification-summary.md` | 删除 |
| `docs/audit/browser-self-test-result.json`、`browser-self-test-v4-result.json`、`browser-self-test-v5-result.json`、`browser-pet-motion-v5-result.json` | ~8.6 KB | 逐版浏览器自测的原始输出，已经被 `docs/audit/browser-validation.md` 取代；`browser-self-test-v6-result.json` 与 `browser-turntable-v6-result.json` 仍被 `browser-validation.md` 引用，那两个留 | 删除这 4 个 |
| `docs/audit/product-presentation-browser.json`、`product-presentation-showcase.json`、`welcome-experience-browser.json`、`welcome-experience-showcase.json` | ~17 KB | 2026-10-09 那两轮的原始输出，对应的 `product-presentation.md` / `welcome-experience.md` 已写结论 | 删除或移到 `docs/audit/archive/` |
| `docs/assets/cabin-tour.gif`（2.5 MB）、`docs/assets/cabin-tour.mp4`（2.1 MB）、`docs/images/showcase/cabin-tour.mp4`（1.6 MB） | 6.2 MB | 全仓库检索下来，**只有** `docs/audit/welcome-experience-showcase.json` 提到过 `cabin-tour.mp4`，而那个 JSON 本身也在建议删除之列；README 与任何文档都没引用 | 三选一：删掉；或者在 README 里真的把这段小屋巡游动画用起来（它 2.1 MB，比现在任何一张图都值） |
| `docs/audit/dependency-review.md` | 4.4 KB | 已被更新的 `docs/security-dependencies.md` 完整取代，且没有任何地方引用前者 | 归档或删除 |

### B. 建议压缩：证据要留，体积可以降

单张 1.4–1.7 MB 的全屏 PNG 是 `docs/` 里的大头。它们各自都有 README 说明用途，**不建议删，建议降采样**（宽度压到 960 px 或转 WebP，体积能降到 1/6 左右）：

| 路径 | 现体积 | 建议 |
| --- | --- | --- |
| `docs/qa/atmosphere/*.png`（5 张大图） | ~8.2 MB | 降采样 |
| `docs/qa/fire-naturalism/*.png`（4 张） | ~4.6 MB | 降采样 |
| `docs/qa/fire-front-light/*.png`（3 张） | ~4.5 MB | 降采样 |
| `docs/qa/fire-light-projection/*.png`（3 张） | ~3.4 MB | 降采样 |
| `docs/qa/cabin-layout/*.png`（8 张） | ~5.6 MB | 保留 `README.md` 里引用的 4 张，其余降采样 |
| `docs/qa/cat-focus/*.png`（4 张） | ~3.9 MB | 降采样 |
| `docs/images/night-study-fullscreen.png` | 3.8 MB | 被 `docs/night-study-validation.md:22` 引用，降采样或转 WebP |
| `docs/images/desktop-improvements/*.png`（3 张） | ~3.3 MB | 降采样 |

B 类全做完，`docs/` 大约能从 58 MB 降到 20 MB 上下。

### C. 建议保留：对外可见的证据

| 路径 | 为什么留 |
| --- | --- |
| `docs/audit/2026-10-product-review.md` | 第一份产品判断，被 `docs/product-plan.md` 引用 |
| `docs/audit/browser-validation.md` | 浏览器验证的正式结论，被 `docs/limitations.md:103` 引用 |
| `docs/audit/native-mac-acceptance-2026-10-09.md` | **仓库里唯一的真实设备验收记录**，`docs/limitations.md:103` 指着它 |
| `docs/audit/verification-summary.md` | `docs/limitations.md:103` 指着它 |
| `docs/audit/feature-matrix.md`、`combined-feature-checklist.md` | 功能矩阵与验收清单，是「做到了什么」的对照表 |
| `docs/audit/live-catalog-check.md` | 记录了 MusicBrainz User-Agent 的决定，是 `desktop/catalog-search.mjs` 的依据 |
| `docs/audit/shelf-and-window-controls-2026-10-14.md`、`welcome-experience.md`、`product-presentation.md` | 带日期的专题记录，本身就是过程记录的一部分 |
| `docs/qa/*/README.md`（6 个）、`docs/qa/*.md`（3 个） | 每份 QA 报告的正文，说明同目录那些截图是什么 |
| `docs/assets/screenshots/**` | README 直接引用的展示图 |
| `docs/media/**` | 猫的动作 gif 与美术对照表，181 KB，很轻 |
| `docs/images/preview-qa/**`、`docs/images/showcase/`（除 mp4） | 房间预览与展示图 |

### D. 建议新增

- `docs/README.md`（约 30 行）：给 `docs/` 做一个索引。现在 GitHub 上打开 `docs/` 会看到 20 多个文件、8 个子目录，没有入口。索引里把「第一次来先读这四份」放最前——`getting-started.md`、`limitations.md`、`architecture.md`、`product-plan.md`——其余按主题分组。

---

## 11. 复现方式

```bash
cd /workspace/Flow-Cabin
export HOME=/workspace/.home

# 相对链接逐个核对（脚本随交付物放在 outputs/v-repo/）
node <plan>/outputs/v-repo/check-links.mjs /workspace/Flow-Cabin

# 单元测试 + 生产构建
npm test
npm run build
```

`npm test` 在本沙箱需要先补两处依赖缺口（见第 6 节）：Electron 二进制与 `node-forge` 软链。这两处只动 `node_modules`。
