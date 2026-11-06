// Sheets folded away (折起) lie on the desk as small paper packets until they are opened again, as on
// DEsk (https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors). They live for the session only.
//
// How a sheet knows how to come back: whoever opens one through the desk's commands (CabinRoom's
// openTool) notes the action first (`noteOpen`), and the next sheet that appears takes that note
// (`takeOpener`). A sheet that took no note can still be thrown away or opened out, but not folded.

const TAKE_WITHIN = 6000; // ms: a note older than this belongs to nothing that opened
let note = null, packets = [], serial = 0;
const listeners = new Set();
const emit = () => { for (const fn of listeners) fn(packets); };
const now = () => (globalThis.performance?.now?.() ?? Date.now());

export function noteOpen(action) { note = action ? { action: String(action), at: now() } : null; }
// `key` is the taking sheet's own id: a sheet rendered twice (React's StrictMode) gets the same answer.
export function takeOpener(key) {
  const n = note;
  if (!n || (n.by && n.by !== key)) return '';
  if (now() - n.at > TAKE_WITHIN) { note = null; return ''; }
  n.by = key;
  return n.action;
}

export const listPackets = () => packets;
export function onPackets(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// Fold a sheet away: one packet per action (folding the same sheet again only moves it to the end).
export function foldPacket({ title, action }) {
  if (!action) return null;
  const packet = { id: `packet-${++serial}`, title: String(title || ''), action };
  packets = [...packets.filter((p) => p.action !== action), packet];
  emit();
  return packet;
}
// Take a packet off the desk; returns it (the caller opens its sheet again).
export function unfoldPacket(id) {
  const packet = packets.find((p) => p.id === id) || null;
  if (packet) { packets = packets.filter((p) => p !== packet); emit(); }
  return packet;
}
// A sheet opened again by any other way takes its packet off the desk.
export function dropPacketFor(action) {
  if (!packets.some((p) => p.action === action)) return;
  packets = packets.filter((p) => p.action !== action); emit();
}
export function clearPackets() { packets = []; note = null; emit(); }
