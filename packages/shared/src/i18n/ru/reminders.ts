import type { Dictionary } from '../types';

export const reminders: Pick<Dictionary, keyof typeof import('../en/reminders').reminders> = {
  'reminders.modal.label': 'НАПОМИНАНИЕ',
  'reminders.modal.dismiss': 'Отклонить',
  'reminders.snooze.minutes': 'Отложить на {n} мин',
  'reminders.snooze.hour': 'Отложить на 1 час',
  'reminders.notification.fallbackTitle': 'Напоминание',
  'reminders.summary.greeting': 'Доброе утро',
  'reminders.summary.checking': 'Проверяем, что ещё открыто…',
  'reminders.summary.yesterdayCount': 'Осталось со вчера: {n}',
  'reminders.summary.olderCount': 'Просрочено ранее: {n}',
  'reminders.summary.notNow': 'Не сейчас',
  'reminders.summary.wasDue': 'срок был {when}',
  'reminders.summary.moveToToday': 'Перенести «{title}» на сегодня',
  'reminders.summary.clearTime': 'Убрать запланированное время для «{title}»',
  'reminders.channel.default': 'Напоминания о задачах',
  'reminders.channel.critical': 'Важные напоминания о задачах',
};
