# 唱机播放器 · Player

Code: `src/player/`, `src/useRoomPlayback.jsx`, `src/MusicSettings.jsx`. Event contract: [events.md](events.md).

## 一键播放

- 双击封面或把唱片拖到唱机上就开始放。第一次放的时候，如果唱片自带明确的音源（扫描的本地文件、这次选的音乐文件、带 QQ 曲目 ID 的资料），会自动用这个音源。你自己选过音源之后，就一直按你选的来。
- 在「仅动画展示」模式下，唱机会直接给出 本地音乐 / QQ 音乐 / 网易云 的快捷按钮，不会悄悄没有声音。
- 控制：上一首 / 播放·暂停 / 下一首 / 取下唱片，顺序 → 整张循环 ⟳ → 单曲循环 ⟳1，本张随机 ⤮（每首只放一次，放完接待播；歌单的「随机播放」只对这一张生效），还有「待播唱片」。在唱片架选中另一张，点「加入待播」，当前这张放完就接着放。
- 进度、音量、静音都会保存。出错时会显示具体原因（网络、解码、地址失效或需要登录），并给出「重试」和「音源设置」按钮（打开 设置 › 音源）。

### 快捷键

正在输入或开着对话框时，这些快捷键不生效。

| 键 | 作用 |
| --- | --- |
| 空格 | 播放 / 暂停（动画模式下是转 / 停） |
| Shift + ← / → | 上一首 / 下一首。放了超过 3 秒时，「上一首」会从头重放当前这首 |
| ← / → | 后退 / 快进 5 秒 |
| M | 静音 |
| - / = | 音量 −5% / +5% |
| R / S | 切换循环模式 / 本张随机 |

系统媒体键和锁屏控制走 Media Session。

## 音源与账户（设置 › 音源 › 账户与文件夹）

| 音源 | 登录方式 | 说明 |
| --- | --- | --- |
| 本地音乐（文件夹） | 不需要登录 | 桌面版扫描文件夹，长期可播。音乐留在原位，不复制。 |
| 本地音乐（直接选文件） | 不需要登录 | 浏览器读取标签，只在本次打开期间可播。重新打开后，唱机会提示再选一次。 |
| QQ 音乐 / 网易云 | 桌面版打开官方登录页（沙盒窗口，只允许官方域名） | Cookie 经 Electron safeStorage 加密保存在本机，系统不能安全加密时拒绝保存。连接成功不代表一定能放：版权、会员和地区限制在播放时才会知道。网页版不能登录，按钮会说明原因。 |
| Music Assistant | 服务器地址 + 访问令牌 | 令牌加密保存，换服务器时清除。声音从服务器的播放器发出。 |
| 系统正在播放 | 不需要登录 | 只显示和控制外部播放器。 |

唱机用哪个音源，在 设置 › 音源 的「唱机音源」单选里选（唱机铭牌上的音源标签也会打开这里）；「账户与文件夹」只管登录、文件夹和 Music Assistant。

**没有接入的服务：** 没有接入 Spotify、Apple Music 的内嵌播放。Spotify Web Playback SDK 需要 Premium 账号、开发者自己的 Client ID，还要 Widevine DRM（普通 Electron 版本不带）；MusicKit JS 需要 Apple 开发者令牌。这些都需要你提供自己的凭据和发行配置，所以没有做假的「已连接」。需要时，请用「系统正在播放」来控制它们的客户端。

## 导入专辑与像素封面

- 「添加到唱片架 › 本地音乐 › 直接选择音乐文件」支持选文件或整个文件夹。能读取 ID3v2.2–2.4（MP3）和 FLAC 的标签与内嵌封面；其他格式或损坏的标签，就从文件名（如 `03 - 歌手 - 歌名`）和文件夹名推断。曲目按碟号和曲序排列，时长从音频元数据读取。
- 像素封面（`pixel-cover.mjs`）：原封面会裁成正方形，缩到 32×32，用 Bayer 抖动量化到小屋的 16 色调色板（实时读取 `tokens.css` 变量，读不到就用内置的同款色值），再按最近邻放大到 256px PNG。没有原封面或读不到像素时，会按「专辑名 + 歌手」生成固定的小场景（窗边、山丘、黑胶、小木屋，分黄昏和夜晚两种），同一张专辑每次生成的都一样。
- 手动添加时如果没填封面，扫描到的专辑如果哪里都没有封面，都会自动生成像素封面。唱片卡片里的「像素封面」可以先预览再决定用不用，原封面会保存在 `originalCover`，随时能「恢复原封面」。


