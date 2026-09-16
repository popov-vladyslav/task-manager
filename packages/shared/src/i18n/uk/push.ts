import type { Dictionary } from '../types';

export const push: Pick<Dictionary, keyof typeof import('../en/push').push> = {
  'push.now': 'зараз',
  'push.overdue': 'прострочено',
  'push.inMin': 'через {n} хв',
  'push.inHours': 'через {n} год',
  'push.inDays': 'через {n} дн',
  'push.new': 'нове',
  'push.task': 'Задача',
  'summary.title': 'Ранковий підсумок',
  'summary.yesterday': 'Залишилось із вчора',
  'summary.older': 'Давніше',
  'summary.empty': 'Прострочених немає. Чудово.',
  'push.summaryTitle': 'Залишки з учора',
  'push.summaryYesterday': 'У вас {n} прострочених {noun} з учора.',
  'push.summaryOlder': 'У вас {n} давніших прострочених {noun}.',
  'push.summaryMixed': 'У вас {n} прострочених {noun} — {y} з учора.',
  'push.taskOne': 'задача',
  'push.taskFew': 'задачі',
  'push.taskMany': 'задач',
};
