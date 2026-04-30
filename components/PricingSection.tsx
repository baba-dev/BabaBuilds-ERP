"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, LazyMotion, domAnimation, m, useReducedMotion } from "framer-motion";
import { Check, Gift, Sparkles, Tag, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  SegmentedControl,
  segmentedControlContainerClass,
  segmentedControlItemActiveClass,
  segmentedControlItemClass,
} from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import { type BillingCycle, formatPlanPrice, getPlanPrice, getPricingRegionFromLocale, type PlanId, type PricingRegion } from "@/lib/pricing";

type TierId = "tier-free" | "tier-pro" | "tier-team";

type PricingTier = {
  id: TierId;
  planId?: PlanId;
  isOneTime?: boolean;
  featured: boolean;
  icon: typeof Gift;
};

const pricingRegions: Array<{ code: PricingRegion; label: string }> = [
  { code: "US", label: "USD" },
  { code: "IN", label: "INR" },
  { code: "EU", label: "EUR" },
  { code: "OM", label: "OMR" },
  { code: "ROW", label: "USD (ROW)" },
];

const tiers: PricingTier[] = [
  {
    id: "tier-free",
    featured: false,
    icon: Gift,
  },
  {
    id: "tier-pro",
    planId: "pro",
    featured: true,
    icon: Sparkles,
  },
  {
    id: "tier-team",
    planId: "team",
    featured: false,
    icon: Users,
  },
];

