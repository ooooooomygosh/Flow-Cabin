// Display-only: put a gap before an ASCII bracket glued to a word, e.g. “Meditation(The Paisley…)” -> “Meditation (The Paisley…)”.
// Full-width （） already carry their own spacing, so CJK titles are left as typed.
export const displayTitle = (value) => typeof value === 'string' ? value.replace(/([^\s(（])\(/g, '$1 (') : value;
