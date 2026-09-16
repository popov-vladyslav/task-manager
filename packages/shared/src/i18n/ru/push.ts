import type { Dictionary } from '../types';

export const push: Pick<Dictionary, keyof typeof import('../en/push').push> = {
  'push.now': 'сейчас',
  'push.overdue': 'просрочено',
  'push.inMin': 'через {n} мин',
  'push.inHours': 'через {n} ч',
  'push.inDays': 'через {n} дн',
  'push.new': 'новое',
  'push.task': 'Задача',
  'summary.title': 'Утренняя сводка',
  'summary.yesterday': 'Осталось со вчера',
  'summary.older': 'Более ранние',
  'summary.empty': 'Просроченных нет. Отлично.',
  'push.summaryTitle': 'Остатки со вчера',
  'push.summaryYesterday': 'У вас {n} просроченных {noun} со вчера.',
  'push.summaryOlder': 'У вас {n} более ранних просроченных {noun}.',
  'push.summaryMixed': 'У вас {n} просроченных {noun} — {y} со вчера.',
  'push.taskOne': 'задача',
  'push.taskFew': 'задачи',
  'push.taskMany': 'задач',
};
