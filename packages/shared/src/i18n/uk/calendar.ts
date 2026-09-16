import type { Dictionary } from '../types';

export const calendar: Pick<Dictionary, keyof typeof import('../en/calendar').calendar> = {
  'calendar.mode.day': 'День',
  'calendar.mode.threeDay': '3 дні',
  'calendar.mode.week': 'Тиждень',
  'calendar.mode.month': 'Місяць',
};
