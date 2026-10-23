# Android 安装包

当前发行版本为 `2.0.0`，包名保持 `cn.flowcabin.app`。平台账号、歌单、搜索与音乐解析复用桌面 Portable 的本机 Node 服务；Media3 执行实际音乐播放，环境音使用独立 AudioTrack。无需电脑或云中转。

2.0 新增原生后台/锁屏播放、可解析队列的随机/循环与跨专辑播放、程序环境音、实际解码PCM能量、非精确专注提醒、唱片/专注两个桌面小组件、五种启动器图标、局域网配对同步和扫码。生活小屋入口位于设置 → 房间与桌宠，桌面版和Android共用八套房间及独立家具。

最低 Android 10 / API 29，支持 64 位 ARM 手机（arm64-v8a）和 x86_64，Android System WebView 111 以上。原生库支持 16 KB 内存页，APK 的 ELF 和 ZIP 对齐另行检查；不是只调整手机屏幕比例。

## 安装与使用

把签名 APK 传到手机，用文件管理器打开安装即可，不需要 ADB、USB 调试或 Windows 防火墙授权。仅在 Android 提示时，允许当前文件管理器安装此 APK。后续更新需使用同一包名、签名和更高 versionCode；不要先卸载旧版。

- Android 3 修正顶部、左侧的大块纯色填充：原生 WebView 延伸至系统栏和挖孔边缘，安全区只用于交互控件，不给整个画面加外边距。单幅房间图保持 4:3 等比裁切铺满，不复制背景或拉伸。根据横竖屏能完整显示的原画格子分页展示收藏，旋转后保留当前唱片。极短窗口折叠底部面板，仍可通过工具栏「打开播放器」操作，恢复尺寸后面板回来。
- 标题、工具栏、弹窗留白和重复信息缩小；播放控制改为紧凑的一排按钮，音量条不再覆盖播放/切歌。刘海、左右挖孔、手势/三键导航由原生安全区适配；横屏软键盘出现时笔记框随剩余高度收缩。
- 「设置 → 音源 → 账户与文件夹」提供 QQ / 网易云官方页面登录，登录结果回传本机音乐服务；可读取平台歌单、搜索和匹配原始曲目，按账号权限获取播放地址。自动匹配、音质降级、播放流和下拉切歌沿用 Portable 的实现。平台会员、地区、风控和歌曲版权仍以平台实际返回为准。
- 工具栏全屏按钮调用 Android 沉浸模式。系统返回键依次关闭弹窗、收起专注面板、退出全屏，再将应用放到后台。
- 「添加 → 手机里的音乐」通过系统文件选择器读取你选择的音乐，保存读取授权和曲目信息。文件仍在原位置；移动、删除、撤销授权或云盘文件离线后需要重新选择。
- 六个房间、收藏、专注、待办、学习、小屋日记与合成环境音使用本地资源。天气、外部图片与自定义 AI 等联网功能仍需要网络及服务支持。
- Windows 二进制、桌面壁纸、桌宠出门、跨应用输入统计及 macOS 系统播放器不适用于 Android。音乐和环境音由原生服务在后台执行，专注提醒由系统闹钟调度；通知权限、系统省电和厂商策略可能影响提醒与服务存活。缺少稳定曲目ID时需要回到前台继续解析，不伪造后台成功。

## 数据保存在何处

收藏、设置、专注、学习与日记写入应用私有 SQLite 数据库 `flow-cabin.db`，独立于 WebView 缓存。启动先读取数据库，再加载业务模块；用同步内存视图兼容现有模型，40 ms 合并写入并通过原生事务保存。收藏修改在原生事务成功后才确认。应用切后台时会主动刷新待保存内容，但系统在事务完成前强制终止进程仍可能丢失最后瞬间的编辑。

写入失败会保留待保存内容并提示重试；事务回滚保留先前数据库。损坏或不支持的数据版本会阻止启动，不自动删库重建。初始化标志保证已清空的数据库不会被旧 WebView 数据恢复。存储上限 32 MiB，超限保留原值。

