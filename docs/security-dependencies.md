# 依赖安全审查 · 2026-10-19

当前基线：2026-10-19，`v1.21.3`；本次审查对应当前锁文件。历史版本记录保留在下文，不能把旧版本的签名、ASAR 或备份结论自动套用到当前版本。

本记录只覆盖当前锁文件与 `npm audit` 对生产依赖能确认的范围；不是渗透测试、漏洞不存在保证，也不替代 macOS 公证、Windows 真机审查或许可证判断。

## 当前结果

执行：

```bash
npm audit --omit=dev
npm --prefix desktop audit --omit=dev
```

截至本记录，根项目与桌面的生产依赖均报告 **0 个已知 npm 公告**（info / low / moderate / high / critical 全部为 0）。这是特定时间、特定 Advisory 数据库和当前锁文件的结果；锁文件变化、公告更新或安装环境差异后必须重新审查，不能把它写成永久保证。

## 本轮处理

| 依赖 | 当前处理 | 原因与验证边界 |
|---|---|---|
| `music-metadata` | 升至 `11.16.1` | 涉及 MP4、EBML、ASF 等恶意标签触发无界分配或解析崩溃的公告版本已移除；另有畸形 FLAC 与媒体解析回归，要求扫描跳过文件而不是卡死或错误索引 |
| 传递依赖 `file-type` | 随 `music-metadata` 升至 `21.3.4` | 避开旧版 ASF 解析无限循环；仍需由实际打包应用验证解析路径 |
| 传递依赖 `basic-ftp` | 覆盖为 `6.2.3` | 移除 FTP 列表解析二次复杂度拒绝服务公告；网易云依赖树本身不开放任意 FTP 目标，但不再使用公告版本 |
| `node-forge` | 以 `desktop/vendor/node-forge-encrypt-only` 替代 | 网易云生产路径只用 `publicKeyFromPem(...).encrypt(..., 'NONE')` 和 `bytesToHex`。本地适配层由 Node / OpenSSL `crypto.publicEncrypt` 实现，不提供证书或签名验证 API，因此不携带公告涉及的 RSA PKCS#1 签名校验实现 |

本地适配包版本为 `1.4.0-flowcabin.1`，**不是上游发布的构建**。`desktop/test/music-dependencies.test.cjs` 检查实际解析路径、缺失签名验证 API、网易 `weapi` 请求字段和畸形媒体拒绝路径。更换适配层时必须重新验证网易 API 请求加密、支持的 Node 版本与最终安装包中的依赖解析。

## 最终包核对

### v1.20.0 历史发布状态

`v1.20.0` 已通过 GitHub Release 发布：macOS arm64 / x64 DMG 与 ZIP、Windows x64 安装版 / 便携版、blockmap、latest YAML 与 SHA256SUMS 均已上线。当前 release commit 的源码构建、`desktop` 测试 338/338、promo 测试 12/12、根项目 437 通过 + 1 主动跳过，以及 Release 工作流的三平台打包与打包后客户端检查已确认。

最终安装包的签名、ASAR、哈希与权限说明尚未逐项复核；从 v1.21.1 起全局键鼠只申请 macOS「输入监控」，最终包仍需在发布流程中核对权限说明、打包内容与实际系统行为，不能用上一版本的安装包结论替代。

### v1.19.0 历史记录

2026-10-19 的 `1.19.0` Apple Silicon 开发包已完成以下核对：

- `codesign --verify --deep --strict` 通过；签名类型为 ad-hoc，TeamIdentifier 为空。
- ASAR 同时包含 `vendor/node-forge-encrypt-only/index.cjs`、`web/**` 与已解包的 `uiohook-napi`；没有发现随包音乐文件。
- 使用真实打包应用、隔离 profile 且未启用 mock keychain，备份导出、导入、重启与逐域比较共 4 项流程、72 项比较通过。
- 包内启动与本地媒体路径由该验收启动，但没有覆盖真实平台账号、全局输入权限和同安装路径升级。

## 不能由审计得出的结论

- **许可证仍未解决。** 根项目没有声明许可证，且包含 GPL-3.0-only 的 Simple Music 组合代码。组合分发如何选择许可证、如何提供对应源码，应由项目所有者确认；0 个 npm 公告不解决 GPL 义务。
- **正式发行仍未完成。** 本机包为 ad-hoc 签名且未公证；还需要 Apple Developer 签名、公证、Windows 可信发布者签名和更新源验证。
- **安装器升级仍未验收。** v1.17.0 到 v1.20.0 的同安装路径、同 profile 替换、重启与逐域数据比较尚未完成。
- **源码测试不等于全部打包验证。** 当前包已核对本地适配层、启动、本地媒体测试路径和备份恢复；网易真实请求、真实账号、全局输入权限、同路径升级与公证仍需对应环境。
- **全局输入跟随的系统权限边界。** `v1.21.1` 在应用失去焦点时通过 macOS 的 HID listen-only tap 接收键盘按下与鼠标点击，只申请「输入监控」，不申请辅助功能。实现约束为只读取事件类型与时间戳、在本机聚合每日次数，不记录具体按键、鼠标按钮、坐标、窗口标题或窗口内容；仍需在最终安装包和真实系统权限环境中验收，不能仅凭自动化测试宣称权限链路完整通过。
- **本机 Codex CLI 的信任边界。** `v1.21.3` 的桌面 AI 可以让主进程运行用户已安装并登录的 `codex`。实现使用隔离临时目录、`--ephemeral`、`--skip-git-repo-check`、read-only sandbox 和受限子进程环境，只读取 `--output-last-message` 最终回答；但 Codex 本身、其账号、模型服务与网络行为仍是用户选择的外部程序，小屋不保管 Codex 凭据，也不能保证第三方 CLI 的所有版本同样安全。只有用户主动选择该模板时才会执行。

依赖审计只覆盖已知 npm Advisory。用户选择的本地媒体仍应按独立用户权限运行；上游平台接口、真实账号和系统权限也不在本审计范围内。

相关边界见[使用限制](limitations.md)与[产品计划](product-plan.md)。
