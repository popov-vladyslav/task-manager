export type CalMode = 'day' | '3day' | 'week' | 'month';

// Timeline modes render a full 24-hour grid (scrollable).
export const HOUR_START = 0;
export const HOUR_END = 24;

// Timeline geometry (single source; calendar-screen imports HOUR_H from here).
export const HOUR_H = 48;
// Pinch-to-zoom bounds for the timeline's hour height.
export const HOUR_H_MIN = 28;
export const HOUR_H_MAX = 160;
export const SNAP_MIN = 15;

// Pixel Y within the hour grid -> minutes past midnight.
export const yToMinutes = (y: number, hourH: number = HOUR_H): number =>
  HOUR_START * 60 + (y / hourH) * 60;

// Snap minutes to the nearest `step`, clamped so a `durationMin` block stays in [0, 24h).
export const snapMinutes = (min: number, step: number = SNAP_MIN, durationMin: number = 0): number => {
  const snapped = Math.round(min / step) * step;
  return Math.max(0, Math.min(24 * 60 - durationMin, snapped));
};

// Pixel X within the grid -> day column index (0-based), clamped to [0, dayCount-1].
export const xToDayIndex = (x: number, labelW: number, colW: number, dayCount: number): number => {
  const i = Math.floor((x - labelW) / colW);
  return Math.max(0, Math.min(dayCount - 1, i));
};

// A local Date at `day`'s midnight + `minutes`.
export const combineDayTime = (day: Date, minutes: number): Date =>
  new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0 + minutes * 60000);

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// Monday-start week (Europe/Warsaw convention).
export function startOfWeek(d: Date): Date {
  const s = startOfDay(d);
  const dow = (s.getDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(s, -dow);
}

// The day columns (timeline) or 6-week grid (month) shown for a mode + anchor.
export function visibleDays(mode: CalMode, anchor: Date): Date[] {
  const a = startOfDay(anchor);
  if (mode === 'day') return [a];
  if (mode === '3day') return [a, addDays(a, 1), addDays(a, 2)];
  if (mode === 'week') {
    const s = startOfWeek(a);
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }
  // month: 6 weeks starting from the Monday of the first week of the month
  const first = new Date(a.getFullYear(), a.getMonth(), 1);
  const s = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(s, i));
}

export function rangeFor(mode: CalMode, anchor: Date): { from: Date; to: Date } {
  const days = visibleDays(mode, anchor);
  const from = days[0];
  const last = days[days.length - 1];
  return { from, to: new Date(last.getFullYear(), last.getMonth(), last.getDate(), 23, 59, 59, 999) };
}

export function shiftAnchor(mode: CalMode, anchor: Date, dir: number): Date {
  const a = startOfDay(anchor);
  if (mode === 'day') return addDays(a, dir);
  if (mode === '3day') return addDays(a, 3 * dir);
  if (mode === 'week') return addDays(a, 7 * dir);
  return new Date(a.getFullYear(), a.getMonth() + dir, 1); // month
}
