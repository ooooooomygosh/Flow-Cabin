'use strict';
// Menu templates (pure data + callbacks) for the application menu, the companion tray and the
// legacy toolbar menu. main.cjs turns them into native menus with Menu.buildFromTemplate.
const SINK_HOTKEY = 'CommandOrControl+Alt+D';

// ctx: { version, companion(command), toggleSettings, checkUpdates, reload, zoom(step|0), fullscreen, toggleFullscreen, toggleSink, openData, about }
function appMenuTemplate(ctx) {
  return [
    { label: '应用', submenu: [
      { label: '小屋设置…', click: () => ctx.companion('open-settings') },
      { label: '显示与字体…', accelerator: 'CmdOrCtrl+,', click: () => ctx.toggleSettings(true) },
      { label: '重新引导', click: () => ctx.companion('open-onboarding') },
      { label: '检查更新…', click: ctx.checkUpdates },
      { label: '重新载入小屋', accelerator: 'CmdOrCtrl+R', click: ctx.reload },
      { type: 'separator' },
      // ctx.quit asks first while a focus round runs (main.cjs requestQuit).
      ctx.quit ? { label: '退出', accelerator: 'CmdOrCtrl+Q', click: ctx.quit } : { role: 'quit', label: '退出' }
    ]},
    { label: '编辑', submenu: [
      { role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' }, { type: 'separator' },
      { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' },
      { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' }
    ]},
    { label: '查看', submenu: [
      { label: '放大', accelerator: 'CmdOrCtrl+Plus', click: () => ctx.zoom(5) },
      { label: '缩小', accelerator: 'CmdOrCtrl+-', click: () => ctx.zoom(-5) },
      { label: '实际大小', accelerator: 'CmdOrCtrl+0', click: () => ctx.zoom(0) },
      { id: 'cabin-fullscreen', type: 'checkbox', checked: ctx.fullscreen, label: '交互全屏', accelerator: 'F11', click: ctx.toggleFullscreen },
      { label: '沉入桌面', accelerator: SINK_HOTKEY, registerAccelerator: false, click: ctx.toggleSink }
    ]},
    // ── M3 player: 控制 menu (playback, volume, mini player) ──
    { label: '控制', submenu: playbackMenuItems(ctx, { accelerators: true }) },
    // ── end M3 player ──
    { label: '帮助', submenu: [
      { label: '打开数据文件夹', click: ctx.openData },
      { label: '关于心流小屋', click: ctx.about }
    ]}
  ];
}

// Focus entries of the tray / menu-bar menu (2.2): start · pause / continue, then while a round
// runs: +5 分钟, skip (ends a focus round early or skips the break) and 结束 (back to idle).
function focusItems(status, ctx) {
  const phase = status.phase || 'idle', active = phase !== 'idle', focus = phase === 'focus';
  if (!active) return [{ label: '开始番茄钟', accelerator: FOCUS_TOGGLE_HOTKEY, registerAccelerator: false, click: () => ctx.companion('focus-start') }];
  return [
    { label: status.paused ? (focus ? '继续专注' : '继续休息') : (focus ? '暂停专注' : '暂停休息'), accelerator: FOCUS_TOGGLE_HOTKEY, registerAccelerator: false, click: () => ctx.companion('focus-toggle') },
    { label: '+5 分钟', click: () => ctx.companion('focus-extend') },
    { label: focus ? (status.overtime ? '结束这一轮，去休息' : '跳过（提前结束本轮）') : '跳过休息', accelerator: FOCUS_SKIP_HOTKEY, registerAccelerator: false, click: () => ctx.companion(focus ? (status.overtime ? 'focus-break' : 'focus-skip') : 'focus-next') },
    { label: focus ? '结束专注' : '结束休息', click: () => ctx.companion('focus-end') }
  ];
}
const { FOCUS_HOTKEYS: { toggle: FOCUS_TOGGLE_HOTKEY, skip: FOCUS_SKIP_HOTKEY } } = require('../focus-shell.cjs');

// ctx: { restore, companion(command), checkUpdates, status (status-bar.cjs statusFrom), player(action), openJournal,
//        petActive, petStart, petStop, petHidden, petShow, sinkActive, sinkEnter, sinkExit, quit,
//        lyricsOpen, lyricsLocked, lyricsToggle, lyricsLock }
function trayMenuTemplate(ctx) {
  const status = ctx.status || {};
  return [
    { label: status.statusLine || '心流小屋', enabled: false },
    { type: 'separator' },
    { label: status.playing ? '暂停音乐' : '播放音乐', click: () => ctx.player?.('toggle') },
    // ── M3 player ──
    { label: '上一首', click: () => ctx.player?.('previous') },
    // ── end M3 player ──
    { label: '下一首', click: () => ctx.player?.('next') },
    { label: '桌面歌词', type: 'checkbox', checked: Boolean(ctx.lyricsOpen), click: () => ctx.lyricsToggle?.() },
    ...(ctx.lyricsOpen ? [{ label: '锁定桌面歌词（鼠标穿透）', type: 'checkbox', checked: Boolean(ctx.lyricsLocked), click: () => ctx.lyricsLock?.() }] : []),
    ...focusItems(status, ctx),
    { label: '喂小猫一条小鱼干', click: () => ctx.companion('cat-feed') },
    { label: '打开小屋日记', click: () => ctx.openJournal?.() },
    { type: 'separator' },
    { label: '打开小屋', click: ctx.restore },
    { label: '小屋设置…', click: () => { ctx.restore(); ctx.companion('open-settings'); } },
    { label: '开关小屋声音', click: () => ctx.companion('sound-toggle') },
    { label: '检查更新…', click: ctx.checkUpdates },
    { type: 'separator' },
    ...(ctx.petHidden ? [{ label: '现在叫伙伴出来', click: ctx.petShow }] : []),
    ctx.petActive ? { label: '让伙伴回家', click: ctx.petStop } : { label: '伙伴出门（桌宠）', click: ctx.petStart },
    ctx.sinkActive ? { label: '浮出桌面（回到窗口）', accelerator: SINK_HOTKEY, click: ctx.sinkExit } : { label: '沉入桌面', accelerator: SINK_HOTKEY, click: ctx.sinkEnter },
    // ── M3 player ──
    ...(ctx.miniToggle ? [{ label: '迷你唱机', type: 'checkbox', checked: Boolean(ctx.miniShown), click: ctx.miniToggle }] : []),
    // ── end M3 player ──
    { type: 'separator' }, { label: '退出应用', click: ctx.quit }
  ];
}

// ── M3 player ──────────────────────────────────────────────────────────────
// Playback items shared by the 控制 menu and the macOS Dock menu. ctx.player(action)
// relays a cabin:player-command; ctx.status.playing names 播放 / 暂停; accelerators
// mirror the global media hotkeys (registered separately, so registerAccelerator: false).
// ctx: { player(action), status, mediaKeys: { bindings }, miniToggle, miniShown, miniPin, miniPinned, lyricsToggle }
function playbackMenuItems(ctx, { accelerators = false } = {}) {
  const keys = accelerators ? ctx.mediaKeys?.enabled === false ? {} : ctx.mediaKeys?.bindings || {} : {};
  const item = (label, action, extra = {}) => ({ label, click: () => ctx.player?.(action), ...(keys[action] ? { accelerator: keys[action], registerAccelerator: false } : {}), ...extra });
  return [
    item(ctx.status?.playing ? '暂停' : '播放', 'toggle'),
    item('上一首', 'previous'), item('下一首', 'next'),
    { type: 'separator' },
    item('音量 +', 'volume-up'), item('音量 −', 'volume-down'),
    ...(accelerators && (ctx.lyricsToggle || ctx.miniToggle) ? [
      { type: 'separator' },
      ...(ctx.lyricsToggle ? [{ label: '桌面歌词', click: ctx.lyricsToggle, ...(keys['lyrics-toggle'] ? { accelerator: keys['lyrics-toggle'], registerAccelerator: false } : {}) }] : []),
      ...(ctx.miniToggle ? [{ label: '迷你唱机', type: 'checkbox', checked: Boolean(ctx.miniShown), click: ctx.miniToggle }, { label: '迷你唱机总在最前', type: 'checkbox', checked: Boolean(ctx.miniPinned), click: () => ctx.miniPin?.(!ctx.miniPinned) }] : [])
    ] : [])
  ];
}
// macOS Dock right-click menu: the song, then the transport.
function dockMenuTemplate(ctx) {
  const track = ctx.status?.playing && ctx.track ? [{ label: ctx.track.length > 40 ? `${ctx.track.slice(0, 39)}…` : ctx.track, enabled: false }, { type: 'separator' }] : [];
  return [...track, ...playbackMenuItems(ctx).slice(0, 3), ...(ctx.miniToggle ? [{ type: 'separator' }, { label: '迷你唱机', type: 'checkbox', checked: Boolean(ctx.miniShown), click: ctx.miniToggle }] : [])];
}
// ── end M3 player ──────────────────────────────────────────────────────────

const ABOUT_DETAIL = '像素 Lo-fi 小屋：收藏专辑、听歌和专注。\n所有收藏与专注记录保存在这台电脑。\n\n使用 HarmonyOS Sans SC 字体，Copyright 2021 Huawei Device Co., Ltd.，字体原文件与授权协议随应用打包。\nQQ / 网易云播放模块来自 Simple Music（GPL-3.0）；曲库搜索来自 iTunes Search 与 MusicBrainz。';
module.exports = { appMenuTemplate, trayMenuTemplate, dockMenuTemplate, playbackMenuItems, ABOUT_DETAIL, SINK_HOTKEY };
