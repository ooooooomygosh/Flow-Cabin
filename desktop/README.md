# 心流小屋 · 桌面客户端

Electron 44 主进程与打包配置。整体结构见 [../docs/architecture.md](../docs/architecture.md)。

## 开发

```bash
npm --prefix .. ci && npm ci
npm start          # 构建原生组件（仅 Windows）、音乐模块和前端，然后启动
npm test           # 单元测试
npm run dist:mac   # 打包 macOS 两种芯片（DMG + ZIP）
npm run dist:win   # 在 Windows 上打包安装版与便携版
```

`prestart` / `predist` 会依次执行三个构建步骤：
- `build:native`：用系统自带的 csc 编译 `DesktopHost.exe`（动态桌面）和 `NowPlaying.exe`（读取系统媒体控制）。`NowPlaying.exe` 编译失败不会中断构建，此时「系统正在播放」显示为不可用。
- `build:music`：打包 Simple Music 播放模块。
- `build:web`：把前端构建到 `web/`。

## 界面测试

测试用 Playwright 驱动真实的 Electron 窗口，测试数据放在内存中，不会读写真实收藏。

| 命令 | 内容 |
| --- | --- |
| `npm run test:shelf` | 抬头看到的书柜：唱片活页夹、排序与筛选、唱片卡片（笔记、从某首开始播放、移除）、添加专辑、多种窗口宽度 |
| `npm run test:library` | 唱片盒、黑胶外观、流派、重启后保留 |
| `npm run test:focus` | 番茄钟（模拟时钟）、待办、统计、奖励、混音、沉浸模式 |
| `npm run test:cat-focus` | 猫咪短途散步、夜景毛色、隐藏秒数、分钟边界、持久化与 reduced-motion |
| `npm run test:pet` | 桌宠窗口、命令白名单、拖动与位置记忆 |
| `npm run test:sources` | 本地音乐与系统正在播放 |
| `npm run test:music` | QQ / 网易云 / Music Assistant 播放链路（静音 WAV 与模拟服务器） |
| `npm run test:night-study` | 3.1 之前的月夜书桌场景（九格架、写字转笔、阴影）、自动选源切歌、原生全屏及 Windows 桌面实际合成（需要本机 Windows）。场景检查依赖壁纸里的房间画面，3.1 壁纸换成书桌后尚未改写 |
| `npm run test:cover-editor` | 延迟封面取色时的透明度、泼溅、手选底色与恢复默认，含保存/重载 |
| `npm run test:improvements` | 封面主色与手动色优先、壁纸错误消退、独立协议资源冒烟（不代替原生桌面挂载验收）。壁纸部分仍按 3.1 之前的房间查找唱机，尚未改写 |
| `npm run test:room` | 沉入桌面挂到桌面图标后（需要 Windows 或 macOS）。脚本仍按 3.1 之前的壁纸房间查找元素，壁纸换成书桌后尚未改写 |
| `npm run test:client` | 打包后客户端的冒烟测试，CI 在 Windows 和 macOS 上运行 |
| `npm run screenshots` | 生成 README 截图到 `../docs/images/` |

Linux 上需要用 `xvfb-run -a -s "-screen 0 1920x1080x24" node test/<name>.cjs` 运行。如果不设置 `ALBUM_QA_EXE`，测试会通过 `node_modules/electron/dist/electron.exe` 启动开发版；在 Linux 上可以把它建成指向 `electron` 的软链接。

## 安全边界

- 小屋页面：禁用 Node、开启沙箱和上下文隔离，只能使用固定的 `album-desktop://action/*` 命令。
- 音源服务：只监听 127.0.0.1 的随机端口，每次启动生成新令牌，并校验请求来源。本地音乐只读取索引里的文件。
- 桌宠与动态桌面（沉入桌面时画书桌）：独立的沙箱窗口，只接收展示数据，能发回的命令是固定白名单。
- 平台登录在独立的隔离分区窗口里完成，凭据用 Electron safeStorage 加密保存。

Simple Music 模块位于 `vendor/simple-music`（GPL-3.0-only），原始许可与来源说明随源码保留。
