import type { useTranslations } from "next-intl";

export type TranslationValues = Record<string, string | number | Date | undefined>;

/** `t(key, fallback, values)` — resolves to `fallback` when the key is missing. */
export type Translator = (key: string, fallback: string, values?: TranslationValues) => string;

type NamespaceTranslator = ReturnType<typeof useTranslations>;

/**
 * Wraps a next-intl translator so missing keys degrade to a caller-supplied
 * fallback instead of surfacing the raw key. Keys are dynamic here, so the
 * strictly-typed next-intl signature is narrowed in exactly one place.
 */
export function createTranslator(t: NamespaceTranslator): Translator {
  const loose = t as unknown as {
    (key: string, values?: TranslationValues): string;
    has?: (key: string) => boolean;
  };
  return (key, fallback, values) => {
    if (typeof loose.has === "function" && !loose.has(key)) return fallback;
    try {
      const translation = loose(key, values);
      if (!translation || translation === key) return fallback;
      return translation;
    } catch {
      return fallback;
    }
  };
}
