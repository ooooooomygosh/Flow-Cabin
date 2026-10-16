// Parse a typed number: blank or invalid gives the fallback (clearing a field is not 0), otherwise round and clamp.
export const clampNumber = (raw, min, max, fallback) => {
  if (String(raw).trim() === '' || !Number.isFinite(Number(raw))) return fallback;
  return Math.max(min, Math.min(max, Math.round(Number(raw))));
};
