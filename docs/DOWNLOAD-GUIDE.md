# 选择适合你的小屋

想先试试看，直接打开[网页版](https://album-circle.vercel.app/)，不需要安装或注册。桌宠、跨应用键鼠陪伴、动态桌面、平台账号登录与本机 Codex CLI 需要桌面版。

## 下载安装包

始终从[官方最新 Release](https://github.com/ooooooomygosh/Flow-Cabin/releases/latest)下载。下面是 **v1.21.6** 的安装包文件名，实际大小以 Release 页面列出的资产为准。

| 设备 | 文件 |
| --- | --- |
| Mac · Apple Silicon（M 系列） | `FlowCabin-1.21.6-mac-arm64.dmg` |
| Mac · Intel | `FlowCabin-1.21.6-mac-x64.dmg` |
| Windows · x64 安装版 | `FlowCabin-1.21.6-x64-setup.exe` |
| Windows · x64 便携版 | `FlowCabin-1.21.6-x64-portable.exe` |

Mac 在「关于本机」查看芯片。Windows 在「设置 → 系统 → 系统信息」查看系统类型。Mac 也提供对应的 ZIP；`.blockmap`、`latest*.yml` 是更新器使用的辅助文件，不是安装包。`SHA256SUMS.txt` 可用于核对下载文件的校验值。

项目打包配置目前未单独声明最低 macOS / Windows 版本，也没有完整的旧系统验收矩阵，因此这里不猜测系统版本下限。尚未提供 Linux 或 Windows ARM64 原生安装包；可以使用网页版，开发构建方法见 [README](../README.md#跑起来)。

## 安装与第一次打开

- **Mac：** 打开 DMG，把「心流小屋」拖进「应用程序」后打开。当前使用自签名身份，尚未完成 Apple Developer ID 签名与公证。核对官方来源并确认信任后，可使用「系统设置 → 隐私与安全性」提供的单次「仍要打开」入口；不需要关闭系统安全保护。系统未提供该入口、提示文件损坏或恶意软件时，保留提示并[反馈问题](https://github.com/ooooooomygosh/Flow-Cabin/issues/new/choose)。
- **Windows：** 安装版允许选择目录；便携版直接运行。当前没有可信发布者签名，遇到系统提示时先核对官方来源、文件名与校验值。
- **更新：** 先在「设置 › 数据与备份」导出备份，再安装更新；不要删除个人数据目录来排除升级问题。

装好后，可以先选一张唱片，或直接开一轮专注。连接音源不是使用小屋的前提。详见[第一次使用](getting-started.md)和[使用边界](limitations.md)。
