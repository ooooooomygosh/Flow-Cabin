// 设置 › 搜索: a small hand-written index of what each section holds, so a
// query like "备份", "通知" or "qq" lands on the right page without rendering
// every section. `anchor` is the visible text the hub scrolls to and
// highlights after jumping (defaults to `title`). `when` hides rows the
// current build cannot show: 'desktop' (Electron shell), 'native' (desktop or
// Android), 'mobile' (Android). `section` is a 3.0 hub section (settings-sections.mjs).
import { LAB_FEATURES } from '../product/features.mjs';
import { hubTab } from './settings-sections.mjs';

// 实验室里的每个开关也能搜到（“明信片”“词书”……）。
const LAB_ENTRIES = Object.entries(LAB_FEATURES).map(([id, lab]) => ({ id: `lab-${id}`, section: 'labs', title: lab.label, keywords: `实验室 开关 隐藏 显示 ${lab.hint}` }));

export const SETTINGS_INDEX = Object.freeze([
  { id: 'source', section: 'music', title: '唱机音源', anchor: '仅动画展示', keywords: '音源 播放 来源 qq音乐 网易云 本地音乐 apple music 系统播放器 自动匹配 music assistant source' },
  { id: 'accounts', section: 'music/accounts', title: '账户与文件夹', keywords: '登录 账号 退出登录 文件夹 扫描 music assistant 凭据 cookie', when: 'native' },
  { id: 'quality', section: 'music', title: '音质', keywords: '无损 高品质 码率 会员 quality', when: 'native' },
  { id: 'crossfade', section: 'music', title: '歌曲过渡', keywords: '淡入 淡出 无缝 交叉 crossfade gapless 下一首' },
  { id: 'home', section: 'room', title: '经典首页（过渡）', anchor: '经典首页', keywords: '首页 生活小屋 原版 唱片架 界面 切换首页 经典 interface' },
  { id: 'decorate', section: 'room', title: '布置小屋', keywords: '家具 摆放 布局 预设 听歌 工作 休息' },
  { id: 'scene', section: 'room', title: '房间场景', anchor: '你的休憩角落', keywords: '主题 场景 房间 背景 皮肤 风景 theme' },
  { id: 'pet', section: 'room', title: '陪你的小伙伴', keywords: '桌宠 宠物 伙伴 猫 奶糖 枫糖 pet' },
  { id: 'sky', section: 'room', title: '窗外天气', anchor: '窗外', keywords: '天气 城市 位置 定位 温度 天空 和风 weather' },
  { id: 'pet-packs', section: 'room', title: '导入桌宠动画包', anchor: '让小伙伴换一种模样', keywords: '桌宠衣柜 动画包 png webm dsh-pet 导入', when: 'native' },
  { id: 'launcher', section: 'room', title: '桌宠启动图标', keywords: '图标 启动器 桌面图标', when: 'mobile' },
  { id: 'typing', section: 'room', title: '跨应用键鼠陪伴', anchor: '奶糖会在你使用其他应用时', keywords: '键盘 鼠标 打字 点击 输入监控 权限 辅助功能 统计 typing' },
  { id: 'timer', section: 'focus', title: '番茄钟时长', anchor: '专注（分）', keywords: '专注 时长 短休 长休 几轮 番茄 pomodoro 计时' },
  { id: 'notify', section: 'focus', title: '系统通知', keywords: '提醒 通知 权限 专注结束 notification' },
  { id: 'chime', section: 'focus', title: '提示音', keywords: '铃声 声音 结束提醒' },
  { id: 'auto', section: 'focus', title: '自动开始休息', anchor: '专注结束自动开始休息', keywords: '自动 休息 专注 连续 隐藏秒数' },
  { id: 'goal', section: 'focus', title: '每日目标', anchor: '每日目标（分钟，0 关闭）', keywords: '目标 分钟 每天 统计' },
  { id: 'sync', section: 'labs', title: '同步与设备', keywords: '配对 二维码 局域网 wi-fi 手机 平板 遥控 副屏 接力 设备 同步 证书' },
  { id: 'performance', section: 'desktop', title: '流畅模式', keywords: '性能 画质 卡顿 掉帧 省电 动画 performance' },
  { id: 'desktop-mode', section: 'desktop', title: '沉入桌面', keywords: '动态壁纸 壁纸 桌面 小组件 wallpaper' },
  { id: 'autostart', section: 'desktop', title: '开机时打开小屋', keywords: '开机启动 自启动 登录 autostart', when: 'desktop' },
  { id: 'display', section: 'desktop', title: '显示与字体', keywords: '缩放 字体 字号 减少动态效果 动效', when: 'desktop' },
  { id: 'shortcuts', section: 'desktop', title: '快捷键', keywords: '键盘 按键 速查 shortcut keyboard hotkey' },
  { id: 'storage', section: 'data', title: '这台手机的小屋', keywords: '本机 存储 空间 保存', when: 'mobile' },
  { id: 'backup', section: 'data', title: '收藏与备份', keywords: '导出 导入 备份 恢复 迁移 数据 backup export import' },
  { id: 'folders', section: 'data', title: '本地音乐文件夹', keywords: '文件夹 扫描 本地音乐', when: 'desktop' },
  { id: 'diagnostics', section: 'data', title: '功能诊断', keywords: '诊断 状态 排查 问题 报告 导出 diagnostics' },
  { id: 'ai', section: 'labs', title: 'AI 服务', anchor: '选一个已经配置好的 AI 模板', keywords: 'ai 模型 接口 api key openai 智能唱片机 大模型 llm' },
  { id: 'letters', section: 'labs', title: '来信的语气与频率', anchor: '多久一封', keywords: '小屋来信 来信 回信 信箱 语气 多久一封 letter' },
  { id: 'update', section: 'labs', title: '检查更新', anchor: '心流小屋 v', keywords: '关于 版本 更新 下载 升级 update version about' },
  { id: 'whats-new', section: 'labs', title: '新功能', keywords: '关于 更新内容 版本历史 更新日志 changelog what\'s new' },
  { id: 'onboarding', section: 'labs', title: '重新引导', keywords: '新手 引导 教程 欢迎 onboarding' },
  ...LAB_ENTRIES
]);

