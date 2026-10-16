// Guards for the pixel stylesheet system (tokens.css → pixel-ui.css): the layer order
// that makes prod cascade like dev, and the art rules a review would otherwise re-catch.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.dirname(fileURLToPath(import.meta.url));
const walk = (dir, ext) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name), ext) : ext.test(e.name) ? [path.join(dir, e.name)] : []);
const rel = (f) => path.relative(SRC, f).split(path.sep).join('/');
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/url\((?:"[^"]*"|'[^']*'|[^)]*)\)/g, 'url()');
const sheets = walk(SRC, /\.css$/).map((f) => ({ file: rel(f), css: strip(fs.readFileSync(f, 'utf8')) }));
// Companion/pet sheets are maintained separately; the art rules below skip them (layer order still applies).
const COMPANION = new Set(['companion-room.css', 'pet/pet.css', 'pet/pet-life.css', 'scene/scene-deck.css']);
const owned = sheets.filter((s) => !COMPANION.has(s.file));
const ORDER = '@layer guards, reset, features, skin, overrides;';
const rules = (css) => [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));

test('every stylesheet declares the layer order first, so chunk load order cannot reorder the cascade', () => {
  for (const { file, css } of sheets) {
    assert.equal(css.trim().split('\n')[0].trim(), ORDER, `${file} must start with ${ORDER}`);
    const outside = css.trim().slice(ORDER.length).replace(/@layer\s+[a-z, ]+\{[\s\S]*$/, '').trim();
    assert.equal(outside, '', `${file}: rules must sit inside an @layer block`);
  }
});

test('!important is only used by the kill switches in the guards layer', () => {
  for (const { file, css } of owned) {
    if (!css.includes('!important')) continue;
    const guards = css.match(/@layer guards\s*\{/);
    assert(guards, `${file}: !important outside @layer guards`);
    let depth = 0, end = guards.index + guards[0].length - 1;
    for (; end < css.length; end++) { if (css[end] === '{') depth++; else if (css[end] === '}' && --depth === 0) break; }
    assert(!(css.slice(0, guards.index) + css.slice(end)).includes('!important'), `${file}: !important outside @layer guards`);
  }
});

test('every animation names a keyframe that exists', () => {
  const defined = new Set(sheets.flatMap(({ css }) => [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1])));
  const KNOWN_MISSING = new Set(['room-spin']); // companion-room.css; the pocket player overrides it with px-spin
  const keywords = /^(none|infinite|both|forwards|backwards|alternate|alternate-reverse|reverse|normal|linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end|paused|running|inherit|initial|unset|end|start|jump-none|jump-both|jump-start|jump-end)$/;
  for (const { file, css } of sheets) for (const m of css.matchAll(/animation(?:-name)?\s*:\s*([^;}]+)/g)) {
    for (const part of m[1].replace(/!important/g, '').replace(/[\w-]*\([^)]*\)/g, '').split(',')) for (const word of part.trim().split(/\s+/)) {
      if (!word || keywords.test(word) || /^[-\d.]/.test(word) || word.startsWith('var') || word === '!important') continue;
      if (KNOWN_MISSING.has(word) && COMPANION.has(file)) continue;
      assert(defined.has(word), `${file}: animation uses undefined keyframes "${word}"`);
    }
  }
});

test('corners are square (true circles excepted) and nothing is blurred', () => {
  for (const { file, css } of owned) {
    for (const m of css.matchAll(/border(?:-[a-z]+)*-radius\s*:\s*([^;}]+)/g)) assert.match(m[1].trim(), /^(0|0px|50%)$/, `${file}: border-radius ${m[1].trim()}`);
    assert(!/backdrop-filter\s*:\s*(?!none)/.test(css), `${file}: backdrop-filter`);
    assert(!/blur\(/.test(css), `${file}: blur()`);
  }
});

test('pixel faces sit on their grid and no text is under 12px', () => {
  for (const { file, css } of owned) for (const { selector, body } of rules(css)) {
    const sizes = [...body.matchAll(/font(?:-size)?\s*:\s*(?:\d00\s+)?(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
    for (const size of sizes) {
      if (/--px-font-en/.test(body)) assert(size % 8 === 0, `${file} ${selector}: Silkscreen at ${size}px (8px grid)`);
      else assert(size >= 12, `${file} ${selector}: ${size}px text`);
      if (/--px-font-cn/.test(body) && !/--px-font-en/.test(body)) assert([12, 24, 36, 48].includes(size), `${file} ${selector}: pixel CJK at ${size}px (12/24)`);
    }
  }
});

test('a colour that equals a palette token is written as the token', () => {
  const tokens = fs.readFileSync(path.join(SRC, 'styles/tokens.css'), 'utf8');
  const palette = new Map([...tokens.matchAll(/(--px-[a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)].filter((m) => !/heat|focus/.test(m[1])).map((m) => [m[2].toLowerCase(), m[1]]));
  for (const { file, css } of owned) {
    if (file === 'styles/tokens.css') continue;
    for (const m of css.matchAll(/#[0-9a-fA-F]{6}(?![0-9a-fA-F])/g)) assert(!palette.has(m[0].toLowerCase()), `${file}: ${m[0]} is var(${palette.get(m[0].toLowerCase())})`);
  }
});

test('every class a stylesheet styles is rendered somewhere', () => {
  const root = path.join(SRC, '..'), pages = fs.readdirSync(root).filter((f) => f.endsWith('.html')).map((f) => path.join(root, f));
  const code = walk(SRC, /\.(jsx?|mjs|html)$/).filter((f) => !/\.test\./.test(f)).concat(pages).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const words = new Set(code.match(/[\w-]+/g));
  const prefixes = [...code.matchAll(/([a-z][\w-]*-)\$\{/g)].map((m) => m[1]);
  for (const { file, css } of owned) for (const { selector } of rules(css)) {
    if (selector.startsWith('@') || /^(from|to|\d+%)/.test(selector)) continue;
    for (const [, cls] of selector.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) {
      assert(words.has(cls) || prefixes.some((p) => cls.startsWith(p)), `${file}: .${cls} is not rendered anywhere`);
    }
  }
});
