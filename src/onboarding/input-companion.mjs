// Pure helpers behind 键鼠陪伴. Kept out of the JSX file so the permission
// wording and counter fallbacks can be tested without a DOM.
export const inputTotal = (value) => {
  const keyboard = Math.max(0, Number(value?.today?.keyboard) || 0);
  const click = Math.max(0, Number(value?.today?.click) || 0);
  const stated = Number(value?.today?.total);
  return Number.isFinite(stated) && stated > 0 ? stated : keyboard + click;
};

export function typingPermissionVerdict(snapshot, { enabled, env = {}, heard = 0 } = {}) {
  if (!enabled) return 'skipped';
  if (!snapshot) return 'pending';
  // macOS only tells us that the grant is not in place yet, not whether the
  // user has denied it. Report it as pending instead of inventing a denial.
  if (snapshot.status === 'needs-permission') return 'pending';
  if (snapshot.status === 'denied') return 'denied';
  if (snapshot.status === 'unavailable' || snapshot.status === 'unsupported') return 'unsupported';
  if (snapshot.status !== 'active') return 'pending';
  if (!env.mac) return 'granted';
  // Accessibility and Input Monitoring are separate grants. The hook can
  // report active before Input Monitoring starts feeding events, so a recorded
  // input is the only honest end-to-end confirmation.
  return inputTotal(snapshot) > 0 || heard > 0 ? 'granted' : 'pending';
}
