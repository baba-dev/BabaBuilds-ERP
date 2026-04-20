"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check, X, Box, Info, GitCompare } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { emitMarketingAnalyticsEvent } from "@/lib/marketing-analytics";

const features = [
  {
    name: "Zero-Effort Retainers",
    baba: true,
    tally: false,
    quickbooks: "Partial",
    desc: "Auto-appends month names, dates, and dynamic content to recurring invoices without lifting a finger.",
  },
  {
    name: "AI Financial Advisor (BabaBot)",
    baba: true,
    tally: false,
    quickbooks: "Add-on",
    desc: "Natural language queries about your finances. 'How much did I spend on SEO last quarter?'",
  },
  {
    name: "Multi-Region Tax Compliance",
    baba: true,
    tally: "Regional",
    quickbooks: true,
    desc: "Region-aware tax labels (VAT, GST, Sales Tax), configurable rates, and country-pack coverage for selected jurisdictions.",
  },
  {
    name: "Unified Proposal-to-Paid Workflow",
    baba: true,
    tally: false,
    quickbooks: true,
    desc: "Send a proposal, get it signed digitally, and convert to an invoice in 1 click.",
  },
  {
    name: "Self-Healing Bank Reconciliation",
    baba: true,
    tally: "Manual",
    quickbooks: true,
    desc: "AI matching of bank transactions with invoices and expenses.",
  },
  {
    name: "Integrated Service E-Store",
    baba: true,
    tally: false,
    quickbooks: "Add-on",
    desc: "A centralized, public-facing shop for selling services directly.",
  },
  {
    name: "Native Apps & PWA Support",
    baba: true,
    tally: "Partial",
    quickbooks: true,
    desc: "Fully built native applications for Android, iOS & PC.",
  },
  {
    name: "Dedicated CA Audit Portal",
    baba: true,
    tally: "Manual",
    quickbooks: false,
    desc: "1-click evidence exports for Chartered Accountants to perform year-end audits.",
  },
  {
    name: "Role-Based Team Access",
    baba: true,
    tally: "Add-on",
    quickbooks: "Premium",
    desc: "Granular permission controls for your team members and accountants.",
  },
];

export default function ComparisonTable() {
  const t = useTranslations("Landing.comparisonSection");
  const tp1 = useTranslations("LandingPhase1");
  const reduceMotion = useReducedMotion();

  return (
    <section id="comparison" className="bg-zinc-50 py-24 dark:bg-zinc-950/50">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.4 }}
          className="mb-14 space-y-4 text-center"
        >
          <p className="inline-flex items-center justify-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-orange-700 dark:text-orange-300">
            <GitCompare className="h-4 w-4" aria-hidden />
            {t("eyebrow")}
          </p>
          <h2 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 md:text-5xl">{t("title")}</h2>
          <p className="mx-auto max-w-3xl text-lg text-zinc-600 dark:text-zinc-400">{t("subtitle")}</p>
        </motion.div>

        <div className="overflow-x-auto rounded-2xl border border-zinc-200/80 dark:border-zinc-800">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/40">
                <th className="px-4 py-6 text-lg font-bold text-zinc-900 dark:text-zinc-50">Feature</th>
                <th className="bg-orange-600/5 px-4 py-6 text-center text-lg font-bold text-orange-600 dark:bg-orange-600/10">
                  <div className="flex flex-col items-center gap-1">
                    <Box className="h-6 w-6" aria-hidden />
                    <span>BabaERP</span>
                  </div>
                </th>
                <th className="px-4 py-6 text-center text-lg font-bold text-zinc-600 dark:text-zinc-400">Tally Prime</th>
                <th className="px-4 py-6 text-center text-lg font-bold text-zinc-600 dark:text-zinc-400">QuickBooks</th>
              </tr>
            </thead>
            <tbody>
              {features.map((feature, idx) => (
                <motion.tr
                  key={feature.name}
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: reduceMotion ? 0 : idx * 0.06 }}
                  className="group border-b border-zinc-100 bg-white dark:border-zinc-900 dark:bg-zinc-950/30"
                >
                  <td className="px-4 py-8">
                    <div className="space-y-1">
                      <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{feature.name}</p>
                      <p className="max-w-md text-sm text-zinc-500 dark:text-zinc-500">{feature.desc}</p>
                    </div>
                  </td>
                  <td className="bg-orange-600/5 px-4 py-8 text-center dark:bg-orange-600/10">
                    <div className="flex items-center justify-center">
                      <div className="rounded-full bg-emerald-500/20 p-2 text-emerald-500">
                        <Check className="h-6 w-6 stroke-[3px]" />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-8 text-center">
                    <div className="flex items-center justify-center">
                      {feature.tally === true ? (
                        <Check className="h-6 w-6 text-emerald-500/50" />
                      ) : feature.tally === false ? (
                        <X className="h-6 w-6 text-rose-500/50" />
                      ) : (
                        <span className="font-medium text-zinc-500">{feature.tally}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-8 text-center">
                    <div className="flex items-center justify-center">
                      {feature.quickbooks === true ? (
                        <Check className="h-6 w-6 text-emerald-500/50" />
                      ) : feature.quickbooks === false ? (
                        <X className="h-6 w-6 text-rose-500/50" />
                      ) : (
                        <span className="font-medium text-zinc-500">{feature.quickbooks}</span>
                      )}
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-10 rounded-2xl border border-orange-500/20 bg-orange-600/5 p-6 dark:bg-orange-600/10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <Info className="mt-0.5 h-8 w-8 shrink-0 text-orange-600" aria-hidden />
              <div>
                <p className="font-medium text-zinc-700 dark:text-zinc-300">
                  Switching is easy. We support <span className="font-bold text-orange-600">direct data import</span> from most legacy accounting tools.
                </p>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">{t("footnote")}</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <Button
                asChild
                className="rounded-xl bg-orange-600 font-bold shadow-lg shadow-orange-600/20 hover:bg-orange-700"
              >
                <Link
                  href="/api/auth/signin"
                  onClick={() =>
                    emitMarketingAnalyticsEvent("marketing_trial_cta_clicked", {
                      location: "comparison_strip",
                      label: tp1("cta.startTrial"),
                    })
                  }
                >
                  {t("ctaTrial")}
                </Link>
              </Button>
              <Button asChild variant="outline" className="rounded-xl border-orange-300 font-bold text-orange-800 hover:bg-orange-50 dark:border-orange-800 dark:text-orange-200 dark:hover:bg-orange-950/40">
                <Link href="#features" onClick={() => emitMarketingAnalyticsEvent("marketing_cta_click", { location: "comparison_strip", label: t("ctaExplore"), href: "#features" })}>
                  {t("ctaExplore")}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
