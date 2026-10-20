// Roving focus for tablists and radiogroups: arrows move (and select), Home/End
// jump, and the selection wraps. Pure so it is unit-tested without a DOM.
// A tablist is a line, not a plane: ← → walk it when it is horizontal, ↑ ↓ when
// it is vertical, and the cross axis is left alone. The directions are not
// swapped: ArrowRight/ArrowDown move forward, ArrowLeft/ArrowUp move back.
const NEXT = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
export function rovingIndex(key, index, count, orientation = 'both') {
  if (!count) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  // Own properties only: an inherited name ('constructor', 'toString') is not an arrow.
  if (!Object.hasOwn(NEXT, key)) return -1;
  const step = NEXT[key];
  if (orientation === 'horizontal' && (key === 'ArrowUp' || key === 'ArrowDown')) return -1;
  if (orientation === 'vertical' && (key === 'ArrowLeft' || key === 'ArrowRight')) return -1;
  return index < 0 ? (step > 0 ? 0 : count - 1) : ((index + step) % count + count) % count;
}

// A two-dimensional grid (the album wall's library): ← → walk the row, ↑ ↓ walk
// a row up or down, Home/End jump to the ends of the row, PageUp/PageDown jump
// to the first/last row of the grid. A row edge stops instead of wrapping: a
// grid that wraps sideways drops the focus on an album that is not next to the
// current one. Returns -1 when the key does not move (the caller keeps the key).
export function gridIndex(key, index, count, columns = 1) {
  if (!count || !columns) return -1;
  const size = Math.min(columns, count), rows = Math.ceil(count / size);
  if (index < 0) return key === 'ArrowLeft' || key === 'ArrowUp' ? count - 1 : 0;
  const row = Math.floor(index / size), column = index % size;
  const at = (r, c) => (r < 0 || r >= rows || c < 0 || c >= size || r * size + c >= count) ? -1 : r * size + c;
  if (key === 'ArrowLeft') return column > 0 ? at(row, column - 1) : -1;
  if (key === 'ArrowRight') return column < size - 1 ? at(row, column + 1) : -1;
  if (key === 'ArrowUp') return at(row - 1, column);
  if (key === 'ArrowDown') return at(row + 1, column);
  if (key === 'Home') return row * size;
  if (key === 'End') return Math.min(row * size + size - 1, count - 1);
  if (key === 'PageUp') return at(0, column);
  if (key === 'PageDown') return at(rows - 1, column);
  return -1;
}
