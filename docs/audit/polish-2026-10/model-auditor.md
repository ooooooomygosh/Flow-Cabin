# 建模与数据契约专项审查 · model-auditor

> 范围：`src/focus/focus-model.mjs`、`src/focus/session-log.mjs`、`src/focus/souvenirs.mjs`、
> `src/room-model.mjs`、`src/room-playback.mjs`、`src/sky-model.mjs`、`src/ai/ai-model.mjs`、
> `src/backup-model.mjs`、`src/playlist-model.mjs`、`src/record-library.mjs`、`src/scene-catalog.mjs`、
> `src/study/study-model.mjs`，以及同目录同名前缀的 `.test.mjs`。
> 基线：`7423860`（v1.21.4）。本轮只改归属内的文件；越界问题写在最后一节，没有动手改。

---

## 1. 审查范围与方法

| 维度 | 做法 |
| --- | --- |
| 纯度 | 逐个模型扫 `Date.now()` / `Math.random()` / `new Date()` / `document` / `localStorage` / `window`，确认时间与随机数都有注入口 |
| 边界与空值 | 对每个导出函数喂 `null` / `undefined` / `''` / `false` / `NaN` / `{}` / 超长串 / 负数 / 非法枚举 |
| 时间与统计 | 跨天、跨周、跨月、跨年、夏令时（用 `process.env.TZ` 切到 `America/New_York`、`Asia/Shanghai` 实测）、断签、时区回拨、跨零点进行中的专注 |
| 版本与迁移 | 备份格式版本号、v1–v4 旧文件、未知字段、导入原子性、导入失败会不会留半份数据 |
| 序列化契约 | 字段名、时间戳单位（全部 epoch ms）、日键（本地 `YYYY-MM-DD`）、新增字段默认值、老数据读出来是否 `undefined` |
| 不变式 | 六间房、唱片格几何（月夜九格 / 其余十二格）、安全区 band、场景 ID 稳定性 |
| AI 模型 | 供应商模板、Key 存储约定、失败回退闭环、Key 是否会进日志或错误信息 |

**验证命令**（本机实跑，结果见第 5 节）：

```bash
cd /workspace/Flow-Cabin && export HOME=/workspace/.home && npm test && npm run build
```

---

## 2. 问题清单

### 2.1 上一轮已复现、本轮补上回归测试的 9 个缺陷

| # | 问题 | 位置 | 判断依据 |
| --- | --- | --- | --- |
| 1 | `null` / `''` / 布尔值参与 clamp 被当成 `0` | `src/focus/focus-model.mjs:60-65` | `normalizeSettings({focusMin: null})` 曾返回 `1`（clamp 下界），而不是默认的 25 分钟 |
| 2 | `opacity: null` 变成全透明 | `src/record-library.mjs:21-32` | `normalizeStyle({opacity: null})` 曾返回 `0`，整张黑胶不可见 |
| 3 | `newPerDay: null` 变成 `0` | `src/study/study-model.mjs:35,75` | `normalizeStudy({newPerDay: null})` 曾返回 `0`，每日新词额度被永久关掉 |
| 4 | 天空算不出高度时产出 `#NaNNaNNaN` | `src/sky-model.mjs:72-85` | `skyColors({altitude: NaN})` 的插值系数未夹紧时，`toHex` 会把 NaN 拼成 `#NaNNaNNaN` |
| 5 | 没有平台编号的歌单用毫秒当 key | `src/playlist-model.mjs:28-53` | 同一毫秒导入两份文件歌单 → 同一个 `externalIds.playlist` → 后一份覆盖前一份 |
| 6 | `focusStats(undefined)` 崩溃 | `src/focus/focus-model.mjs:252` | 统计面板直接白屏 |
| 7 | `endedSession` 把重读过的状态误判成又结束一轮 | `src/focus/session-log.mjs:53-70` | 状态从存储读回再比较，`sameRound` 不成立时会凭空多出一条专注记录 |
| 8 | `appendSession` 吞掉写失败 | `src/focus/session-log.mjs:45-50` | 写盘失败时仍返回“已保存”，并对外广播 `cabin:focus-session` |
| 9 | study / focus 的随机 id 不可注入 | `src/focus/focus-model.mjs:68-69`、`src/study/study-model.mjs:37-38` | 模型不可测、不可重放；已改为 `makeId` / `makeUid` 注入口 |

