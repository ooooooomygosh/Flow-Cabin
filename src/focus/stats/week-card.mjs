// Draws the weekly report as a pixel card on a 2D canvas context. No DOM access
// beyond the context, so it can be exercised with a stub in tests.
import { formatMinutes } from './stats-model.mjs';
export const CARD_W = 480, CARD_H = 640;
// Mirrors --px-* tokens (canvas cannot read CSS variables before export).
export const CARD_PALETTE = Object.freeze({ bg: '#1c120b', surface: '#2e1d12', inset: '#160d07', ink: '#ffe9cb', dim: '#c9a47a', faint: '#a88a68', accent: '#e0ad69', hi: '#ffd99c', lo: '#a8743c', border: '#8a5a32', good: '#9ccf8c' });
const FONT = "'Fusion Pixel 12', 'Zpix', 'PingFang SC', 'Microsoft YaHei', sans-serif";

function frame(ctx, x, y, w, h, p) {
  ctx.fillStyle = p.border; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = p.surface; ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
  ctx.fillStyle = p.hi; ctx.fillRect(x + 4, y + 4, w - 8, 2); ctx.fillStyle = p.lo; ctx.fillRect(x + 4, y + h - 6, w - 8, 2);
}
function clip(ctx, text, max) { let t = String(text); while (t.length > 1 && ctx.measureText(t).width > max) t = t.slice(0, -2) + '…'; return t; }
function wrap(ctx, text, max) {
  const lines = []; let line = '';
  for (const ch of String(text)) { if (ctx.measureText(line + ch).width > max && line) { lines.push(line); line = ch; } else line += ch; }
  return line ? [...lines, line] : lines;
}

// PNG export may only draw covers that cannot taint the canvas.
export function canDrawCover(url, origin) {
  if (!url) return false;
  if (/^data:image\//i.test(url)) return true;
  try { return new URL(url, origin).origin === origin; } catch { return false; }
}
// 32×32 cover at 1.5× (48 px), or a pixel record placeholder.
function drawCover(ctx, x, y, image, p) {
  ctx.fillStyle = p.border; ctx.fillRect(x - 2, y - 2, 52, 52);
  if (image) { ctx.imageSmoothingEnabled = false; ctx.drawImage(image, x, y, 48, 48); return; }
  ctx.fillStyle = p.inset; ctx.fillRect(x, y, 48, 48);
  ctx.fillStyle = p.lo; ctx.fillRect(x + 8, y + 8, 32, 32); ctx.fillStyle = p.inset; ctx.fillRect(x + 12, y + 12, 24, 24);
  ctx.fillStyle = p.accent; ctx.fillRect(x + 20, y + 20, 8, 8);
}
export function drawWeekCard(ctx, r, p = CARD_PALETTE, { cover = null } = {}) {
  ctx.imageSmoothingEnabled = false; ctx.textBaseline = 'top';
  ctx.fillStyle = p.bg; ctx.fillRect(0, 0, CARD_W, CARD_H); frame(ctx, 8, 8, CARD_W - 16, CARD_H - 16, p);
  ctx.fillStyle = p.accent; ctx.font = `bold 22px ${FONT}`; ctx.fillText('心流小屋 · 周报', 32, 32);
  ctx.fillStyle = p.dim; ctx.font = `14px ${FONT}`; ctx.fillText(r.label, 32, 62);
  // Totals
  ctx.fillStyle = p.inset; ctx.fillRect(32, 92, CARD_W - 64, 72);
  ctx.fillStyle = p.hi; ctx.font = `bold 28px ${FONT}`; ctx.fillText(formatMinutes(r.totalMinutes), 48, 104);
  ctx.fillStyle = r.deltaMinutes >= 0 ? p.good : p.dim; ctx.font = `14px ${FONT}`;
  ctx.fillText(r.deltaMinutes === 0 ? '与上周持平' : `${r.deltaMinutes > 0 ? '▲ 比上周多' : '▼ 比上周少'} ${formatMinutes(Math.abs(r.deltaMinutes))} · ${r.pomodoros} 个番茄`, 48, 140);
  // 7 pixel bars, heights snapped to 4px.
  const peak = Math.max(30, ...r.daily.map((d) => d.minutes)), bw = 40, gap = (CARD_W - 64 - bw * 7) / 6, base = 290;
  r.daily.forEach((d, i) => {
    const x = 32 + i * (bw + gap), h = d.minutes ? Math.max(4, Math.round(d.minutes / peak * 96 / 4) * 4) : 2;
    ctx.fillStyle = d === r.bestDay ? p.hi : p.accent; ctx.fillRect(x, base - h, bw, h);
    ctx.fillStyle = p.lo; for (let y = base - h + 4; y < base; y += 8) ctx.fillRect(x, y, bw, 2);
    ctx.fillStyle = p.faint; ctx.font = `12px ${FONT}`; ctx.fillText(d.label, x + 4, base + 6);
  });
  // Facts
  const facts = [
    ['最好的一天', r.bestDay ? `${r.bestDay.label} · ${formatMinutes(r.bestDay.minutes)}` : '—'],
    ['最专注时段', r.bestSlot ? `${r.bestSlot.label} ${r.bestSlot.from}–${r.bestSlot.to} 点` : '—'],
    ['最长连续', `${r.longestStreak} 天`],
    ['最常听', r.album ? `《${r.album.title}》${r.album.artist ? ` · ${r.album.artist}` : ''}` : '—'],
    ['主要待办', r.topTasks.length ? r.topTasks.map((t) => t.name).join('、') : '—'],
    ['完成待办', r.completed.length ? `${r.completed.length} 件：${r.completed.join('、')}` : '—']
  ];
  ctx.font = `14px ${FONT}`;
  facts.forEach(([k, v], i) => { const y = 326 + i * 30; ctx.fillStyle = p.faint; ctx.fillText(k, 32, y); ctx.fillStyle = p.ink; ctx.fillText(clip(ctx, v, CARD_W - 160), 128, y); });
  if (r.album && (cover || r.album.cover)) drawCover(ctx, CARD_W - 84, 28, cover, p);
  // Summary
  ctx.fillStyle = p.inset; ctx.fillRect(32, 520, CARD_W - 64, 84); ctx.fillStyle = p.hi; ctx.font = `15px ${FONT}`;
  wrap(ctx, r.summary, CARD_W - 96).slice(0, 3).forEach((line, i) => ctx.fillText(line, 48, 534 + i * 22));
  return { width: CARD_W, height: CARD_H };
}
