import { en, type TranslationKey } from './en/index';
import { pl } from './pl/index';
import { ru } from './ru/index';
import type { Dictionary } from './types';
import { uk } from './uk/index';

export type { TranslationKey } from './en/index';
export type { Dictionary } from './types';

export const LOCALES = ['en', 'uk', 'pl', 'ru'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export const INTL_TAG: Record<Locale, string> = {
  en: 'en-US',
  uk: 'uk-UA',
  pl: 'pl-PL',
  ru: 'ru-RU',
};

const DICTIONARIES: Record<Locale, Dictionary> = { en, uk, pl, ru };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function resolveLocale(languageTags: readonly (string | null | undefined)[]): Locale {
  for (const tag of languageTags) {
    const code = tag?.split(/[-_]/)[0]?.toLowerCase();
    if (isLocale(code)) return code;
  }
  return DEFAULT_LOCALE;
}

export type TranslationParams = Record<string, string | number>;

export function translate(locale: Locale, key: TranslationKey, params?: TranslationParams): string {
  const text = DICTIONARIES[locale][key] ?? en[key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export type PluralForm = 'one' | 'few' | 'many';

export function pluralForm(locale: Locale, n: number): PluralForm {
  const abs = Math.abs(Math.trunc(n));
  if (locale === 'en') return abs === 1 ? 'one' : 'many';
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return 'one';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
  return 'many';
}

export function localeLabel(locale: Locale): string {
  return en[`language.${locale}`];
}
