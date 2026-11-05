// What lies in the drawer (小屋日常), as plain data: which object each menu item is, how it lies on the felt,
// and what picking it does. Pure functions, so they can be tested without a DOM.

// id (from shell-model.mjs gearMenu) → the drawn object. Unknown ids lie there as a paper card.
export const OBJECTS = Object.freeze({
  themes: 'album', decorate: 'toolbox', backup: 'tin', settings: 'screwdriver',
  recipes: 'recipe', sleep: 'lamp', postcard: 'camera'
});
export const objectKind = (id) => OBJECTS[id] || 'card';

// How each object lies: a small turn (degrees) and a nudge up or down (px), different for every one so the
// felt looks tidied by a person, not laid on a grid. Stable per id, so it does not shuffle between renders.
const TILTS = Object.freeze({ album: -3.2, toolbox: 2.4, tin: -1.4, screwdriver: 3.6, recipe: -2.2, lamp: 1.6, camera: -3.6, card: 1.2 });
const NUDGE = Object.freeze({ album: 2, toolbox: -3, tin: 3, screwdriver: -1, recipe: 3, lamp: -2, camera: 1, card: 0 });
export function layOn(id) {
  const kind = objectKind(id);
  return { kind, tilt: TILTS[kind], nudge: NUDGE[kind] };
}

// `items` is gearMenu()'s { core: [[id, name]], lab: [[id, name]] }; a plain list of [id, name] pairs is also fine.
export function normalizeItems(items) {
  const pairs = (list) => (Array.isArray(list) ? list : []).filter((entry) => Array.isArray(entry) ? entry[0] : entry?.id).map((entry) => {
    const [id, name] = Array.isArray(entry) ? entry : [entry.id, entry.name];
    return { id: String(id), name: String(name ?? id), ...layOn(String(id)) };
  });
  if (Array.isArray(items)) return { core: pairs(items), lab: [] };
  return { core: pairs(items?.core), lab: pairs(items?.lab) };
}

// What CabinHome does when an object is picked (so a host that wants to mirror it can):
//   themes  → open the swatch album            (setDrawer('themes'))
//   decorate → start arranging the room        (startEditing())
//   others  → close the drawer, open the thing (setDrawer(''); commands.open(id))
export function pickAction(id) {
  if (id === 'themes') return { type: 'themes' };
  if (id === 'decorate') return { type: 'decorate' };
  return { type: 'open', id };
}

// The order Tab visits the objects in: core first, then the lab shelf — also the order they lie in.
export const tabOrder = (list) => [...list.core, ...list.lab].map((item) => item.id);

// Drawer phases: out (not in the DOM) → opening → open → closing → out. Reduced motion skips the slides.
export function nextPhase(phase, event, { reduced = false } = {}) {
  if (event === 'open') return phase === 'out' || phase === 'closing' ? (reduced ? 'open' : 'opening') : phase;
  if (event === 'close') return phase === 'out' ? 'out' : reduced ? 'out' : 'closing';
  if (event === 'settled') return phase === 'opening' ? 'open' : phase === 'closing' ? 'out' : phase;
  return phase;
}
