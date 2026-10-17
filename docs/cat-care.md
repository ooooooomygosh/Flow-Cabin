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