### 2.2 本轮新发现并修掉的 4 个缺陷

| # | 问题 | 位置 | 复现步骤 / 判断依据 |
| --- | --- | --- | --- |
| 10 | `focusStats` 没有可用时钟时造出 `NaN-NaN-NaN` 日期 | `src/focus/focus-model.mjs:252-260` | `focusStats(sessions, undefined)`：`startOfDay(undefined)` → NaN → `dayKey` 产出 `"NaN-NaN-NaN"`，星期栏出现假日期 |
| 11 | 音源服务用非 Error 拒绝时，catch 里读 `error.name` 自己再崩一次 | `src/room-playback.mjs:94,145,148,169` | `request()` 以 `undefined` 拒绝 → `catch (error) { … if (error.name === 'NotAllowedError') … }` → `TypeError: Cannot read properties of undefined (reading 'name')`，异常从 `findPlayableSource` 抛给播放器 UI |
| 12 | 备份里的 `roomId` 读到 `Object.prototype`，整间房被悄悄丢掉 | `src/backup-model.mjs:324-333` | `mergeBackupLibrary(current, {library, roomId: '__proto__'}, 'home')`：旧写法 `source.rooms[parsed.roomId]` 命中 `Object.prototype`（真值），于是备份里那间房的盒子与外观**不写进**当前房间，用户看不出任何异常，只觉得“导入后房间是空的” |
| 13 | 天空模型遇到无效日期时高度是 NaN | `src/sky-model.mjs:10-16` | `skyState(new Date('invalid'), null)` → `syntheticSun` 读到 NaN 小时 → `altitude` / `azimuth` 全是 NaN，整条天空状态带 NaN 传下去 |

### 2.3 看过但确认没问题（记录判断依据，避免以后重复怀疑）

| 位置 | 结论 |
| --- | --- |
| `src/backup-model.mjs:249-313` | `restoreBackupMemory` 是真事务：先算完整 `writes`（含 `oldValue`），再逐个写；任一写失败就把**已提交**的那些按 `oldValue` 还原（新键 `removeItem`），并且**不发**任何 `storage` / 自定义事件。回滚失败时也会明说“部分写入无法回滚”。 |
| `src/backup-model.mjs:190-206` | `parseBackup` 在解析阶段就把每个域校验完（版本、focus、study、sound、memory），任何一处不合法直接抛错，**一行都不写**；`buildBackup` 导出前同样清洗。 |
| `src/backup-model.mjs:28-39` | 专注备份只保留 `tasks / sessions / rewards / settings / notes`，**不含 `timer`**：恢复不会让一台机器上的计时器在另一台上继续跑。 |
| `src/focus/focus-model.mjs:227-243` | `minutesByDay` 用 `startOfDay + addDays` 切分本地日，夏令时那天自然是 23/25 小时，不会算错分钟（见 §4 的实测）。 |
| `src/focus/focus-model.mjs:245-251` | `currentStreak` 的“今天未满 1 分钟就从昨天算起”规则与 `STREAK_HINT` 文案一致；断签、跨月、跨年都正确（见 §4）。 |
| `src/ai/ai-model.mjs:87-105` | `normalizeAi` 不接受任何 Key 字段：Key 只在 `AI_KEY_KEY`（网页版 localStorage）或桌面端 safeStorage 里，备份不读它（`backup-model.test.mjs` 有“凭据不进备份”断言）。 |
| `src/ai/ai-model.mjs:180` + `src/ai/ai-transport.mjs:144-146` | 错误与模型回答都过 `redact(text, key)`，Key 不会进日志、不会进信件正文。 |
| `src/ai/smart-turntable.mjs:338`（只读） | AI 不可用或输出不合格时确实回退本机唱片架推荐（`SmartTurntable.jsx:71`、`:154` 两处调用），闭环成立。 |
| `src/focus/souvenirs.mjs` | 纪念物只认四个固定 ID，日期用 `calendarDate` 校验（`2026-02-30` 不算数），写入失败如实返回 `ok:false`，不丢已有纪念物。 |

