"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Globe2, MoonStar, Sun, ChevronDown, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import LandingNavbar from "@/components/LandingNavbar";
import LandingFooter from "@/components/LandingFooter";
import { DemoLaunchButton } from "@/components/landing/persona/DemoLaunchButton";
import type { PersonaConfig } from "@/components/landing/persona/persona-config";
import { personaNavigationLinks } from "@/components/landing/persona/persona-config";
import { emitMarketingAnalyticsEvent } from "@/lib/marketing-analytics";

const localeOptions = [
  { label: "English", value: "en-IN" },
  { label: "Hindi", value: "hi" },
  { label: "Arabic", value: "ar" },
  { label: "Spanish", value: "es" },
] as const;

type PersonaLandingPageProps = {
  persona: PersonaConfig;
};

function FloatingPreferencesWidget() {
  const { resolvedTheme, setTheme } = useTheme();
  const currentLocale = useMemo(() => {
    if (typeof document === "undefined") return "en-IN";
    const cookie = document.cookie
      .split("; ")
      .find((part) => part.startsWith("NEXT_LOCALE="));
    return cookie?.split("=")[1] || "en-IN";
  }, []);

  const updateLocale = (value: string) => {
    document.cookie = `NEXT_LOCALE=${value}; path=/; max-age=${60 * 60 * 24 * 365}`;
    window.location.reload();
  };

  return (
    <div className="fixed bottom-6 right-6 z-40 w-72 rounded-2xl border border-orange-200/80 bg-white/95 p-4 shadow-2xl backdrop-blur dark:border-orange-900/50 dark:bg-zinc-950/90">
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-orange-700 dark:text-orange-300">
        Experience Preferences
      </p>
      <div className="mt-3 space-y-3">
        <label className="block">
          <span className="mb-1 flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            <Globe2 className="h-3.5 w-3.5 text-orange-500" />
            Language
          </span>
          <div className="relative">
            <select
              defaultValue={currentLocale}
              onChange={(event) => updateLocale(event.target.value)}
              className="h-10 w-full appearance-none rounded-xl border border-zinc-200 bg-white px-3 pr-9 text-sm font-medium text-zinc-800 outline-none ring-orange-400/40 transition focus:ring-2 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {localeOptions.map((locale) => (
                <option key={locale.value} value={locale.value}>
                  {locale.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-zinc-500" />
          </div>
        </label>

        <Button
          type="button"
          variant="outline"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          className="h-10 w-full justify-center gap-2 rounded-xl border-zinc-200 bg-white font-semibold text-zinc-700 hover:bg-orange-50 hover:text-orange-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-orange-300"
        >
          {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
          Switch to {resolvedTheme === "dark" ? "Light" : "Dark"} Mode
        </Button>
      </div>
    </div>
  );
}

export default function PersonaLandingPage({ persona }: PersonaLandingPageProps) {
  return (
    <div className="min-h-screen bg-surface-base">
      <LandingNavbar />

      <main className="px-6 pb-20 pt-28">
        <section className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <p className="inline-flex rounded-full border border-orange-500/25 bg-orange-500/10 px-4 py-1 text-xs font-black uppercase tracking-[0.2em] text-orange-700 dark:text-orange-300">
              {persona.navLabel}
            </p>
            <h1 className="text-4xl font-black leading-tight text-zinc-900 dark:text-zinc-50 md:text-6xl">
              {persona.headline}
            </h1>
            <p className="max-w-2xl text-lg text-zinc-600 dark:text-zinc-300">{persona.subheadline}</p>
            <div className="flex flex-col gap-4 sm:flex-row">
              <Button size="lg" className="h-14 rounded-2xl px-8 text-base font-black" asChild>
                <Link
                  href={persona.primaryCta.href}
                  onClick={() =>
                    emitMarketingAnalyticsEvent("trial_cta_click", {
                      source: persona.slug,
                      label: persona.primaryCta.label,
                    })
                  }
                >
                  {persona.primaryCta.label}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <DemoLaunchButton
                templateKey={persona.secondaryCta.templateKey}
                label={persona.secondaryCta.label}
                analyticsContext={`persona:${persona.slug}`}
                className="h-14 rounded-2xl px-8 text-base font-bold"
              />
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              {persona.trustChips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>

          <div className="card-elevated rounded-3xl border border-zinc-200/80 p-6 dark:border-zinc-800">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              This is the workflow your team will see
            </p>
            <ol className="mt-4 space-y-3">
              {persona.demoFlow.map((step) => (
                <li
                  key={step}
                  className="rounded-2xl border border-orange-100 bg-orange-50/80 p-3 text-sm font-medium text-zinc-700 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-zinc-200"
                >
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto mt-16 grid max-w-7xl gap-8 lg:grid-cols-2">
          <div className="space-y-4 rounded-3xl border border-zinc-200 bg-white p-7 dark:border-zinc-800 dark:bg-zinc-900/60">
            <h2 className="text-2xl font-black text-zinc-900 dark:text-zinc-50">Pain points we fix first</h2>
            <ul className="space-y-2">
              {persona.painPoints.map((point) => (
                <li key={point} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-4 rounded-3xl border border-zinc-200 bg-white p-7 dark:border-zinc-800 dark:bg-zinc-900/60">
            <h2 className="text-2xl font-black text-zinc-900 dark:text-zinc-50">Features tailored to this niche</h2>
            <ul className="space-y-2">
              {persona.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto mt-16 max-w-7xl">
          <h2 className="text-2xl font-black text-zinc-900 dark:text-zinc-50 md:text-3xl">Trusted by teams like yours</h2>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            {persona.testimonials.map((testimonial) => (
              <article
                key={`${testimonial.author}-${testimonial.role}`}
                className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70"
              >
                <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                  &quot;{testimonial.quote}&quot;
                </p>
                <p className="mt-4 text-sm font-black text-zinc-900 dark:text-zinc-50">{testimonial.author}</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {testimonial.role}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-16 max-w-7xl rounded-3xl border border-orange-200 bg-orange-50/70 p-8 dark:border-orange-900/40 dark:bg-orange-950/20">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700 dark:text-orange-300">Explore by persona</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {personaNavigationLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-xl border border-orange-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-orange-400 hover:text-orange-700 dark:border-orange-900/40 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-orange-300"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </section>
      </main>

      <LandingFooter />
      <FloatingPreferencesWidget />
    </div>
  );
}
