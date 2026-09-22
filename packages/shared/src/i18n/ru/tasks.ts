import type { Dictionary } from '../types';

export const tasks: Pick<Dictionary, keyof typeof import('../en/tasks').tasks> = {
  'tasks.list.addTask': 'Добавить задачу…',
  'tasks.card.missing': 'Этой задачи больше нет.',
  'tasks.card.notePlaceholder': 'Добавить заметку…',
  'tasks.card.note': 'Заметка',
  'tasks.card.subtask': 'Подзадача',
  'tasks.card.reminder': 'Напоминание',
  'tasks.card.startTimer': 'Запустить таймер',
  'tasks.card.startTimerFor': 'Запустить таймер для {title}',
  'tasks.card.completeTask': 'Выполнить {title}',
  'tasks.card.deleteTask': 'Удалить задачу',
  'tasks.deleteScope.title': 'Удалить повторяющуюся задачу',
  'tasks.deleteScope.message':
    'Эта задача повторяется. Удалить только её или остановить всю серию?',
  'tasks.deleteScope.occurrence': 'Только эту',
  'tasks.deleteScope.series': 'Всю серию',
  'tasks.subtask.newPlaceholder': 'Новая подзадача',
  'tasks.subtask.reorder': 'Изменить порядок',
  'tasks.completed.show': 'ПОКАЗАТЬ ВЫПОЛНЕННЫЕ',
  'tasks.completed.hide': 'СКРЫТЬ ВЫПОЛНЕННЫЕ',
  'tasks.completed.empty': 'Нет выполненных задач',
  'tasks.completed.reopen': 'Вернуть {title}',
};
