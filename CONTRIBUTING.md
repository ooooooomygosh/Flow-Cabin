# 一起打磨心流小屋

欢迎反馈一个让你分心的细节、修复一个明确的问题，或补充真实设备上的验证。先看 [README](README.md)、[使用边界](docs/limitations.md)与[产品计划](docs/product-plan.md)，了解现在的范围。

## 报告问题或提出想法

从 [新建 Issue](https://github.com/ooooooomygosh/Flow-Cabin/issues/new/choose) 选一个模板：

- [使用中遇到问题](https://github.com/ooooooomygosh/Flow-Cabin/issues/new?template=bug_report.yml) —— 需要系统／芯片、应用版本、复现步骤、预期与实际结果。
- [一个小屋改进想法](https://github.com/ooooooomygosh/Flow-Cabin/issues/new?template=idea.yml) —— 从一个具体场景说起就行。

音乐问题请注明音源和界面状态，桌面问题请注明单屏／多屏。截图只截小屋；不要提交 Cookie、令牌、签名音频 URL、个人数据备份或完整个人路径。

建议从具体场景出发，例如「第一次打开时不知道怎样听歌」。较大的功能先开 Issue 讨论。独立的小改进可以直接提交 PR。

## 现在最需要的帮助

- 用真实 Mac / Windows 设备走完「放盘 → 专注 → 结束 → 日记 → 再打开」，记录会让人分心的细节。
- 补齐多显示器、DPI、睡眠唤醒、输入法和真实音乐账号的验收证据。
- 反馈看不清的文字、键盘绕路和窄窗口布局，附复现步骤与只包含小屋的截图。

新功能先说明它如何加强「房间 × 唱片 × 这一轮专注」；优先合并已有入口，保留轻量待办与安静陪伴的定位。

## 本地开发

使用 Node.js **24.x**（`.npmrc` 会阻止不支持的 Node 主版本安装），在独立分支与隔离数据目录工作：

```bash
git clone https://github.com/ooooooomygosh/Flow-Cabin.git
cd Flow-Cabin
npm ci
npm --prefix desktop ci
npm run desktop:dev
```

`npm run desktop:dev` 会先构建原生组件、音乐模块和前端，再拉起 Electron；只想改界面时用 `npm run dev`（只启动 Vite 渲染层）。

开发启动使用应用数据目录；避免拿个人收藏做实验。可指定隔离 profile（替换成自己新建的临时目录）：

```bash
ALBUM_DESKTOP_TEST_PROFILE=/tmp/flow-cabin-dev-profile npm run desktop:dev
```

Windows PowerShell 请先设置 `$env:ALBUM_DESKTOP_TEST_PROFILE`。不要在测试中启用用户桌面背景、系统权限或真实账号；确需原生验证时先明确范围与数据隔离方式。

## 提交前验证

```bash
npm run check
npm --prefix desktop run build:music
npm --prefix desktop run build:web
npm run test:browser
```

`npm run check` 等于 `npm test` + `npm run build`：`npm test` 先跑桌面端单测，再跑根项目的 `node:test` 单测（含 CSS 设计系统守卫 `src/css-lint.test.mjs`）；`npm run build` 产出 index / promo / wallpaper / pet / mini 五个入口的生产构建。CI 跑的就是这一套，再加隔离浏览器回归。

浏览器测试需要 Chromium，可用 `BROWSER_EXECUTABLE` 指定已有可执行文件；它使用隔离数据与生成 WAV，不访问个人收藏或登录账号。音乐播放、计时或数据持久化改动，请补对应回归；呈现改动请检查 1440×900 和 960×600，附脱敏截图与生成方式。[更多桌面测试与打包命令](desktop/README.md)。

PR 描述说明问题、变化与实际检查结果。明确区分代码实现、夹具验证与真实设备验收；未运行的检查直接写明。别把旧提交的成功记录当成当前提交结果。

保持温暖、简洁的房间体验，避免增加无目的的面板。保留稳定的本地存储键、迁移路径、原创素材来源与上游许可证。根项目许可及 GPL 组合发行义务仍待明确，贡献不自动解决再分发许可。

新增截图可运行 `npm run screenshots:product`；只启动隐藏浏览器和回环服务器，使用公开曲库的真实专辑与封面，来源与复现方式见[展示素材说明](docs/showcase-sources.md)。原始封面只缓存在被忽略的测试目录，不随应用分发。生成图是真实渲染，不能标成真实平台账号播放证据。入门向导检查已纳入 `npm run test:browser`，这套离线回归无需下载真实封面。

核心旅程回归运行 `npm run test:journey`，使用合成收藏与隔离浏览器，不连接真实账号；证据写入 `desktop/test-results/journey/`。