---

## 3. 实际改动

| 文件:行 | 改动 | 为什么 |
| --- | --- | --- |
| `src/focus/focus-model.mjs:252-260` | `focusStats` 增加“没有可用时钟”的分支：只返回与时间无关的部分（总时长、完成轮数），星期栏留空 | 调用方漏传 `now` 时不再产出 `NaN-NaN-NaN` 这种假日期；面板显示 0 而不是坏日期 |
| `src/room-playback.mjs:94,145,148,169` | `error.name` / `error.message` 改成 `error?.name`，并统一走 `playbackErrorMessage(error)` | 音源服务用非 Error 拒绝时不再自己崩一次；错误文案与其它地方一致，且对真实 Error 的文案没有变化 |
| `src/backup-model.mjs:22-24,330-336` | 新增 `safeRoomId()`；`mergeBackupLibrary` 改用 `own()` 查房间，非法房间名退回当前房间 | 备份文件里的 `roomId` 是外部内容，不能让它读对象原型；同时修掉“整间房被悄悄丢掉”这个静默数据丢失 |
| `src/sky-model.mjs:10-16` | `syntheticSun` 先把时间转成毫秒并判断有效性，无效时按午夜计算 | 无效日期不再让 NaN 高度流进整条天空状态 |
| `src/focus/session-log.mjs:32-45` | `coverThumb` 的图片构造器改为 `doc.defaultView?.Image \|\| globalThis.Image` | 模型层不再硬依赖全局 DOM；这段画缩略图的代码现在能被假文档测到（`CabinRoom.jsx` 的调用方式不变） |
| `src/record-library.mjs:44-48,82-83` | `genresFor` / `matchesLibraryFilters` 允许缺 `data`、缺 `filters` | 缺字段时返回“没有命中”而不是抛 `TypeError` |

> 上一轮已经改过、本轮没有再动的文件：`src/ai/ai-model.mjs`、`src/playlist-model.mjs`、
> `src/room-model.mjs`、`src/scene-catalog.mjs`、`src/study/study-model.mjs`、
> 以及 `src/focus/focus-model.mjs`、`src/focus/session-log.mjs`、`src/sky-model.mjs`、
> `src/record-library.mjs` 的 clamp / 随机 id 等修复。

---

## 4. 新增测试证据

### 4.1 回归测试（每个修过的缺陷都有先失败的测试）

