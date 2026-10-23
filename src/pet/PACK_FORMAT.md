# Data-only pet packs (v1)

Desktop Settings → Room → Pet animations accepts a UTF-8 `.json` file or a restricted `.zip` archive:

```json
{"version":1,"id":"my-pet","name":"My pet","author":"Your name","license":"CC0","authorized":true,"media":{"type":"spritesheet","data":"BASE64_RGBA_PNG","frameWidth":32,"frameHeight":32},"animations":{"idle":{"frames":[0,1],"fps":2},"typing":{"frames":[2,3],"fps":8}},"mirror":false,"baseline":0,"actionMap":{}}
```

Frames are row-major, zero-based. PNG must be static noninterlaced 8-bit RGBA, ≤4096×4096 and ≤16 MiB; each frame dimension is 16–1024 and divides the atlas. Each clip has 1–240 frame indices and 0.5–30 FPS. `idle` is required. Missing actions explicitly fall back to idle. Author/license markings are declarations, not legal verification. Packages never execute scripts or use remote URLs. ZIP imports contain exactly two regular files at the archive root: `manifest.json` and `atlas.png`. In the manifest, replace `media.data` with `media.file: "atlas.png"`. Stored and deflate entries (including data descriptors) are supported. Archive size is limited to 16 MiB + 256 KiB; manifest ≤100 KiB and decoded atlas ≤16 MiB. Central and local directories, CRCs, compressed and decoded sizes must agree. Paths, symlinks, encrypted entries, nested archives, duplicate names, ZIP64, extra fields and undeclared data are rejected. No files are extracted before validation. Transparent WebM remains unsupported until codec and dimension validation is available.

Preview lets the user map actions, mirror and adjust the baseline, then apply the pack. The chosen manifest and preview adjustments are local preferences; original imported data stays unchanged. Remove the active pack to restore built-in art. The external desktop pet receives validated metadata in its companion snapshot, fetches only the fixed local atlas endpoint, and hit-tests the actual rendered alpha channel, including mirroring and baseline adjustments.

# dsh-pet

Uses the user's already-running local service exclusively at `http://127.0.0.1:<port>/dsh-pet-7340`. Protocol verified against upstream API.md and openapi.yaml (2026-10-23). Renewal uses POST `/lock` with the same `lockId`; there is no `/lock/renew` endpoint. The client reads config/state, acquires a two-minute lock, plays configured named animations, and releases on pause/quiet/disconnect. User takeover stops the client; it never reacquires automatically. No upstream animation assets are bundled. Actual installed dsh-pet interoperability still requires an integration test against that application.
