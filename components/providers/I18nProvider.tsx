"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { t as translate, type I18nKey } from "@/lib/i18n";
import {
  normalizePreferredLanguage,
  PREFERRED_LANGUAGE_CHANGED_EVENT,
  readDocumentPreferredLanguage,
  type PreferredLanguage,
} from "@/lib/language";

type Params = Record<string, string | number>;

export type I18nApi = {
  locale: PreferredLanguage;
  t: (key: I18nKey, params?: Params) => string;
};

const I18nContext = createContext<I18nApi | null>(null);

export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: PreferredLanguage | string;
  children: ReactNode;
}) {
  const [locale, setLocale] = useState<PreferredLanguage>(() => normalizePreferredLanguage(initialLocale));

  useEffect(() => {
    const setIfChanged = (next: PreferredLanguage) => {
      setLocale((prev) => (prev === next ? prev : next));
    };

    const syncLocale = () => {
      setIfChanged(readDocumentPreferredLanguage());
    };

    const onLanguageChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ language?: PreferredLanguage }>;
      if (customEvent.detail?.language) {
        setIfChanged(customEvent.detail.language);
        return;
      }
      syncLocale();
    };

    syncLocale();
    window.addEventListener("focus", syncLocale);
    window.addEventListener("storage", syncLocale);
    window.addEventListener(PREFERRED_LANGUAGE_CHANGED_EVENT, onLanguageChanged as EventListener);

    return () => {
      window.removeEventListener("focus", syncLocale);
      window.removeEventListener("storage", syncLocale);
      window.removeEventListener(PREFERRED_LANGUAGE_CHANGED_EVENT, onLanguageChanged as EventListener);
    };
  }, []);

  const t = useCallback(
    (key: I18nKey, params?: Params) => translate(locale, key, params),
    [locale],
  );

  const value = useMemo<I18nApi>(() => ({ locale, t }), [locale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18nContext(): I18nApi | null {
  return useContext(I18nContext);
}
