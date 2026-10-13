// Traditional ⇄ Simplified Chinese, character by character. Records added
// from a Taiwan / Hong Kong storefront say 「討厭紅樓夢」 while QQ 音乐 and
// 网易云 list 「讨厌红楼梦」; a Mac library may hold either. Matching compares
// both sides in Simplified, and searches try each script.
import { T2S, S2T } from './hanzi-data.mjs';

const table = (pairs) => { const map = new Map(), chars = [...pairs]; for (let i = 0; i + 1 < chars.length; i += 2) map.set(chars[i], chars[i + 1]); return map; };
let t2s, s2t;
const convert = (value, map) => { const text = String(value || ''); let out = ''; for (const char of text) out += map.get(char) || char; return out; };

export const toSimplified = (value) => convert(value, t2s ||= table(T2S));
export const toTraditional = (value) => convert(value, s2t ||= table(S2T));

// The text as written, then in Simplified, then in Traditional; duplicates dropped.
export function scriptVariants(value) {
  const text = String(value || '').trim();
  return text ? [...new Set([text, toSimplified(text), toTraditional(text)])] : [];
}
