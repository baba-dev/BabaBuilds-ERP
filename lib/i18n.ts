const RTL_LANGS = new Set(["ar", "fa", "he", "ur"]);

export function getLocaleDirection(locale: string): "rtl" | "ltr" {
  const language = locale.toLowerCase().split("-")[0];
  return RTL_LANGS.has(language) ? "rtl" : "ltr";
}