| 测试文件 | 新增用例 | 覆盖的缺陷 |
| --- | --- | --- |
| `src/focus/focus-model.test.mjs` | `missing settings fall back to the defaults instead of collapsing to zero` | #1 |
| | `focus statistics survive a missing session list` | #6 |
| | `focus statistics without a usable clock keep only the timeless parts` | #10 |
| | `task ids come from the injected factory, never from a random source` | #9 |
| | `a session across a daylight-saving switch keeps its minutes` | 时间/统计 |
| | `a streak survives month, year and clock changes` | 时间/统计 |
| `src/focus/session-log.test.mjs` | `a re-read focus state is not mistaken for a second finished round` | #7 |
| | `a session that cannot be written reports the failure instead of pretending it was saved` | #8 |
| | `the cover thumbnail is drawn through the injected document` | 纯度 |
| `src/study/study-model.test.mjs` | `a missing daily limit falls back to the default instead of zero` | #3 |
| | `deck, card and countdown ids come from the injected factory` | #9 |
| `src/sky.test.mjs` | `an unusable sun altitude never produces a broken colour` | #4 #13 |
| `src/record-library.test.mjs`（新） | `a missing opacity keeps the record visible` 等 6 项 | #2 + 库不变式 |
| `src/playlist-model.test.mjs`（新） | `a playlist keeps one identity across imports, however fast they arrive` 等 6 项 | #5 + 歌单契约 |
| `src/scene-catalog.test.mjs`（新） | 六间房、九格/十二格、band 覆盖唱片格、场景不可变等 4 项 | 不变式 |
| `src/room-playback.test.mjs`（新） | `a source that rejects with something other than an Error still ends politely` 等 7 项 | #11 + 音源匹配契约 |
| `src/backup-model.test.mjs` | `a room id from a backup file never reaches the object prototype` | #12 |
| | `an import either lands completely or changes nothing at all` | 原子性 |
| | `every shipped backup version still imports, and a newer one is refused` | 旧版本兼容 |
| | `unknown fields in a backup are ignored, never written back` | 未知字段 |
| | `a restore never brings a running timer back` | 导入语义 |

### 4.2 夏令时与跨天实测（`America/New_York` 2026-03-08 只有 23 小时）

```
本地 01:30 → 04:00 的专注 = 90 分钟（02:00 那一小时不存在）
本地 00:00 → 次日 00:00 = 1380 分钟（23 小时 × 60）
2026-03-08 当天统计 = 90 分钟，streak = 1
week 的七个日期 = 2026-03-02 … 2026-03-08（没有 NaN）
```

跨月跨年：`2025-12-30 / 12-31 / 2026-01-01` 连续三天 → streak = 3；中间缺一天 → streak = 1；
不足 1 分钟（0.5）不算一天。

### 4.3 备份原子性与旧版本兼容（最高优先级）

- **要么整份成功，要么原封不动**：文件里任何一处不合法（信件、纪念物、手记重复 id、任务 `null`、学习记录类型错）都在解析阶段抛出，本机 `storage.data` 一个字节都不动；
  本机自己的存储损坏时（手记 JSON 坏掉）先失败、`writes.length === 0`；写盘中途失败（配额不足）时已写入的域全部回滚，原有内容保持不变。
- **旧版本备份仍可读**：无版本号 / v1 / v2 / v3 / v4 五种文件都能解析，focus / study / sound 正常还原，且不含 memory 域的老文件不会去动本机的记忆存储；v0 / -1 / 5 / 99 / `'4'` / `2.5` / `null` / `true` 一律拒绝并提示版本不支持。
- **未知字段**：顶层、focus 内、memory 内的未知字段既不报错也不写回本机。
- **不恢复运行中的计时器**：`parsed.focus.timer === undefined`，恢复后计时器回到 idle。
- **凭据不进备份**：会话、来信、手记里的 `apiKey` / `credentials` / `accessToken` 全部被丢掉。

### 4.4 变异检查（证明每条回归真的守得住）

`/workspace/.mavis/plans/plan_357f4278/workspace/mutation-check.py`：把每处修复改回旧行为，跑对应测试文件，确认测试变红，然后还原源码。

```
CAUGHT  focus: null 被当成 0                    CAUGHT  record-library: opacity 为 null 变全透明
CAUGHT  focus: focusStats(undefined) 崩溃        CAUGHT  playlist: 没有平台编号就用毫秒当 key
CAUGHT  focus: focusStats 没有 now 就编假日期     CAUGHT  room-playback: 非 Error 拒绝自己再崩一次
CAUGHT  focus: 随机 id 不可注入                  CAUGHT  backup: 备份里的 roomId 读到原型
CAUGHT  session-log: 写失败被吞掉                CAUGHT  sky: 算不出高度就出坏颜色
CAUGHT  session-log: 重读后误判又结束一轮          CAUGHT  sky: 无效日期的高度是 NaN
CAUGHT  study: newPerDay 为 null 变成 0
CAUGHT  study: 随机 id 不可注入
--- 14/14 条回归守住了旧行为，源文件已还原 ---
```

