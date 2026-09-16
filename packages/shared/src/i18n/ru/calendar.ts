import type { Dictionary } from '../types';

export const calendar: Pick<Dictionary, keyof typeof import('../en/calendar').calendar> = {
  'calendar.mode.day': 'День',
  'calendar.mode.threeDay': '3 дня',
  'calendar.mode.week': 'Неделя',
  'calendar.mode.month': 'Месяц',
};
