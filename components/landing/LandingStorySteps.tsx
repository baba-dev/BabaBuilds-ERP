"use client";

import { LazyMotion, domAnimation, m, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  ChevronDown,
  FileSignature,
  Landmark,
  Receipt,
  Scale,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const icons = [FileSignature, Receipt, Landmark, Scale] as const;

export default function LandingStorySteps() {
  const t = useTranslations("Landing.story");
  const reduceMotion = useReducedMotion();
  const stepKeys = ["s1", "s2", "s3", "s4"] as const;

  return (
    <section className="relative border-y border-border/80 bg-gradient-to-b from-orange-50/40 via-surface-base to-surface-base py-20 dark:from-orange-950/15 dark:via-zinc-950 dark:to-zinc-950">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-400/30 to-transparent dark:via-orange-500/20" />
      <div className="mx-auto max-w-7xl px-6">
        <m.div
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.4 }}
          className="mb-12 max-w-3xl space-y-3"
        >
          <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-orange-700 dark:text-orange-300">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/15 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300">
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
            {t("eyebrow")}
          </p>
          <h2 className="text-3xl font-black tracking-tight text-foreground md:text-4xl lg:text-5xl">{t("title")}</h2>
          <p className="text-lg font-medium leading-relaxed text-muted-body">{t("subtitle")}</p>
        </m.div>

        <LazyMotion features={domAnimation}>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {stepKeys.map((key, idx) => {
              const Icon = icons[idx];
              return (
                <m.div
                  key={key}
                  initial={reduceMotion ? false : { opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.25 }}
                  transition={{ duration: 0.35, delay: reduceMotion ? 0 : idx * 0.07 }}
                  className="group relative"
                >
                  {idx > 0 && (
                    <div
                      className="absolute -left-3 top-10 hidden h-px w-6 bg-gradient-to-r from-orange-300/0 via-orange-400/50 to-orange-400/80 lg:block dark:from-orange-900/0 dark:via-orange-700/40 dark:to-orange-600/60"
                      aria-hidden
                    />
                  )}
                  <div
                    className={cn(
                      "relative h-full rounded-2xl border border-border/90 bg-surface-elevated p-5 shadow-sm transition duration-300",
                      "hover:-translate-y-0.5 hover:border-orange-400/35 hover:shadow-lg dark:hover:border-orange-700/40",
                    )}
                  >
                    <m.div
                      animate={
                        reduceMotion
                          ? undefined
                          : {
                              y: [0, -3, 0],
                            }
                      }
                      transition={{ duration: 5 + idx * 0.5, repeat: Infinity, ease: "easeInOut" }}
                      className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-orange-200/80 bg-gradient-to-br from-orange-50 to-amber-50 text-orange-700 dark:border-orange-800/50 dark:from-orange-950/50 dark:to-amber-950/30 dark:text-orange-300"
                    >
                      <Icon className="h-6 w-6" strokeWidth={2.25} />
                    </m.div>
                    <h3 className="text-lg font-black text-foreground">{t(`steps.${key}.title`)}</h3>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-muted-body">{t(`steps.${key}.body`)}</p>
                  </div>
                  {idx < stepKeys.length - 1 && (
                    <div className="flex justify-center py-3 lg:hidden" aria-hidden>
                      <ChevronDown className="h-5 w-5 text-orange-400/70" />
                    </div>
                  )}
                </m.div>
              );
            })}
          </div>
        </LazyMotion>
      </div>
    </section>
  );
}
