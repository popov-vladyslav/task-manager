import type { Dictionary } from '../types';

export const toasts: Pick<Dictionary, keyof typeof import('../en/toasts').toasts> = {
  'toasts.taskCreated': 'Задачу створено',
  'toasts.taskCompleted': 'Задачу виконано',
  'toasts.taskCompletedNext': 'Виконано · наступний повтор заплановано',
  'toasts.taskDeleted': 'Задачу видалено',
  'toasts.seriesDeleted': 'Серію видалено',
  'toasts.deleteTaskFailed': 'Не вдалося видалити задачу — відновлено',
  'toasts.moveFailed': 'Не вдалося перенести задачу',
  'toasts.addSubtaskFailed': 'Не вдалося додати підзадачу',
  'toasts.loadFailed': 'Не вдалося завантажити',
};
