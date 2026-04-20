"use client";

import { motion, useReducedMotion } from "framer-motion";
import { BriefcaseBusiness, Building2, Calculator, ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { DemoLaunchButton } from "@/components/landing/persona/DemoLaunchButton";

export default function RoleDemoLauncher() {
  const tp1 = useTranslations("LandingPhase1");
  const reduceMotion = useReducedMotion();
  const roleCards = [
    {
      title: tp1("roleLauncher.cards.ca.title"),
      description: tp1("roleLauncher.cards.ca.description"),
      templateKey: "tax_agency" as const,
      icon: Calculator,
    },
    {
      title: tp1("roleLauncher.cards.agency.title"),
      description: tp1("roleLauncher.cards.agency.description"),
      templateKey: "dm_agency" as const,
      icon: BriefcaseBusiness,
    },
    {
      title: tp1("roleLauncher.cards.contractor.title"),
      description: tp1("roleLauncher.cards.contractor.description"),
      templateKey: "contractor_builder" as const,
      icon: Building2,
    },
  ];

  return (
    <section className="border-y border-border bg-zinc-50/70 py-16 dark:bg-zinc-950/40">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.4 }}
          className="mb-8 max-w-3xl space-y-3"
        >
          <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700 dark:text-orange-300">
            {tp1("roleLauncher.badge")}
          </p>
          <h2 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 md:text-4xl">
            {tp1("roleLauncher.title")}
          </h2>
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
            {tp1("roleLauncher.description")}
          </p>
        </motion.div>

        <div className="grid gap-5 md:grid-cols-3">
          {roleCards.map((card, idx) => (
            <motion.article
              key={card.title}
              initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.35, delay: reduceMotion ? 0 : idx * 0.06 }}
              className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/70"
            >
              <div className="mb-4 inline-flex rounded-xl bg-orange-50 p-2.5 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300">
                <card.icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-50">{card.title}</h3>
              <p className="mt-2 min-h-16 text-sm text-zinc-600 dark:text-zinc-300">{card.description}</p>
              <DemoLaunchButton
                templateKey={card.templateKey}
                label={card.title}
                analyticsContext="homepage_role_demo"
                className="mt-4 h-11 w-full justify-center rounded-xl border-orange-300 font-bold text-orange-700 hover:bg-orange-50 hover:text-orange-800 dark:border-orange-800/60 dark:text-orange-300 dark:hover:bg-orange-950/30"
              />
            </motion.article>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-orange-200/80 bg-orange-50/90 px-4 py-3 text-sm font-medium text-zinc-700 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-zinc-200">
          <span className="font-black text-orange-700 dark:text-orange-300">{tp1("roleLauncher.footerPrefix")}</span>{" "}
          {tp1("roleLauncher.footerTextPart1")}{" "}
          <span className="font-bold">&quot;{tp1("roleLauncher.footerQuotedCta")}&quot;</span>{" "}
          {tp1("roleLauncher.footerTextPart2")}
          <ArrowRight className="ml-1 inline h-4 w-4 text-orange-500" />
        </div>
      </div>
    </section>
  );
}
