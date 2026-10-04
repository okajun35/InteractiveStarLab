/**
 * Locale detection and persistence — pure functions so verification can run
 * them without a DOM. localStorage access is always guarded: a blocked or
 * malformed store must never crash the app.
 */

export type Locale = "en" | "ja";

const STORAGE_KEY = "star-view.locale";

export interface LocaleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function normalize(value: unknown): Locale | null {
  return value === "en" || value === "ja" ? value : null;
}

export function readStoredLocale(storage: LocaleStorage): Locale | null {
  try {
    return normalize(storage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeStoredLocale(storage: LocaleStorage, locale: Locale): void {
  try {
    storage.setItem(STORAGE_KEY, locale);
  } catch {
    // Blocked storage only loses the preference; the toggle still works.
  }
}

/** Stored choice wins, then a Japanese browser, then English. */
export function detectLocale(
  storage: LocaleStorage,
  navigatorLanguage?: string,
): Locale {
  const stored = readStoredLocale(storage);
  if (stored !== null) return stored;
  return typeof navigatorLanguage === "string" && navigatorLanguage.toLowerCase().startsWith("ja")
    ? "ja"
    : "en";
}
