# 心流小屋 Flow Cabin：竞品与设计原则调研

> 调研日期：2026-10-26。数据来自 Steam 商店页、评测聚合、媒体报道、官方博客和设计文章，来源见文末。标「⚠」的数字是二手或厂商自报，只适合看方向。

---

## 0. 一页结论（TL;DR）

1. **最接近的成功案例都只有一个主循环，其他功能都挂在它上面。** Spirit City 是“开计时器专注，房间和精灵随时间生长”；Rusty's Retirement 和 Ropuka 是“挂在屏幕边上，你工作，它自己长”；Finch 是“照顾自己，小鸟去冒险”。没有一款产品把“家具”“桌宠”“日记”做成三个并列的大系统。
2. **用户买的是陪伴，不是功能。** Lofi Girl、Chill Pulse 和 Spirit City 的好评高频词都是 cozy、relaxing、像有人陪着学（body doubling），没有人夸“功能多”。
3. **差评集中在性能、平台和付费上，不是功能少。** Spirit City 的主要差评是 CPU/GPU 占用高、音频卡顿、没有移动端、DLC 贵。Finch 的主要差评是丢档、断签后归零、订阅扣费。所以一个常驻桌面的音乐和专注工具，**轻量、稳定、不丢数据本身就是高级感的一部分**。
4. **“不让人愧疚”可以做，也有数据支撑。** Finch 的鸟不会死，也不会难过，它的 D1/D7 留存约 54%/37%（⚠ 第三方估算），高于 Duolingo。Duolingo 自己的实验显示，允许装两个“连胜冻结”反而让日活上升 0.38%。Forest 的“树会死”很有效，但也带来“讨厌杀死树”的流失。
5. **建议的主循环**：**放一张唱片，专注一段，这段时间被“压制”成架上的一张唱片或一页手记，小猫和房间随累计时长慢慢变暖。** 音乐、专注、收藏、日记这四件事会合成同一个动作。家具和房间变成累计时长的自然结果，不再需要单独的货币系统。

---

## 1. 逐个竞品：主循环、刻意不做的、好评和差评、对心流小屋的启示

### 1.1 Spirit City: Lofi Sessions（Steam，最接近的对标）
- **数据**：英文好评率 97%（9,189 条），近 30 天 98%，Metacritic 80；本体 A$16.99，另有 4 个各 A$11.79 的场景 DLC。
- **主循环**：开 Session 计时器做一件事 → 获得 XP 并升级 → 拿到 tickets（Spirit Credits）→ 解锁装扮和家具。**精灵收集**是巧妙的地方：每只精灵喜欢一种特定的“情境组合”，比如“傍晚 + 点着壁炉 + 风声”。游戏给提示，你凑出组合并让它继续运行，精灵就会出现。这样“换氛围、听不同的声音”本身就成了收集行为，不需要另外设计玩法。
- **刻意不做的**：没有内购商店，评测者特别赞赏 “no in-game shop to sully the experience”；没有失败惩罚；没有社交排行。
- **好评**：放松、cozy（53 次提及）；适合专注和学习（43 次）；计时器可调（44 次）；音乐和环境音（44 + 39 次）；对 ADHD 等神经多样性用户友好（28 次）。
- **差评**：角色自定义少（44 次）；性能差、资源占用高（19 次），Mac 和低端本问题明显；电脑负载高时音频跳帧；没有移动端（26 次）；担心 DLC 太贵、以后出现付费商店；文字不能放大。评测者另外希望加日历、每日重复任务、节日主题。Stackup 的评测者提到：装修太好玩，会把专注时间吃掉；默认 lofi 听着容易犯困；To-Do 和日记基本没用。
- **启示**：
  - **把情境组合用作发现机制**，可以直接借给小猫：雨天 + 夜晚 + 爵士唱片时，小猫会蜷在唱片机旁。这能把“听什么、在哪个房间、什么天气”和收藏连起来，**而且不需要新增货币**。
  - **To-Do 和日记做浅了没人用，做深了又分散注意力。** 日记应该是专注结束后自动生成的一页，加一句可选的话，而不是一个独立的写作 App。
  - **装修是双刃剑**：要限制在休息时段或专注结束后进行，或者让房间“自己长”。
  - **性能就是口碑**：Electron 桌面端要严格控制常驻 CPU 和 GPU 占用。

