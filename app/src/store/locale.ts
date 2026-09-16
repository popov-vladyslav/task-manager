import { create } from 'zustand';
import { getLocales } from 'expo-localization';
import { DEFAULT_LOCALE, isLocale, resolveLocale, type Locale } from '@task-manager/shared';
import { api } from '../lib/api';
import { storage } from '../lib/storage';

const LOCALE_KEY = 'locale';

interface LocaleState {
  locale: Locale;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setLocale: (locale: Locale) => Promise<void>;
  adoptServerLocale: (locale: Locale | null) => void;
}

function deviceLocale(): Locale {
  try {
    return resolveLocale(getLocales().map((l) => l.languageTag ?? l.languageCode));
  } catch {
    return DEFAULT_LOCALE;
  }
}

export const useLocaleStore = create<LocaleState>((set, get) => ({
  locale: DEFAULT_LOCALE,
  hydrated: false,

  async hydrate() {
    const stored = await storage.get(LOCALE_KEY);
    const locale = isLocale(stored) ? stored : deviceLocale();
    set({ locale, hydrated: true });
    if (!isLocale(stored)) await storage.set(LOCALE_KEY, locale);
  },

  async setLocale(locale) {
    if (locale === get().locale) return;
    set({ locale });
    await storage.set(LOCALE_KEY, locale);
    api.updateSettings({ language: locale }).catch(() => {});
  },

  adoptServerLocale(locale) {
    if (!locale) {
      api.updateSettings({ language: get().locale }).catch(() => {});
      return;
    }
    if (locale !== get().locale) {
      set({ locale });
      storage.set(LOCALE_KEY, locale).catch(() => {});
    }
  },
}));
