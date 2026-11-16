"use client";

import { useTranslations } from "next-intl";
import { Download, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { RunLineDto } from "./shared";

function Lines({ title, rows, money, tone }: { title: string; rows: { code: string; label: string; amount: number; formula: string }[]; money: (n: number) => string; tone?: "neg" }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      <ul className="divide-y rounded-xl border">
        {rows.map((r, i) => (
          <li key={`${r.code}-${i}`} className="px-3 py-2">
            <div className="flex items-center justify-between gap-3 text-sm"><span>{r.label}</span><span className={tone === "neg" ? "tabular-nums text-rose-600" : "tabular-nums"}>{tone === "neg" ? "-" : ""}{money(r.amount)}</span></div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{r.formula}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RunLineDrawer({ line, runId, open, onOpenChange, money }: { line: RunLineDto | null; runId: string; open: boolean; onOpenChange: (v: boolean) => void; money: (n: number) => string }) {
  const t = useTranslations("PayrollHub");
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {line ? (
          <>
            <SheetHeader className="border-b p-5">
              <SheetTitle>{line.employee.name}</SheetTitle>
              <SheetDescription>{[line.employee.code, line.employee.designation, line.employee.department].filter(Boolean).join(" · ") || t("run.employee")}</SheetDescription>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                {[[t("run.gross"), line.gross], [t("run.deductions"), line.deductions], [t("run.net"), line.netPay]].map(([k, v]) => <div key={String(k)} className="rounded-xl bg-muted/50 p-2"><p className="text-[10px] uppercase text-muted-foreground">{k}</p><p className="text-sm font-semibold tabular-nums">{money(Number(v))}</p></div>)}
              </div>
            </SheetHeader>
            <div className="space-y-5 p-5">
              {line.warnings.length > 0 ? <div className="space-y-1.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">{line.warnings.map((w) => <p key={w} className="flex gap-2 text-xs text-amber-800 dark:text-amber-200"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t(`issue.${w}.title`, { count: 1 })}</p>)}</div> : null}
              {line.lopDays > 0 ? <p className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">{t("run.lopNote", { days: line.lopDays })}</p> : null}
              <Lines title={t("run.earnings")} rows={line.earnings} money={money} />
              <Lines title={t("run.deductionsTitle")} rows={line.deductionLines} money={money} tone="neg" />
              <Lines title={t("run.employerTitle")} rows={line.employerLines} money={money} />
              {line.ytdAssumed ? <p className="text-[11px] text-muted-foreground">{t("run.ytdNote")}</p> : null}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
                <span>{line.payment.accountLast4 ? t("run.paidTo", { bank: line.payment.bankName ?? "", last4: line.payment.accountLast4 }) : t(`bank.modeValue.${line.payment.mode}`)}</span>
                <Button asChild variant="outline" size="sm" className="gap-1.5"><a href={`/api/payroll/runs/${runId}/payslips/${line.id}`} target="_blank" rel="noreferrer"><Download className="h-4 w-4" />{t("run.payslip")}</a></Button>
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
