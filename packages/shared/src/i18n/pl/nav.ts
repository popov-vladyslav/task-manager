import type { Dictionary } from '../types';

export const nav: Pick<Dictionary, keyof typeof import('../en/nav').nav> = {
  'nav.calendar': 'Kalendarz',
  'nav.countdown': 'Odliczanie',
  'nav.settings': 'Ustawienia',
  'nav.signOut': 'Wyloguj się',
  'nav.openMenu': 'Otwórz menu',
  'nav.countdownPlaceholder': 'Odliczania pojawią się w późniejszej fazie.',
};
