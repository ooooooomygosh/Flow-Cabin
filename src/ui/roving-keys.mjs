// Roving focus for tablists and radiogroups: arrows move (and select), Home/End
// jump, and the selection wraps. Pure so it is unit-tested without a DOM.
const NEXT = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
export function rovingIndex(key, index, count, orientation = 'both') {
  if (!count) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  const step = NEXT[key];
  if (!step) return -1;
  if (orientation === 'horizontal' && (key === 'ArrowUp' || key === 'ArrowDown')) return -1;
  if (orientation === 'vertical' && (key === 'ArrowLeft' || key === 'ArrowRight')) return -1;
  return index < 0 ? (step > 0 ? 0 : count - 1) : ((index + step) % count + count) % count;
}