### 1.2 Chill Pulse（Steam）
- **数据**：Overwhelmingly Positive（约 4,600 条，95%）；约 £4–5。
- **主循环**：写待办并设定时间 → 完成后打勾 → 解锁新环境、新歌曲和新功能 → 休息时给女孩做咖啡，或读藏在场景里的日记碎片（她的背景故事）。
- **好评**：屏幕上有个“一起学习的人”，有 body doubling 的感觉；更像生产力工具而不是游戏。
- **启示**：**角色在“和你一起干活”**是核心情绪价值。小猫在你专注时应该也在做一件安静的事，比如趴在书上、看窗外、陪你听歌，而不是吵着要喂食。**休息时有一个小仪式**（做咖啡）很适合拿来设计 5 分钟的休息。

### 1.3 Rusty's Retirement（Steam）
- **数据**：96% 好评（约 7,856 条）；首发 5 天日均约 2 万份，约 4 个月卖出约 33 万份；售价 $7；China 占销量约 26%，日韩台合计约 20%（GameDiscoverCo）。
- **主循环**：窗口固定在屏幕底部的一条，种子和自动化让农场自己运转，你只是偶尔瞄一眼、点一下。
- **设计哲学**：游戏只要求你愿意给出的那一点注意力；能深能浅，休闲玩家和 min-max 玩家都能玩。
- **差评**：全部解锁后会无聊；不支持离线进度。
- **启示**：**占据屏幕边缘，而不是屏幕中心。** 心流小屋的桌面形态应该是一条小窗或角落里的小屋，而不是全屏房间。**离线时间也应该被尊重**：关掉 App 回来时，小猫睡了一觉、植物长了一点，要给“欢迎回来”，而不是“你错过了”。

### 1.4 Ropuka's Idle Island（Steam）
- **数据**：Overwhelmingly Positive；约 £2；2025-01-29 发售。
- **主循环**：一个可以放在桌面任意位置的“可玩贴纸”，青蛙自己割草，草作为货币升级工具或装饰小岛，偶尔睡午觉。
- **启示**：**角色有自己的生活节奏**（会午睡），比“对你的行为做出反应”更像活物。小猫有一套与时间和天气挂钩的作息，比加更多互动按钮更能营造温馨感。

### 1.5 Bongo Cat（Steam）
- **数据**：2025 年一度是 Steam 在线人数前五，日均在线十几万（⚠ 媒体数据，有人质疑有刷量）。免费，开发者称月净收入只有约 $2–4k，基本不赚钱。
- **主循环**：你打字或点击，猫就拍桌子；按活跃度掉落帽子（普通 90%……传说约五十万分之一），帽子可以在 Steam 市场交易。
- **启示**：
  - **对键盘的即时反馈本身就很解压**，心流小屋的桌宠反应打字方向是对的。
  - 但它的病毒式增长主要来自**可交易的稀有掉落**，这其实是类博彩机制，跟“高级温馨”的定位冲突，**不建议学**。可以学“用得越久越有一点小惊喜”，但惊喜应该是**不可交易、无稀有度焦虑**的，比如小猫偶尔叼来一张明信片。

### 1.6 Mini Cozy Room: Lo-Fi（Steam）
- **数据**：Overwhelmingly Positive（约 3,100–3,500 条）。桌面小房间 + 番茄钟 + 便签 + 待办 + 宠物 + 多人一起工作。Spirit City 官方和它做了捆绑包，说明两者用户高度重合。
- **启示**：这一品类里，**“桌面小房间 + lofi + 番茄钟”已经是红海标配。** 心流小屋的差异化只能来自**“真实音乐库（QQ 音乐、网易云、本地、Apple Music）+ 逐字歌词 + 唱片收藏”**，这是 Steam 上这几款 lofi 产品都没有的。

