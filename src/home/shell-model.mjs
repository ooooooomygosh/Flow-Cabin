// 3.0 首页外壳（docs/design/3.0-design.md §5.1、§6.1）：顶栏三个入口、齿轮菜单、
// 全屋视图里只标注三个热点，以及实验室关闭时收起的入口。纯函数，方便测试。

// 顶栏：唱片架 · 专注 · 日记（右侧另有 ⚙ 与全屏）。action 交给 commands.open。
export const NAV_ENTRIES = Object.freeze([
  { id: 'library', label: '唱片架', action: 'library' },
  { id: 'focus', label: '专注', action: 'timer' },
  { id: 'diary', label: '日记', action: 'diary' }
]);

// 全屋视图里常驻文字的三个热点。每个热点取房间里第一件在场的家具（按 types 顺序）。
export const HOTSPOTS = Object.freeze([
  { id: 'listen', action: 'music', types: ['deck', 'records', 'player'], labels: { deck: '唱机', records: '唱机', player: '唱机' } },
  { id: 'focus', action: 'timer', types: ['desk', 'clock', 'timer'], labels: { desk: '书桌', clock: '专注钟', timer: '专注钟' } },
  { id: 'journal', action: 'diary', types: ['journal', 'bed'], labels: { journal: '日记本', bed: '窝 · 日记本' } }
]);

// itemId → { id, action, label }
export function hotspotItems(items = []) {
  const out = new Map();
  for (const spot of HOTSPOTS) {
    for (const type of spot.types) {
      const item = items.find((entry) => entry?.type === type);
      if (item) { out.set(item.id, { id: spot.id, action: spot.action, label: spot.labels[type] }); break; }
    }
  }
  return out;
}

// 齿轮「小屋日常」：只留四项；实验室开着时再多几项。
export function gearMenu(labs = {}) {
  const core = [['themes', '选择小屋'], ['decorate', '布置小屋'], ['backup', '备份与恢复'], ['settings', '全部设置']];
  const lab = [...(labs.scenes ? [['recipes', '场景配方'], ['sleep', '睡前模式']] : []), ...(labs.postcard ? [['postcard', '小屋明信片']] : [])];
  return { core, lab };
}

// 家具上的入口：实验室关闭时换成一个仍然有意义的去处，而不是打开被收起的功能。
const FALLBACKS = Object.freeze({ mail: ['letters', 'diary'], postcard: ['postcard', 'diary'], study: ['study', 'library'], recipes: ['scenes', ''], sleep: ['scenes', ''] });
export function gatedAction(action, labs = {}) {
  const rule = FALLBACKS[action];
  return !rule || labs[rule[0]] ? action : rule[1];
}
