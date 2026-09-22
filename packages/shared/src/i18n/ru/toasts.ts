import type { Dictionary } from '../types';

export const toasts: Pick<Dictionary, keyof typeof import('../en/toasts').toasts> = {
  'toasts.taskCreated': 'Задача создана',
  'toasts.taskCompleted': 'Задача выполнена',
  'toasts.taskCompletedNext': 'Выполнено · следующий повтор запланирован',
  'toasts.taskDeleted': 'Задача удалена',
  'toasts.seriesDeleted': 'Серия удалена',
  'toasts.deleteTaskFailed': 'Не удалось удалить задачу — восстановлена',
  'toasts.moveFailed': 'Не удалось перенести задачу',
  'toasts.addSubtaskFailed': 'Не удалось добавить подзадачу',
  'toasts.loadFailed': 'Не удалось загрузить',
};