// Lower-case, full-width → half-width, single spaces: "ＱＱ  音乐" matches "qq音乐".
export function normalizeQuery(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}
const squash = (text) => text.replace(/\s+/g, '');

export function visibleEntries(env = {}, index = SETTINGS_INDEX) {
  return index.filter((entry) => !entry.when
    || (entry.when === 'desktop' && env.desktop)
    || (entry.when === 'mobile' && env.mobile)
    || (entry.when === 'native' && (env.desktop || env.mobile)));
}

// Every whitespace-separated term must appear in the title, the section's
// label or the keywords. Titles rank first, then section names, then keywords;
// the index order breaks ties, so a section reads top to bottom.
export function searchSettings(query, { env = {}, labels = {}, index = SETTINGS_INDEX } = {}) {
  const q = normalizeQuery(query);
  if (!q) return [];
  const terms = q.split(' ');
  return visibleEntries(env, index).map((entry, order) => {
    const title = normalizeQuery(entry.title), label = normalizeQuery(labels[hubTab(entry.section)] || ''), keywords = normalizeQuery(entry.keywords || '');
    let score = 0;
    for (const term of terms) {
      const bare = squash(term);
      if (title.startsWith(term) || squash(title).startsWith(bare)) score += 6;
      else if (title.includes(term) || squash(title).includes(bare)) score += 4;
      else if (label.includes(term)) score += 2;
      else if (keywords.includes(term) || squash(keywords).includes(bare)) score += 1;
      else return null;
    }
    return { ...entry, score, order };
  }).filter(Boolean).sort((a, b) => b.score - a.score || a.order - b.order).map(({ order, ...entry }) => entry);
}

// The sections that hold at least one result, in the hub's order.
export function matchingSections(results, sections) {
  const hit = new Set(results.map((entry) => hubTab(entry.section)));
  return sections.filter((section) => hit.has(section.id));
}
