<div align="center">

<img src="public/icons/icon-192.png" width="88" alt="心流小屋图标">

# 心流小屋 · Flow Cabin

**听一张喜欢的唱片，安心做完这一轮，再把日子轻轻收好。**

一间会下雪、会亮灯、会等你回来的像素小屋。<br>
本地优先 · macOS / Windows · 无需注册账号

<p>
<a href="https://album-circle.vercel.app/promo.html"><b>宣传网站 →</b></a>
&nbsp;·&nbsp;
<a href="https://github.com/ooooooomygosh/album-web/releases/latest"><b>下载最新版 ↓</b></a>
&nbsp;·&nbsp;
<a href="docs/getting-started.md">第一次使用</a>
&nbsp;·&nbsp;
<a href="https://album-circle.vercel.app/">网页版</a>
</p>

<a href="https://album-circle.vercel.app/promo.html">
  <img src="docs/assets/screenshots/cabin.jpg" width="100%" alt="心流小屋：雪夜木屋、唱片架、唱机与壁炉">
</a>

</div>

## 小屋里有什么

- **唱片与唱机**：十二格唱片架、黑胶特写、可拖动唱臂、曲目笔记、唱片盒与专辑墙；支持本地音乐、QQ 音乐 / 网易云、系统正在播放与 Music Assistant。
- **智能唱片机**：说一句「学习 50 分钟，帮我搭配音乐」，AI 会按你的计划生成一张完整歌单，不再只从唱片架选 1–3 张；生成后可「只收进唱片架」，或「收进唱片架并开始专注」。歌单作为普通歌单保存，播放时沿用自动匹配音源；AI 不可用时回退到本机唱片架推荐。
- **专注与学习**：四档番茄节奏、待办、每日目标、连续天数、7 天趋势与一年热力图；FSRS 闪卡、15 本内置词书和考试倒计时都在同一张桌上。
- **六间房与奶糖**：像素小屋、琥珀小屋、月夜书桌、林间书屋、海边慢屋、星夜阁楼，各有窗光、天气和可以碰一碰的小物；奶糖会在你打字、点击时回应。
- **来信与手记**：随手记、手记和小屋来信慢慢收成一本年鉴；没有社交 feed，也没有已读压力。
- **每次升级都重新确认**：更新向导从上一次完成引导的版本开始，累计列出变化，并重新检查音源、权限、房间与伙伴；中途关掉可以接着走完。
- **本地优先**：收藏、笔记、专注记录、待办、手记和陪伴统计都保存在本机，可随时导出 / 导入；平台凭据通过 Electron safeStorage 加密保存。

<div align="center">
  <img src="docs/assets/screenshots/smart-turntable.jpg" width="100%" alt="智能唱片机根据学习 50 分钟的计划生成完整歌单，并提供只收进唱片架与收进唱片架并开始专注两种选择">
</div>

## 奶糖会陪你用电脑

<div align="center">
  <img src="docs/assets/screenshots/pet-panel.png" width="360" alt="奶糖的桌面陪伴面板：今日键盘与点击次数、连续陪伴天数、喂食、配饰与专注入口">
</div>

桌面版在「设置 › 键鼠陪伴」打开跨应用陪伴后，即使心流小屋在后台，你打字时它也会轮流落爪，点击鼠标时它会伸手回应。统计、日记、来信和桌宠小面板会记录今天的键盘 / 点击次数、连续陪伴天数与最近 7 天；完成专注赚到的小鱼干可以换配饰。

只处理事件类型与时间戳，不保存按键、鼠标按钮、坐标、应用名或窗口标题。几天不开门，奶糖也不会生病、掉级或离开；它只是把灯留着。

<sub>macOS 首次使用只需授予「输入监控」；普通字母、数字和中文输入法里的按键都会触发。版本更新后引导会复核一次，已授权时不会重复弹窗。</sub>

## 下载

[**前往最新版 Releases 选择安装包 →**](https://github.com/ooooooomygosh/album-web/releases/latest)

| 平台 | 安装包 |
| --- | --- |
| macOS | Apple Silicon · Intel |
| Windows | x64 安装版 · 便携版 |

当前构建未完成商业签名与公证；首次打开如遇系统提示，请先核对下载来源，并阅读[安装说明](docs/getting-started.md#安装与首次打开)。

## 快速开始

需要 **Node.js 24.x**。

```bash
git clone https://github.com/ooooooomygosh/album-web.git
cd album-web
npm ci
npm --prefix desktop ci

npm run desktop:dev   # 启动完整 Electron 客户端
npm run dev           # 只启动浏览器渲染层
```

提交前运行 `npm run check`，它会执行测试与生产构建。更多命令见 [desktop/README.md](desktop/README.md)。

## 文档与贡献

React 19 · Vite 8 · Electron 44 · Tone.js · Web Audio · FSRS · `node:test` · Playwright

[架构说明](docs/architecture.md) · [桌面开发](desktop/README.md) · [美术规范](docs/art-direction.md) · [播放器与音源](docs/player.md) · [发布说明](desktop/RELEASE-NOTES.md) · [使用边界](docs/limitations.md)

欢迎提交 Issue、修复 Bug 或补充真实设备验证。开始前请阅读[贡献指南](CONTRIBUTING.md)。

## 许可与致谢

专辑封面版权归各唱片公司 / 艺术家所有，仅用于界面展示，不包含在项目许可范围内。项目代码与第三方模块的许可边界见[许可与依赖](docs/limitations.md#许可与依赖)。

灵感来自 [Bongo Cat](https://github.com/ayangweb/BongoCat) 的跨应用键鼠陪伴思路，以及 Chill Pulse、lofi-engine 等作品；角色与场景美术均为本项目原创。感谢 [Tone.js](https://tonejs.github.io/)、[Simple Music](https://github.com/Yyyangshenghao/simple-music)（GPL-3.0-only，来源见 [SOURCE.txt](desktop/vendor/simple-music/SOURCE.txt)）、[Music Assistant](https://github.com/music-assistant/server) 与像素字体 [Fusion Pixel](https://github.com/TakWolf/fusion-pixel-font)。

<div align="center">
<sub>Made with ☕ and lo-fi in a small pixel cabin.</sub>
</div>
