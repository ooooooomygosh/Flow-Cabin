# Android 安装包

基于主分支 `455700d`（v1.21.6），首个 Android 版本为 `1.21.6-android.1`，包名 `cn.flowcabin.app`。使用 Capacitor 8 将本地生产资源打进 APK，启动不依赖网站或电脑服务。最低 Android 7.0 / API 24，Android System WebView 111 以上；旧系统兼容性仍需真机确认。

## 安装与使用

把签名 APK 传到手机，用文件管理器打开安装即可，不需要 ADB、USB 调试或 Windows 防火墙授权。仅在 Android 提示时，允许当前文件管理器安装此 APK。后续更新需使用同一包名、签名和更高 versionCode；不要先卸载旧版。

- 手机竖屏重新安排唱机与唱片操作，横屏和平板保留房间原始 4:3 比例。为系统栏、安全区域和软键盘预留空间；常用操作使用至少 44 CSS px 的触摸区域。
- 工具栏全屏按钮调用 Android 沉浸模式。系统返回键依次关闭弹窗、收起专注面板、退出全屏，再将应用放到后台。
- 「添加 → 手机里的音乐」通过系统文件选择器读取你选择的音乐，保存读取授权和曲目信息。文件仍在原位置；移动、删除、撤销授权或云盘文件离线后需要重新选择。
- 六个房间、收藏、专注、待办、学习、小屋日记与合成环境音使用本地资源。天气、外部图片与自定义 AI 等联网功能仍需要网络及服务支持。
- 本版没有迁移 Electron 的 QQ/网易音乐后端、Music Assistant、桌面壁纸、桌宠出门和跨应用输入统计。手机系统后台音频、锁屏控制与定时通知尚未实现；切到后台后 WebView 可能暂停音频或计时调度。主要用于应用前台使用。

## 数据保存在何处

收藏、设置、专注、学习与日记写入应用私有 SQLite 数据库 `flow-cabin.db`，独立于 WebView 缓存。启动先读取数据库，再加载业务模块；用同步内存视图兼容现有模型，40 ms 合并写入并通过原生事务保存。收藏修改在原生事务成功后才确认。应用切后台时会主动刷新待保存内容，但系统在事务完成前强制终止进程仍可能丢失最后瞬间的编辑。

写入失败会保留待保存内容并提示重试；事务回滚保留先前数据库。损坏或不支持的数据版本会阻止启动，不自动删库重建。初始化标志保证已清空的数据库不会被旧 WebView 数据恢复。存储上限 32 MiB，超限保留原值。

清除缓存不删除数据库；卸载应用或「清除应用数据」会删除它。没有自动云同步，Android 自动备份已关闭。请在「设置 → 数据与备份 → 收藏与备份」导出 JSON，并用系统保存面板选择位置。备份与桌面版格式兼容，但不包含音乐文件、手机文件读取授权、API Key 或账户凭据。换手机后需要重新选择歌曲。AI Key 保持原有会话存储策略，不写入此数据库。

原生接口仅处理小屋命名空间、所选音乐文件与系统保存面板返回的位置。只声明 INTERNET 权限，不申请扫描全部存储空间权限。Android 资源入口额外设置 CSP，禁止远程脚本和 iframe 获取原生桥。

## 构建

需要 Node 24、JDK 21、Android SDK platform 36、相应 Build Tools。设置 `JAVA_HOME`、`ANDROID_HOME`；通过 SDK Manager 接受许可证。Gradle Wrapper 使用 8.14.3，首次构建需要联网下载依赖。

```sh
npm ci
npm run android:apk
```

生成 `android/app/build/outputs/apk/debug/app-debug.apk`。脚本会重新打包本地资源并同步原生插件。APK 自带资源，请勿把 `server.url` 改成远程网页来代替打包。

签名发布包需自行保存长期使用的密钥，设置以下环境变量后运行 `npm run android:apk -- --release`：

| 环境变量 | 用途 |
| --- | --- |
| `FLOW_CABIN_ANDROID_KEYSTORE` | 密钥库绝对路径 |
| `FLOW_CABIN_ANDROID_STORE_PASSWORD` | 密钥库密码 |
| `FLOW_CABIN_ANDROID_KEY_ALIAS` | 默认 `flow-cabin-android` |
| `FLOW_CABIN_ANDROID_KEY_PASSWORD` | 默认与密钥库密码一致 |

输出 `android/app/build/outputs/apk/release/app-release.apk`。密钥、密码和本机 SDK 路径禁止提交；丢失签名密钥后，无法覆盖更新已安装的同签名版本。这里生成的本地签名与之前的桌面发行包没有签名继承关系。

## 验证记录与边界

2026-10-21 本地验证：

- 现有桌面测试 349 通过 / 5 跳过，网页模型测试 557 通过 / 2 跳过。
- 新增存储队列测试 6 项，覆盖恢复、删除、写入失败重试、并发修改合并、配额与清空。
- Chromium 加载真实 Android 生产资源，使用固定原生桥替身，11 项检查通过：覆盖触摸新增、事务确认、重载恢复笔记、系统保存接口的备份内容、所选音乐 URI 恢复及生成 WAV 的播放/下拉切歌，以及 360×640、390×844、412×915、844×390、800×1280 的布局、房间比例、唱机不遮挡底栏、专注面板边界。此测试不等同于 Android WebView 真机测试。
- `:app:assembleDebug` 和 `:app:assembleDebugAndroidTest` 编译成功。原生 SQLite 测试使用隔离测试库，覆盖重启、事务拒绝、损坏文件保留；仅完成编译，尚未执行。
- 签名 release APK 另以 `apksigner verify` 检查签名，以 `aapt2 dump badging` 检查包名、版本与 SDK 配置。

因 Windows 未允许 ADB，已停止 ADB 和模拟器。没有完成 Android 真机/模拟器运行验收，包含 SQLite 在真实进程重启后的行为、系统音乐/保存选择器、原生文件播放、键盘和系统栏效果、升级保留数据及低版本兼容性。请将本次 APK 作为待真机验收版本。

重复浏览器验证：安装 `desktop/` 测试依赖和 Playwright Chromium，运行 `npm run android:bundle && npm run test:mobile-ui`；可用 `BROWSER_EXECUTABLE` 指定现有 Chrome。结果和截图位于忽略的 `mobile-test-results/`。原生测试仅在设备可用且允许 ADB 时运行 `cd android && ./gradlew :app:connectedDebugAndroidTest`。

参考：[Capacitor 配置](https://capacitorjs.com/docs/config)、[Android 系统文件访问](https://developer.android.com/training/data-storage/shared/documents-files)、[应用私有存储](https://developer.android.com/training/data-storage/app-specific)。
