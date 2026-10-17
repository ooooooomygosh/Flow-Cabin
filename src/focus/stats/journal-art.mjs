// 小屋日记 art slots (JS side). Set a URL (e.g. '/journal/spine.png', 4× nearest-scaled
// PNG) to switch a slot from the CSS baseline to art; the matching CSS variable in
// journal-art.css takes the same url(). `null` keeps the tokens-only baseline.
export const JOURNAL_ART = Object.freeze({
  frame: '/journal/frame.png',     // 9-slice cover edge  → --journal-frame-img
  paper: '/journal/paper.png',     // tiling page texture → --journal-paper-img
  spine: '/journal/spine.png',     // stitched gutter     → --journal-spine-img (hides the CSS stitches)
  ribbon: '/journal/ribbon.png',    // bookmark tab sprite → --journal-tab-img
  card: '/journal/card.png',      // stamp + postmark corner (transparent), drawn ONCE top-right → --journal-card-img; export: integer scale ≤ 96 px
  cardPaper: null, // optional postcard paper TILE; empty → the card reuses `paper` → --journal-card-paper-img
  cardTape: '/journal/tape.png',  // optional tape strip, top centre        → --journal-card-tape-img; export: integer scale ≤ 128×32
  doodle: '/journal/doodle.png'     // cat doodle on the weekly card → --journal-card-doodle
});
const VARS = { frame: '--journal-frame-img', paper: '--journal-paper-img', spine: '--journal-spine-img', ribbon: '--journal-tab-img', card: '--journal-card-img', cardPaper: '--journal-card-paper-img', cardTape: '--journal-card-tape-img', doodle: '--journal-card-doodle' };
// Inline style for the dialog: only slots with art override the CSS defaults.
export function journalArtStyle(art = JOURNAL_ART) {
  return Object.fromEntries(Object.entries(art).filter(([, url]) => url).map(([slot, url]) => [VARS[slot], `url(${JSON.stringify(url)})`]));
}
export const hasArt = (slot, art = JOURNAL_ART) => Boolean(art[slot]);
// Slots the weekly PNG export draws (same-origin only, so the canvas stays exportable).
export const CARD_EXPORT_SLOTS = Object.freeze(['paper', 'cardPaper', 'card', 'cardTape', 'doodle']);
// Maps loaded slot images to drawWeekCard's art roles: tile, stamp, tape, doodle.
export const cardArt = (img = {}) => ({ cardPaper: img.cardPaper || img.paper || null, cardStamp: img.card || null, cardTape: img.cardTape || null, doodle: img.doodle || null });
