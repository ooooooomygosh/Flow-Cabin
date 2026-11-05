// The sticky notes on the settings pad (docs/v3-desk-design.md): every part of a page has a note
// stuck on the pad's right edge, in one of the desk's six sticky-note colours, with its name written
// by hand. Pure functions, so the ordering, colours and flip rules can be tested without a DOM.
// Colours and the (index + 3 * pad) rule follow DEsk's settings window
// (https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors, src/settings.c note_paint, draw.c STICK_RGB).

export const NOTE_COLOURS = Object.freeze(['#FCE066', '#FAADBD', '#9ED1F5', '#BAE394', '#FCBD73', '#CCB8F0']);

// The colour of the index-th note of the pad number `pad` (0 = first section): neighbouring pads start on different colours.
export const noteColour = (index = 0, pad = 0) => NOTE_COLOURS[(((index + 3 * pad) % 6) + 6) % 6];

// What a part is called on its note: a line or two, as short as on a sticky note ("音质\n过渡").
export function noteLines(label = '') {
  const lines = String(label).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.length ? lines.slice(0, 2) : [''];
}

// Parts of the open page that carry a note: any element with data-note, in page order.
// `root` is anything with querySelectorAll (a real element, or a stand-in in tests).
export function readNotes(root) {
  const seen = new Set(), out = [];
  for (const node of root?.querySelectorAll?.('[data-note]') || []) {
    const id = node.id || node.getAttribute?.('id') || '', label = (node.getAttribute?.('data-note') || '').trim();
    if (!id || !label || seen.has(id)) continue;
    seen.add(id); out.push({ id, label });
  }
  return out;
}
export const sameNotes = (a = [], b = []) => a.length === b.length && a.every((note, i) => note.id === b[i].id && note.label === b[i].label);

// Which part the person is reading: the last one whose top has reached `offset` px below the pad's top
// (the first one before any has). `tops` is [{ id, top }] in page order, tops relative to the pad.
export function currentNote(tops = [], offset = 48) {
  if (!tops.length) return '';
  let here = tops[0].id;
  for (const entry of tops) if (entry.top <= offset) here = entry.id; else break;
  return here;
}

// How a click on a note turns the page. Going down the page lifts the page over the wire to show what is
// below; going up lets the target page fall back onto the pad. Small moves just scroll.
export function flipPlan(from, to, { min = 12, reduced = false } = {}) {
  const distance = to - from;
  if (reduced || Math.abs(distance) < min) return { kind: 'jump', to };
  return { kind: distance > 0 ? 'lift' : 'drop', to, from };
}

// Where to scroll the pad so a part's top sits `margin` px below the pad's top edge, kept inside the scroll range.
export function targetScroll({ scrollTop = 0, partTop = 0, panelTop = 0, scrollHeight = 0, clientHeight = 0, margin = 8 }) {
  const wanted = scrollTop + (partTop - panelTop) - margin;
  return Math.max(0, Math.min(Math.max(0, scrollHeight - clientHeight), Math.round(wanted)));
}
