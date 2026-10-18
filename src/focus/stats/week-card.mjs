// Draws the weekly report as a pixel card on a 2D canvas context. No DOM access
// beyond the context, so it can be exercised with a stub in tests.
import { formatMinutes } from './stats-model.mjs';
export const CARD_W = 600, CARD_H = 840;
// Mirrors --px-* tokens (canvas cannot read CSS variables before export).
export const CARD_PALETTE = Object.freeze({ bg: '#1c120b', surface: '#2e1d12', inset: '#160d07', ink: '#ffe9cb', dim: '#c9a47a', faint: '#a88a68', accent: '#e0ad69', hi: '#ffd99c', lo: '#a8743c', border: '#8a5a32', good: '#9ccf8c' });
// Used when the cardPaper slot supplies a light paper texture (mirrors --px-paper*).
export const CARD_PAPER_PALETTE = Object.freeze({ bg: '#1c120b', surface: '#fff7e6', inset: 'rgba(59, 42, 32, .08)', ink: '#3b2a20', dim: '#6b5442', faint: '#8a735e', accent: '#a8743c', hi: '#3b2a20', lo: '#c9a47a', border: '#8a5a32', good: '#4f7d43' });
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

// Largest integer scale (>= 1) that fits an image inside maxW×maxH.
export function intScale(img, maxW, maxH) {
  const w = img?.naturalWidth || img?.width || 0, h = img?.naturalHeight || img?.height || 0;
  if (!w || !h) return 0;
  return Math.max(1, Math.floor(Math.min(maxW / w, maxH / h)));
}
const dims = (img, k) => [(img.naturalWidth || img.width) * k, (img.naturalHeight || img.height) * k];
// Tiles an image at 1:1 (art is pre-scaled 4× nearest) over a rect, clipped by drawImage source rects.
function tile(ctx, img, x, y, w, h) {
  const [tw, th] = dims(img, 1);
  for (let ty = 0; ty < h; ty += th) for (let tx = 0; tx < w; tx += tw) {
    const cw = Math.min(tw, w - tx), ch = Math.min(th, h - ty);
    ctx.drawImage(img, 0, 0, cw, ch, x + tx, y + ty, cw, ch);
  }
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
// Draws `img` once at the largest integer scale that fits maxW×maxH; returns [x, y, w, h] or null.
function sprite(ctx, img, x, y, maxW, maxH, anchor = 'tl') {
  const k = intScale(img, maxW, maxH); if (!k) return null;
  const [w, h] = dims(img, k), dx = anchor.includes('r') ? x - w : anchor.includes('c') ? x - Math.round(w / 2) : x, dy = anchor.includes('b') ? y - h : y;
  ctx.drawImage(img, dx, dy, w, h); return [dx, dy, w, h];
}
function tapeRect(ctx, x, y, w, h, p) { ctx.fillStyle = p === CARD_PAPER_PALETTE ? 'rgba(224, 173, 105, .55)' : 'rgba(255, 217, 156, .45)'; ctx.fillRect(x, y, w, h); }
// Mirrors the 周报 spread: taped card (cat, total, stacked book bars, best-day
// sticker), then 小屋来信, an album snapshot from focus records and the cat line.
// art: { cardPaper, cardStamp, cardTape, doodle, cat, bestSticker, barUnit, barCap, fedSticker }
// — loaded same-origin images; any missing slot falls back to flat pixels.
export function drawWeekCard(ctx, r, palette, { cover = null, art = {}, letter = null, mood = null } = {}) {
  const paper = art.cardPaper && intScale(art.cardPaper, 1, 1) ? art.cardPaper : null;
  const p = palette || (paper ? CARD_PAPER_PALETTE : CARD_PALETTE);
  ctx.imageSmoothingEnabled = false; ctx.textBaseline = 'top';
  ctx.fillStyle = p.bg; ctx.fillRect(0, 0, CARD_W, CARD_H); frame(ctx, 8, 8, CARD_W - 16, CARD_H - 16, p);
  if (paper) tile(ctx, paper, 12, 12, CARD_W - 24, CARD_H - 24);
  // Tape (top centre) and stamp/postmark (top right): each drawn exactly once.
  if (!sprite(ctx, art.cardTape, CARD_W / 2, 0, 128, 32, 'tc')) tapeRect(ctx, CARD_W / 2 - 48, 0, 96, 24, p);
  const stamp = sprite(ctx, art.cardStamp, CARD_W - 24, 24, 96, 96, 'tr');
  const textRight = stamp ? stamp[0] - 12 : CARD_W - 32;
  ctx.fillStyle = p.accent; ctx.font = `bold 24px ${FONT}`; ctx.fillText(clip(ctx, '心流小屋 · 周报', textRight - 36), 36, 36);
  ctx.fillStyle = p.dim; ctx.font = `14px ${FONT}`; ctx.fillText(r.label, 36, 70);
  // Hero: cat illustration (≤128) + total.
  const catImg = art.cat || art.doodle, heroY = 108;
  if (!sprite(ctx, catImg, 36, heroY, 128, 128)) { ctx.fillStyle = p.inset; ctx.fillRect(36, heroY, 128, 128); }
  ctx.fillStyle = p.faint; ctx.font = `14px ${FONT}`; ctx.fillText('这周专注', 184, heroY + 8);
  ctx.fillStyle = p.hi; ctx.font = `bold 34px ${FONT}`; ctx.fillText(formatMinutes(r.totalMinutes), 184, heroY + 30);
  ctx.fillStyle = r.deltaMinutes >= 0 ? p.good : p.dim; ctx.font = `14px ${FONT}`;
  ctx.fillText(clip(ctx, `${r.deltaMinutes === 0 ? '与上周持平' : `${r.deltaMinutes > 0 ? '▲ 比上周多' : '▼ 比上周少'} ${formatMinutes(Math.abs(r.deltaMinutes))}`} · ${r.pomodoros} 个番茄`, CARD_W - 220), 184, heroY + 76);
  ctx.fillStyle = p.ink; ctx.font = `14px ${FONT}`;
  wrap(ctx, r.summary, CARD_W - 220).slice(0, 2).forEach((line, i) => ctx.fillText(line, 184, heroY + 100 + i * 20));
  // Stacked bars: 10 units max, 12 px each (16×6 art at 2×) + 8 px cap.
  const peak = Math.max(30, ...r.daily.map((d) => d.minutes)), colW = Math.floor((CARD_W - 72) / 7), base = 438;
  r.daily.forEach((d, i) => {
    const cx = 36 + i * colW + Math.floor(colW / 2), n = d.minutes ? Math.max(1, Math.min(10, Math.round(d.minutes / peak * 10))) : 0, x = cx - 16;
    if (!n) { ctx.fillStyle = p.lo; ctx.fillRect(x, base - 2, 32, 2); }
    for (let u = 0; u < n; u++) { const y = base - (u + 1) * 12; if (art.barUnit) ctx.drawImage(art.barUnit, x, y, 32, 12); else { ctx.fillStyle = u % 2 ? p.lo : p.accent; ctx.fillRect(x, y, 32, 12); ctx.fillStyle = p.border; ctx.fillRect(x, y + 10, 32, 2); } }
    const top = base - n * 12;
    if (n) { if (art.barCap) ctx.drawImage(art.barCap, x, top - 8, 32, 8); else { ctx.fillStyle = p.hi; ctx.fillRect(x + 2, top - 6, 28, 6); } }
    const best = d === r.bestDay;
    ctx.fillStyle = best ? p.accent : p.faint; ctx.font = `${best ? 'bold ' : ''}12px ${FONT}`;
    if (d.minutes) { const t = `${d.minutes}′`; ctx.fillText(t, cx - Math.round(ctx.measureText(t).width / 2), top - 26); }
    ctx.fillStyle = p.faint; ctx.font = `12px ${FONT}`; ctx.fillText(d.label, cx - 12, base + 8);
    if (best && n) sprite(ctx, art.bestSticker, cx + 4, Math.max(260, top - 64), 32, 32);
  });
  // Divider + 小屋来信
  ctx.fillStyle = p.lo; for (let x = 36; x < CARD_W - 36; x += 8) ctx.fillRect(x, 476, 4, 2);
  ctx.fillStyle = p.accent; ctx.font = `bold 16px ${FONT}`; ctx.fillText('小屋来信', 36, 492);
  ctx.fillStyle = p.ink; ctx.font = `14px ${FONT}`;
  const lines = (letter || [r.summary]).flatMap((l) => wrap(ctx, l, CARD_W - 72)).slice(0, 8);
  lines.forEach((line, i) => { ctx.fillText(line, 36, 520 + i * 22); ctx.fillStyle = p.inset; ctx.fillRect(36, 538 + i * 22, CARD_W - 72, 1); ctx.fillStyle = p.ink; });
  ctx.fillStyle = p.dim; ctx.fillText('—— 小屋里的猫', CARD_W - 150, 520 + lines.length * 22 + 2);
  // Bottom row: polaroid (album) + cat line + finished count.
  const rowY = 700;
  ctx.fillStyle = '#fffdf6'; ctx.fillRect(36, rowY, 84, 104); ctx.fillStyle = p.border; ctx.fillRect(36, rowY + 102, 84, 2);
  if (r.album && cover) ctx.drawImage(cover, 44, rowY + 8, 68, 68);
  else { ctx.fillStyle = '#3b2a20'; ctx.fillRect(44, rowY + 8, 68, 68); ctx.fillStyle = '#1c120b'; ctx.fillRect(52, rowY + 16, 52, 52); ctx.fillStyle = '#e0ad69'; ctx.fillRect(72, rowY + 36, 12, 12); }
  tapeRect(ctx, 56, rowY - 6, 44, 12, p);
  ctx.fillStyle = '#3b2a20'; ctx.font = `12px ${FONT}`; ctx.fillText(clip(ctx, r.album ? `《${r.album.title}》` : '无唱片记录', 76), 40, rowY + 82);
  ctx.font = `14px ${FONT}`; let y = rowY + 6;
  const facts = [
    r.album ? `专注时放在唱机上的唱片 · 《${r.album.title}》${r.album.artist ? ` · ${r.album.artist}` : ''}` : null,
    r.bestDay ? `最好的一天 · ${r.bestDay.label} ${formatMinutes(r.bestDay.minutes)}` : null,
    r.completed.length ? `✓ 勾掉 ${r.completed.length} 件 · ${r.completed.slice(0, 3).join('、')}` : '这周没有勾掉待办，也没关系',
    mood && (mood.feeds > 0 || mood.label) ? `小猫 · ${mood.feeds > 0 ? `喂了 ${mood.feeds} 次` : ''}${mood.feeds > 0 && mood.label ? '，' : ''}${mood.label || ''}` : null
  ].filter(Boolean);
  for (const f of facts) { ctx.fillStyle = p.ink; ctx.fillText(clip(ctx, f, CARD_W - 180), 140, y); y += 24; }
  if (mood?.feeds > 0) sprite(ctx, art.fedSticker, CARD_W - 68, rowY + 60, 32, 32);
  return { width: CARD_W, height: CARD_H };
}
