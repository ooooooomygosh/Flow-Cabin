// Repaints the three vector rooms (Forest Glade, Seaside, Starry Night) as finished pixel art.
// Usage: node scripts/art/paint-scenes.mjs [forest seaside starlight]   (needs desktop npm ci)
// 1. Renders public/room-scenes/<id>-cabin.svg at 1448×1086 in Chromium: the plain room (sun,
//    moon and painted stars removed: the live window sky draws those) plus one render per
//    material key (sky, wall, floor, rug, cabinet wood) with that fill swapped for #ff00ff.
// 2. scripts/art/paint-scene.py turns them into <id>-cabin-pixel.png: 362×272 art pixels,
//    grain and boards, one warm light source in dithered steps, rim light, ~56 colours, 4×.
//    The window sky is transparent so the live sky (src/CabinAtmosphereSky.jsx) shows through.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../launch-browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scenes = path.join(root, 'public/room-scenes');
const MAGENTA = '#ff00ff';
// Per room: material keys (the fill each material uses in the SVG) and what the live sky replaces.
export const SCENES = {
  forest: { keys: { wall: 'url(#wall)', floor: 'url(#floor)', rug: '#576651', wood: '#8c7250' } },
  seaside: { keys: { wall: 'url(#wall)', floor: 'url(#floor)', rug: '#d9d0b1', wood: '#bca580' }, strip: [/<ellipse cx="288" cy="247" rx="32" ry="32" fill="#f8e7b9" \/>/, /<path d="M132 278q14 -13 29 0q14 -13 29 0"[^>]*\/>/] },
  starlight: { keys: { wall: 'url(#wall)', floor: 'url(#floor)', rug: '#555a70', wood: '#806e60', ceiling: '#48515c' }, strip: [/<ellipse cx="\d+" cy="\d+" rx="[\d.]+" ry="[\d.]+" fill="#f5e7bd" opacity="[\d.]+"\/>/g, /<path d="M286 266A34 34[^>]*\/>/] }
};
const swap = (svg, fill) => svg.split(`fill="${fill}"`).join(`fill="${MAGENTA}"`);

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENES);
// PAINT_WORK keeps the renders for iterating on paint-scene.py alone.
const work = process.env.PAINT_WORK || fs.mkdtempSync(path.join(os.tmpdir(), 'cabin-paint-'));
const browser = await launchChromium();
try {
  const page = await browser.newPage({ viewport: { width: 1448, height: 1086 }, deviceScaleFactor: 1 });
  const render = async (svg, file) => {
    await page.setContent(`<!doctype html><style>html,body{margin:0;background:#000}svg{display:block}</style>${svg}`);
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 1448, height: 1086 } });
  };
  for (const id of ids) {
    const spec = SCENES[id]; let svg = fs.readFileSync(path.join(scenes, `${id}-cabin.svg`), 'utf8');
    for (const pattern of spec.strip || []) svg = svg.replace(pattern, '');
    const dir = path.join(work, id); fs.mkdirSync(dir, { recursive: true });
    await render(svg, path.join(dir, 'base.png'));
    await render(swap(svg, 'url(#sky)'), path.join(dir, 'key-sky.png'));
    for (const [name, fill] of Object.entries(spec.keys)) await render(swap(svg, fill), path.join(dir, `key-${name}.png`));
    execFileSync('python3', [path.join(root, 'scripts/art/paint-scene.py'), id, dir, path.join(scenes, `${id}-cabin-pixel.png`)], { stdio: 'inherit' });
  }
} finally { await browser.close(); if (!process.env.PAINT_WORK) fs.rmSync(work, { recursive: true, force: true }); }
