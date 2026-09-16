import type { Dictionary } from '../types';

export const nav: Pick<Dictionary, keyof typeof import('../en/nav').nav> = {
  'nav.calendar': 'Календарь',
  'nav.countdown': 'Отсчёт',
  'nav.settings': 'Настройки',
  'nav.signOut': 'Выйти',
  'nav.openMenu': 'Открыть меню',
  'nav.countdownPlaceholder': 'Отсчёты появятся в следующей фазе.',
};
