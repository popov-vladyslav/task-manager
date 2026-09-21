import type { Dictionary } from '../types';

export const calendar: Pick<Dictionary, keyof typeof import('../en/calendar').calendar> = {
  'calendar.mode.day': 'День',
  'calendar.mode.threeDay': '3 дні',
  'calendar.mode.week': 'Тиждень',
  'calendar.mode.month': 'Місяць',
  'calendar.legend.scheduled': 'Запланована задача',
  'calendar.legend.repeating': 'Повторювана',
  'calendar.moveScope.title': 'Перенести повторювану задачу',
  'calendar.moveScope.message': 'Ця задача повторюється. Перенести лише її чи її та всі наступні?',
  'calendar.moveScope.occurrence': 'Лише цю',
  'calendar.moveScope.following': 'Цю та всі наступні',
};
