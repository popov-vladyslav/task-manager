import type { Dictionary } from '../types';

export const calendar: Pick<Dictionary, keyof typeof import('../en/calendar').calendar> = {
  'calendar.mode.day': 'Dzień',
  'calendar.mode.threeDay': '3 dni',
  'calendar.mode.week': 'Tydzień',
  'calendar.mode.month': 'Miesiąc',
};
