import type { Dictionary } from '../types';

export const auth: Pick<Dictionary, keyof typeof import('../en/auth').auth> = {
  'auth.subtitle': 'Войдите с помощью электронной почты',
  'auth.hint':
    'Впервые здесь? Введите почту — аккаунт создастся автоматически, больше ничего заполнять не нужно.',
  'auth.emailPlaceholder': 'you@example.com',
  'auth.sendCode': 'Отправить код входа на почту',
  'auth.sentInfo':
    'Проверьте почту. Откройте ссылку или вставьте код ниже (в dev-режиме он выводится в консоль сервера).',
  'auth.codePlaceholder': 'Вставьте код входа',
  'auth.signIn': 'Войти',
};
