import type { Dictionary } from '../types';

export const timer: Pick<Dictionary, keyof typeof import('../en/timer').timer> = {
  'timer.stopTimer': 'Зупинити таймер',
  'timer.pause': 'Пауза',
  'timer.resume': 'Продовжити',
};
