"use client";

import { useTranslations } from "next-intl";
import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaidArt } from "./art/PayrollArt";
import { monthLabel, dayLabel } from "./shared";

export type MyPayslip = { lineId: string; runId: string; month: string; gross: number; deductions: number; netPay: number; paidAt: string | null };

export function MyPayslips({ items, locale, money }: { items: MyPayslip[]; locale: string; money: (n: number) => string }) {
  const t = useTranslations("PayrollHub");
  if (items.length === 0) return (
    <div className="grid items-center gap-4 rounded-3xl border p-8 md:grid-cols-[1fr_240px]"><div><h2 className="text-xl font-semibold">{t("mine.emptyTitle")}</h2><p className="mt-2 text-sm text-muted-foreground">{t("mine.emptyBody")}</p></div><div className="hidden h-36 md:block"><PaidArt /></div></div>
  );
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("mine.body")}</p>
      {items.map((p) => (
        <div key={p.lineId} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4 shadow-xs">
          <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600"><FileText className="h-5 w-5" /></span><div><p className="text-sm font-medium">{monthLabel(p.month, locale)}</p><p className="text-xs text-muted-foreground">{p.paidAt ? t("mine.paidOn", { date: dayLabel(p.paidAt, locale) }) : t("mine.notPaid")}</p></div></div>
          <div className="flex items-center gap-4"><div className="text-right"><p className="text-xs text-muted-foreground">{t("mine.net")}</p><p className="text-base font-semibold tabular-nums">{money(p.netPay)}</p></div><Button asChild variant="outline" size="sm" className="gap-1.5"><a href={`/api/payroll/my-payslips/${p.lineId}`} target="_blank" rel="noreferrer"><Download className="h-4 w-4" />{t("mine.download")}</a></Button></div>
        </div>
      ))}
    </div>
  );
}
