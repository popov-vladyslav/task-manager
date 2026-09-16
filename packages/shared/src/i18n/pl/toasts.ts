import type { Dictionary } from '../types';

export const toasts: Pick<Dictionary, keyof typeof import('../en/toasts').toasts> = {
  'toasts.taskCreated': 'Zadanie utworzone',
  'toasts.taskCompleted': 'Zadanie ukończone',
  'toasts.taskCompletedNext': 'Ukończono · zaplanowano następne wystąpienie',
  'toasts.taskDeleted': 'Zadanie usunięte',
  'toasts.deleteTaskFailed': 'Nie udało się usunąć zadania — przywrócono',
  'toasts.addSubtaskFailed': 'Nie udało się dodać podzadania',
  'toasts.loadFailed': 'Nie udało się wczytać',
};