---

## 5. 跑过的命令与结果

| 命令 | 结果 |
| --- | --- |
| `npm test`（根项目，含桌面端） | **通过**。桌面端 354/354；根项目 518 项，517 通过、1 项预期跳过、0 失败 |
| `npm run build`（5 个入口） | **通过**，`✓ built in 55.00s` |
| `node --test src/focus/focus-model.test.mjs` | 16 通过 |
| `node --test src/focus/session-log.test.mjs` | 7 通过 |
| `node --test src/study/study-model.test.mjs` | 22 通过 |
| `node --test src/sky.test.mjs` | 15 通过 |
| `node --test src/backup-model.test.mjs` | 38 通过 |
| `node --test src/record-library.test.mjs` | 6 通过 |
| `node --test src/playlist-model.test.mjs` | 6 通过 |
| `node --test src/scene-catalog.test.mjs` | 4 通过 |
| `node --test src/room-playback.test.mjs` | 7 通过 |
| `python3 mutation-check.py` | 14/14 变异被抓住 |

第一次跑 `npm test` 时桌面端有 6 个失败（`Cannot find module 'node-forge'`）：那是沙箱里
`desktop/node_modules/node-forge` 软链尚未就位导致的环境问题，与本轮改动无关；软链补齐后
`npm run desktop:test` 单独跑 354/354 全绿，随后重跑 `npm test` 也全绿。

---

## 6. 未验证的部分

- **浏览器验收未执行**：本轮没有跑 `npm run test:browser` / `test:promo`（沙箱里没有可用 Chromium）。
  模型层是纯函数，浏览器里只验证了 `coverThumb` 的假文档路径。
- **真实平台未验收**：QQ / 网易云 / Apple Music / Music Assistant 的真实账号、音源匹配成功率、
  智能唱片机的云端真实输出都没有跑过；`room-playback` 的测试用的是假 `request` / `play`。
- **真实系统时间**：夏令时用 `process.env.TZ` 切换验证的是 Node 的本地时区行为，
  没有在跨时区飞行的真实机器上验证。
- **桌面端 safeStorage**：Key 的加密落盘由 `desktop/` 负责，本轮只审查了网页版路径与模型契约。

---

## 7. 遗留风险

1. **`npm test` 是显式文件列表**，本轮新增的 4 个测试文件（`src/record-library.test.mjs`、
   `src/playlist-model.test.mjs`、`src/scene-catalog.test.mjs`、`src/room-playback.test.mjs`）
   暂时不会被 `npm test` 跑到（`package.json` 不在我的归属内）。集成时需要把这四个文件加进
   `package.json` 的 `test` 脚本；在此之前用
   `node --test src/record-library.test.mjs src/playlist-model.test.mjs src/scene-catalog.test.mjs src/room-playback.test.mjs` 单独跑。
2. **随机 id 的兜底仍是 `Math.random()` + `Date.now()`**（`focus-model.randomId`、`study-model.randomUid`）。
   所有调用点都已支持注入，但默认路径依然不是纯函数；若将来要在多窗口之间保证 id 不撞，
   需要换成带种子的生成器。
3. **统计模型对缺 `durationMs` 的会话不设防**（见 §8 越界发现 2）。目前所有会话都经过
   `normalizeSessionRecord`，所以线上不会出现；一旦有人直接传原始会话，分钟数会变成 NaN。
4. **`focusStats` 的“今天完成轮数”按 `end` 归日**，而分钟数按午夜切分。一轮跨零点的专注，
   分钟数分两天、轮数只算结束那天——这是既有口径，本轮没有改，也写了测试固定住。
