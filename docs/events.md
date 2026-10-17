# 小屋全局事件 · Cabin events

Window-level `CustomEvent`s that let parts of the cabin react to each other without importing one another. All are read-only signals: listening never changes playback.

## `cabin:playback`

Dispatched on `window` by the music player (`src/player/usePlayer.jsx` → `usePlaybackBroadcast`).

```js
window.addEventListener('cabin:playback', (event) => {
  const { playing, energy } = event.detail;
  turntable.dataset.playing = String(playing);
  pet.style.setProperty('--groove', energy.toFixed(3)); // 0..1
});
```

| field | type | meaning |
| --- | --- | --- |
| `playing` | `boolean` | Real audio is playing (local files, QQ, 网易云, Music Assistant, or the system player). **`false` in 仅动画展示 mode**, even if the record spins. |
| `energy` | `number` 0..1 | Loudness. RMS of an `AnalyserNode` on the deck's `<audio>`, with a fast attack and slower release. Always `0` when not playing. |
| `estimated` | `boolean` | `true` when no analyser can be attached (Music Assistant speakers, system player, or audio that is not same-origin). `energy` is then a gentle synthetic pulse; don't treat it as a beat. |
| `spinning` | `boolean` | The record is turning on the deck, including 仅动画展示 mode. Use this for platter and tonearm motion, and `playing` for anything that implies sound. |
| `provider` | `string` | `visual`, `auto`, `local`, `qq`, `netease`, `ma` or `system`. |
| `track` | `object \| null` | `{ id, index, title, artist, album }`. `id` is the collection item id. `null` when the deck is empty. |
| `bpm` | `number` | Tempo found by `src/player/beat-tracker.mjs` (kick-drum band of the analyser, autocorrelation), or `0` while no beat is certain or the signal is `estimated`. |
| `beatAt` | `number` | Wall-clock time (`Date.now()` ms) of one beat when `bpm` is set, else `0`. Any beat works as the phase anchor: beats fall at `beatAt + k × 60000 / bpm`. |
| `reason` | `string` | `state` (play/pause/source/spin changed), `track` (track or record changed), `beat` (a new tempo, or a phase shift of more than 30 ms), or `energy` (periodic tick). |

### Timing

- `state` and `track` events are sent **immediately**.
- `energy` ticks are throttled to about **15 fps** (≥ 66 ms apart), only while `playing`, and are skipped when the value barely changes.
- When playback stops, one final event carries `playing: false, energy: 0`. Nothing is sent while paused.
- There is no replay for late listeners. Treat "no event yet" as `{ playing: false, energy: 0 }`.

### Notes for listeners

- Keep handlers cheap. Write a CSS variable or a ref, and let CSS or your own `requestAnimationFrame` do the drawing.
- Respect reduced motion (`[data-desktop-reduce-motion=true]` / `prefers-reduced-motion`). The event still fires, but motion should stay subtle.
- The analyser is attached during the first user-started play and only when the context is running. Audio never goes silent because of it.

### In the desktop pet window

The pet runs in its own Electron window (`pet.html`), so it never sees the main page's `window` events. The music state travels with the companion snapshot instead:

1. `src/CompanionBridge.jsx` listens to `cabin:playback` and adds `musicPlaying`, `energy` (rounded to 0.05), `energyEstimated`, `bpm`, `beatAt` and a separate `lofiBpm` to `albumCompanionSnapshot()`.
2. `desktop/companion-sync.cjs` reads the snapshot. `desktop/wallpaper-model.cjs` `cleanCompanion` whitelists and clamps it (`energy` 0..1, 2 decimals, forced to 0 when nothing is playing). `desktop/pet.cjs` polls about every **125 ms (~8 Hz) while `musicPlaying` is true** and every 750 ms otherwise, and only sends `pet:update` when the cleaned value changed.
3. `src/pet/pet-snapshot.mjs` re-dispatches `cabin:playback` on the pet window with `{ playing, energy, estimated, source: 'companion', reason: 'companion' }`, and only when the values change.

