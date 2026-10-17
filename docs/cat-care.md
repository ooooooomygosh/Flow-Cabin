# 小猫照顾：小鱼干、心情与喂食

逻辑在 `src/cat/cat-care.mjs`（纯函数，测试：`src/cat/cat-care.test.mjs`），状态由 `src/cat/useCatCare.js` 托管（小屋里只运行一次 `useCatCareHost()`）。

## 规则

| 项目 | 规则 |
| --- | --- |
| 心情 | 0–100，初始 60。每小时缓慢下降 1 点，降到 30（「无精打采」）就停住；不会生病，也不会离家。 |
| 档位 | `happy` 开心（≥70）· `ok` 还不错（≥45）· `droopy` 无精打采（<45） |
| 喂一条 | 花 1 条小鱼干，心情 +12。每天最多 5 条，喂满后显示「小猫今天已经吃饱啦，明天再喂吧～」，不扣小鱼干。 |
| 摸摸 | 点小猫 +2，每天最多计 10 次。 |
| 专注 | 每完成一轮（`cabin:focus-session` 且 `completed`）+8，同一轮只算一次。 |
| 小动作 | 累计喂 3 / 10 / 25 / 50 条，解锁「伸懒腰 / 打滚 / 洗脸 / 揣手手」（`FEED_ACTIONS`）。 |
| 兑换 | 配饰和窗景除了按等级解锁，也可以用小鱼干提前兑换：每级 3 条（`unlockPrice`），在小猫面板里点两次确认。兑换记录保存在专注数据的 `rewards.bought` 里。 |

喂食入口：小猫面板的「喂一条」按钮，或把面板里的小鱼干拖到小猫身上（拖拽数据类型 `application/x-cabin-fish`）。两种方式都发出 `cabin:cat-feed-request`，由同一段逻辑处理。

## 存储：`localStorage['flow-cabin-cat-mood-v1']`

格式已锁定（见 `docs/events.md`）：`{ v: 1, mood, tier, updatedAt, feeds: [{ at, fishLeft }], totalFeeds, unlockedActions }`，`feeds` 保留最近 400 次。周报可以用 `feedsBetween(readCare(), weekStart, weekEnd)` 读取，或直接统计 `cabin:cat-fed` 事件。每天摸摸的次数和已经加过心情的专注记录，另存在 `flow-cabin-cat-care-meta-v1`。

## 给美术的接口（先用占位，帧图到位后直接替换）

| 位置 | 占位 | 说明 |
| --- | --- | --- |
| `.room-cat.cat--eating` | `.pet-life` 上下点头（CSS） | 喂食后持续 `EAT_MS`（2400 ms，见 `RoomCat.jsx`）。放进食帧时，用 `.cat--eating .pixel-cat` 选择器，和 `docs/art-direction.md` 里小猫的格子尺寸一致（32 格 × 4 美术像素）。 |
| `.cat-eat-fish` | CSS 画的小鱼，`steps(4)` 被吃掉 | 小猫身前的鱼，可以换成 4 帧精灵图。 |
| `.room-cat.cat--drop-target` | 虚线描边 | 小鱼干拖到小猫身上时显示。 |
| `.room-cat.cat--by-desk` | 暂无 | 心情「开心」且正在专注时，场景 CSS 可以把小猫挪到书桌旁。 |
| `.room-cat[data-mood=happy]` | 跟着 `--pet-energy`（`cabin:playback`）左右摇摆 | 可以换成甩尾巴的帧。 |
| `.room-cat[data-mood=droopy]` | 颜色稍暗 | 无精打采时的样子。 |
| 小动作 `stretch / roll / groom / loaf` | 暂时只有文字 | 解锁后可在待机时随机播放，帧图到位后接到 `pet-model.mjs` 的 pose。 |

## 帧图文件（`public/cat/`，透明 PNG，1x，最近邻缩放；美术在 PR #55）

清单在 `src/cat/cat-art.mjs`。构建时用 Vite 的 `import.meta.glob` 检查 `public/cat/*.png` 是否存在：文件在，对应格子就自动启用；不在，小屋继续画占位小猫，也不会请求图片。所以 #55 合并后，不用改代码就会生效。

| 文件 | 尺寸 | 什么时候出现（`catArtPose`） |
| --- | --- | --- |
| `cat-sleep-books.png` | 64×64 | 睡觉（夜里或长时间没有操作） |
| `cat-wait.png` | 64×64 | 心情「还不错」，待机 |
| `cat-desk.png` | 64×64 | 心情「开心」，正在专注 |
| `cat-rub.png` | 64×64 | 心情「开心」时待机，或刚被摸过 |
| `cat-droopy.png` | 64×64 | 心情「无精打采」 |
| `cat-eat.png` | 512×64（8 帧横排，每帧 64×64，120 ms） | 喂食后 `EAT_MS` 内播放。CSS 用 `steps(8)`，帧数要改的话，同时改 `CAT_EATING.frames` 和 `cat-care.css`。 |
| `sticker-best-day.png` / `sticker-streak.png` / `sticker-fed.png` | 32×32 | 给小屋日记用的贴纸（最好的一天、连续专注、喂过小猫），清单在 `STICKERS`。 |

## 状态细节（bini 评审后）

