import type { Dictionary } from '../types';

export const contexts: Pick<Dictionary, keyof typeof import('../en/contexts').contexts> = {
  'contexts.editor.emoji': 'Emoji',
  'contexts.editor.namePlaceholder': 'Nazwa kategorii',
  'contexts.editor.hideFromAll': 'Ukryj we „Wszystkie zadania”',
  'contexts.editor.hideFromAllHint':
    'Nadal widoczny w menu; zadania nie trafiają do „Wszystkie zadania”.',
  'contexts.editor.colour': 'KOLOR',
  'contexts.editor.saveFailed': 'Nie udało się zapisać',
  'contexts.editor.deleteFailed': 'Nie udało się usunąć',
  'contexts.menu.taskCountOne': '{n} zadanie',
  'contexts.menu.taskCount': 'Zadania: {n}',
  'contexts.menu.rename': 'Nazwa, kolor i emoji',
  'contexts.menu.showInAll': 'Pokaż we „Wszystkie zadania”',
  'contexts.menu.delete': 'Usuń kategorię',
  'contexts.menu.deleteFailed': 'Nie udało się usunąć kategorii',
  'contexts.screen.noOpenTasks': 'Brak otwartych zadań',
  'contexts.drawer.caption': 'KATEGORIE',
  'contexts.drawer.newContext': 'Nowa kategoria',
  'contexts.drawer.hiddenNote':
    'Ukryte kategorie pozostają na tej liście; ich zadania nie trafiają do „Wszystkie zadania”.',
  'contexts.drawer.closeMenu': 'Zamknij menu',
  'contexts.menu.deleteBlocked':
    'Otwarte zadania nadal używają tej kategorii — przenieś je lub usuń.',
};