Pet code listens the same way in both windows (`onCabinPlayback` in `src/scene/playback-listener.mjs`). In the pet window the signal is coarser: about 8 Hz, with 0.05 energy steps and roughly 125 ms of extra latency. That is too coarse for beats, so the beat itself travels as `bpm` + `beatAt` on the wall clock and each window keeps its own beat clock (`src/player/beat-clock.mjs`): the pet's hop (`src/pet/PetLife.jsx`, a Web Animation put back on the beat when it drifts) and its groove frames (`grooveFrame` in `src/pet/pet-model.mjs`, two per beat, head dip on the beat) follow it. Without a detected beat they use 96 BPM, or the lo-fi section's tempo. The existing `playing` field in the snapshot still means "grooving" (real audio, spinning, or lo-fi). Use `musicPlaying` / the event's `playing` for real audio only.

### Generated lo-fi tempo

`lofiBpm` is nonzero only while the generated lo-fi engine is playing and real deck/system music is not. The shell whitelists it to 40–220 BPM. The pet relay applies it to the visual beat clock independently; it does **not** turn `musicPlaying` or the playback event's `playing` on, and lo-fi-only playback still has `energy: 0`, `bpm: 0`, `beatAt: 0` in that event. Tempo changes participate in snapshot deduplication. Stopping lo-fi resets its visual fallback to 96 BPM; real music takes precedence.

This synchronizes the generated section's target tempo, not sample-accurate phase. The engine supplies no beat-origin timestamp and ramps between section tempos over two seconds; the slow lo-fi snapshot poll can add up to approximately 750 ms of visual delay.

## `cabin:player-command` (incoming)

The cabin page listens on `window` and executes:

```js
window.dispatchEvent(new CustomEvent('cabin:player-command', { detail: { action: 'toggle' } }));
```

| `detail.action` | Effect |
| --- | --- |
| `toggle` | Play / pause (in 仅动画展示: spin / stop the record) |
| `play` | Play if paused; no-op when already playing |
| `pause` | Pause if playing; no-op when already paused |
| `next` | Same rules as the ⏭ button: album order, 待播 queue, repeat, shuffle. Unplayable tracks are still auto-skipped (max 5 in a row) |
| `previous` | Same as ⏮: restarts the track after 3 s, otherwise the previous track |

Unknown actions and commands with no record on the deck are ignored. In 系统正在播放 mode only `next` / `previous` reach the deck queue; use the system transport for the external player.
Code: `PLAYER_COMMAND_EVENT` / `PLAYER_COMMANDS` in `src/player/usePlayer.jsx`.

Other Electron windows (the desktop-mode mini turntable) do not dispatch this themselves: the main process relays its IPC channel of the same name into the main window as this event — see [desktop.md](desktop.md).

## Other player events (existing)

| event | direction | detail |
| --- | --- | --- |
| `cabin-play` | → player | `{ id, track }` put an album on the deck, optionally starting at a track (used by the album card). |
| `cabin-open-music-settings` | → cabin | no detail. Opens 设置 › 音源 (used by the player's error card and the turntable's source chip). |
| `album-quick-search` | → app | `{ query }` opens 添加到唱片架 › 曲库搜索 with that query. |
| `album-music-account` / `album-music-settings` | desktop → page | Sign-in or source settings changed. The player re-resolves the current track. |

## `cabin:focus-session` *(schema agreed with the focus-entry PR)*

Dispatched on `window` when a focus session ends; the same record is appended to `localStorage['flow-cabin-focus-sessions-v1']` (a JSON array, or `{ version, sessions: [] }`). The stats adapter `src/focus/stats/session-source.mjs` reads both, plus the pomodoro state's existing `sessions` (`album-circle-focus-v1:<user>` → `{ start, end, taskId, completed }`) as a fallback, and merges duplicates (start and end within a minute; the richer record wins).

| field | type | meaning |
| --- | --- | --- |
| `id` | `string?` | Stable id; defaults to `s<start>`. |
| `start`, `end` | `number` | Epoch ms. Aliases `startedAt`/`endedAt`/`startAt`/`endAt` are accepted. Sessions over 4 h are dropped. |
| `durationMs` | `number` | Focused time without pauses; defaults to `end − start`. |
| `completed` | `boolean` | `false` when ended early. Only completed sessions count as 番茄. |
| `taskId` | `string` | Todo id, `''` for 自由专注. `taskText` (optional) keeps the name if the todo is later deleted. |
| `album` | `{ id?, title, artist? } \| string` | What was on the deck. Falls back to `track.album`. |
| `track` | `{ title, artist?, album? }?` | Optional. |
| `cover` | `string?` | Top-level, optional. Album cover — the focus view writes a 32×32 PNG data URL; accepted forms: `data:image/(png\|jpeg\|gif\|webp);base64,…` (≤ 400 KB), an `http(s)` URL or a same-site path. Also read from `album.cover`. Other values are dropped. The weekly report shows the most-played album's cover (32 px, pixelated) and falls back to the name only. PNG export draws only `data:` or same-origin covers (others would taint the canvas) and uses a pixel-record placeholder otherwise. |