- 吃完（`EAT_MS` 2.4 秒）后有约 1.5 秒「吃饱」状态（`FULL_MS`）：`.cat--full`，美术姿势 `cat-rub`；学会「打滚」后加 `.is-roll`，打一个滚。
- 心情优先于夜间/发呆睡觉：`happy` 和 `droopy` 夜里照样显示 `cat-rub`（专注时 `cat-desk`）和 `cat-droopy`，只有「还不错」才在书上睡（`cat-sleep-books`）。
- 开心时的尾巴摇摆只在音乐播放时出现（`.room-cat.is-playing[data-mood=happy]`）。
- 拖小鱼干：`dataTransfer` 同时写 `application/x-cabin-fish` 和 `text/plain`（`cabin-fish`）。小猫面板是模态窗口，打开时房间不可交互，所以由面板在整页监听：小鱼干放在小猫所在区域就算喂食。有真实鼠标拖拽的 Playwright 测试覆盖。
- 心情衰减后保持存储新鲜：加载时和每 10 分钟用 `refreshCare()` 结算一次；档位变了就写回 `flow-cabin-cat-mood-v1`（`mood`、`tier`、`updatedAt`），并发 `cabin:cat-mood`。`getCatMoodNow()` 返回带衰减的 `{ mood, tier }`，只读不写。

## 跟着节拍（两只猫共用一个节拍时钟）

节拍来自房间的节拍时钟 `src/player/beat-clock.mjs`：唱机音频由 `src/player/beat-tracker.mjs` 从分析器的低频段测出 `bpm` + `beatAt`，经 `cabin:playback` 广播；生成的 Lo-fi 电台用它自己的段落速度。`beatSynced()`（`src/cat/beat-sync.mjs`）只在「正在播放 + 速度是真的」时为真：

| 情况 | 精灵小猫（PixelCat） | PNG 小猫（`public/cat/`） |
| --- | --- | --- |
| 测到节拍 / Lo-fi | `groove`：每半拍一帧，拍点上点头 | 开心：`cat-groove.png`（4 帧 64×64：头左 / 中间低头 / 头右 / 中间低头，每拍 2 帧）；还不错：同上 |
| 播放中但没有节拍（`estimated`、跨域音频不能分析、刚换歌还没测出） | `listen`（美术加到 `cat-sprites.mjs` 之前用 `idle`），静止 | `cat-listen.png`（闭眼听歌），静止 |
| 暂停 / 没在放 | 原来的发呆 / 睡觉 | 按心情 |

- 不再用固定 96 BPM 假装跳舞：`grooveFrame` 没有速度时停在第 0 帧。
- 开心时的尾巴摆动：Web Animation，一个周期 = 2 拍，每半拍一步，−3° / +3° 的峰值正好落在拍点上；漂移超过 35 ms 就拉回拍上（`lockToBeat`）。吃饱后的弹跳：每拍一次。
- `cat-groove.png` 或 `cat-listen.png` 还没放进来时，PNG 层返回 null，由同一节拍时钟上的精灵小猫代替。
- 减少动态效果：全部不动。小猫 `.room-cat` 上的 `data-music`（`beat` / `free`）和 `data-beat-motion`（`sway` / `groove` / `full`）可供测量拍点偏差。

### 节拍精度（bini 复测后）

- **测速**（`src/player/beat-tracker.mjs`）：自相关先粗估速度，再用最近 6 秒的强起拍点做最小二乘拟合，得到精确的速度和相位（误差几毫秒）。**置信门槛**：最近 4 秒里至少 4 个强起拍点，而且多数间隔是整数拍；鼓点停了 2 秒就失去置信。所以持续的音调（如 220 Hz）和噪声不算节拍，小猫只闭眼听。
- **听到的时刻**：分析器读数用 `performance.now()` 计时（元素的 `currentTime` 太粗，不能用来定拍），再加上 AudioContext 的 `baseLatency + outputLatency`，也就是拍子真正从扬声器出来的时间。用点击音轨实测，分析器测到的起拍点和 `currentTime` 只差约 +5 ms。
- **稳定的时钟**（`src/player/beat-clock.mjs`）：整个过程只有一个锚点，每次只按「两拍」整数平移，所以奇偶拍（4 帧 = 2 拍）永远不会翻。小于 8 ms 的误差忽略；更大的误差每次只修正 20%；超过 1/4 拍、连续 4 次都这样，才算真的换了相位，直接对齐。速度变化超过 3%，或者 bpm 变成 0，就重新锚定。
- **跳曲和拖进度**：换歌会重置测速；拖进度（媒体时间往回跳，或一次跳超过 600 ms）也会重置。重置后 bpm 为 0，小猫闭眼听，约 3.5 秒后重新锁定。
- **Lo-fi**：取 Tone 走带的四分音符网格在「正在播放的时刻」的位置，用 `getOutputTimestamp`；拿不到时用 `currentTime` 加延迟。这样 lo-fi 也有真实相位（`beatAt`），不再只有速度。
- **Web Animation 只在必要时调整**：速度变化超过 0.5%，或者相位漂移超过 12 ms（`lockToBeat`）。
- **自动测试** `npm run test:beat`（`scripts/beat-sync-regression.mjs`，已进 CI 和 `qa`）：用生成的 120 / 90 BPM 点击音轨、220 Hz 音调测试，也测拖进度和跳曲。对比 PNG 小猫和画布小猫每次换帧的时刻与「听到的半拍」：平均 < 20 ms、p95 < 50 ms；音调时只闭眼听；拖进度和跳曲后先闭眼听，再重新锁定。
