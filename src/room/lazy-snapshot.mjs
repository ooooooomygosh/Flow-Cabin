// Rebuilds a value only when one of its named inputs changed identity; `read()`
// builds lazily, so values nobody asks for are never built.
export const sameInputs = (a, b) => Boolean(a && b) && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((key) => Object.is(a[key], b[key]));
export function lazySnapshot(build) {
  let inputs = null, value = null;
  return { update(next) { if (!sameInputs(inputs, next)) { inputs = next; value = null; } }, read() { if (value === null && inputs) value = build(inputs); return value; } };
}
