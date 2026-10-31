"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18nContext } from "@/components/providers/I18nProvider";
import { selectPluralKey, t as translate, type I18nKey } from "@/lib/i18n";
import {
  PREFERRED_LANGUAGE_CHANGED_EVENT,
  readDocumentPreferredLanguage,
  type PreferredLanguage,
} from "@/lib/language";

type Params = Record<string, string | number>;

type I18nApi = {
  locale: PreferredLanguage;
  t: (key: I18nKey, params?: Params) => string;
  tp: (singularKey: I18nKey, pluralKey: I18nKey, count: number, params?: Params) => string;
};

export function useI18n(): I18nApi {
  const context = useI18nContext();
  const [fallbackLocale, setFallbackLocale] = useState<PreferredLanguage>("en-US");

  useEffect(() => {
    if (context) return;
    const syncLocale = () => {
      const next = readDocumentPreferredLanguage();
      setFallbackLocale((prev) => (prev === next ? prev : next));
    };

    const onLanguageChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ language?: PreferredLanguage }>;
      if (customEvent.detail?.language) {
        setFallbackLocale((prev) => (prev === customEvent.detail?.language ? prev : customEvent.detail?.language ?? prev));
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
  }, [context]);

  const locale = context?.locale ?? fallbackLocale;

  const t = useCallback((key: I18nKey, params?: Params) => {
    return translate(locale, key, params);
  }, [locale]);

  const tp = useCallback((singularKey: I18nKey, pluralKey: I18nKey, count: number, params?: Params) => {
    return translate(locale, selectPluralKey(count, singularKey, pluralKey), { ...params, count });
  }, [locale]);

  return { locale, t, tp };
}