export default function PricingSection() {
  const tp = useTranslations("Landing.pricingSection");
  const locale = useLocale();
  const defaultRegion = getPricingRegionFromLocale(locale) ?? "ROW";
  const [pricingRegion, setPricingRegion] = useState<PricingRegion>(defaultRegion);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annually">("monthly");
  const reduceMotion = useReducedMotion();
  const normalizedCycle: BillingCycle = billingCycle === "annually" ? "annual" : "monthly";

  const planSignals = useMemo(
    () => [
      { label: tp("signals.setupLabel"), value: tp("signals.setupValue") },
      { label: tp("signals.remindersLabel"), value: tp("signals.remindersValue") },
      { label: tp("signals.reconLabel"), value: tp("signals.reconValue") },
    ],
    [tp],
  );

  const perPeriod =
    billingCycle === "monthly" ? tp("perMonth") : tp("perYear");

  const cycleParam = billingCycle === "annually" ? "annual" : "monthly";

  return (
    <section id="pricing" className="bg-white py-24 dark:bg-zinc-950">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-16 space-y-6 text-center">
          <p className="inline-flex items-center justify-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-orange-700 dark:text-orange-300">
            <Tag className="h-4 w-4 shrink-0" aria-hidden />
            {tp("eyebrow")}
          </p>
          <h2 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 md:text-5xl">
            {tp("title")}
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-zinc-600 dark:text-zinc-300">{tp("subtitle")}</p>
          <p className="mx-auto max-w-3xl text-sm font-medium text-zinc-500 dark:text-zinc-400">{tp("gatewayNote")}</p>

          <div className="flex w-full flex-col items-center justify-center gap-4 py-4 md:flex-row md:gap-8">
            <SegmentedControl
              className="md:w-auto"
              value={billingCycle}
              onValueChange={setBillingCycle}
              options={[
                { value: "monthly", label: tp("billing.monthly") },
                {
                  value: "annually",
                  label: (
                    <span className="flex items-center gap-2">
                      {tp("billing.annually")}
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] uppercase tracking-tighter text-emerald-600 dark:text-emerald-400">
                        {tp("billing.bestValue")}
                      </span>
                    </span>
                  ),
                },
              ]}
              itemClassName="min-w-[8.25rem] grow-0 basis-auto px-6"
            />

            <div className={cn(segmentedControlContainerClass, "w-full max-w-full flex-nowrap overflow-x-auto md:w-auto")}>
              {pricingRegions.map((region) => (
                <Button
                  key={region.code}
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={region.label}
                  aria-pressed={pricingRegion === region.code}
                  onClick={() => setPricingRegion(region.code)}
                  className={cn(
                    "h-auto shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-100 dark:focus-visible:ring-offset-zinc-900",
                    segmentedControlItemClass,
                    pricingRegion === region.code && segmentedControlItemActiveClass,
                  )}
                >
                  {region.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-10 grid gap-4 md:grid-cols-3">
          {planSignals.map((signal) => (
            <div key={signal.label} className="rounded-2xl border border-zinc-200 bg-zinc-50 px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">{signal.label}</p>
              <p className="mt-2 text-lg font-black text-zinc-900 dark:text-zinc-100">{signal.value}</p>
            </div>
          ))}
        </div>

        <LazyMotion features={domAnimation}>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {tiers.map((tier, idx) => {
              const Icon = tier.icon;
              const resolvedPrice = tier.planId
                ? getPlanPrice({ planId: tier.planId, billingCycle: normalizedCycle, region: pricingRegion })
                : null;
              const price = resolvedPrice ? formatPlanPrice(resolvedPrice) : "0";
              const priceKey = `${tier.id}-${pricingRegion}-${billingCycle}`;
              const tierKey = tier.id === "tier-free" ? "free" : tier.id === "tier-pro" ? "pro" : "team";
              const featureList = tp.raw(`tiers.${tierKey}.features`) as string[];
              const description = tp(`tiers.${tierKey}.description`);
              const cta = tp(`tiers.${tierKey}.cta`);
              const cue = tp(`tiers.${tierKey}.cue`);
              const planFitDetail = tp(`tiers.${tierKey}.planFitDetail`);
              const name = tp(`tiers.${tierKey}.name`);

              return (
                <m.div
                  key={tier.id}
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.08, duration: 0.35 }}
                  className={cn(
                    "relative flex flex-col rounded-3xl border p-8 transition-all",
                    tier.featured
                      ? "z-10 scale-[1.02] border-orange-600 bg-zinc-900 shadow-2xl shadow-orange-500/10 dark:bg-zinc-950"
                      : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900",
                  )}
                >
                  {tier.featured && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-orange-600 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-white shadow-lg">
                      {tp("badgeHighestValue")}
                    </div>
                  )}

                  <div className="mb-8 space-y-4">
                    <div
                      className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-2xl",
                        tier.featured ? "bg-orange-600 text-white" : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50",
                      )}
                    >
                      <Icon className="h-6 w-6" aria-hidden />
                    </div>
                    <h3 className={cn("text-2xl font-black", tier.featured ? "text-white" : "text-zinc-900 dark:text-zinc-50")}>
                      {name}
                    </h3>
                    <div className="flex items-baseline gap-1" aria-live="polite">
                      <AnimatePresence mode="wait" initial={false}>
                        <m.span
                          key={priceKey}
                          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                          transition={{ duration: reduceMotion ? 0 : 0.22 }}
                          className={cn("text-4xl font-black tracking-tight", tier.featured ? "text-white" : "text-zinc-900 dark:text-zinc-50")}
                        >
                          {price}
                        </m.span>
                      </AnimatePresence>
                      {Boolean(tier.planId) && (
                        <span className={cn("text-sm font-medium", tier.featured ? "text-zinc-300" : "text-zinc-500 dark:text-zinc-400")}>
                          {"isOneTime" in tier && tier.isOneTime
                            ? `/ ${tp("perOneTime")}`
                            : `/ ${perPeriod}`}
                        </span>
                      )}
                    </div>
                    <p className={cn("text-sm leading-relaxed", tier.featured ? "text-zinc-300" : "text-zinc-600 dark:text-zinc-300")}>
                      {description}
                    </p>
                  </div>

                  <div className="mb-6 space-y-2">
                    <p className={cn("text-xs font-bold uppercase tracking-widest", tier.featured ? "text-orange-300" : "text-zinc-500 dark:text-zinc-400")}>
                      {tp("planFitHeading")}
                    </p>
                    <p className={cn("text-sm", tier.featured ? "text-zinc-100" : "text-zinc-700 dark:text-zinc-300")}>{cue}</p>
                    <div className="rounded-xl border border-zinc-200/90 bg-zinc-100/80 px-3 py-2 text-xs font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {planFitDetail}
                    </div>
                  </div>

                  <div className="mb-8 flex-1 space-y-4">
                    <p className={cn("text-xs font-bold uppercase tracking-widest", tier.featured ? "text-orange-300" : "text-zinc-400")}>
                      {tp("includedHeading")}
                    </p>
                    <ul className="space-y-3">
                      {featureList.map((feature) => (
                        <li key={feature} className="flex items-start gap-3 text-sm">
                          <Check className={cn("mt-0.5 h-4 w-4 shrink-0", tier.featured ? "text-orange-400" : "text-emerald-500")} aria-hidden />
                          <span className={tier.featured ? "text-zinc-200" : "text-zinc-700 dark:text-zinc-300"}>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Button
                    asChild
                    size="lg"
                    className={cn(
                      "w-full rounded-2xl py-6 font-bold transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900",
                      tier.featured
                        ? "bg-orange-600 text-white shadow-xl shadow-orange-600/20 hover:bg-orange-700"
                        : "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200",
                    )}
                  >
                    <a
                      href={
                        tier.planId
                          ? `/signup?plan=${tier.planId}&cycle=${cycleParam}&trial=15&source=pricing`
                          : `/signup?plan=pro&cycle=monthly&trial=15&source=pricing_free`
                      }
                    >
                      {cta}
                    </a>
                  </Button>
                </m.div>
              );
            })}
          </div>
        </LazyMotion>

        <div className="mt-16 flex flex-col items-center gap-6">
          <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <Check className="h-5 w-5 text-emerald-500" aria-hidden />
            <div className="text-start">
              <p className="mb-1 text-xs font-bold uppercase leading-none tracking-widest text-zinc-500 dark:text-zinc-400">{tp("msmeLabel")}</p>
              <p className="text-sm font-black text-zinc-900 dark:text-zinc-100">{tp("udyamId")}</p>
            </div>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {tp("footerQuestion")}{" "}
            <a
              href="mailto:admin@bababuilds.com"
              className="rounded-sm font-bold text-orange-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950"
            >
              {tp("emailUs")}
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
