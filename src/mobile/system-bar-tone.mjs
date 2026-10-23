// Android status bar icons follow what is drawn under them. The bar is
// transparent (MainActivity draws edge to edge), so light icons (SystemBars
// 'DARK') are right over a dark band and dark icons ('LIGHT') over a bright one.
//
// STATUS_BAND_LUMA is the mean luminance (0–1) of the top 32 px of the 2.2
// cabin home at 390 × 844 with a 32 px inset, measured from screenshots of every
// theme in the whole-room view and each corner (the corner art sits under a dark
// top gradient). All current rooms measure 0.10–0.19, so every room keeps
// light icons; a brighter room added later only needs its numbers here.
export const STATUS_BAND_LUMA = Object.freeze({
  pixel: { all: 0.122, music: 0.140, work: 0.149, life: 0.138 },
  warm: { all: 0.122, music: 0.128, work: 0.110, life: 0.155 },
  'night-study': { all: 0.121, music: 0.110, work: 0.122, life: 0.101 },
  forest: { all: 0.141, music: 0.138, work: 0.132, life: 0.148 },
  seaside: { all: 0.192, music: 0.185, work: 0.193, life: 0.184 },
  starlight: { all: 0.121, music: 0.105, work: 0.100, life: 0.104 },
  'rain-train': { all: 0.130, music: 0.133, work: 0.150, life: 0.121 },
  greenhouse: { all: 0.141, music: 0.174, work: 0.179, life: 0.188 }
});
// Above this the light icons lose contrast; WCAG-style midpoint for white vs. black text.
export const LIGHT_BAND = 0.55;

// 'DARK' (light icons) or 'LIGHT' (dark icons) for one view. Lights off or night
// only darken a room, so they never flip a dark band to light.
export function statusBarStyle({ look = 'pixel', zone = 'all', dim = false } = {}) {
  const luma = STATUS_BAND_LUMA[look]?.[zone] ?? STATUS_BAND_LUMA[look]?.all ?? 0;
  return !dim && luma >= LIGHT_BAND ? 'LIGHT' : 'DARK';
}

// Read the view from the cabin home's own markup: `theme-<look>` on
// .cabin-home and its data-zone. Classic home and dialogs keep the default.
export function readHomeView(root = globalThis.document) {
  const home = root?.querySelector?.('.cabin-home');
  if (!home) return null;
  const look = [...home.classList].find((name) => name.startsWith('theme-'))?.slice(6) || 'pixel';
  return { look, zone: home.dataset.zone || 'all' };
}

// Watch the home and call `apply(style)` whenever the right style changes.
// DOM changes arrive in bursts (a theme switch re-renders the room), so checks
// are coalesced into one per `delay` ms.
export function watchStatusBar(apply, { root = globalThis.document, Observer = globalThis.MutationObserver, delay = 120, setTimer = globalThis.setTimeout } = {}) {
  if (!root?.body || typeof Observer !== 'function') return () => {};
  let current = '', pending = false;
  const update = () => {
    const view = readHomeView(root), style = view ? statusBarStyle(view) : 'DARK';
    if (style === current) return;
    current = style;
    Promise.resolve(apply(style)).catch(() => { current = ''; });
  };
  const observer = new Observer(() => { if (pending) return; pending = true; setTimer(() => { pending = false; update(); }, delay); });
  observer.observe(root.body, { subtree: true, attributes: true, attributeFilter: ['class', 'data-zone'], childList: true });
  update();
  return () => observer.disconnect();
}
