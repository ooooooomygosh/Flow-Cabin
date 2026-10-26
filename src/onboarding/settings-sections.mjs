// 设置的分区（3.0：9 → 6，见 docs/design/3.0-design.md §5.4）。
// 旧的分区 id 仍然可以打开设置（托盘、菜单、其他面板的 `cabin-open-settings`、
// 回归脚本……），它们落到新的分区，并滚到原来那一块。

export const HUB_SECTIONS = Object.freeze([
  { id: 'music', label: '音乐' }, { id: 'focus', label: '专注' }, { id: 'room', label: '小屋与奶糖' },
  { id: 'desktop', label: '桌面' }, { id: 'data', label: '数据' }, { id: 'labs', label: '实验室' }
]);
export const HUB_IDS = Object.freeze(HUB_SECTIONS.map((item) => item.id));

// 旧 id → [新分区, 分区里的锚点（DOM id）]。'beta' 是 2.1 的首页选择。
export const LEGACY_SECTIONS = Object.freeze({
  beta: ['room', 'hub-home'], companion: ['room', 'hub-companion'], sky: ['room', 'hub-sky'], weather: ['room', 'hub-sky'],
  sync: ['labs', 'hub-sync'], ai: ['labs', 'hub-ai'], about: ['labs', 'hub-about'], diagnostics: ['data', 'hub-diagnostics']
});

// 'music/accounts' 是 音乐 › 账户与文件夹 这一页；未知的 id 回到 音乐。
export function hubTab(section = '') {
  const head = String(section || '').split('/')[0];
  if (HUB_IDS.includes(head)) return head;
  return LEGACY_SECTIONS[head]?.[0] || 'music';
}
// 打开后要滚到的那一块（没有就是分区顶部）。
export const hubAnchor = (section = '') => LEGACY_SECTIONS[String(section || '').split('/')[0]]?.[1] || '';
