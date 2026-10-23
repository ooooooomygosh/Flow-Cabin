'use strict';
// One handler per Electron session; only packaged shell/companion assets are served.
const { companionCsp }=require('./policy.cjs');
const { protocol } = require('electron');
const fs = require('node:fs'), path = require('node:path');
const readAsset = (file) => { try { return fs.readFileSync(file); } catch { return undefined; } };
function registerShellProtocol(targetProtocol = protocol) {
  const assets = {
    '/index.html': ['renderer/index.html', 'text/html; charset=utf-8'],
    '/pet-menu.html':['renderer/pet-menu.html','text/html; charset=utf-8'], '/pet-menu.css':['renderer/pet-menu.css','text/css; charset=utf-8'], '/pet-menu.js':['renderer/pet-menu.js','text/javascript; charset=utf-8'],
    '/app.css': ['renderer/app.css', 'text/css; charset=utf-8'],
    '/app.js': ['renderer/app.js', 'text/javascript; charset=utf-8'],
    '/fonts.css': ['renderer/fonts.css', 'text/css; charset=utf-8'],
    '/fonts/LICENSE.txt': ['web/fonts/LICENSE.txt', 'text/plain; charset=utf-8'],
    '/icon.png': ['assets/icon.png', 'image/png'],
    '/cabin.png': ['web/room-scenes/pixel-cabin.png', 'image/png']
  };
  for (const weight of ['Thin', 'Light', 'Regular', 'Medium', 'Bold', 'Black']) assets[`/fonts/HarmonyOS_Sans_SC_${weight}.ttf`] = [`web/fonts/HarmonyOS_Sans_SC_${weight}.ttf`, 'font/ttf'];
  for (const name of fs.readdirSync(path.join(__dirname, 'renderer', 'icons'))) assets[`/icons/${name}`] = [`renderer/icons/${name}`, name.endsWith('.svg') ? 'image/svg+xml' : 'text/plain'];
  const wallpaperAssets = new Map();
  const mime = { '.json':'application/json', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.webm': 'video/webm', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
  const list = (directory, prefix = '') => { for (const file of fs.readdirSync(directory, { withFileTypes: true })) { if (file.isSymbolicLink()) continue; const relative = `${prefix}/${file.name}`; if (file.isDirectory()) list(path.join(directory, file.name), relative); else if (mime[path.extname(file.name)] && (relative === '/wallpaper.html' || relative === '/pet.html' || relative === '/mini.html' || relative === '/lyrics.html' || relative.startsWith('/assets/') || relative.startsWith('/room-scenes/') || relative.startsWith('/pet-art/') || relative.startsWith('/fonts/'))) wallpaperAssets.set(relative, path.join(directory, file.name)); } };
  list(path.join(__dirname, 'web'));
  targetProtocol.handle('album-desktop', (request) => {
    const url = new URL(request.url);
    // The wallpaper, pet, mini player and lyric bar windows each load only their own page and shared assets.
    if (['wallpaper', 'pet', 'mini', 'lyrics'].includes(url.hostname) && !url.username && !url.password && !url.port && ['GET', 'HEAD'].includes(request.method)) {
      const page = url.pathname.endsWith('.html') ? `/${url.hostname}.html` : null;
      const file = page && url.pathname !== page ? null : wallpaperAssets.get(url.pathname);
      if (!file || !fs.existsSync(file)) return new Response('Not found', { status: 404 });
      const body = request.method === 'HEAD' ? null : readAsset(file);
      if (body === undefined) return new Response('Asset unavailable', { status: 404 });
      return new Response(body, { headers: { 'Content-Type': mime[path.extname(file)], 'Content-Security-Policy': companionCsp(url.hostname) } });
    }
    const entry = url.hostname === 'shell' && !url.username && !url.password && !url.port && ['GET', 'HEAD'].includes(request.method) ? assets[url.pathname] : null;
    if (!entry) return new Response('Not found', { status: 404 });
    const body = readAsset(path.join(__dirname, entry[0]));
    if (body === undefined) return new Response('Asset unavailable', { status: 404 });
    return new Response(request.method === 'HEAD' ? null : body, {
      headers: {
        'Content-Type': entry[1],
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'"
      }
    });
  });
}

module.exports = { registerShellProtocol };
