import type { Dictionary } from '../types';

export const tasks: Pick<Dictionary, keyof typeof import('../en/tasks').tasks> = {
  'tasks.list.addTask': 'Dodaj zadanie…',
  'tasks.card.missing': 'Tego zadania już nie ma.',
  'tasks.card.notePlaceholder': 'Dodaj notatkę…',
  'tasks.card.note': 'Notatka',
  'tasks.card.subtask': 'Podzadanie',
  'tasks.card.reminder': 'Przypomnienie',
  'tasks.card.startTimer': 'Uruchom timer',
  'tasks.card.startTimerFor': 'Uruchom timer dla {title}',
  'tasks.card.completeTask': 'Ukończ {title}',
  'tasks.card.deleteTask': 'Usuń zadanie',
  'tasks.subtask.newPlaceholder': 'Nowe podzadanie',
  'tasks.subtask.reorder': 'Zmień kolejność',
  'tasks.completed.show': 'POKAŻ UKOŃCZONE',
  'tasks.completed.hide': 'UKRYJ UKOŃCZONE',
  'tasks.completed.empty': 'Brak ukończonych zadań',
  'tasks.completed.reopen': 'Przywróć {title}',
};
