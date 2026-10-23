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
//        petActive, petStart, petStop, petHidden, petShow, sinkActive, sinkEnter, sinkExit, quit }
function trayMenuTemplate(ctx) {
  const status = ctx.status || {};
  return [
    { label: status.statusLine || '心流小屋', enabled: false },
    { type: 'separator' },
    { label: status.playing ? '暂停音乐' : '播放音乐', click: () => ctx.player?.('toggle') },
    { label: '下一首', click: () => ctx.player?.('next') },
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
    { type: 'separator' }, { label: '退出应用', click: ctx.quit }
  ];
}

const ABOUT_DETAIL = '像素 Lo-fi 小屋：收藏专辑、听歌和专注。\n所有收藏与专注记录保存在这台电脑。\n\n使用 HarmonyOS Sans SC 字体，Copyright 2021 Huawei Device Co., Ltd.，字体原文件与授权协议随应用打包。\nQQ / 网易云播放模块来自 Simple Music（GPL-3.0）；曲库搜索来自 iTunes Search 与 MusicBrainz。';
module.exports = { appMenuTemplate, trayMenuTemplate, ABOUT_DETAIL, SINK_HOTKEY };