## 无感播放（自动重新匹配）

问题根因：以前自动匹配只接受「曲名和歌手文字完全一致」的结果。从 iTunes / MusicBrainz / Discogs 添加的唱片常写 `Jay Chou`，QQ 写 `周杰伦`，或者曲名带 `(Remastered)`，于是所有候选都被判 0 分，播放直接失败，只能在「重新匹配」里手动点同一个候选。另外 QQ 搜索结果的专辑名是字符串，旧代码按对象读取，专辑名一直是空的，专辑也就无法参与匹配（`desktop/music-policy.cjs`）。

现在（`src/player/auto-match.mjs`、`src/room-playback.mjs`）：

1. 先试上次成功的匹配（按「唱片 + 曲序 + 曲名」记在本机，最多 400 条）；失败就忘掉它。
2. 再试唱片自带的平台曲目 ID。
3. 再搜索并打分：曲名（允许去掉 Remaster / 版本 / 插曲 这类装饰）、歌手（同种文字必须一致；中英文写法不同时不判断，交给专辑和时长）、专辑、时长（±3 秒加分，差 20 秒以上扣分）。Live、伴奏、翻唱、Remix 永远不会替换录音室版本。达到 70 分才自动播放，每个平台最多试 4 个，按分数从高到低，播不出来就试下一个。
4. 都不行才显示候选列表，并在 2.2 秒后自动跳到下一首（连续最多 5 首）。
5. QQ 音乐 / 网易云在小屋里播不出来时，唱机下方会出现「在 QQ 音乐中打开」/「在网易云音乐中打开」。网易云已安装时用 `orpheus://song/<id>` 打开 App；QQ 音乐的客户端链接格式没有公开文档，所以打开官方歌曲页（页面上有「在客户端打开」）。打开后声音由那个 App 播放，小屋不显示进度，也不会显示成「正在播放」。

## 音质

设置 › 音源 › 音质：标准 · 128k / 高品质 · 320k（默认）/ 无损 · FLAC。平台会按账号权限给出能播放的最高档（没有会员通常是 128k），唱机状态里显示的是**实际**播放的档位，例如「正在播放 · 320k MP3」。

## 系统 Apple Music（仅 macOS）

唱机音源选「系统 Apple Music」后，在“音乐”App 资料库里按 歌手 + 曲名 搜索，按上面的规则挑选并在“音乐”App 中播放；小屋每 1.5 秒读取进度，可暂停、继续。Apple 不允许把音频转进别的应用，所以声音来自“音乐”App，音量滑块不控制它。歌单导入沿用「歌单 › 音乐 App」。首次使用会弹出“自动化”权限请求。代码：`desktop/apple-music.cjs`。

## 音源接口（给新手引导用）

`src/player/sources.mjs`，签名保持稳定：

| 函数 | 返回 |
| --- | --- |
| `listSources({ mac? })` | `[{ id, label, kind, login, platform?, supported }]`，id：`qq` `netease` `local` `appleMusic` `ma` `system` |
| `connectSource(id)` | `qq` / `netease` 打开官方登录窗口，`local` 打开选文件夹；`Promise<{ ok, cancelled, error }>` |
| `getSourceStatus(id)` | `Promise<{ id, supported, connected, detail, needsPermission?, app? }>`，不会抛错。QQ / 网易云的 `connected` 只表示保存了登录，播放权限要用 `testPlayback` 确认 |
| `requestPermission('appleMusic')` | 运行一个无害的 osascript 探测（读取“音乐”App 版本），首次会弹出系统“自动化”授权；`Promise<{ granted, needsPermission, available, error }>` |
| `testPlayback({ provider = 'auto', seconds = 3 })` | 匹配《晴天》，低音量真实播放约 3 秒后停止；只有音频真正开始播放才返回 `{ ok: true, provider, quality, title }`，否则 `{ ok: false, error }` |

桌面服务接口（`/desktop-music/…`）：`GET /config`（新增 `quality`、`qualities`、`appleMusicAvailable`、`localApps`）、`POST /quality { quality }`、`GET /apple/permission`、`GET /apple/state`、`POST /apple/control { action }`、`POST /open-local { provider, id?, query? }`。
