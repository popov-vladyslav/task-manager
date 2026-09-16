import type { Dictionary } from '../types';

export const auth: Pick<Dictionary, keyof typeof import('../en/auth').auth> = {
  'auth.subtitle': 'Zaloguj się przez e-mail',
  'auth.hint':
    'Pierwszy raz? Podanie adresu e-mail tworzy konto — nie trzeba wypełniać nic więcej.',
  'auth.emailPlaceholder': 'you@example.com',
  'auth.sendCode': 'Wyślij mi kod logowania',
  'auth.sentInfo':
    'Sprawdź pocztę. Otwórz link lub wklej kod poniżej (w trybie dev jest wypisywany w konsoli serwera).',
  'auth.codePlaceholder': 'Wklej kod logowania',
  'auth.signIn': 'Zaloguj się',
};
