"use client";

import { useState } from "react";
import { AnimatePresence, LazyMotion, domAnimation, m, useReducedMotion } from "framer-motion";
import { Check, Gift, Sparkles, Tag, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  SegmentedControl,
  segmentedControlContainerClass,
  segmentedControlItemActiveClass,
  segmentedControlItemClass,
} from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import { PRICING } from "@/lib/pricing";

type Currency = {
  code: string;
  symbol: string;
  rate: number;
  decimals?: number;
};

type PricingTier = {
  name: string;
  id: string;
  href: string;
  priceMonthly: number;
  priceINR?: number;
  isOneTime?: boolean;
  description: string;
  features: string[];
  featured: boolean;
  cta: string;
  icon: typeof Gift;
  cue: string;
};

const currencies: Currency[] = [
  { code: "USD", symbol: "$", rate: 1, decimals: 2 },
  { code: "INR", symbol: "₹", rate: 80, decimals: 0 },
  { code: "EUR", symbol: "€", rate: 0.92, decimals: 0 },
  { code: "OMR", symbol: "OMR ", rate: 0.385, decimals: 3 },
];

const tiers: PricingTier[] = [
  {
    name: "Free",
    id: "tier-free",
    href: "/api/auth/signin",
    priceMonthly: 0,
    description: "Explore the full ERP with sensible limits — one workspace per account.",
    features: [
      "5 invoices per calendar month (UTC)",
      "Up to 3 clients",
      "Up to 3 published shop listings",
      "Core CRM, proposals, income & expenses",
      "Multi-currency support",
    ],
    featured: false,
    cta: "Start Free",
    icon: Gift,
    cue: "Validate your workflow before you scale",
  },
  {
    name: "Pro",
    id: "tier-pro",
    href: "/api/auth/signin",
    priceMonthly: 2.5,
    priceINR: 200,
    description: "Solo operators: unlimited invoices, gateways, and automation.",
    features: [
      "Unlimited invoices",
      "Stripe & Razorpay on invoices",
      "AI BabaBot & premium workflows",
      "Retainer automation",
      "Up to 3 seats",
      "20 MB document storage",
    ],
    featured: true,
    cta: "Go Pro",
    icon: Sparkles,
    cue: "Best for freelancers who bill every month",
  },
  {
    name: "Team",
    id: "tier-team",
    href: "/api/auth/signin",
    priceMonthly: 5,
    priceINR: 400,
    description: "Collaborate with staff and accountants in the same workspace.",
    features: [
      "Everything in Pro",
      "Up to 15 seats",
      "Role-based access & accountant workflows",
      "50 MB document storage",
      "Priority scaling for agencies",
    ],
    featured: false,
    cta: "Start with Team",
    icon: Users,
    cue: "Best for agencies with multiple operators",
  },
];

