// Calendar dates use local time; a local day can contain 23 or 25 hours.
export function dayKey(time) {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function startOfDay(time) {
  const date = new Date(time); date.setHours(0, 0, 0, 0); return date.getTime();
}
export function addDays(time, count) {
  const date = new Date(time); date.setDate(date.getDate() + count); return date.getTime();
}
// Monday through Sunday, with an exclusive next-Monday endpoint.
export function startOfWeek(time) {
  const day = startOfDay(time);
  return addDays(day, -((new Date(day).getDay() + 6) % 7));
}
export const isMonday = (time) => new Date(time).getDay() === 1;
