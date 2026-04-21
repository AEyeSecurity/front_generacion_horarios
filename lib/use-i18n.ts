"use client";

import { useCallback, useEffect, useState } from "react";
import { t as translate, type I18nKey } from "@/lib/i18n";
import {
  PREFERRED_LANGUAGE_CHANGED_EVENT,
  readDocumentPreferredLanguage,
  type PreferredLanguage,
} from "@/lib/language";

type Params = Record<string, string | number>;

type I18nApi = {
  locale: PreferredLanguage;
  t: (key: I18nKey, params?: Params) => string;
};

export function useI18n(): I18nApi {
  const [locale, setLocale] = useState<PreferredLanguage>(() => readDocumentPreferredLanguage());

  useEffect(() => {
    const syncLocale = () => {
      setLocale(readDocumentPreferredLanguage());
    };

    const onLanguageChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ language?: PreferredLanguage }>;
      if (customEvent.detail?.language) {
        setLocale(customEvent.detail.language);
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

  const t = useCallback((key: I18nKey, params?: Params) => {
    return translate(locale, key, params);
  }, [locale]);

  return { locale, t };
}
