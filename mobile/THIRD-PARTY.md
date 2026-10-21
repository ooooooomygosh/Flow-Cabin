# Android 原生音乐运行时

- 音乐服务、曲库搜索和 QQ / 网易云适配直接来自本仓库 `desktop/`，与 Windows Portable 同源。Simple Music 模块采用 GPL-3.0-only，保留 `desktop/vendor/simple-music/` 及其许可证。
- Javet 6.0.2：Apache-2.0，https://github.com/caoccao/Javet/tree/6.0.2 。Android Maven 包 `com.caoccao.javet:javet-node-android:6.0.2`，用于在应用私有线程嵌入 Node.js。许可证在 `licenses/Javet-LICENSE.txt`。
- 该运行时的 Node.js 为 v26.10.0（Javet 6.0.2 发布说明），许可证及所列第三方声明在 `licenses/Node-LICENSE.txt`。
- NeteaseCloudMusicApi 和依赖从 `desktop/package-lock.json` 对应的已安装依赖树复制，保留各包的许可证，不捆绑 Electron、Windows 原生插件或用户凭据。裁剪版 node-forge 来自本仓库 `desktop/vendor/node-forge-encrypt-only`。

构建脚本将许可证放入 APK 的 `assets/cabin-backend/licenses`，依赖包自己的许可证仍留在 `assets/cabin-backend/node_modules` 下。应用源码按仓库 GPL-3.0-only 许可证提供。
