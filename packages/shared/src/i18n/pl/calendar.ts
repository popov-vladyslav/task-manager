import type { Dictionary } from '../types';

export const calendar: Pick<Dictionary, keyof typeof import('../en/calendar').calendar> = {
  'calendar.mode.day': 'Dzień',
  'calendar.mode.threeDay': '3 dni',
  'calendar.mode.week': 'Tydzień',
  'calendar.mode.month': 'Miesiąc',
  'calendar.legend.scheduled': 'Zaplanowane zadanie',
  'calendar.legend.repeating': 'Powtarzające się',
  'calendar.moveScope.title': 'Przenieś powtarzające się zadanie',
  'calendar.moveScope.message':
    'To zadanie się powtarza. Przenieść tylko to jedno czy to i wszystkie kolejne?',
  'calendar.moveScope.occurrence': 'Tylko to jedno',
  'calendar.moveScope.following': 'To i wszystkie kolejne',
};
