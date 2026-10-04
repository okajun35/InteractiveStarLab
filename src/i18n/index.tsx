import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { en, type MessageKey } from "./en";
import { ja } from "./ja";
import {
  detectLocale,
  intlLocale,
  writeStoredLocale,
  type Locale,
} from "./locale";

const dictionaries = { en, ja } as const;

export interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /**
   * Looks up a message; missing keys fall back to English, never throw.
   * `vars` substitutes `{name}` placeholders in the message.
   */
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
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
    (key: MessageKey, vars?: Record<string, string | number>): string => {
      let message: string = dictionaries[locale][key] ?? en[key];
      if (vars !== undefined) {
        for (const [name, value] of Object.entries(vars)) {
          message = message.split(`{${name}}`).join(String(value));
        }
      }
      return message;
    },
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

export { intlLocale };
export type { Locale, MessageKey };
