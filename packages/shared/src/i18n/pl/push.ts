import type { Dictionary } from '../types';

export const push: Pick<Dictionary, keyof typeof import('../en/push').push> = {
  'push.now': 'teraz',
  'push.overdue': 'po terminie',
  'push.inMin': 'za {n} min',
  'push.inHours': 'za {n} godz.',
  'push.inDays': 'za {n} dni',
  'push.new': 'nowe',
  'push.task': 'Zadanie',
  'summary.title': 'Poranne podsumowanie',
  'summary.yesterday': 'Zostało z wczoraj',
  'summary.older': 'Starsze',
  'summary.empty': 'Nic po terminie. Świetnie.',
  'push.summaryTitle': 'Zaległości z wczoraj',
  'push.summaryYesterday': 'Masz {n} {noun} po terminie z wczoraj.',
  'push.summaryOlder': 'Masz {n} starszych {noun} po terminie.',
  'push.summaryMixed': 'Masz {n} {noun} po terminie — {y} z wczoraj.',
  'push.taskOne': 'zadanie',
  'push.taskFew': 'zadania',
  'push.taskMany': 'zadań',
};
