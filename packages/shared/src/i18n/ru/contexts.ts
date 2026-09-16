import type { Dictionary } from '../types';

export const contexts: Pick<Dictionary, keyof typeof import('../en/contexts').contexts> = {
  'contexts.editor.emoji': 'Эмодзи',
  'contexts.editor.namePlaceholder': 'Название категории',
  'contexts.editor.hideFromAll': 'Скрыть из «Все»',
  'contexts.editor.hideFromAllHint': 'Остаётся в меню; задачи не показываются во «Все».',
  'contexts.editor.colour': 'ЦВЕТ',
  'contexts.editor.saveFailed': 'Не удалось сохранить',
  'contexts.editor.deleteFailed': 'Не удалось удалить',
  'contexts.menu.taskCountOne': '{n} задача',
  'contexts.menu.taskCount': 'Задач: {n}',
  'contexts.menu.rename': 'Название, цвет и эмодзи',
  'contexts.menu.showInAll': 'Показывать во «Все»',
  'contexts.menu.delete': 'Удалить категорию',
  'contexts.menu.deleteFailed': 'Не удалось удалить категорию',
  'contexts.screen.noOpenTasks': 'Нет открытых задач',
  'contexts.drawer.caption': 'КАТЕГОРИИ',
  'contexts.drawer.newContext': 'Новая категория',
  'contexts.drawer.hiddenNote': 'Скрытые категории остаются здесь; их задачи не входят во «Все».',
  'contexts.drawer.closeMenu': 'Закрыть меню',
  'contexts.menu.deleteBlocked':
    'Открытые задачи ещё используют эту категорию — перенесите или удалите их.',
};
