"use client";

import { useState } from "react";
import { m, LazyMotion, domAnimation } from "framer-motion";
import { Check, Sparkles, Zap, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SegmentedControl,
  segmentedControlContainerClass,
  segmentedControlItemActiveClass,
  segmentedControlItemClass,
} from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import { getPlanPrice, formatPlanPrice, type PricingRegion, type BillingCycle } from "@/lib/pricing";
import { useTranslations } from "next-intl";

const availableRegions: Array<{ code: PricingRegion; label: string }> = [
  { code: "US", label: "USD" },
  { code: "IN", label: "INR" },
  { code: "OM", label: "OMR" },
];

export default function PricingRealtimeV3() {
  const t = useTranslations("LandingV3.Pricing");
  const [region, setRegion] = useState<PricingRegion>("US");
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");

  const proPrice = getPlanPrice({ planId: "pro", billingCycle, region });
  const teamPrice = getPlanPrice({ planId: "team", billingCycle, region });

  const tiers = [
    {
      id: "free",
      name: t("free.name"),
      icon: Zap,
      price: "0",
      period: "",
      description: t("free.description"),
      features: (t.raw("free.features") as string[]) || [],
      cta: t("free.cta"),
      href: "/signup?plan=free",
      highlighted: false,
    },
    {
      id: "pro",
      name: t("pro.name"),
      icon: Sparkles,
      price: formatPlanPrice(proPrice),
      period: billingCycle === "monthly" ? t("perMo") : t("perYr"),
      description: t("pro.description"),
      features: (t.raw("pro.features") as string[]) || [],
      cta: t("pro.cta"),
      href: `/signup?plan=pro&cycle=${billingCycle}&trial=15`,
      highlighted: true,
    },
    {
      id: "team",
      name: t("team.name"),
      icon: Building2,
      price: formatPlanPrice(teamPrice),
      period: billingCycle === "monthly" ? t("perMo") : t("perYr"),
      description: t("team.description"),
      features: (t.raw("team.features") as string[]) || [],
      cta: t("team.cta"),
      href: `/signup?plan=team&cycle=${billingCycle}&trial=15`,
      highlighted: false,
    },
  ];

  return (
    <section className="bg-white py-24 dark:bg-zinc-950">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-16 space-y-6 text-center">
          <h2 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 md:text-5xl">
            {t("title")}
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-zinc-600 dark:text-zinc-300" dangerouslySetInnerHTML={{ __html: t.raw("subtitle") as string }} />

          <div className="flex w-full flex-col items-center justify-center gap-4 py-4 md:flex-row md:gap-8">
            <SegmentedControl
              className="md:w-auto"
              value={billingCycle}
              onValueChange={(v) => setBillingCycle(v as BillingCycle)}
              options={[
                { value: "monthly", label: t("monthly") },
                {
                  value: "annual",
                  label: (
                    <span className="flex items-center gap-2">
                      {t("annually")}
                      <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] uppercase tracking-tighter text-orange-600 dark:text-orange-400">
                        {t("bestValue")}
                      </span>
                    </span>
                  ),
                },
              ]}
              itemClassName="min-w-[8.25rem] grow-0 basis-auto px-6"
            />

            <div className={cn(segmentedControlContainerClass, "w-full max-w-full flex-nowrap overflow-x-auto md:w-auto")}>
              {availableRegions.map((r) => (
                <Button
                  key={r.code}
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-pressed={region === r.code}
                  onClick={() => setRegion(r.code)}
                  className={cn(
                    "h-auto shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-all",
                    segmentedControlItemClass,
                    region === r.code && segmentedControlItemActiveClass
                  )}
                >
                  {r.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <LazyMotion features={domAnimation}>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {tiers.map((tier, idx) => {
              const Icon = tier.icon;
              return (
                <m.div
                  key={tier.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1, duration: 0.4 }}
                  className={cn(
                    "relative flex flex-col rounded-3xl border p-8 transition-all",
                    tier.highlighted
                      ? "z-10 scale-[1.02] border-orange-500 bg-zinc-900 shadow-2xl shadow-orange-500/20 dark:bg-zinc-900"
                      : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
                  )}
                >
                  {tier.highlighted && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-orange-500 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-white shadow-lg">
                      {t("mostPopular")}
                    </div>
                  )}

                  <div className="mb-8 space-y-4">
                    <div
                      className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-2xl",
                        tier.highlighted ? "bg-orange-500 text-white" : "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400"
                      )}
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className={cn("text-2xl font-black", tier.highlighted ? "text-white" : "text-zinc-900 dark:text-zinc-50")}>
                      {tier.name}
                    </h3>
                    <div className="flex items-baseline gap-1">
                      <span className={cn("text-4xl font-black tracking-tight", tier.highlighted ? "text-white" : "text-zinc-900 dark:text-zinc-50")}>
                        {tier.price}
                      </span>
                      {tier.period && (
                        <span className={cn("text-sm font-medium", tier.highlighted ? "text-zinc-400" : "text-zinc-500 dark:text-zinc-400")}>
                          {tier.period}
                        </span>
                      )}
                    </div>
                    <p className={cn("text-sm", tier.highlighted ? "text-zinc-300" : "text-zinc-600 dark:text-zinc-400")}>
                      {tier.description}
                    </p>
                  </div>

                  <div className="mb-8 flex-1 space-y-4">
                    <ul className="space-y-3">
                      {tier.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-3 text-sm">
                          <Check className={cn("mt-0.5 h-4 w-4 shrink-0", tier.highlighted ? "text-orange-400" : "text-emerald-500")} />
                          <span className={tier.highlighted ? "text-zinc-200" : "text-zinc-700 dark:text-zinc-300"}>
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Button
                    asChild
                    size="lg"
                    className={cn(
                      "w-full rounded-2xl py-6 font-bold transition-all active:scale-95",
                      tier.highlighted
                        ? "bg-orange-500 text-white hover:bg-orange-600 shadow-xl shadow-orange-500/20"
                        : "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                    )}
                  >
                    <a href={tier.href}>{tier.cta}</a>
                  </Button>
                </m.div>
              );
            })}
          </div>
        </LazyMotion>
      </div>
    </section>
  );
}
