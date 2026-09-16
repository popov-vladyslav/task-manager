import type { Dictionary } from '../types';

export const reminders: Pick<Dictionary, keyof typeof import('../en/reminders').reminders> = {
  'reminders.modal.label': 'НАГАДУВАННЯ',
  'reminders.modal.dismiss': 'Відхилити',
  'reminders.snooze.minutes': 'Відкласти на {n} хв',
  'reminders.snooze.hour': 'Відкласти на 1 годину',
  'reminders.notification.fallbackTitle': 'Нагадування',
  'reminders.summary.greeting': 'Доброго ранку',
  'reminders.summary.checking': 'Перевіряємо, що ще відкрито…',
  'reminders.summary.yesterdayCount': 'Залишилось із вчора: {n}',
  'reminders.summary.olderCount': 'Прострочено давніше: {n}',
  'reminders.summary.notNow': 'Не зараз',
  'reminders.summary.wasDue': 'термін був {when}',
  'reminders.summary.moveToToday': 'Перенести «{title}» на сьогодні',
  'reminders.summary.clearTime': 'Прибрати запланований час для «{title}»',
  'reminders.channel.default': 'Нагадування про задачі',
  'reminders.channel.critical': 'Важливі нагадування про задачі',
};
