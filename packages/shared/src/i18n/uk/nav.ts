import type { Dictionary } from '../types';

export const nav: Pick<Dictionary, keyof typeof import('../en/nav').nav> = {
  'nav.calendar': 'Календар',
  'nav.countdown': 'Відлік',
  'nav.settings': 'Налаштування',
  'nav.signOut': 'Вийти',
  'nav.openMenu': 'Відкрити меню',
  'nav.countdownPlaceholder': 'Відліки з’являться в наступній фазі.',
};