清除缓存不删除数据库；卸载应用或「清除应用数据」会删除它。没有自动云同步，Android 自动备份已关闭。请在「设置 → 数据与备份 → 收藏与备份」导出 JSON，并用系统保存面板选择位置。备份与桌面版格式兼容，但不包含音乐文件、手机文件读取授权、API Key 或账户凭据。换手机后需要重新选择歌曲。AI Key 保持原有会话存储策略，不写入此数据库。

原生接口仅处理小屋命名空间、所选音乐文件与系统保存面板返回的位置。声明联网、媒体前台服务、通知与主动扫码所需相机权限；不申请录音或扫描全部存储空间。相机仅在用户开始扫码后的前台限时开放，不授予麦克风。Android 资源入口额外设置 CSP，禁止远程脚本和 iframe 获取原生桥。

平台登录页面在独立 Android 进程与 WebView 配置中运行，不安装 Capacitor/Node 桥，只允许相应平台 HTTPS 导航。成功后只把 Cookie 在应用内交给音乐服务，并清理登录 WebView Cookie；落盘由 Android Keystore 的 AES-GCM 加密。音乐凭据与 Node 代码位于应用私有 no-backup 目录，不进入收藏数据库、JSON 备份、Git 或 APK。退出平台会清除本机凭据并使旧播放流失效。

Node 服务仅监听随机的 `127.0.0.1` 端口，使用每次进程随机生成的令牌；端口和令牌不暴露给界面。界面只可调用白名单 JSON 接口，音频通过同源 WebView 拦截流式转发；原生登录 Cookie 接口不开放给界面。只有本机回环允许明文 HTTP。网络工作与 SQLite 写入使用独立执行器，避免登录、搜索等待阻塞本机保存。

## 构建

需要 Node 24、JDK 21、Android SDK platform 36、相应 Build Tools。设置 `JAVA_HOME`、`ANDROID_HOME`；通过 SDK Manager 接受许可证。Gradle Wrapper 使用 8.14.3，首次构建需要联网下载依赖。

