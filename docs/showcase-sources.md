# 展示专辑与图片来源

新版展示图使用实际 React 界面、真实专辑名称／曲目与公开曲库封面。截图在隔离浏览器中生成，没有连接音乐账号，也没有把这些专辑写入用户收藏。展示模式没有音频。

封面与唱片作品的权利属于各自权利人，仅用于说明收藏界面的实际呈现；不属于本项目原创素材或项目代码许可。没有下载或分发专辑音频。

数据来源：iTunes Search / Lookup API（US storefront），取得日期 2026-10-09。完整源地址、曲目与封面校验值见 [`scripts/showcase-albums.json`](../scripts/showcase-albums.json)。

| 专辑 | 艺术家 | 公开曲库来源 |
| --- | --- | --- |
| 橙月 | Khalil Fong | [查看专辑](https://music.apple.com/us/album/%E6%A9%99%E6%9C%88/313404785?uo=4) |
| 寓言 | Faye Wong | [查看专辑](https://music.apple.com/us/album/%E5%AF%93%E8%A8%80/966489223?uo=4) |
| 小宇宙 | sodagreen | [查看专辑](https://music.apple.com/us/album/%E5%B0%8F%E5%AE%87%E5%AE%99/1461046017?uo=4) |
| U 87 | Eason Chan | [查看专辑](https://music.apple.com/us/album/u-87/1443374875?uo=4) |
| 克卜勒 | Yanzi Sun | [查看专辑](https://music.apple.com/us/album/%E5%85%8B%E5%8D%9C%E5%8B%92/1443147411?uo=4) |
| Bewitched | Laufey | [查看专辑](https://music.apple.com/us/album/bewitched/1690607869?uo=4) |
| First Love (Remastered 2014) | Hikaru Utada | [查看专辑](https://music.apple.com/us/album/first-love-remastered-2014/1440763349?uo=4) |
| Metaphorical Music | Nujabes | [查看专辑](https://music.apple.com/us/album/metaphorical-music/1078898175?uo=4) |
| async | Ryuichi Sakamoto | [查看专辑](https://music.apple.com/us/album/async/1507014129?uo=4) |
| Come Away with Me (Remastered) | Norah Jones | [查看专辑](https://music.apple.com/us/album/come-away-with-me-remastered/1624173298?uo=4) |
| Waltz for Debby (Original Jazz Classics Remasters) [with Paul Motian & Scott LaFaro] | Bill Evans Trio | [查看专辑](https://music.apple.com/us/album/waltz-for-debby-original-jazz-classics-remasters-with/1440942198?uo=4) |
| Random Access Memories | Daft Punk | [查看专辑](https://music.apple.com/us/album/random-access-memories/617154241?uo=4) |

## 重现截图

`npm run screenshots:product` 使用上述清单生成主界面、专注、伙伴和入门截图，并检查真实交互。封面不再在运行时下载：iTunes 封面 CDN 会重新编码原图，导致原始字节校验值不稳定，因此经人工核对的 300×300 副本保存在 [`docs/assets/covers`](assets/covers)，脚本按清单中的 `localSHA256` 校验。原始 `artworkSHA256` 仅作为来源记录保留。应用构建不会包含清单或封面。封面需要更新时，先人工复核来源，再替换文件与校验值。

`npm run screenshots:readme` 生成 README 中番茄钟、待办与统计的特写（演示用固定专注数据），输出到 `docs/assets/screenshots`。

`SHOWCASE_TOUR=1 npm run screenshots:product` 额外录制实际界面操作为 MP4（需要 ffmpeg）。这段录像展示三步指南、打开并开始专注、在「设置 › 小屋与奶糖」换伙伴、进入沉浸；没有音轨，不是平台账号播放验收。截图默认减少动态；录像使用正常动画。

旧 `docs/images` 文件保留历史验收证据。README 展示的当前图片在 `docs/assets`（截图、GIF、MP4、封面）；`docs/images/showcase` 为上一版展示图。脚本默认输出到 `docs/images/showcase`，更新 README 时用 `SHOWCASE_OUTPUT=docs/assets/screenshots`。
