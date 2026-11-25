const millisecondsPerDay = 24 * 60 * 60 * 1000;

export function localDay(date = new Date()) {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dayDate(day: string) {
  return new Date(`${day}T12:00:00`);
}

export function isDay(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = dayDate(day);
  return Number.isFinite(date.getTime()) && localDay(date) === day;
}

export function shiftDay(day: string, offset: number) {
  const date = dayDate(day);
  date.setDate(date.getDate() + offset);
  return localDay(date);
}

// Date labels are local calendar days. UTC ticks keep their spacing uniform across daylight-saving changes.
export function dayNumber(day: string) {
  return Date.parse(`${day}T00:00:00.000Z`) / millisecondsPerDay;
}
