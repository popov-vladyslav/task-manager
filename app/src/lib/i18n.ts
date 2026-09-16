import { useCallback } from 'react';
import {
  INTL_TAG,
  translate,
  type Locale,
  type TranslationKey,
  type TranslationParams,
} from '@task-manager/shared';
import { useLocaleStore } from '../store/locale';

export type T = (key: TranslationKey, params?: TranslationParams) => string;

export function useLocale(): Locale {
  return useLocaleStore((s) => s.locale);
}

export function useT(): T {
  const locale = useLocale();
  return useCallback<T>((key, params) => translate(locale, key, params), [locale]);
}

export function useIntlTag(): string {
  return INTL_TAG[useLocale()];
}

export function currentT(): T {
  const locale = useLocaleStore.getState().locale;
  return (key, params) => translate(locale, key, params);
}