### 1.7 Lofi Girl、lofi.cafe、lofi.co、Flocus、LifeAt（氛围学习空间）
- **Lofi Girl**：2017 年起 24 小时直播，疫情期间爆发，订阅超 1,000 万。研究者认为它的吸引力在于**永远在线、永远有聊天室**，提供 body doubling 和“准社交”的陪伴感，用户和一个 10 秒循环动画建立了关系（BPS / UCSC）。
- **lofi.co**：背景 + 环境音 + BGM 混音，付费 $3.99/月，**2024-05-22 关停**（约 2.6 万月活）。说明**单纯的“氛围壁纸 + 混音”很难商业化**。
- **lofi.cafe**：复古颗粒感视觉 + 切换 YouTube 电台 + 番茄钟。
- **Flocus**：首页仪表盘、专注模式、氛围模式三档切换；主题、番茄钟、待办、专注统计、环境音、Spotify 歌单。
- **LifeAt**：上百个虚拟空间，有预录的 Study with Me 场景（包括明星和偶像主题）。
- **启示**：
  - **模式切换要极简**：Flocus 的三档开关很值得借鉴，可以做成“小屋（看）/ 专注（做）/ 唱片（听）”三个状态，而不是 8 个房间加十几个菜单入口。
  - 心流小屋缺少“有人在一起”的感觉。可以低成本加一个**“此刻有 N 人在小屋专注”**的匿名提示，或者一个可选的同桌自习房间。不要做聊天，免得变成社交产品。

### 1.8 Forest
- **主循环**：开始专注时种下一棵树，中途离开 App 树就会枯死；成功后得到金币，可以解锁树种或捐出去种真树；森林时间轴就是专注历史。
- **机制本质**：损失厌恶。有效，但有代价：用户说“讨厌杀死树”；枯树会永久留在森林里，要花 seeds 才能清掉；社区里有 “they got greedy” 的不满。
- **启示**：保留**“专注成果可视化累积”**（森林换成唱片架），去掉**“失败的永久留痕”**。被打断的专注可以只是“这张唱片没录完，放回抽屉”，不显示、不扣分。

### 1.9 Session、Flow（Mac 菜单栏番茄钟）
- **Session**：开始前写意图，结束后问“学到了什么”；同步 Apple Calendar；自动静音 Slack；屏蔽网站和 App。Timing 的 2026 年评测把它列为“深度集成”最佳。
- **Flow**：极简，无 Dock 图标，菜单栏右键即可开始；屏蔽黑名单 App；统计；全屏休息；iCloud 和日历同步；基础功能永久免费。
- **启示**：**“意图 → 专注 → 一句话回顾”**正好可以替代心流小屋现有的独立日记模块。日记不再是一个空白页，而是专注的副产品。**菜单栏或托盘一键开始**是桌面端的必备入口。

### 1.10 Tide
- 番茄钟 + 白噪音 + 自带音乐，“Music Fusion”可以让白噪音和音乐同时播放；有“沉浸模式”（离开即算专注失败）；用户夸免费版无广告、限制少、看着很平静。
- **启示**：**环境音叠加在真实音乐上**是心流小屋应有的基础能力：雨声 + 你自己的歌单。

### 1.11 Finch（自我关怀宠物）
- **数据**：约 1,000 万月活（⚠）；D1/D7 约 54%/37%（⚠ Deconstructor of Fun）；约 4.6 星，82% 正面（Appbot 抽样）。
- **主循环**：完成自我关怀小任务 → 进度条填满 → 小鸟出发冒险（例如 6 小时计时）→ 晚上回来讲经历；奖励是 rainbow stones，用来买衣服和家具。**桌面小组件**会实时显示小鸟状态，是不打扰的回访入口。
- **不愧疚设计**：鸟不会死，不会难过，也没有缺勤惩罚；任务目标由用户自己定。
- **差评**：234 天连胜因断两天归零、无法恢复；丢档；订阅扣费和退款困难；客服回复慢。也有评论指出，“每天都要完成”本身仍然可能带来压力。
- **启示**：
  - **宠物出门冒险**是很好的“约定式回访”：专注满 X 分钟后小猫出门，带回一张明信片、一首推荐歌或一句话。
  - **用户的情感投入越深，丢数据就越致命。** 云同步、导出、绝不清零，都是必须做的。

### 1.12 Endel、Brain.fm（功能性音乐）
- **Brain.fm**：卖“科学”，用 neural phase locking 和振幅调制；引用了 2021 年 *Communications Biology* 上一篇关于 ADHD 的研究，但那项研究测的是同类音乐，不是 Brain.fm 本身。差评说重复、让人分心、头疼；订阅陷阱。定位论点是“普通音乐为了好听而设计，所以会抢走你的注意力”。
- **Endel**：根据时间、天气、心率、昼夜节律实时生成环境声，深度集成 Apple 生态，几乎没有可选项。
- **启示**：心流小屋**不要和它们比“科学”**，而是**站到它们的反面**：“你自己喜欢的音乐，加上不打扰的陪伴”。可以借鉴 Endel 的**情境自适应**：专注时自动切到“无人声 / 纯音乐优先”，或者把歌词收起只留氛围；休息时恢复正常播放。另外可以学 Endel 的“少选项”。

