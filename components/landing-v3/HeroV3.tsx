"use client";

import { m, LazyMotion, domAnimation } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

export default function HeroV3() {
  const t = useTranslations("LandingV3.Hero");

  return (
    <section className="relative overflow-hidden bg-white px-6 dark:bg-zinc-950">
      <div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center opacity-30 dark:opacity-20">
        <div className="absolute h-[600px] w-[600px] rounded-full bg-orange-500/20 blur-[100px]" />
        <div className="absolute right-[-20%] top-[-10%] h-[400px] w-[400px] rounded-full bg-amber-400/20 blur-[100px]" />
      </div>

      <LazyMotion features={domAnimation}>
        <div className="mx-auto max-w-5xl text-center">
          <m.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-6 flex justify-center"
          >
            <span className="flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-sm font-semibold text-orange-700 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-300">
              <Sparkles className="h-4 w-4" />
              {t("badge")}
            </span>
          </m.div>

          <m.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-8 text-5xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 md:text-7xl lg:text-8xl"
          >
            {t("headline1")} <br />
            <span className="bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">
              {t("headlineHighlight")}
            </span>
          </m.h1>

          <m.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mx-auto mb-10 max-w-2xl text-lg font-medium leading-relaxed text-zinc-600 dark:text-zinc-300 md:text-xl"
          >
            {t("subtitle")}
          </m.p>

          <m.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <Button
              asChild
              size="lg"
              className="h-14 rounded-2xl bg-orange-600 px-8 text-lg font-bold text-white shadow-xl shadow-orange-600/20 transition-all hover:bg-orange-700 active:scale-95 dark:hover:bg-orange-500"
            >
              <a href="/signup?plan=free">{t("ctaFree")}</a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="group h-14 rounded-2xl border-zinc-200 px-8 text-lg font-bold text-zinc-900 transition-all hover:bg-zinc-50 active:scale-95 dark:border-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              <a href="/signup?plan=pro&trial=15">
                {t("ctaPro")}
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </a>
            </Button>
          </m.div>

          <m.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5 }}
            className="mt-20 relative mx-auto max-w-5xl"
          >
            <div className="rounded-t-3xl border-x border-t border-zinc-200/50 bg-white/50 p-2 shadow-2xl backdrop-blur-xl dark:border-zinc-800/50 dark:bg-zinc-900/50">
              <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex h-12 items-center gap-2 border-b border-zinc-100 bg-zinc-50/50 px-4 dark:border-zinc-800/50 dark:bg-zinc-900/50">
                  <div className="flex gap-1.5">
                    <div className="h-3 w-3 rounded-full bg-red-400" />
                    <div className="h-3 w-3 rounded-full bg-amber-400" />
                    <div className="h-3 w-3 rounded-full bg-green-400" />
                  </div>
                </div>
                <div className="aspect-[16/9] w-full bg-zinc-100/50 p-8 dark:bg-zinc-900/50">
                  <div className="h-full w-full rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center">
                    <p className="text-sm font-medium text-zinc-400 dark:text-zinc-500">{t("dashboardPreview")}</p>
                  </div>
                </div>
              </div>
            </div>
          </m.div>
        </div>
      </LazyMotion>
    </section>
  );
}
