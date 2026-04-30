"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, X, Box, Info, GitCompare } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { emitMarketingAnalyticsEvent } from "@/lib/marketing-analytics";

const ROW_KEYS = [
  "retainers",
  "bababot",
  "tax",
  "proposal",
  "recon",
  "estore",
  "native",
  "ca",
  "roles",
] as const;

type CellCode = "yes" | "no" | "partial" | "addon" | "regional" | "manual" | "premium";

function ComparisonCell({
  code,
  labelYes,
  labelNo,
  tStatus,
}: {
  code: CellCode;
  labelYes: string;
  labelNo: string;
  tStatus: (key: CellCode) => string;
}) {
  if (code === "yes") {
    return (
      <div className="flex items-center justify-center" role="img" aria-label={labelYes}>
        <Check className="h-6 w-6 text-emerald-500/50" aria-hidden />
      </div>
    );
  }
  if (code === "no") {
    return (
      <div className="flex items-center justify-center" role="img" aria-label={labelNo}>
        <X className="h-6 w-6 text-rose-500/50" aria-hidden />
      </div>
    );
  }
  return <span className="font-medium text-zinc-500 dark:text-zinc-400">{tStatus(code)}</span>;
}

export default function ComparisonTable() {
  const t = useTranslations("Landing.comparisonSection");
  const tp1 = useTranslations("LandingPhase1");
  const reduceMotion = useReducedMotion();

  const rows = useMemo(
    () =>
      ROW_KEYS.map((key) => ({
        key,
        name: t(`rows.${key}.name`),
        desc: t(`rows.${key}.desc`),
        tally: t(`rows.${key}.tally`) as CellCode,
        quickbooks: t(`rows.${key}.quickbooks`) as CellCode,
      })),
    [t],
  );

  const tStatus = (k: CellCode) => t(`statusLabels.${k}`);
  const labelYes = t("cellYes");
  const labelNo = t("cellNo");

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
          <table className="w-full border-collapse text-start">
            <caption className="sr-only">{t("title")}</caption>
            <thead>
              <tr className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/40">
                <th scope="col" className="px-4 py-6 text-lg font-bold text-zinc-900 dark:text-zinc-50">
                  {t("table.feature")}
                </th>
                <th
                  scope="col"
                  className="bg-orange-600/5 px-4 py-6 text-center text-lg font-bold text-orange-600 dark:bg-orange-600/10"
                >
                  <div className="flex flex-col items-center gap-1">
                    <Box className="h-6 w-6" aria-hidden />
                    <span>{t("table.baba")}</span>
                  </div>
                </th>
                <th scope="col" className="px-4 py-6 text-center text-lg font-bold text-zinc-600 dark:text-zinc-400">
                  {t("table.tally")}
                </th>
                <th scope="col" className="px-4 py-6 text-center text-lg font-bold text-zinc-600 dark:text-zinc-400">
                  {t("table.quickbooks")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((feature, idx) => (
                <motion.tr
                  key={feature.key}
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: reduceMotion ? 0 : idx * 0.06 }}
                  className="group border-b border-zinc-100 bg-white dark:border-zinc-900 dark:bg-zinc-950/30"
                >
                  <th scope="row" className="px-4 py-8 text-start align-top font-normal">
                    <div className="space-y-1">
                      <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{feature.name}</p>
                      <p className="max-w-md text-sm text-zinc-500 dark:text-zinc-500">{feature.desc}</p>
                    </div>
                  </th>
                  <td className="bg-orange-600/5 px-4 py-8 text-center align-middle dark:bg-orange-600/10">
                    <div className="flex items-center justify-center">
                      <div className="rounded-full bg-emerald-500/20 p-2 text-emerald-500">
                        <Check className="h-6 w-6 stroke-[3px]" aria-hidden />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-8 text-center align-middle">
                    <ComparisonCell code={feature.tally} labelYes={labelYes} labelNo={labelNo} tStatus={tStatus} />
                  </td>
                  <td className="px-4 py-8 text-center align-middle">
                    <ComparisonCell code={feature.quickbooks} labelYes={labelYes} labelNo={labelNo} tStatus={tStatus} />
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
                  {t("switchIntro")}{" "}
                  <span className="font-bold text-orange-600">{t("switchHighlight")}</span> {t("switchOutro")}
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
                  href="/signup?plan=pro&cycle=monthly&trial=15&source=comparison"
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
              <Button
                asChild
                variant="outline"
                className="rounded-xl border-orange-300 font-bold text-orange-800 hover:bg-orange-50 dark:border-orange-800 dark:text-orange-200 dark:hover:bg-orange-950/40"
              >
                <Link
                  href="#features"
                  onClick={() =>
                    emitMarketingAnalyticsEvent("marketing_cta_click", {
                      location: "comparison_strip",
                      label: t("ctaExplore"),
                      href: "#features",
                    })
                  }
                >
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