### 1.13 音乐体验标杆（Apple Music、网易云、Spotify、Plexamp）
- **Apple Music Sing / 逐字歌词**：每个音节与音乐同步；和声单独拆出来，用更小的字号动画；对唱分左右对齐；长音高亮并轻微起伏；可以降低原唱人声。
- **网易云**：“我喜欢的音乐（红心）”是一切推荐的种子；每日推荐偏准确，私人 FM 偏多样，像一种“托管模式”；心动模式基于红心歌曲向外扩展，把“只听我喜欢”的用户引到推荐上。
- **Spotify**：心形改为“＋”，保存后变成绿色对勾，“保存”和“喜欢”的合并引起困惑（社区帖）。桌面端有 Miniplayer。
- **Plexamp**：响度均衡、真无缝播放、Sweet Fades（上一首进入静音段时让下一首淡入）、7 段 EQ。用户说 Sweet Fades “改变了我和自己曲库的关系”；更新后功能失效也被大量抱怨。
- **LyricsX、Lyric Fever（Mac）**：Dock 上方透明叠加的卡拉 OK 式桌面歌词；菜单栏单行歌词；可调偏移；双击跳转到某一句；简繁转换；歌词源支持网易云和 QQ 音乐。

---

## 2. 横向设计原则（14 条）

| # | 原则 | 证据 |
|---|---|---|
| 1 | **一个主循环，其余都是它的装饰** | Spirit City、Chill Pulse、Finch 都只有一个“做事 → 被温柔回报”的循环；Mini Cozy Room 和 Flocus 的功能都很克制 |
| 2 | **用最少的注意力，待在边缘** | Calm Tech 原则 1 和 3；Rusty 和 Ropuka 只占屏幕边缘就能卖几十万份 |
| 3 | **安全：没有失败、没有损失、没有威胁** | Project Horseshoe 的 coziness 三要素之一；Forest 的枯树引起反感；Finch 的“鸟不会死” |
| 4 | **富足：不制造稀缺和时间压力** | Lost Garden：cozy 游戏避免资源稀缺和紧迫截止时间；Spirit City 不设商店 |
| 5 | **柔和：低对比、暖光、持续而有来源的声音** | Lost Garden：雨、火、猫的呼噜声，慢节奏，空间私密 |
| 6 | **陪伴感大于功能感（body doubling）** | Lofi Girl 和 Chill Pulse 的好评核心；BPS 研究 |
| 7 | **角色有自己的生活，而不是一个“需求很多”的宠物** | Lost Garden 把“必须维护、需求多的同伴”列为破坏 coziness 的因素；Ropuka 的午睡 |
| 8 | **用情境组合来发现，而不是用货币购买** | Spirit City 的精灵偏好；减少货币，增加惊喜 |
| 9 | **成果可视化累积，失败不留痕** | Forest 森林时间轴（正面）、枯树（负面） |
| 10 | **约定式回访，而非通知轰炸** | Finch 的冒险计时 + 小组件；Lost Garden 把通知和弹窗列为破坏因素 |
| 11 | **给予宽容（slack）比给予惩罚更能留住人** | Duolingo：两个冻结让 DAU +0.38%；宾大 / UCLA 关于 slack 的研究 |
| 12 | **性能、稳定、不丢数据就是高级感** | Spirit City 性能差评；Finch 丢档和归零差评；Calm Tech 原则 6：“失效时也能工作” |
| 13 | **克制的排版 + 微动效 = 高级** | Things 3：大量留白、粗字体、少量色块、窗口最小尺寸时轻轻回弹；2017 年 Apple 设计奖 |
| 14 | **默认就美，选项藏起来** | Endel 几乎零选项；Flow 无 Dock 图标；Flocus 三档开关 |

---

## 3. 不制造愧疚的留存机制（针对心流小屋的具体建议）

