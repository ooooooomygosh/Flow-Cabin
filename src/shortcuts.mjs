// Every keyboard shortcut of the cabin in one table: 设置 › 显示与桌面 › 快捷键 is
// rendered from it and buttons take `aria-keyshortcuts` from `keys`.
// scope: 'room' (the cabin, no dialog open), 'deck' (a record is on the deck),
// 'corner' (唱机特写), 'display' (专注画面 filling the window), 'app' (anywhere in the desktop app).
export const SHORTCUTS = Object.freeze([
  { id: 'play', keys: 'Space', label: '空格', action: '播放 / 暂停', scope: 'deck' },
  { id: 'seek', keys: 'ArrowLeft ArrowRight', label: '← →', action: '快退 / 快进 5 秒', scope: 'deck', repeat: true },
  { id: 'track', keys: 'Shift+ArrowLeft Shift+ArrowRight', label: 'Shift+← →', action: '上一首 / 下一首', scope: 'deck' },
  { id: 'volume', keys: '- =', label: '− =', action: '音量', scope: 'deck', repeat: true },
  { id: 'mute', keys: 'M', label: 'M', action: '静音', scope: 'deck' },
  { id: 'repeat', keys: 'R', label: 'R', action: '循环方式', scope: 'deck' },
  { id: 'shuffle', keys: 'S', label: 'S', action: '随机', scope: 'deck' },
  { id: 'shelf', keys: 'ArrowUp ArrowDown Home End', label: '↑ ↓', action: '翻唱片架', scope: 'room', repeat: true },
  { id: 'load', keys: 'Enter', label: '回车', action: '把选中的唱片放上唱机', scope: 'room' },
  { id: 'zen', keys: 'Z', label: 'Z', action: '沉浸', scope: 'room' },
  { id: 'corner', keys: 'T', label: 'T', action: '唱机特写', scope: 'room' },
  { id: 'back', keys: 'Escape', label: 'Esc', action: '返回 / 退出沉浸', scope: 'room' },
  { id: 'fullscreen', keys: 'F11', label: 'F11', action: '全屏', scope: 'app' },
  { id: 'desktop', keys: 'Control+Alt+D Meta+Alt+D', label: 'Ctrl/⌘+Alt+D', action: '沉入 / 浮出桌面', scope: 'app' },
  { id: 'settings', keys: 'Control+, Meta+,', label: 'Ctrl/⌘+,', action: '显示与字体', scope: 'app' },
  { id: 'journal', keys: 'L', label: 'L', action: '打开小屋日记', scope: 'room' },
  { id: 'focusDisplay', keys: 'F', label: 'F', action: '专注画面：窗口变成时钟', scope: 'room' },
  { id: 'focusFaces', keys: 'ArrowLeft ArrowRight', label: '← →', action: '专注画面里换一个画面', scope: 'display' }
]);
export const shortcut = (id) => SHORTCUTS.find((entry) => entry.id === id);
export const ariaKeys = (id) => shortcut(id)?.keys || undefined;
