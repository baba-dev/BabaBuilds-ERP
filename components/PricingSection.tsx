"use client";

import { useState } from "react";
import { AnimatePresence, LazyMotion, domAnimation, m, useReducedMotion } from "framer-motion";
import { Check, Gift, Sparkles, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Currency = {
  code: string;
  symbol: string;
  rate: number;
};

const currencies: Currency[] = [
  { code: "USD", symbol: "$", rate: 1 },
  { code: "INR", symbol: "₹", rate: 80 },
  { code: "EUR", symbol: "€", rate: 0.92 },
  { code: "GBP", symbol: "£", rate: 0.79 },
];

const tiers = [
  {
    name: "Starter",
    id: "tier-starter",
    href: "/api/auth/signin",
    priceMonthly: 0,
    description: "Perfect for freelancers and small agencies starting out.",
    features: ["5 Invoices per Month", "1 Workspace", "Standard Proposal Templates", "Client CRM (Basic)", "Multi-Currency support"],
    featured: false,
    cta: "Start Free",
    icon: Gift,
    cue: "Good for validating your workflow",
  },
  {
    name: "Professional",
    id: "tier-pro",
    href: "/api/auth/signin",
    priceMonthly: 2.5,
    priceINR: 200,
    description: "Unleash the full power of automated bookkeeping and AI insights.",
    features: ["Unlimited Invoices", "3 Workspaces", "AI BabaBot Insights", "Premium Proposal Workflows", "Retainer Automation", "E-Signature integration", "Stripe/Razorpay Gateway"],
    featured: true,
    cta: "Go Pro",
    icon: Sparkles,
    cue: "Most teams upgrade here",
  },
  {
    name: "Enterprise",
    id: "tier-enterprise",
    href: "mailto:admin@bababuilds.com",
    priceMonthly: 2000,
    isOneTime: true,
    description: "For agencies and groups managing multiple organizations. $2,000 one-time fee.",
    features: ["Unlimited Invoices", "Unlimited Workspaces", "Custom Domain support", "Priority CA-Portal Support", "Dedicated Success Manager", "SLA & Security Audits"],
    featured: false,
    cta: "Contact Sales",
    icon: ShieldCheck,
    cue: "Tailored onboarding included",
  },
] as const;

export default function PricingSection() {
  const [currency, setCurrency] = useState<Currency>(currencies[0]);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annually">("monthly");
  const reduceMotion = useReducedMotion();

  const formatPrice = (tier: (typeof tiers)[number]) => {
    if (tier.priceMonthly === 0) return "0";

    if (tier.name === "Professional" && currency.code === "INR") {
      const base = tier.priceINR || 200;
      const final = billingCycle === "annually" ? base * 10 : base;
      return final.toLocaleString();
    }

    if (tier.name === "Enterprise") {
      const base = 2000;
      const converted = currency.code === "USD" ? base : base * currency.rate;
      return Math.floor(converted).toLocaleString();
    }

    const convertedPrice = tier.priceMonthly * currency.rate;
    const finalPrice = billingCycle === "annually" ? convertedPrice * 10 : convertedPrice;
    return Math.floor(finalPrice).toLocaleString();
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
          <h2 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 md:text-5xl">
            Simple, <span className="text-indigo-600">Growth-Ready</span> Pricing
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-zinc-600 dark:text-zinc-300">
            Choose the plan that fits your current operational scale. No hidden fees, just pure productivity.
          </p>

          <div className="flex flex-col items-center justify-center gap-8 py-4 md:flex-row">
            <div className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-zinc-100 p-1.5 dark:border-zinc-800 dark:bg-zinc-900">
              <button
                onClick={() => setBillingCycle("monthly")}
                className={cn(
                  "rounded-xl px-6 py-2 text-sm font-bold transition-all",
                  billingCycle === "monthly"
                    ? "bg-white text-indigo-600 shadow-sm dark:bg-zinc-800"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200",
                )}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle("annually")}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-6 py-2 text-sm font-bold transition-all",
                  billingCycle === "annually"
                    ? "bg-white text-indigo-600 shadow-sm dark:bg-zinc-800"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200",
                )}
              >
                Annually
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] uppercase tracking-tighter text-emerald-600 dark:text-emerald-400">
                  Best Value
                </span>
              </button>
            </div>

            <div className="flex max-w-full items-center gap-2 overflow-x-auto rounded-2xl border border-zinc-200 bg-zinc-100 p-1.5 dark:border-zinc-800 dark:bg-zinc-900">
              {currencies.map((c) => (
                <button
                  key={c.code}
                  onClick={() => setCurrency(c)}
                  className={cn(
                    "shrink-0 rounded-xl px-4 py-2 text-sm font-bold transition-all",
                    currency.code === c.code
                      ? "bg-white text-indigo-600 shadow-sm dark:bg-zinc-800"
                      : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200",
                  )}
                >
                  {c.code} {c.symbol}
                </button>
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
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
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
                      ? "z-10 scale-[1.02] border-indigo-600 bg-zinc-900 shadow-2xl shadow-indigo-500/10 dark:bg-zinc-950"
                      : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900",
                  )}
                >
                {tier.featured && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-white shadow-lg">
                    Highest Value
                  </div>
                )}

                <div className="mb-8 space-y-4">
                  <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl", tier.featured ? "bg-indigo-600 text-white" : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50")}>
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
                        {tier.isOneTime ? "/ one-time" : `/ per ${billingCycle === "monthly" ? "month" : "year"}`}
                      </span>
                    )}
                  </div>
                  <p className={cn("text-sm leading-relaxed", tier.featured ? "text-zinc-300" : "text-zinc-600 dark:text-zinc-300")}>{tier.description}</p>
                </div>

                <div className="mb-6 space-y-2">
                  <p className={cn("text-xs font-bold uppercase tracking-widest", tier.featured ? "text-indigo-300" : "text-zinc-500 dark:text-zinc-400")}>Plan fit</p>
                  <p className={cn("text-sm", tier.featured ? "text-zinc-100" : "text-zinc-700 dark:text-zinc-300")}>{tier.cue}</p>
                  <div className="rounded-xl border border-zinc-200/90 bg-zinc-100/80 px-3 py-2 text-xs font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    {tier.featured ? "Optimized for scaling agencies" : "Best for focused teams with predictable growth"}
                  </div>
                </div>

                <div className="mb-8 flex-1 space-y-4">
                  <p className={cn("text-xs font-bold uppercase tracking-widest", tier.featured ? "text-indigo-300" : "text-zinc-400")}>What&apos;s Included</p>
                  <ul className="space-y-3">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3 text-sm">
                        <Check className={cn("mt-0.5 h-4 w-4 shrink-0", tier.featured ? "text-indigo-400" : "text-emerald-500")} />
                        <span className={tier.featured ? "text-zinc-200" : "text-zinc-700 dark:text-zinc-300"}>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Button
                  asChild
                  size="lg"
                  className={cn(
                    "w-full rounded-2xl py-6 font-bold transition-all active:scale-95",
                    tier.featured
                      ? "bg-indigo-600 text-white shadow-xl shadow-indigo-600/20 hover:bg-indigo-700"
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
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
            <div className="text-left">
              <p className="mb-1 text-xs font-bold uppercase leading-none tracking-widest text-zinc-500 dark:text-zinc-400">Official MSME Registered</p>
              <p className="text-sm font-black text-zinc-900 dark:text-zinc-100">UDYAM-RJ-21-0089275</p>
            </div>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Need a custom solution for your enterprise?{" "}
            <a href="mailto:admin@bababuilds.com" className="font-bold text-indigo-600 hover:underline">
              Speak with an expert
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