1. **唱片架（核心收藏）**：每完成一次专注，就“压制”一张唱片。封面取当时播放最多的专辑封面、房间、天气和时段，侧标签写任务名，背面写可选的一句回顾（来自 Session 式的结束提问）。唱片架就是专注史、听歌史和日记三合一。被中断的专注不生成唱片，也不显示失败。
2. **周唱片 / 月专辑**：每周自动把唱片装订成一张“B 面合集”，回顾“这周你和 XX 歌一起专注了 6 小时”，可以分享。这在情感上接近网易云的年度报告，但更高频。
3. **小猫的情境发现**：20–40 种小猫“瞬间”（姿势或行为），由“房间 × 天气 × 时段 × 音乐风格 × 专注时长”触发。给模糊提示，比如“它似乎喜欢下雨的深夜”。收集到的瞬间放进相册。**零货币**。
4. **小猫出门**：单日专注满 60–90 分钟后，小猫自己出门（可关闭），下次打开时带回一样东西：一张房间明信片、一首基于红心生成的“它在路上听到的歌”、一个新家具。这就是 Finch 的冒险，唯一的提醒是一个可关闭的系统通知：“小猫回来了”。
5. **房间随累计时长自然变暖**：累计 5、20、50、100 小时时，房间多一盏灯、多一盆植物，窗外的季节在变。**不要每日签到，不要连胜。** 如果一定要连续性指标，做成“本周专注了几天”（每周归零，不会断），而不是“连续第几天”。
6. **欢迎回来，而不是“你错过了”**：离开 3 天后打开，小猫在睡觉，醒来伸个懒腰；房间落了一点点灰，点一下就掸掉，有趣但无惩罚。绝对不出现“你已经 X 天没来了”。
7. **随真实时间变化（Animal Crossing 式）**：房间光线随真实时间和季节变化，节日有小装饰（满足 Spirit City 用户想要节日主题的诉求）。这能给人“想看看今天什么样”的理由，又不是逼人每天来。
8. **轻量的“有人在”**：匿名的“此刻有 N 只小猫陪主人专注”，或者可选的同桌自习（只显示对方小屋的剪影和计时）。不做聊天和排行。
9. **数据安全承诺**：本地 + 云端双份保存；一键导出唱片架（JSON 或图片）；**任何数据都不会因为不活跃而被清除**。

---

## 4. 听歌、歌词、收藏的必备体验

**播放基础（这是“高级”的底线）**
- 真无缝播放（尤其是现场专辑和古典）；可选交叉淡化，或 Plexamp 式的“遇到静音段才淡入”；**响度均衡**，避免切歌时音量忽大忽小。
- **从上次的位置继续**：重启后恢复到上次的歌、上次的进度和上次的队列，第一次点播放就是“接着听”。
- 最近播放、最常播放（按周和月）、搜索时优先显示我的红心歌曲。
- 媒体键、系统“正在播放”中心、托盘或菜单栏迷你播放器（封面 + 播放暂停 + 红心 + 单行歌词）。
- 专注时一键“安静模式”：优先播放纯音乐、降低人声（参考 Apple Sing 的人声调节，但不是必须）、收起歌词。

**收藏**
- **红心是一级动作**：全局快捷键、迷你播放器、桌面歌词条和小猫身上都能一键红心，有清晰的状态反馈（Spotify 合并“保存”和“喜欢”造成的困惑要避免）。
- 红心双向同步到来源平台（QQ 音乐、网易云）；本地文件也可以红心。
- 红心可以作为 AI 歌单和“心动模式”的种子，**用红心驱动推荐**，不要让用户填问卷。
- 唱片架和专辑实体感：翻转封面、放上唱机的动效、黑胶边缘和手写标签，这就是 Things 3 式的微动效。

**歌词**
- 逐字（逐音节）高亮，用柔和的渐变扫过，而不是生硬的变色；和声或背景人声用小字号单独一行；对唱左右区分；长音轻微起伏。
- 桌面歌词：透明叠加、可锁定穿透、字体和颜色和小屋主题联动；可调全局偏移和单曲偏移；双击某一句跳转；翻译和罗马音可切换；简繁转换。
- 歌词来源回退链：平台逐字 → 平台逐行 → 本地 LRC → 网络源；缺歌词时显示专辑信息，而不是空白。
- 专注时，桌面歌词可以自动收起，或者淡到只剩一行，符合“最少注意力”原则。

---

## 5. 要避免的反模式

