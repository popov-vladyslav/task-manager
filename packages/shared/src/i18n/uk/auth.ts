import type { Dictionary } from '../types';

export const auth: Pick<Dictionary, keyof typeof import('../en/auth').auth> = {
  'auth.subtitle': 'Увійдіть за допомогою електронної пошти',
  'auth.hint':
    'Уперше тут? Введіть свою пошту — обліковий запис створиться автоматично, більше нічого заповнювати не потрібно.',
  'auth.emailPlaceholder': 'you@example.com',
  'auth.sendCode': 'Надіслати код входу на пошту',
  'auth.sentInfo':
    'Перевірте пошту. Відкрийте посилання або вставте код нижче (у dev-режимі він виводиться в консоль сервера).',
  'auth.codePlaceholder': 'Вставте код входу',
  'auth.signIn': 'Увійти',
};
