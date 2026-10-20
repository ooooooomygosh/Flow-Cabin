'use strict';
const $ = (id) => document.getElementById(id);
for (const node of document.querySelectorAll('[data-hero]')) {
  const request = new XMLHttpRequest(); request.open('GET', `icons/${node.dataset.hero}.svg`);
  request.onload = () => { if (request.status === 200) node.innerHTML = request.responseText; }; request.send();
}
const actionMap = { menu: 'menu', 'retry-page': 'retry', settings: 'settings', 'fit-display': 'fit-display', minimize: 'minimize', maximize: 'maximize', close: 'close' };
for (const [id, command] of Object.entries(actionMap)) $(id).addEventListener('click', () => window.albumDesktop.command(command).catch(() => {}));
let panelOpen = false;
function showSettings(settings) {
  $('font').value = settings.font; $('weight').value = String(settings.weight); $('zoom').value = String(settings.zoom);
  $('reduce-motion').checked = settings.reduceMotion; $('typing-follow').checked = settings.typingFollow === true; updatePreview();
}
const TYPING_TEXT = {
  off: '全局键鼠跟随已关闭，仅跟随小屋内的键盘和点击活动。',
  active: '键鼠跟随已开启：奶糖会响应其他应用里的键盘按下和鼠标点击，并只在本机按天累计次数。',
  'waiting-pet': '已开启：让伙伴出门（桌宠）后生效。',
  'needs-permission': '需要在「系统设置 › 隐私与安全性 › 输入监控」里允许心流小屋。只需这一项权限，不再需要辅助功能；授权前只响应小屋内的输入。',
  unavailable: '这台电脑暂时无法使用全局键鼠检测，键鼠跟随仅响应小屋内的键盘和点击活动。'
};
function showTyping(typing) {
  if (!typing) return;
  $('typing-status').textContent = TYPING_TEXT[typing.status] || '';
  $('typing-permission').hidden = typing.status !== 'needs-permission' || typing.platform !== 'darwin';
  $('typing-input-permission').hidden = typing.platform !== 'darwin';
  $('typing-repair-permission').hidden = typing.platform !== 'darwin';
}
$('typing-permission').addEventListener('click', async () => {
  try { const data = await window.albumDesktop.settings('typing-permission'); showTyping(data.typing); } catch { /* the hint stays */ }
});
$('typing-input-permission').addEventListener('click', async () => {
  try { const data = await window.albumDesktop.settings('typing-input-permission'); showTyping(data.typing); } catch { /* the hint stays */ }
});
$('typing-repair-permission').addEventListener('click', async () => {
  try { const data = await window.albumDesktop.settings('typing-repair-permission'); showTyping(data.typing); } catch { /* the user can cancel or retry */ }
});
function showDisplay(display) { if (display) $('display-info').textContent = `${display.name} · ${display.width} × ${display.height} · 缩放 ${display.scale}% · ${Math.round(display.refreshRate)} Hz`; }
function updatePreview() {
  $('zoom-value').textContent = `${$('zoom').value}%`;
  const family = $('font').value === 'bundled' ? 'HarmonyOS Sans SC Bundled' : $('font').value;
  $('font-preview').style.fontFamily = $('font').value === 'system' ? 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif' : `${JSON.stringify(family)}, system-ui, sans-serif`;
  $('font-preview').style.fontWeight = $('weight').value;
}
async function loadSettings() {
  try {
    const data = await window.albumDesktop.settings('get');
    const pendingFont = $('font').value || data.settings.font;
    const group = document.createElement('optgroup'); group.label = '本机已安装字体';
    for (const font of data.fonts) { const option = document.createElement('option'); option.value = font; option.textContent = font; group.append(option); }
    $('font').querySelector('optgroup')?.remove(); $('font').append(group);
    $('font-hint').textContent = data.fonts.length ? `也可以选用本机的 ${data.fonts.length} 种字体。` : '本机字体列表读取失败，仍可使用内置字体。';
    $('font').value = pendingFont; updatePreview(); showDisplay(data.display); showTyping(data.typing);
  } catch { $('settings-notice').textContent = '无法读取设置，请关闭后重试。'; }
}
for (const id of ['font', 'weight', 'zoom']) $(id).addEventListener('input', updatePreview);
let saveQueue = Promise.resolve();
function saveDraft() {
  const draft = { font: $('font').value || 'system', weight: Number($('weight').value), zoom: Number($('zoom').value), reduceMotion: $('reduce-motion').checked, typingFollow: $('typing-follow').checked };
  $('settings-notice').textContent = '正在应用…';
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    const saved = await window.albumDesktop.settings('apply', draft); showTyping(saved?.typing);
    $('settings-notice').textContent = '已保存。';
  });
  return saveQueue;
}
const showSaveError = (error) => { $('settings-notice').textContent = `保存失败：${error.message}`; };
$('settings-form').addEventListener('change', () => saveDraft().catch(showSaveError));
$('settings-form').addEventListener('submit', (event) => { event.preventDefault(); saveDraft().catch(showSaveError); });
$('settings-close').addEventListener('click', async () => {
  try { await saveDraft(); await window.albumDesktop.command('settings-close'); } catch (error) { showSaveError(error); }
});
$('settings-reset').addEventListener('click', async () => {
  try { const data = await window.albumDesktop.settings('reset'); showSettings(data.settings); showTyping(data.typing); $('settings-notice').textContent = '已恢复默认设置。'; }
  catch { $('settings-notice').textContent = '恢复失败，请重试。'; }
});
$('font-license').addEventListener('click', () => {
  const box = $('license-text'); box.hidden = !box.hidden;
  if (!box.hidden && !box.textContent) {
    const request = new XMLHttpRequest(); request.open('GET', 'fonts/LICENSE.txt');
    request.onload = () => { box.textContent = request.responseText.replace(/\0/g, ''); };
    request.onerror = () => { box.textContent = '授权协议随程序的字体文件一起打包。'; }; request.send();
  }
});
window.albumDesktop.onState((state) => {
  document.body.dataset.shellVisible = String(Boolean(state.settingsOpen || state.loading || state.error));
  $('connection').hidden = !state.loading && !state.error;
  $('loader').hidden = Boolean(state.error);
  $('recovery').hidden = !state.error;
  $('headline').textContent = state.error ? '小屋的灯暂时没亮' : '正在点亮小屋';
  $('message').textContent = state.error || '壁炉生起火，唱机上好弦，马上就好。';
  $('settings-panel').hidden = !state.settingsOpen; showDisplay(state.display);
  if (state.settingsOpen && !panelOpen) { showSettings(state.settings); $('settings-notice').textContent = '修改后立即生效'; loadSettings(); $('settings-close').focus(); }
  if (!state.settingsOpen && panelOpen && (state.loading || state.error)) $('settings').focus();
  panelOpen = state.settingsOpen;
});
window.addEventListener('keydown', (event) => {
  if (!panelOpen) return;
  if (event.key === 'Escape') { event.preventDefault(); window.albumDesktop.command('settings-close').catch(() => {}); }
  if (event.key === 'Tab') {
    const controls = [...$('settings-panel').querySelectorAll('button:not(:disabled), input, select')].filter((control) => control.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
window.albumDesktop.command('ready').catch(() => {});