1. **功能并列堆叠**：8 个房间、闪卡、日记、AI 歌单、桌宠、家具全部放在一级导航里，就是“四不像”的根源。建议一级入口只保留**小屋、专注、唱片架**三个，其余降为二级或者直接砍掉。闪卡和学习工具与“音乐 + 专注”的关联最弱，是首选的砍掉对象。
2. **多种货币**：金币 + 钻石 + 碎片 + 体力，会把 cozy 变成“经济系统”。Lost Garden 明确警告，外在奖励占主导会破坏 coziness。最多用**一种隐形的累计量（专注小时数）**驱动解锁。
3. **可交易、带稀有度的掉落**（Bongo Cat）：有增长效果，但和“高级温馨”冲突，也会招来刷子。
4. **惩罚性连胜和枯死**（Forest 枯树、Finch 断签归零）：短期有效，长期带来愧疚和流失。
5. **通知轰炸、弹窗、“你已经 X 天没来”**：Calm Tech 和 Lost Garden 都把它们列为头号破坏因素。
6. **需求很多的宠物**：要喂、要洗、不管就生病。宠物应该是陪伴者，而不是又一张待办清单。
7. **装修吃掉专注时间**：Spirit City 评测者的亲身体验。装修应该只在休息时或专注结束后开放，或者让房间“自己长”。
8. **常驻高占用**：Spirit City 第二大差评。桌面端动画在后台和专注时应该降帧，窗口被遮挡时暂停渲染。
9. **订阅陷阱和付费商店**：Brain.fm 和 Finch 的扣费差评；Spirit City 用户担心 DLC。买断或一次性 Supporter Pack（Rusty 约 11% 的附加购买率）更符合这一品类用户的心态。
10. **“科学专注音乐”式营销**：心流小屋没有证据，也不需要。卖点就是“你的音乐 + 温柔陪伴”。

---

## 6. 定位一句话（建议）

> **心流小屋：放一张你自己的唱片，和小猫一起专注。每一段专注都会变成架上的一张唱片。**

差异化：Steam 上的 lofi 小屋（Spirit City、Chill Pulse、Mini Cozy Room）都只有内置 lofi；音乐 App（网易云、Apple Music）没有专注和陪伴。心流小屋站在两者的交叉点上：**真实曲库 + 逐字和桌面歌词 + 唱片收藏 + 不愧疚的专注陪伴**。

---

## 来源

**Spirit City**
- Steam 商店页：https://store.steampowered.com/app/2113850/
- Vaporlens 评测聚合：https://vaporlens.app/app/2113850/spirit_city_lofi_sessions
- Aywren 评测：https://aywren.com/2024/06/17/steam-gaming-spirit-city-lofi-sessions
- Stackup 评测：https://www.stackup.org/post/review-spirit-city-lofi-sessions

**桌面闲置游戏**
- Chill Pulse（Automaton）：https://automaton-media.com/articles/newsjp/20240313-285746/
- Chill Pulse（Game*Spark）：https://www.gamespark.jp/article/2024/05/18/141397.html
- Chill Pulse（GG.deals）：https://gg.deals/gb/game/chill-pulse/
- Rusty's Retirement（GameDiscoverCo）：https://newsletter.gamediscover.co/p/how-rustys-retirement-idle-farmed
- Rusty's Retirement（Siliconera）：https://www.siliconera.com/review-rustys-retirement-offers-a-calming-and-simplistic-respite/
- Rusty's Retirement（PCGamesN）：https://www.pcgamesn.com/rustys-retirement/high-sales
- Ropuka's Idle Island（Steam）：https://store.steampowered.com/app/3416070/
- Ropuka's Idle Island（Automaton）：https://automaton-media.com/articles/newsjp/ropukas-idle-island-20250204-327321/
- Ropuka's Idle Island（Professional Moron）：https://professionalmoron.com/2025/11/16/ropukas-idle-island-game/
- Bongo Cat（esports.net）：https://www.esports.net/news/bongo-cat-steam-popularity
- Bongo Cat（wnhub）：https://wnhub.io/news/stores-and-publishing/item-48117
- Bongo Cat（Insider Gaming）：https://insider-gaming.com/what-is-bongo-cat-on-steam/
- Mini Cozy Room: Lo-Fi（Steam）：https://store.steampowered.com/app/3511030/

**氛围学习空间**
- lofi.co 关停：https://wonderspace.beehiiv.com/p/5-best-lofico-alternatives
- 氛围学习网站盘点（Gridfiti）：https://gridfiti.com/aesthetic-study-websites/
- Lofi Girl 与 body doubling（BPS）：https://bps.org.uk/news/side-side-success-lo-fi-body-doubling-technique
- Lofi Girl 粉丝社群研究：https://pure.hud.ac.uk/en/publications/vibes-gender-and-musical-affordance-on-the-internet-a-study-of-th/

