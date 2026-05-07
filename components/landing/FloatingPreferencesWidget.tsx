"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Globe2, MoonStar, Sun, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function FloatingPreferencesWidget() {
  const tl = useTranslations("LandingPhase1");
  const ts = useTranslations("Settings");
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [currentLocale, setCurrentLocale] = useState("en-IN");
  const localeOptions = [
    { label: ts("languageOptions.enIN"), value: "en-IN" },
    { label: ts("languageOptions.hi"), value: "hi" },
    { label: ts("languageOptions.ar"), value: "ar" },
    { label: ts("languageOptions.es"), value: "es" },
  ] as const;
  useEffect(() => {
    const cookie = document.cookie.split("; ").find((part) => part.startsWith("NEXT_LOCALE="));
    const locale = cookie?.split("=")[1] || "en-IN";
    const timeoutId = window.setTimeout(() => {
      setCurrentLocale(locale);
      setMounted(true);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const themeIsDark = mounted && resolvedTheme === "dark";

  const updateLocale = (value: string) => {
    document.cookie = `NEXT_LOCALE=${value}; path=/; max-age=${60 * 60 * 24 * 365}`;
    window.location.reload();
  };

  return (
    <aside
      aria-label={tl("persona.widget.title")}
      className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 w-auto rounded-2xl border border-orange-200/80 bg-white/95 p-4 shadow-2xl backdrop-blur dark:border-orange-900/50 dark:bg-zinc-950/90 sm:inset-x-auto sm:end-6 sm:w-72"
    >
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-orange-700 dark:text-orange-300">
        {tl("persona.widget.title")}
      </p>
      <div className="mt-3 space-y-3">
        <label className="block">
          <span className="mb-1 flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            <Globe2 className="h-3.5 w-3.5 text-orange-500" />
            {tl("persona.widget.language")}
          </span>
          <div className="relative">
            <select
              value={currentLocale}
              onChange={(event) => updateLocale(event.target.value)}
              className="h-10 w-full appearance-none rounded-xl border border-zinc-200 bg-white px-3 pe-9 text-sm font-medium text-zinc-800 outline-none ring-orange-400/40 transition focus:ring-2 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {localeOptions.map((locale) => (
                <option key={locale.value} value={locale.value}>
                  {locale.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute end-3 top-3 h-4 w-4 text-zinc-500" />
          </div>
        </label>

        <Button
          type="button"
          variant="outline"
          onClick={() => setTheme(themeIsDark ? "light" : "dark")}
          className="h-10 w-full justify-center gap-2 rounded-xl border-zinc-200 bg-white font-semibold text-zinc-700 hover:bg-orange-50 hover:text-orange-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-orange-300"
        >
          {themeIsDark ? <Sun className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
          {themeIsDark ? tl("persona.widget.switchToLight") : tl("persona.widget.switchToDark")}
        </Button>
      </div>
    </aside>
  );
}
