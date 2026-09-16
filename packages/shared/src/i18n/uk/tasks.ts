import type { Dictionary } from '../types';

export const tasks: Pick<Dictionary, keyof typeof import('../en/tasks').tasks> = {
  'tasks.list.addTask': 'Додати задачу…',
  'tasks.card.missing': 'Цієї задачі вже немає.',
  'tasks.card.notePlaceholder': 'Додати нотатку…',
  'tasks.card.note': 'Нотатка',
  'tasks.card.subtask': 'Підзадача',
  'tasks.card.reminder': 'Нагадування',
  'tasks.card.startTimer': 'Запустити таймер',
  'tasks.card.startTimerFor': 'Запустити таймер для {title}',
  'tasks.card.completeTask': 'Виконати {title}',
  'tasks.card.deleteTask': 'Видалити задачу',
  'tasks.subtask.newPlaceholder': 'Нова підзадача',
  'tasks.subtask.reorder': 'Змінити порядок',
  'tasks.completed.show': 'ПОКАЗАТИ ВИКОНАНІ',
  'tasks.completed.hide': 'СХОВАТИ ВИКОНАНІ',
  'tasks.completed.empty': 'Немає виконаних задач',
  'tasks.completed.reopen': 'Відновити {title}',
};
