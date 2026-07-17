import { HOUR_H, SNAP_MIN, yToMinutes, snapMinutes, xToDayIndex, combineDayTime } from './calendar-dates';

// Maps a drop (gridX, gridY within the scroll content) to a snapped start Date.
export function resolveDrop(
  days: Date[],
  gridX: number,
  gridY: number,
  labelW: number,
  colW: number,
  durationMin: number,
): { dayIndex: number; minutes: number; startISO: string } {
  const dayIndex = xToDayIndex(gridX, labelW, colW, days.length);
  const minutes = snapMinutes(yToMinutes(gridY, HOUR_H), SNAP_MIN, durationMin);
  const startISO = combineDayTime(days[dayIndex], minutes).toISOString();
  return { dayIndex, minutes, startISO };
}
