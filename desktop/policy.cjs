'use strict';

// Virtual origin of the cabin page. Every request to it is answered on this
// computer (site-router.cjs); it is kept so data saved by earlier versions
// under this origin's localStorage stays available.
const SITE_ORIGIN = 'https://album-circle.vercel.app';
const SHELL_ORIGIN = 'album-desktop://shell';
const SHELL_URL = `${SHELL_ORIGIN}/index.html`;
const companionCsp = hostname => `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' ${hostname === 'pet' ? SITE_ORIGIN : 'https:'} data:; font-src 'self'; connect-src 'self'; media-src 'self' ${SITE_ORIGIN}; object-src 'none'; frame-src 'none'; base-uri 'none'`;

function parseUrl(value) {
  try { return new URL(value); } catch { return null; }
}

function isSiteUrl(value) {
  const url = parseUrl(value);
  return Boolean(url && url.origin === SITE_ORIGIN && !url.username && !url.password);
}

function isShellUrl(value) {
  const url = parseUrl(value);
  return Boolean(url && url.protocol === 'album-desktop:' && url.hostname === 'shell'
    && !url.username && !url.password && !url.port && url.pathname === '/index.html');
}

function isExternalUrl(value) {
  const url = parseUrl(value);
  return Boolean(url && url.protocol === 'https:' && !url.username && !url.password && url.hostname);
}

// Keep downloads local and small; only the named study template gains TSV.
function localDownloadType({ url, filename, bytes, mimeType }) {
  if (!String(url).startsWith(`blob:${SITE_ORIGIN}/`) || !Number.isFinite(bytes) || bytes < 0) return null;
  if (/^FlowCabin-backup-\d{8}\.json$/.test(filename) && bytes <= 64 * 1024 * 1024) return 'backup';
  if (/\.(png|json)$/i.test(filename) && bytes <= 64 * 1024 * 1024) return /\.png$/i.test(filename) ? 'png' : 'json';
  if (filename === '小屋词书模板.tsv' && mimeType === 'text/tab-separated-values' && bytes <= 4096) return 'tsv';
  return null;
}
// The native save dialog's wording per allowed download.
const SAVE_DIALOGS = Object.freeze({
  backup: { title: '保存备份', filter: '心流小屋备份', extension: 'json' },
  json: { title: '保存专辑墙工程', filter: '专辑墙工程', extension: 'json' },
  png: { title: '保存专辑墙图片', filter: 'PNG 图片', extension: 'png' },
  tsv: { title: '保存词书模板', filter: '词书模板', extension: 'tsv' }
});
const saveDialog = (type) => SAVE_DIALOGS[type] || null;

function safeSavedWindow(value, workArea) {
  const width = Math.min(workArea.width, Math.max(Math.min(900, workArea.width), Math.round(Number(value?.width) || workArea.width * 0.9)));
  const height = Math.min(workArea.height, Math.max(Math.min(600, workArea.height), Math.round(Number(value?.height) || workArea.height * 0.9)));
  const x = Number(value?.x);
  const y = Number(value?.y);
  const visible = Number.isFinite(x) && Number.isFinite(y)
    && x + width > workArea.x && y + height > workArea.y
    && x < workArea.x + workArea.width && y < workArea.y + workArea.height;
  return { width, height, ...(visible ? { x: Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - width)), y: Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - height)) } : {}) };
}

module.exports = { SITE_ORIGIN, SHELL_ORIGIN, SHELL_URL, companionCsp, isSiteUrl, isShellUrl, isExternalUrl, safeSavedWindow, localDownloadType, saveDialog };
