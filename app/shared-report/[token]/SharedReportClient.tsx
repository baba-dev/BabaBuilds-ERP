"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ReportBodyView } from "@/app/(dashboard)/reporting/_components/ReportBodyView";
import type { Lineage, ReportResult } from "@/app/(dashboard)/reporting/_components/shared";

export default function SharedReportClient({ result, title, company, reportId, lineage, createdAt, expiresAt }: { result: ReportResult; title: string; company: string | null; reportId: string; lineage: Lineage | null; createdAt: string; expiresAt: string | null }) {
  const t = useTranslations("ReportingCenter");
  const locale = useLocale();
  const money = useMemo(() => { const f = new Intl.NumberFormat(locale, { style: "currency", currency: result.currency }); return (n: number) => f.format(n); }, [locale, result.currency]);
  const compact = useMemo(() => { const f = new Intl.NumberFormat(locale, { style: "currency", currency: result.currency, notation: "compact", maximumFractionDigits: 1 }); return (n: number) => f.format(n); }, [locale, result.currency]);
  const when = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <header className="space-y-1 border-b pb-4">
        {company ? <p className="text-sm text-muted-foreground">{company}</p> : null}
        <h1 className="text-2xl font-semibold">{title || (reportId && t.has(`reports.${reportId}.title`) ? t(`reports.${reportId}.title`) : "")}</h1>
        <p className="text-xs text-muted-foreground">{t("share.snapshotOf", { date: when(createdAt) })}{expiresAt ? ` · ${t("share.expiresOn", { date: when(expiresAt) })}` : ""}</p>
      </header>
      <ReportBodyView result={{ ...result, quality: [] }} locale={locale} lineage={lineage ?? undefined} money={money} compact={compact} showDrill={false} />
      <footer className="border-t pt-4 text-xs text-muted-foreground">{t("share.readOnly")}</footer>
    </main>
  );
}
