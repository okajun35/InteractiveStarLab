import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { en, type MessageKey } from "./en";
import { ja } from "./ja";
import {
  detectLocale,
  writeStoredLocale,
  type Locale,
} from "./locale";

const dictionaries = { en, ja } as const;

export interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** Looks up a message; missing keys fall back to English, never throw. */
  t: (key: MessageKey) => string;
}

const LocaleContext = createContext<LocaleState | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() =>
    detectLocale(
      window.localStorage,
      typeof navigator === "undefined" ? undefined : navigator.language,
    ),
  );

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    writeStoredLocale(window.localStorage, next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback(
    (key: MessageKey): string => dictionaries[locale][key] ?? en[key],
    [locale],
  );

  const value = useMemo<LocaleState>(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleState {
  const context = useContext(LocaleContext);
  if (context === null) throw new Error("useLocale must be used inside <LocaleProvider>");
  return context;
}

export type { Locale, MessageKey };