5. **备份导入的“全有或全无”目前只覆盖记忆域**。唱片架在用户确认之前就先落地了（产品既有行为，
   文档写明“唱片先合并进来”）；专注 / 学习 / 声音三个域由各自的存储钩子分别写入。

---

## 8. 越界发现（只报告，没有动手改）

1. **`package.json` 的 `test` 脚本是显式文件列表**（`node --test <一长串文件>`），
   新增测试文件不会自动被跑到。本轮新增的 4 个文件需要集成时补进脚本（见 §7.1）。
2. **`src/focus/stats/stats-model.mjs`（不属于本专项）对缺 `durationMs` 的会话不设防**。
   复现：
   ```js
   const now = new Date(2026, 9, 20, 12).getTime();
   byTask([{ start: now - 3600000, end: now, completed: true }], []);   // → minutes: NaN
   weeklyReport([{ start: now - 3600000, end: now, completed: true }], [], now).totalMinutes; // → 0（应为 60）
   timeOfDay([{ start: now - 3600000, end: now }]).slots                 // → 上午那格是 NaN（JSON 里是 null）
   ```
   原因：`byTask` / `timeOfDay` / `slices` 直接用 `s.durationMs`，`weeklyReport` 的 `sumMinutes` 同理。
   目前所有会话都来自 `normalizeSessionRecord`（一定带 `durationMs`），所以线上不会触发。
3. **两个热力图的一周起点不同**：`stats-model.yearHeatmap` 从周一开始（统计面板在用），
   `study-model.heatmap` 从周日开始（注释写“Focus heatmap”）。同一份专注数据在两个界面里
   会差一列。建议统一，或把 `study-model.heatmap` 的注释改掉（它其实只被测试用到）。
4. **房间画布尺寸 1448×1086 在多处重复定义**：`src/room-model.mjs:2` 的 `ROOM_SIZE` 是唯一出处，
   但 `src/RoomScene.jsx:65,82,86`、`src/CabinAtmosphere.jsx:9,82`、`src/CabinAtmosphereSky.jsx:34`
   各自写死了这两个数字。`ROOM_SIZE` 本身只被 `room-model.mjs` 内部使用。
   这三个文件属于 `motion-auditor` / `interaction-auditor` 的归属范围。
5. **`src/BackupDialog.jsx` 的导入顺序**：`importItems()` 先把唱片写进曲库，然后才问用户是否替换
   专注 / 学习 / 声音 / 记忆。模型层已经保证“解析阶段不写、记忆域要么全写要么全回滚”，
   但“整份导入全有或全无”需要改这个组件（不在本专项归属内）。
6. **`src/ai/smart-turntable.mjs`（只读审查）**：AI 不可用 / 输出不合格时回退本机推荐的闭环是成立的
   （`localRecommendation` + `SmartTurntable.jsx:71,154`），本轮没有发现需要改的地方；
   如果要加严（例如 0 首输出时的回退断言），需要另行授权。
7. **`redact()` 对长度 ≤ 6 的 Key 不做直接替换**（`src/ai/ai-model.mjs:180`），
   只靠 `sk-` / `Bearer` 正则兜底。真实 Key 远长于 6 个字符，判断为可接受，未改。

---

## 9. 改动清单

**改动的源文件（6 个）**

- `src/focus/focus-model.mjs`
- `src/focus/session-log.mjs`
- `src/sky-model.mjs`
- `src/room-playback.mjs`
- `src/backup-model.mjs`
- `src/record-library.mjs`

**改动的测试文件（5 个）**

- `src/focus/focus-model.test.mjs`
- `src/focus/session-log.test.mjs`
- `src/study/study-model.test.mjs`
- `src/sky.test.mjs`
- `src/backup-model.test.mjs`

**新增的测试文件（4 个）**

- `src/record-library.test.mjs`
- `src/playlist-model.test.mjs`
- `src/scene-catalog.test.mjs`
- `src/room-playback.test.mjs`
