"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Calculator } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import type { InvoiceSummaryDto } from "@/lib/invoices/types";
import { formatMoney } from "./income-utils";

/** Optional card for Indian professionals (presumptive income + GST threshold). Hidden everywhere else. */
export function TaxEstimateCard({ summary, locale, onChanged }: { summary: InvoiceSummaryDto; locale: string; onChanged: () => void }) {
  const t = useTranslations("Income.taxCard");
  const [saving, setSaving] = useState(false);
  const tax = summary.taxEstimate;
  if (!tax.eligible) return null;

  const currency = summary.baseCurrency;
  const near = (tax.thresholdPercent ?? 0) >= 90;

  const toggle = async (enabled: boolean) => {
    setSaving(true);
    try {
      const res = await fetch("/api/invoices/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taxEstimateEnabled: enabled }),
      });
      if (!res.ok) throw new Error();
      onChanged();
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label={t("title")} className="grid gap-4 rounded-2xl border border-border/70 bg-card p-5 shadow-sm md:grid-cols-2">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Calculator className="size-4 text-indigo-500" aria-hidden />
            {t("title")}
            <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">{t("badge")}</span>
          </h2>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            {tax.enabled ? t("on") : t("off")}
            <Switch checked={tax.enabled} disabled={saving} onCheckedChange={toggle} aria-label={t("toggle")} />
          </label>
        </div>
        {tax.enabled ? (
          <div className="space-y-1">
            <p className="text-2xl font-bold tabular-nums">{formatMoney(tax.estimatedIncome, currency, locale)}</p>
            <p className="text-xs text-muted-foreground">{t("basis", { rate: tax.ratePercent, amount: formatMoney(summary.collected, currency, locale) })}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("enableDescription", { rate: tax.ratePercent })}</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{t("gstTitle")}</span>
          <span className="tabular-nums text-muted-foreground">{tax.thresholdPercent?.toFixed(1)}%</span>
        </div>
        <Progress value={tax.thresholdPercent ?? 0} className="h-2" aria-label={t("gstTitle")} />
        <p className="text-xs text-muted-foreground">
          {t("gstDescription", {
            turnover: formatMoney(tax.fyTurnover, currency, locale),
            threshold: formatMoney(tax.threshold, currency, locale),
          })}
        </p>
        {near && (
          <p className="flex items-start gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {t("nearThreshold")}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">{t("disclaimer")}</p>
      </div>
    </section>
  );
}
