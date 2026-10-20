# 打磨轮共享契约 · 2026-10

所有专项 BOT 在本文件之上工作。**先读本文件，再读 `docs/art-direction.md`。**

## 0. 环境

| 项 | 值 |
| --- | --- |
| 仓库路径 | `/workspace/Flow-Cabin` |
| 基线提交 | `7423860de4657ac1da5dcab8f2e874f40855911e`（v1.21.4） |
| Node | 24.x（沙箱内为 v22.19.0，可跑测试） |
| 依赖 | 根目录与 `desktop/` 的 `node_modules` 已装好，**不要重新 install** |
| Git | `HOME=/workspace/.home`（已配好 `http.sslCAInfo`）。**无 GitHub 凭据，禁止 push / 禁止创建 PR** |
| 沙箱网络 | GitHub 可读可克隆；`album-circle.vercel.app` 的 DNS 在本沙箱被污染，**不要用 curl 判定线上站点死活** |

## 1. 不可违背的硬约束

`src/css-lint.test.mjs` 是机器强制的设计系统守卫。**任何 CSS 改动必须继续通过它。**它要求：

1. 每个 `.css` 文件第一行必须是 `@layer guards, reset, features, skin, overrides;`，且所有规则都在 `@layer` 块内。
2. `!important` 只允许出现在 `@layer guards` 里。
3. 每个 `animation` 引用的 `@keyframes` 必须存在。
4. `border-radius` 只能是 `0` / `0px` / `50%`；禁止 `backdrop-filter`；禁止 `blur()`。
5. 字号：Silkscreen（`--px-font-en`）必须是 8 的倍数；像素中文（`--px-font-cn`）只能是 12 / 24 / 36 / 48；任何文字不得小于 12px。
6. 凡是等于调色板 token 的颜色必须写成 `var(--px-*)`，不能写裸 hex。
7. CSS 里出现的每个 class 都必须在 JSX / JS / MJS / HTML 里真实渲染过。

`docs/art-direction.md` 是美术方向的唯一事实来源：调色板只用 `--px-*`、像素字体只用 Fusion Pixel / Silkscreen、无圆角、9-slice 斜角面板、2px 硬阴影、动效只用 `steps()` 缓动、只动 `translate/scale/opacity`、每条动效都要有 reduced-motion 降级、像素图必须 `image-rendering: pixelated`。

**任何"改进"不得违反以上两条。新增设计值一律先加进 `src/styles/tokens.css` 的 token，不准在组件里写裸值。**

## 2. 文件归属（只准改自己那一格）

多个 BOT 会同时改同一个仓库。**只允许修改下表自己那一行里的文件。**越界发现的问题写进自己的 `deliverable.md` 的「越界发现」一节，**不要动手改**。

| BOT | 只能修改 |
| --- | --- |
| `visual-auditor` 审美与设计系统 | `src/styles/tokens.css`、`src/styles/pixel-ui.css`、`src/styles/perf-low.css` |
| `model-auditor` 建模与数据契约 | `src/focus/focus-model.mjs`、`src/room-model.mjs`、`src/room-playback.mjs`、`src/sky-model.mjs`、`src/ai/ai-model.mjs`、`src/backup-model.mjs`、`src/playlist-model.mjs`、`src/record-library.mjs`、`src/scene-catalog.mjs`、`src/study/study-model.mjs`、`src/focus/session-log.mjs`、`src/focus/souvenirs.mjs` 及**同目录同名前缀的 `.test.mjs`** |
| `motion-auditor` 动效与渲染性能 | `src/frame-clock.mjs`、`src/motion-preference.mjs`、`src/useReducedMotion.jsx`、`src/perf-profile.mjs`、`src/pet/*`、`src/scene/*`、`src/turntable/*` 及各自 `.test.mjs` |
| `interaction-auditor` 交互与可访问性 | `src/ui/*`、`src/shortcuts.mjs`、`src/drag-gesture.mjs`、`src/Dialog.jsx`、`src/RecordCard.jsx`、`src/RecordLibrary.jsx`、`src/PlaylistLibrary.jsx`、`src/AddAlbum.jsx`、`src/AlbumWall.jsx`、`src/room/CabinDetails.jsx` 及各自 `.test.mjs` |
| `promo-auditor` 宣传网页 | `promo.html`、`src/promo/promo.css`、`src/promo/promo.js`、`public/promo/**` |
| `repo-auditor` 仓库展示面 | `README.md`、`CONTRIBUTING.md`、`.github/**`、`docs/**`（不含 `docs/audit/polish-2026-10/` 下的他人产物） |
| `Coder`（集成） | 全部，但**只在其它 BOT 全部交付之后**执行 |

新增文件允许，但必须落在自己那一行的目录里。

## 3. 验证命令

改动后必须实际运行，不许"看起来没问题"：

```bash
cd /workspace/Flow-Cabin
export HOME=/workspace/.home
npm test          # 全部 node:test 单测（含 css-lint.test.mjs 设计系统守卫）
npm run build     # 生产构建，5 个入口：index / promo / wallpaper / pet / mini
npm --prefix desktop test   # Electron 主进程单测
```

Playwright 相关回归（`npm run test:browser` / `test:promo` 等）需要 Chromium。如果 `desktop/node_modules/.bin/playwright` 可用，可跑 `npx playwright install chromium` 后再跑；**装不上就跳过，并在交付里明说"浏览器验收未执行"及原因**，不要假装跑过。

## 4. 提交与交付

- 每个 BOT 在自己的一份工作分支上提交：`git checkout -b polish/<bot-name>`，提交信息用中文 `feat/fix/refactor: <一句话>`，一次提交一���改动。
- 提交后写 `docs/audit/polish-2026-10/<bot-name>.md`，包含：审查范围、发现的问题清单（每条给文件:行号 + 复现/判断依据）、实际改动（文件:行号 + 为什么这么改）、跑过的命令与结果、没验证的部分、遗留风险。
- **不要 push**。集成任务负责合并。

## 5. 质量底线

- 改不动就不改。这个项目已经有完整的美术方向、守卫测试和审计文档，**不要为了"看起来有产出"而制造无意义的 diff**。正确的产出是：发现了真实的问题、修了真问题、或者明确说明"这块没有问题"。
- 不许悄悄改行为。任何行为变化都要在 `deliverable.md` 里单独列出来。
- 不许为了让测试变绿而放宽断言或删测试。守卫测试（`css-lint.test.mjs` 等）只能加严，不能放松。
- 注释和文档用中文，与仓库现有风格一致。
