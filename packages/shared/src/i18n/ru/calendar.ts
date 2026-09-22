import type { Dictionary } from '../types';

export const calendar: Pick<Dictionary, keyof typeof import('../en/calendar').calendar> = {
  'calendar.mode.day': 'День',
  'calendar.mode.threeDay': '3 дня',
  'calendar.mode.week': 'Неделя',
  'calendar.mode.month': 'Месяц',
  'calendar.legend.scheduled': 'Запланированная задача',
  'calendar.legend.repeating': 'Повторяющаяся',
  'calendar.moveScope.title': 'Перенести повторяющуюся задачу',
  'calendar.moveScope.message':
    'Эта задача повторяется. Перенести только её или её и все следующие?',
  'calendar.moveScope.occurrence': 'Только эту',
  'calendar.moveScope.following': 'Эту и все следующие',
  'calendar.ghost.noOpenTask':
    'У этого повтора пока нет открытой задачи — она появится в свой день',
};