**专注与宠物激励**
- Forest（Wikipedia）：https://en.wikipedia.org/wiki/Forest_(application)
- Forest 讨论（kottke.org）：https://kottke.org/25/06/0046973-want-to-use-your-phone
- Forest（Sweet Setup）：https://thesweetsetup.com/?p=53148
- Session（App Store）：https://apps.apple.com/us/app/session-%E7%95%AA%E8%8C%84%E9%92%9F%E4%B8%93%E6%B3%A8%E8%AE%A1%E6%97%B6%E5%99%A8/id1521432881
- Mac 番茄钟盘点（Timing）：https://timingapp.com/blog/best-pomodoro-apps-for-mac/
- Flow（App Store）：https://apps.apple.com/us/app/flow-focus-and-work-timer/id1423210932
- Tide（App Store）：https://apps.apple.com/app/tide-focus-timer-white-noise/id1077776989
- Tide 评测（Connecticut College）：https://engage.digital.conncoll.edu/?p=2072
- Finch 留存机制（Deconstructor of Fun）：https://www.deconstructoroffun.com/blog/x0hd2ssr80y5n7gv0w967pg7hwd7tl
- Finch 评论分析（Appbot）：https://appbot.co/blog/finch-app-reviews-emotional-attachment-user-retention-product-loyalty/
- Finch 评测（Headway）：https://makeheadway.com/blog/finch-app-review/
- Finch 设计评析（Pratt）：https://ixd.prattsi.org/2026/02/design-critique-finch-self-care-pet-ios-app/
- Duolingo 连胜设计：https://blog.duolingo.com/how-duolingo-streak-builds-habit

**功能性音乐**
- Brain.fm vs Endel（Brain.fm 自家博客，有利益相关）：https://www.brain.fm/blog/best-focus-music-app-brain-fm-vs-endel-vs-noisli
- Brain.fm 用户评价（Trustpilot）：https://www.trustpilot.com/review/brain.fm?page=2
- Brain.fm 评测（NeuroLaunch）：https://neurolaunch.com/brain-fm-review/

**音乐体验**
- Apple Music Sing（TechCrunch）：https://techcrunch.com/2022/12/06/apple-music-is-getting-a-new-karaoke-like-feature-apple-sing
- Apple Music 歌词支持页：https://support.apple.com/HT204459
- 网易云个性化推荐分析（人人都是产品经理）：https://www.woshipm.com/evaluating/4213966.html
- 网易云产品分析（人人都是产品经理）：https://www.woshipm.com/operate/2535383.html
- Spotify 心形改为加号：https://community.spotify.com/t5/Community-Blog/The-Heart-button-is-being-replaced-with-a-Plus-button/bc-p/5530501/highlight/true
- Spotify Miniplayer：https://community.spotify.com/t5/Community-Blog/Introducing-the-Spotify-Miniplayer-to-Spotify-Desktop/bc-p/6028624/highlight/true
- Plexamp（App Store）：https://apple.co/3R0OiUl
- Plexamp Sweet Fades 讨论：https://forums.plex.tv/t/sweet-fades-on-tidal-tracks/835537/4
- LyricsX（Softpedia）：https://mac.softpedia.com/get/Audio/LyricsX.shtml
- LyricsX（ifun.de）：https://www.ifun.de/lyricsx-freie-mac-app-laedt-und-zeigt-songtexte-automatisch-246736/

**设计原则**
- Cozy Games（Lost Garden）：https://lostgarden.com/2018/01/24/cozy-games/
- Designing for Coziness（Game Developer）：https://www.gamedeveloper.com/design/designing-for-coziness
- Calm Tech 原则：https://calmtech.institute/calm-tech-principles
- Calm Tech 原则（O'Reilly）：https://oreilly.com/content/principles-calm-technology-we-are-not-bad-at-technology-technology-is-bad-at-us
- 动物森友会 GDC 2006（Eguchi）：https://www.nintendoworldreport.com/news/11224/is-that-a-franchise-in-your-pocket
- Things 3（MacStories）：https://www.macstories.net/?p=48965
- 微动效细节（Swiftjectivec）：https://swiftjectivec.com/Making-iOS-apps-just-a-little-nicer
