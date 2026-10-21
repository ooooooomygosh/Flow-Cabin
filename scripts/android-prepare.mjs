import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'dist-android');
const index = path.join(web, 'index.html');
let html = await fs.readFile(index, 'utf8');
// Native builds have no Vercel headers. Do not allow injected scripts or remote frames
// to acquire the native bridge; images and explicitly requested HTTPS APIs remain usable.
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self'; media-src 'self' https: blob:; connect-src 'self' https:; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'none'";
html = html.replace(/<meta name="flow-cabin-native-csp"[^>]*>/, '');
html = html.replace('<head>', `<head>\n    <meta name="flow-cabin-native-csp" http-equiv="Content-Security-Policy" content="${csp}">`);
await fs.writeFile(index, html);
const drawable = path.join(root, 'android/app/src/main/res/drawable-nodpi');
await fs.mkdir(drawable, { recursive: true });
await fs.copyFile(path.join(root, 'public/icons/icon-192.png'), path.join(drawable, 'cabin_icon.png'));
console.log('Android offline bundle, bridge CSP and launcher icon prepared.');
