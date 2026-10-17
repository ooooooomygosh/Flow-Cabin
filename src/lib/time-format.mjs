// Track lengths round to the nearest second (119.6 s → 2:00); live clocks floor so they never run ahead.
const pad = (value) => String(value).padStart(2, '0');
function clock(total) {
  const hours = Math.floor(total / 3600), minutes = Math.floor(total / 60) % 60, seconds = total % 60;
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
export const formatDuration = (millis) => clock(Math.max(0, Math.round((Number(millis) || 0) / 1000)));
export const formatSeconds = (seconds) => clock(Math.max(0, Math.floor(Number(seconds) || 0)));
