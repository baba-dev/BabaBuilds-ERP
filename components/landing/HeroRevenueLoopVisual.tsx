"use client";

import { LazyMotion, domAnimation, m, useReducedMotion } from "framer-motion";
import { ArrowRight, FileSignature, Landmark, Receipt, Send } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const steps = [
  { icon: FileSignature, key: "step1" as const },
  { icon: Send, key: "step2" as const },
  { icon: Receipt, key: "step3" as const },
  { icon: Landmark, key: "step4" as const },
];

export default function HeroRevenueLoopVisual() {
  const t = useTranslations("Landing.heroLoop");
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative">
      <div className="pointer-events-none absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-orange-500/15 via-amber-500/10 to-transparent blur-2xl dark:from-orange-500/10" />
      <LazyMotion features={domAnimation}>
        <m.div
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-[1.75rem] border border-orange-200/60 bg-white/90 p-6 shadow-xl shadow-orange-500/10 backdrop-blur-xl dark:border-orange-900/40 dark:bg-zinc-950/80"
        >
          <div className="mb-5 flex items-center justify-between gap-2">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-orange-700 dark:text-orange-300">
              {t("label")}
            </p>
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              {t("live")}
            </span>
          </div>

          <div className="space-y-3">
            {steps.map((step, idx) => (
              <m.div
                key={step.key}
                initial={reduceMotion ? false : { opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: reduceMotion ? 0 : 0.12 + idx * 0.07, duration: 0.35 }}
                className="flex items-center gap-3"
              >
                <m.div
                  animate={
                    reduceMotion
                      ? undefined
                      : {
                          y: [0, -3, 0],
                        }
                  }
                  transition={{
                    duration: 4 + idx * 0.4,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: idx * 0.3,
                  }}
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-orange-200/80 bg-gradient-to-br from-orange-50 to-amber-50 text-orange-700 dark:border-orange-800/50 dark:from-orange-950/60 dark:to-amber-950/40 dark:text-orange-300",
                  )}
                >
                  <step.icon className="h-5 w-5" strokeWidth={2.25} />
                </m.div>
                <div className="min-w-0 flex-1 rounded-xl border border-zinc-200/80 bg-zinc-50/90 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/80">
                  <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50">{t(`steps.${step.key}.title`)}</p>
                  <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t(`steps.${step.key}.body`)}</p>
                </div>
              </m.div>
            ))}
          </div>

          <m.div
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reduceMotion ? 0 : 0.55 }}
            className="mt-5 flex justify-end border-t border-zinc-200/80 pt-4 dark:border-zinc-800"
          >
            <Link
              href="#demo-launcher"
              title={t("seeDemo")}
              className="group inline-flex items-center gap-2 text-sm font-black text-orange-700 transition hover:text-orange-600 dark:text-orange-300 dark:hover:text-orange-200"
            >
              {t("seeDemo")}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </m.div>
        </m.div>
      </LazyMotion>
    </div>
  );
}
