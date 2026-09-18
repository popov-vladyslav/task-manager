import type { Dictionary } from '../types';

export const contexts: Pick<Dictionary, keyof typeof import('../en/contexts').contexts> = {
  'contexts.editor.emoji': 'Емодзі',
  'contexts.editor.namePlaceholder': 'Назва категорії',
  'contexts.editor.hideFromAll': 'Приховати з «Усі задачі»',
  'contexts.editor.hideFromAllHint': 'Залишається в меню; задачі не показуються в «Усі задачі».',
  'contexts.editor.colour': 'КОЛІР',
  'contexts.editor.saveFailed': 'Не вдалося зберегти',
  'contexts.editor.deleteFailed': 'Не вдалося видалити',
  'contexts.menu.taskCountOne': '{n} задача',
  'contexts.menu.taskCount': 'Задач: {n}',
  'contexts.menu.rename': 'Назва, колір та емодзі',
  'contexts.menu.showInAll': 'Показувати в «Усі задачі»',
  'contexts.menu.delete': 'Видалити категорію',
  'contexts.menu.deleteFailed': 'Не вдалося видалити категорію',
  'contexts.menu.deleteConfirm':
    'Видалити «{name}»? Її завершені задачі збережуться, лише без категорії.',
  'contexts.screen.noOpenTasks': 'Пустий список',
  'contexts.drawer.caption': 'КАТЕГОРІЇ',
  'contexts.drawer.newContext': 'Нова категорія',
  'contexts.drawer.hiddenNote':
    'Приховані категорії залишаються тут; їхні задачі не входять до «Усі задачі».',
  'contexts.drawer.closeMenu': 'Закрити меню',
  'contexts.menu.deleteBlocked':
    'Відкриті задачі ще використовують цю категорію — перенесіть або видаліть їх.',
};