## `cabin:open-journal`

Opens the 小屋日记 overlay (`src/focus/stats/CabinJournal.jsx`). Also opened by **L** in the room and the 统计 card's 「打开小屋日记 →」.

```js
window.dispatchEvent(new CustomEvent('cabin:open-journal', { detail: { tab: 'weekly' } }));
```

| field | type | meaning |
| --- | --- | --- |
| `tab` | `'overview' \| 'tasks' \| 'weekly'`? | Page to open; unknown or missing → `overview`. |

The overlay is a native `<dialog>` (top layer), so room keys pause while it is open; Esc or 「返回小屋」 closes it.

## `cabin:cat-fed`, `cabin:cat-mood` and `flow-cabin-cat-mood-v1` *(owned by the pet mood/feeding logic)*

The 小屋日记 only **reads** these (`src/focus/stats/cat-mood-source.mjs`). A missing key, bad JSON, `v !== 1`, or a store with no valid `tier` and no feeds in the week hides the cat line in 小屋来信, the mood doodle and the export line. Nothing is shown as a penalty.

`localStorage['flow-cabin-cat-mood-v1']`:

```js
{ v: 1, mood: 0–100, tier: 'happy' | 'ok' | 'droopy', updatedAt, feeds: [{ at, fishLeft }], totalFeeds, unlockedActions: [] }
```

| field | journal use |
| --- | --- |
| `v` | must be `1`. |
| `tier` | mood doodle (`happy` → cat-rub, `ok` → cat-wait, `droopy` → cat-droopy), the 周报 cat pose (`happy` → cat-rub when the week has focus; `droopy` → cat-droopy on a quiet week) and the label 心情很好 / 心情不错 / 有点无精打采. |
| `feeds[].at` | ms timestamps (last 400 kept). The weekly count is the number of `at` inside the displayed week, so past weeks show their own count. |
| `mood`, `updatedAt`, `fishLeft`, `totalFeeds`, `unlockedActions` | not used by the journal. |

Events (on `window`), both trigger a re-read of the key, so the store must be written **before** dispatching:

| event | detail |
| --- | --- |
| `cabin:cat-fed` | `{ at, mood, tier, fishLeft, totalFeeds }` |
| `cabin:cat-mood` | `{ mood, tier }` |

Cross-window `storage` events for the key also trigger a re-read.

## `cabin:cat-fed` / `cabin:cat-mood` / `cabin:cat-feed-request`

格式已锁定，小屋日记（#57）按这个读取。

- `cabin:cat-fed`：每喂一次，在 `window` 上触发一次，`detail` 为 `{ at, mood, tier, fishLeft, totalFeeds }`（`at` 是毫秒时间戳）。
- `cabin:cat-mood`：心情数值或档位变化时触发（包括加载时和每 10 分钟随时间衰减跨档时，存储也会同步写回），`detail` 为 `{ mood, tier }`。`tier` 取值 `happy | ok | droopy`（开心 / 还不错 / 无精打采）。当前档位同时写在 `document.documentElement.dataset.catMood` 和 `.room-cat[data-mood]` 上。
- `cabin:cat-feed-request`（输入）：请求喂一条，喂食按钮和把小鱼干拖到小猫身上都发这个事件。吃饱或没有小鱼干时不扣鱼，只显示提示。

存储 `localStorage['flow-cabin-cat-mood-v1']`，只有以下字段：

```js
{ v: 1, mood: 62,                 // 0–100
  tier: 'ok',                     // 'happy' | 'ok' | 'droopy'
  updatedAt: 1760000000000,       // 上次结算心情的时间（毫秒）
  feeds: [{ at: 1760000000000, fishLeft: 2 }],   // 最近 400 次喂食
  totalFeeds: 3, unlockedActions: ['stretch'] }
```

每天摸摸的次数和已经加过心情的专注记录，另存在 `flow-cabin-cat-care-meta-v1`（只供内部使用）。规则见 `docs/cat-care.md`。
