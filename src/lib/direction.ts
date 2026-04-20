import { getLocaleDirection } from "@/lib/i18n";

export const RTL_LOCALES = new Set(["ar", "fa", "he", "ur"]);

export function isRtlLocale(locale: string): boolean {
  const language = locale.toLowerCase().split("-")[0];
  return RTL_LOCALES.has(language);
}

export function dirFromLocale(locale: string): "rtl" | "ltr" {
  return getLocaleDirection(locale);
}

export function isRtlDocument(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.dir === "rtl";
}