```sh
npm ci
npm --prefix desktop ci --ignore-scripts
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
- 移动端测试 7 项：存储恢复、删除、失败重试、并发修改合并、配额、清空，以及使用实际 Portable 服务的凭据加密/重启、授权保护、搜索、音频流和退出登录。完整 `npm test` 共 913 通过、7 跳过。
- Chromium 加载真实 Android 生产资源，使用固定原生桥替身，17 项检查通过：触摸新增、事务确认、笔记/音乐映射重载、备份、生成 WAV 播放/下拉切歌、平台登录按钮到原生接口，以及 360×640、390×844、412×915、844×390、800×1280、393×852、852×393、360×740 等尺寸。额外模拟左右各 44 px 挖孔、安全底栏和 393×490 键盘窗口，检查按钮不互相遮挡、播放按钮实际命中、音源按钮未裁切、输入弹窗可达。此测试不等同于 Android WebView 真机测试。
- 主机 JVM 的真实 Javet 6.0.2 / Node 26.10.0 测试 2 项：Java 加密回调、模拟账号、搜索/解析/音频流/退出，以及不替换上游模块时真实 Portable 适配器和 NCM 请求/加密模块的加载。NCM 入口保留原参数与 Cookie 处理、按需加载原始端点，避免启动时执行不需要的 Express 服务与全部端点。发现并修复了普通脚本执行与 CommonJS 作用域差异、私有 Node 上下文禁止依赖内部 Function() 等问题。这里用的是主机 JNI 和测试加密密钥，不代表 Android Keystore 已实测。
- `:app:assembleDebug` 和 `:app:assembleDebugAndroidTest` 编译成功。原生 SQLite 测试使用隔离测试库，覆盖重启、事务拒绝、损坏文件保留；仅完成编译，尚未执行。
- 签名 release APK 另以 `apksigner verify` 检查签名，以 `aapt2 dump badging` 检查包名、版本与 SDK 配置。

Android 2 当时因 ADB 不可用，没有完成 Android 运行验收。Android 3 按用户要求在本机安装官方模拟器后补测，结果见下文。仍未使用真实账号或代填凭据；真实平台登录、会员/地区歌曲播放、Android Keystore 凭据持久化、系统文件选择、签名覆盖升级、ARM 真机和其他厂商设备尚未验收。浏览器合成音频不等同于真实平台音乐播放。

### Android 3 的全面屏修复与模拟器复验

- `npm test`：916 通过、7 个原有跳过；移动浏览器 31 项通过，六种场景各自横竖屏四边覆盖、4:3、29 张收藏逐页可达、实际封面命中，以及同尺寸下左右挖孔安全区互换。
- Android 16 / API 36、x86_64、WebView 133 的官方 Emulator 实测：普通竖屏、横屏、反向横屏，模拟挖孔的三个方向，以及竖横屏沉浸模式；WebView 到达整个显示区域、原画四边覆盖、封面与控件可达。真实 Android JNI 中的嵌入音乐服务成功启动，读取平台配置成功，没有代登录或播放用户账号歌曲。
- `connectedDebugAndroidTest` 在模拟器执行 3 项 SQLite 测试通过：数据与删除重启保存、非法事务拒绝并保留旧值、损坏数据库不被空库覆盖。签名 release/debug 构建和 release lint 通过。
- 登录页返回操作改用 AndroidX OnBackPressedDispatcher，兼容 Android 16 的返回手势。
- 真实模拟器界面回归 12 项通过，包含横竖屏软键盘的笔记输入可达、关闭键盘恢复，以及强制结束应用进程再启动后 29 张收藏和笔记仍在 SQLite。截图取自 Android 实际合成屏幕，包含系统栏与输入法。

本机 SDK / Emulator 位于 `D:\APPS\Android\Sdk`，测试手机资料位于同级 `avd`；同级及开始菜单提供「Android Emulator - Flow Cabin」快捷方式。启动器仅设置自身 SDK/AVD 环境，不修改 Windows 安全设置或全局 PATH。不调试时关闭模拟器。

复验真实 WebView 布局：在专用 `flow-cabin-qa` 模拟器安装 debug APK，设置 `ANDROID_HOME`，运行 `node scripts/android-device-regression.mjs --fixture`。该命令只允许此测试 AVD，用标明为测试的 29 张收藏替换模拟器收藏，通过原生 SQLite 写入；不操作真实手机或账号。报告和实际 Android 截图保存到 `mobile-test-results/android-device-report.json` 及同目录。模拟挖孔会重建 WebView，脚本重新连接调试接口；退出时移除测试挖孔并恢复竖屏。

重复浏览器验证：安装 `desktop/` 测试依赖和 Playwright Chromium，运行 `npm run android:bundle && npm run test:mobile-ui`；可用 `BROWSER_EXECUTABLE` 指定现有 Chrome。结果和截图位于忽略的 `mobile-test-results/`。原生测试仅在设备可用且允许 ADB 时运行 `cd android && ./gradlew :app:connectedDebugAndroidTest`。

主机嵌入引擎复验：从 Maven Central 获取 Javet 6.0.2 的 `javet` 核心 JAR 和当前主机的 Node 原生 JAR（Windows 为 `javet-node-windows-x86_64`）；将二者路径按系统 classpath 分隔符写入 `JAVET_TEST_CLASSPATH`，设置 `JAVA_HOME`，在 `android:bundle` 后运行 `npm run test:mobile-engine`。测试资料与报告只写到 `mobile-test-results/`。许可证和来源见 [移动运行时第三方说明](../mobile/THIRD-PARTY.md)。

参考：[Capacitor 配置](https://capacitorjs.com/docs/config)、[Android 系统文件访问](https://developer.android.com/training/data-storage/shared/documents-files)、[应用私有存储](https://developer.android.com/training/data-storage/app-specific)。
