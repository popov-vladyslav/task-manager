import type { Dictionary } from '../types';

export const timer: Pick<Dictionary, keyof typeof import('../en/timer').timer> = {
  'timer.stopTimer': 'Zatrzymaj timer',
  'timer.pause': 'Pauza',
  'timer.resume': 'Wznów',
};
