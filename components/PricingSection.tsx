"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Info, Box, Gift, Sparkles, ShieldCheck } from "lucide-react";
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
    icon: Gift
  },
  {
    name: "Professional",
    id: "tier-pro",
    href: "/api/auth/signin",
    priceMonthly: 2.5, // Approx $2.5 for $1 = 80 INR
    priceINR: 200,
    description: "Unleash the full power of automated bookkeeping and AI insights.",
    features: ["Unlimited Invoices", "3 Workspaces", "AI BabaBot Insights", "Premium Proposal Workflows", "Retainer Automation", "E-Signature integration", "Stripe/Razorpay Gateway"],
    featured: true,
    cta: "Go Pro",
    icon: Sparkles
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
    icon: ShieldCheck
  },
];

export default function PricingSection() {
  const [currency, setCurrency] = useState<Currency>(currencies[0]);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annually">("monthly");

  const formatPrice = (tier: typeof tiers[0]) => {
    if (tier.priceMonthly === 0) return "0";
    
    // Special handling for Pro INR
    if (tier.name === "Professional" && currency.code === "INR") {
      const base = (tier as any).priceINR || 200;
      const final = billingCycle === "annually" ? base * 10 : base; // 10x for annual (2 months free)
      return final.toLocaleString();
    }

    // Special handling for Enterprise (One-time USD fixed)
    if (tier.name === "Enterprise") {
      const base = 2000;
      const converted = currency.code === "USD" ? base : base * currency.rate;
      return Math.floor(converted).toLocaleString();
    }

    const convertedPrice = tier.priceMonthly * currency.rate;
    const finalPrice = billingCycle === "annually" ? convertedPrice * 10 : convertedPrice; // 10x for annual (2 months free)
    return Math.floor(finalPrice).toLocaleString();
  };

  return (
    <section id="pricing" className="py-24 bg-white dark:bg-zinc-950">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center space-y-6 mb-16">
          <h2 className="text-3xl md:text-5xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
            Simple, <span className="text-indigo-600">Growth-Ready</span> Pricing
          </h2>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
            Choose the plan that fits your current operational scale. No hidden fees, just pure productivity.
          </p>

          {/* Controls Container */}
          <div className="flex flex-col md:flex-row items-center justify-center gap-8 py-4">
            {/* Billing Toggle */}
            <div className="flex items-center gap-4 bg-zinc-100 dark:bg-zinc-900 p-1.5 rounded-2xl border border-zinc-200 dark:border-zinc-800">
              <button
                onClick={() => setBillingCycle("monthly")}
                className={cn(
                  "px-6 py-2 rounded-xl text-sm font-bold transition-all",
                  billingCycle === "monthly" ? "bg-white dark:bg-zinc-800 shadow-sm text-indigo-600" : "text-zinc-500 hover:text-zinc-900"
                )}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle("annually")}
                className={cn(
                  "px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                  billingCycle === "annually" ? "bg-white dark:bg-zinc-800 shadow-sm text-indigo-600" : "text-zinc-500 hover:text-zinc-900"
                )}
              >
                Annually
                <span className="bg-emerald-500/10 text-emerald-600 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-tighter">Best Value</span>
              </button>
            </div>

            {/* Currency Switcher */}
            <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-900 p-1.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-x-auto max-w-full">
              {currencies.map((c) => (
                <button
                  key={c.code}
                  onClick={() => setCurrency(c)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-sm font-bold transition-all shrink-0",
                    currency.code === c.code ? "bg-white dark:bg-zinc-800 shadow-sm text-indigo-600" : "text-zinc-500 hover:text-zinc-900"
                  )}
                >
                  {c.code} {c.symbol}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {tiers.map((tier, idx) => {
            const Icon = tier.icon;
            return (
              <motion.div
                key={tier.name}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className={cn(
                  "relative p-8 rounded-3xl border transition-all flex flex-col",
                  tier.featured
                    ? "bg-zinc-900 dark:bg-zinc-950 border-indigo-600 shadow-2xl shadow-indigo-500/10 scale-105 z-10"
                    : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
                )}
              >
                {tier.featured && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-xs font-black px-4 py-1.5 rounded-full uppercase tracking-widest shadow-lg">
                    Highest Value
                  </div>
                )}
                
                <div className="space-y-4 mb-8">
                  <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", tier.featured ? "bg-indigo-600 text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50")}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className={cn("text-2xl font-black", tier.featured ? "text-white" : "text-zinc-900 dark:text-zinc-50")}>
                    {tier.name}
                  </h3>
                  <div className="flex items-baseline gap-1">
                    <span className={cn("text-4xl font-black tracking-tight", tier.featured ? "text-white" : "text-zinc-900 dark:text-zinc-50")}>
                      {currency.symbol}{formatPrice(tier)}
                    </span>
                    {tier.priceMonthly > 0 && (
                      <span className={cn("text-sm font-medium", tier.featured ? "text-zinc-400" : "text-zinc-500")}>
                        {(tier as any).isOneTime ? "/ one-time" : `/ per ${billingCycle === "monthly" ? "month" : "year"}`}
                      </span>
                    )}
                  </div>
                  <p className={cn("text-sm leading-relaxed", tier.featured ? "text-zinc-400" : "text-zinc-500")}>
                    {tier.description}
                  </p>
                </div>

                <div className="space-y-4 mb-8 flex-1">
                  <p className={cn("text-xs font-bold uppercase tracking-widest", tier.featured ? "text-indigo-400" : "text-zinc-400")}>What's Included</p>
                  <ul className="space-y-3">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3 text-sm">
                        <Check className={cn("w-4 h-4 mt-0.5 shrink-0", tier.featured ? "text-indigo-500" : "text-emerald-500")} />
                        <span className={tier.featured ? "text-zinc-300" : "text-zinc-600 dark:text-zinc-400"}>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Button
                  asChild
                  size="lg"
                  className={cn(
                    "w-full rounded-2xl font-bold py-6 transition-all active:scale-95",
                    tier.featured
                      ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl shadow-indigo-600/20"
                      : "bg-zinc-900 dark:bg-zinc-50 dark:text-zinc-950 text-white hover:bg-zinc-800 dark:hover:bg-zinc-200"
                  )}
                >
                  <a href={tier.href}>{tier.cta}</a>
                </Button>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-16 flex flex-col items-center gap-6">
            <div className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
              <div className="text-left">
                <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest leading-none mb-1">Official MSME Registered</p>
                <p className="text-sm font-black text-zinc-900 dark:text-zinc-100">UDYAM-RJ-21-0089275</p>
              </div>
            </div>
            <p className="text-zinc-500 text-sm">
               Need a custom solution for your enterprise? <a href="mailto:admin@bababuilds.com" className="text-indigo-600 font-bold hover:underline">Speak with an expert</a>
            </p>
        </div>
      </div>
    </section>
  );
}
