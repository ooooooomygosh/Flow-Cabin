// 小屋日记 art slots (JS side). Set a URL (e.g. '/journal/spine.png', 4× nearest-scaled
// PNG) to switch a slot from the CSS baseline to art; the matching CSS variable in
// journal-art.css takes the same url(). `null` keeps the tokens-only baseline.
export const JOURNAL_ART = Object.freeze({
  frame: null,     // 9-slice cover edge  → --journal-frame-img
  paper: null,     // tiling page texture → --journal-paper-img
  spine: null,     // stitched gutter     → --journal-spine-img (hides the CSS stitches)
  ribbon: null,    // bookmark tab sprite → --journal-tab-img
  card: null,      // postcard background → --journal-card-img
  doodle: null     // cat doodle on the weekly card → --journal-card-doodle
});
const VARS = { frame: '--journal-frame-img', paper: '--journal-paper-img', spine: '--journal-spine-img', ribbon: '--journal-tab-img', card: '--journal-card-img', doodle: '--journal-card-doodle' };
// Inline style for the dialog: only slots with art override the CSS defaults.
export function journalArtStyle(art = JOURNAL_ART) {
  return Object.fromEntries(Object.entries(art).filter(([, url]) => url).map(([slot, url]) => [VARS[slot], `url(${JSON.stringify(url)})`]));
}
export const hasArt = (slot, art = JOURNAL_ART) => Boolean(art[slot]);
