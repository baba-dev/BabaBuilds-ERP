export const SUPPORTED_LOCALES = ['en-IN', 'es', 'hi', 'ar'] as const;

export const DEFAULT_LOCALE = 'en-IN';

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const isSupportedLocale = (locale: string): locale is SupportedLocale =>
  SUPPORTED_LOCALES.includes(locale as SupportedLocale);
