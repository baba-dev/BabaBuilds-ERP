"use client";

import { LazyMotion, domAnimation, m, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  Calculator,
  Handshake,
  Store,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const personaCards = [
  { href: "/for-ca", titleKey: "caTitle", descKey: "caDesc", icon: Calculator },
  { href: "/for-agencies", titleKey: "agencyTitle", descKey: "agencyDesc", icon: BriefcaseBusiness },
  { href: "/for-contractors", titleKey: "contractorTitle", descKey: "contractorDesc", icon: Building2 },
  { href: "/for-small-businesses", titleKey: "smbTitle", descKey: "smbDesc", icon: Store },
  { href: "/for-freelancers", titleKey: "freelanceTitle", descKey: "freelanceDesc", icon: Handshake },
] as const;

export default function LandingPersonaHub() {
  const t = useTranslations("Landing.personaHub");
  const tc = useTranslations("Landing.personaCards");
  const reduceMotion = useReducedMotion();

  return (
    <section className="border-t border-border/80 bg-gradient-to-b from-surface-base to-orange-50/30 py-20 dark:to-orange-950/10">
      <div className="mx-auto max-w-7xl px-6">
        <m.div
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.4 }}
          className="mb-10 flex flex-col gap-3 md:flex-row md:items-end md:justify-between"
        >
          <div className="max-w-2xl space-y-2">
            <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-orange-700 dark:text-orange-300">
              <Users className="h-4 w-4" />
              {t("eyebrow")}
            </p>
            <h2 className="text-3xl font-black tracking-tight text-foreground md:text-4xl">{t("title")}</h2>
            <p className="text-base font-medium text-muted-body">{t("subtitle")}</p>
          </div>
        </m.div>

        <LazyMotion features={domAnimation}>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {personaCards.map((persona, idx) => (
              <m.div
                key={persona.href}
                initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.32, delay: reduceMotion ? 0 : idx * 0.05 }}
              >
                <Link href={persona.href} className="group block h-full">
                  <Card
                    className={cn(
                      "h-full border-border/90 bg-surface-elevated transition-all duration-300",
                      "hover:-translate-y-1 hover:border-orange-400/40 hover:shadow-xl dark:hover:border-orange-700/35",
                    )}
                  >
                    <CardHeader className="space-y-3">
                      <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-orange-300/40 bg-orange-50 text-orange-700 dark:border-orange-700/40 dark:bg-orange-950/50 dark:text-orange-300">
                        <persona.icon className="h-5 w-5" strokeWidth={2.25} />
                      </div>
                      <CardTitle className="text-lg font-black tracking-tight text-foreground">
                        {tc(persona.titleKey)}
                      </CardTitle>
                      <CardDescription className="text-sm leading-relaxed text-muted-body">
                        {tc(persona.descKey)}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <span className="inline-flex items-center gap-1 text-sm font-bold text-orange-700 transition group-hover:translate-x-0.5 dark:text-orange-300">
                        {t("visit")} <ArrowRight className="h-4 w-4" />
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              </m.div>
            ))}
          </div>
        </LazyMotion>
      </div>
    </section>
  );
}