export default function PricingSection() {
  const tp = useTranslations("Landing.pricingSection");
  const [currency, setCurrency] = useState<Currency>(currencies[0]);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annually">("monthly");
  const reduceMotion = useReducedMotion();

  const formatPrice = (tier: (typeof tiers)[number]) => {
    if (tier.priceMonthly === 0) return "0";

    if (tier.name === "Pro" && currency.code === "INR") {
      const final = billingCycle === "annually" ? PRICING.YEARLY : PRICING.MONTHLY;
      return final.toLocaleString();
    }

    if (tier.name === "Team" && currency.code === "INR") {
      const final = billingCycle === "annually" ? PRICING.TEAM_YEARLY : PRICING.TEAM_MONTHLY;
      return final.toLocaleString();
    }

    const convertedPrice = tier.priceMonthly * currency.rate;
    const finalPrice = billingCycle === "annually" ? convertedPrice * 10 : convertedPrice;
    const decimals = currency.decimals ?? 0;
    return finalPrice.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const planSignals = [
    { label: "Average setup time", value: "<15 min" },
    { label: "Automated reminders", value: "Included" },
    { label: "Invoice reconciliation", value: "Real-time" },
  ];

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
          <p className="mx-auto max-w-3xl text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Payment links use regional gateway routing: Razorpay for India (INR) and Stripe for global collection, including Oman and GCC currencies.
          </p>

          <div className="flex w-full flex-col items-center justify-center gap-4 py-4 md:flex-row md:gap-8">
            <SegmentedControl
              className="md:w-auto"
              value={billingCycle}
              onValueChange={setBillingCycle}
              options={[
                { value: "monthly", label: "Monthly" },
                {
                  value: "annually",
                  label: (
                    <span className="flex items-center gap-2">
                      Annually
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] uppercase tracking-tighter text-emerald-600 dark:text-emerald-400">
                        Best Value
                      </span>
                    </span>
                  ),
                },
              ]}
              itemClassName="min-w-[8.25rem] grow-0 basis-auto px-6"
            />

            <div className={cn(segmentedControlContainerClass, "w-full max-w-full flex-nowrap overflow-x-auto md:w-auto")}>
              {currencies.map((c) => (
                <Button
                  key={c.code}
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-pressed={currency.code === c.code}
                  onClick={() => setCurrency(c)}
                  className={cn(
                    "h-auto shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-100 dark:focus-visible:ring-offset-zinc-900",
                    segmentedControlItemClass,
                    currency.code === c.code && segmentedControlItemActiveClass,
                  )}
                >
                  {c.symbol}
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
              const price = `${currency.symbol}${formatPrice(tier)}`;
              const priceKey = `${tier.name}-${currency.code}-${billingCycle}`;
              return (
                <m.div
                  key={tier.name}
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
                    Highest Value
                  </div>
                )}

                <div className="mb-8 space-y-4">
                  <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl", tier.featured ? "bg-orange-600 text-white" : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50")}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className={cn("text-2xl font-black", tier.featured ? "text-white" : "text-zinc-900 dark:text-zinc-50")}>{tier.name}</h3>
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
                    {tier.priceMonthly > 0 && (
                      <span className={cn("text-sm font-medium", tier.featured ? "text-zinc-300" : "text-zinc-500 dark:text-zinc-400")}>
                        {"isOneTime" in tier && tier.isOneTime ? "/ one-time" : `/ per ${billingCycle === "monthly" ? "month" : "year"}`}
                      </span>
                    )}
                  </div>
                  <p className={cn("text-sm leading-relaxed", tier.featured ? "text-zinc-300" : "text-zinc-600 dark:text-zinc-300")}>{tier.description}</p>
                </div>

                <div className="mb-6 space-y-2">
                  <p className={cn("text-xs font-bold uppercase tracking-widest", tier.featured ? "text-orange-300" : "text-zinc-500 dark:text-zinc-400")}>Plan fit</p>
                  <p className={cn("text-sm", tier.featured ? "text-zinc-100" : "text-zinc-700 dark:text-zinc-300")}>{tier.cue}</p>
                  <div className="rounded-xl border border-zinc-200/90 bg-zinc-100/80 px-3 py-2 text-xs font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    {tier.featured ? "Optimized for scaling agencies" : "Best for focused teams with predictable growth"}
                  </div>
                </div>

                <div className="mb-8 flex-1 space-y-4">
                  <p className={cn("text-xs font-bold uppercase tracking-widest", tier.featured ? "text-orange-300" : "text-zinc-400")}>What&apos;s Included</p>
                  <ul className="space-y-3">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3 text-sm">
                        <Check className={cn("mt-0.5 h-4 w-4 shrink-0", tier.featured ? "text-orange-400" : "text-emerald-500")} />
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
                  <a href={tier.href}>{tier.cta}</a>
                </Button>
                </m.div>
              );
            })}
          </div>
        </LazyMotion>

        <div className="mt-16 flex flex-col items-center gap-6">
          <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <Check className="h-5 w-5 text-emerald-500" />
            <div className="text-left">
              <p className="mb-1 text-xs font-bold uppercase leading-none tracking-widest text-zinc-500 dark:text-zinc-400">Official MSME Registered</p>
              <p className="text-sm font-black text-zinc-900 dark:text-zinc-100">UDYAM-RJ-21-0089275</p>
            </div>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Questions about Pro or Team?{" "}
            <a href="mailto:admin@bababuilds.com" className="rounded-sm font-bold text-orange-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950">
              Email us
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
