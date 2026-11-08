"use client";

import { useTranslations } from "next-intl";
import { Wallet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Gstr3bReport } from "@/lib/gst/gstr3b";
import type { TaxHeads, TaxRow } from "@/lib/gst/money";
import { stateName } from "@/lib/gst/states";
import { PeriodBar } from "./PeriodBar";
import { formatDay, Section, Stat, TableShell, td, tdr, th, thr, useJson, useMoney, type ObligationView } from "./gst-utils";

type Resp = { report: Gstr3bReport; gstin: string | null; invoiceCount: number };

export function Gstr3bTab({ obligations, period, onPeriod, onFile }: { obligations: ObligationView[]; period: string; onPeriod: (p: string) => void; onFile: (o: ObligationView) => void }) {
  const t = useTranslations("GstHub.g3");
  const tc = useTranslations("GstHub");
  const { n, c, m, locale } = useMoney();
  const { data, loading, error } = useJson<Resp>(period ? `/api/gst/gstr3b?period=${encodeURIComponent(period)}` : null);
  const r = data?.report;
  const rows = obligations.filter((o) => o.returnType === "GSTR3B");
  const current = rows.find((o) => o.periodKey === period);
  const head = (<><th className={thr}>{t("taxable")}</th><th className={thr}>IGST</th><th className={thr}>CGST</th><th className={thr}>SGST</th><th className={thr}>{tc("cess")}</th></>);
  const rowCells = (x: TaxRow) => (<><td className={tdr}>{n(x.taxable)}</td><td className={tdr}>{n(x.igst)}</td><td className={tdr}>{n(x.cgst)}</td><td className={tdr}>{n(x.sgst)}</td><td className={tdr}>{n(x.cess)}</td></>);
  const headCells = (x: TaxHeads, bold = false) => (<><td className={cn(tdr, bold && "font-semibold")}>{n(x.igst)}</td><td className={cn(tdr, bold && "font-semibold")}>{n(x.cgst)}</td><td className={cn(tdr, bold && "font-semibold")}>{n(x.sgst)}</td><td className={cn(tdr, bold && "font-semibold")}>{n(x.cess)}</td></>);
  const sum = (x: TaxHeads) => x.igst + x.cgst + x.sgst + x.cess;

  return (
    <div className="space-y-5">
      <PeriodBar obligations={rows} value={period} onChange={onPeriod} onFile={onFile} />
      <p className="rounded-xl bg-emerald-50/70 px-4 py-2.5 text-xs text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">{t("intro")}</p>
      {error ? <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p> : null}
      {loading && !r ? <div className="space-y-3"><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-60 rounded-2xl" /></div> : null}
      {r ? (
        <div className={cn("space-y-5 transition-opacity", loading && "opacity-60")}>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <Stat label={t("liability")} value={c(sum(r.payment.liability))} sub={t("liabilityHint", { count: data?.invoiceCount ?? 0 })} accent="bg-indigo-500" />
            <Stat label={t("itcUsed")} value={c(sum(r.payment.itcUsed))} sub={t("itcOpening", { amount: c(sum(r.payment.openingItc)) })} accent="bg-emerald-500" />
            <Stat label={t("cash")} value={c(r.payment.cashTotal)} sub={current ? t("dueBy", { date: formatDay(current.extendedDueDate ?? current.dueDate, locale) }) : ""} accent="bg-amber-500" />
            <Stat label={t("carry")} value={c(sum(r.payment.closingItc))} sub={t("carryHint")} accent="bg-sky-500" />
          </div>

          {r.payment.cashTotal > 0 ? (
            <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200/70 dark:from-amber-500/10 dark:to-orange-500/5 dark:text-amber-200 dark:ring-amber-400/20">
              <Wallet className="size-5 shrink-0" aria-hidden />
              <p>{t("payNote", { amount: m(r.payment.cashTotal) })}</p>
            </div>
          ) : null}

          <Section title={t("s31")} hint={t("s31Hint")}>
            <TableShell minWidth={760}>
              <thead><tr><th className={th}>{t("nature")}</th>{head}</tr></thead>
              <tbody>
                <tr className="border-t border-border/50"><td className={td}>(a) {t("a")}</td>{rowCells(r.s31.a)}</tr>
                <tr className="border-t border-border/50"><td className={td}>(b) {t("b")}</td>{rowCells(r.s31.b)}</tr>
                <tr className="border-t border-border/50"><td className={td}>(c) {t("c")}</td><td className={tdr}>{n(r.s31.c.taxable)}</td><td className={tdr} colSpan={4} /></tr>
                <tr className="border-t border-border/50"><td className={td}>(d) {t("d")}</td>{rowCells(r.s31.d)}</tr>
                <tr className="border-t border-border/50"><td className={td}>(e) {t("e")}</td><td className={tdr}>{n(r.s31.e.taxable)}</td><td className={tdr} colSpan={4} /></tr>
              </tbody>
            </TableShell>
          </Section>

          {r.s32.length > 0 ? (
            <Section title={t("s32")} hint={t("s32Hint")}>
              <TableShell minWidth={420}>
                <thead><tr><th className={th}>{t("pos")}</th><th className={thr}>{t("taxable")}</th><th className={thr}>IGST</th></tr></thead>
                <tbody>{r.s32.map((x) => <tr key={x.pos} className="border-t border-border/50"><td className={td}>{stateName(x.pos) || x.pos}</td><td className={tdr}>{n(x.taxable)}</td><td className={tdr}>{n(x.igst)}</td></tr>)}</tbody>
              </TableShell>
            </Section>
          ) : null}

          <Section title={t("s4")} hint={t("s4Hint")}>
            <TableShell minWidth={620}>
              <thead><tr><th className={th}>{t("details")}</th><th className={thr}>IGST</th><th className={thr}>CGST</th><th className={thr}>SGST</th><th className={thr}>{tc("cess")}</th></tr></thead>
              <tbody>
                <tr className="border-t border-border/50"><td className={td}>A(3) {t("rcmItc")}</td>{headCells(r.s4.a.rcm)}</tr>
                <tr className="border-t border-border/50"><td className={td}>A(5) {t("otherItc")}</td>{headCells(r.s4.a.other)}</tr>
                <tr className="border-t border-border/50"><td className={td}>B(1) {t("rules")}</td>{headCells(r.s4.b.rules)}</tr>
                <tr className="border-t border-border/50"><td className={td}>B(2) {t("reversalOther")}</td>{headCells(r.s4.b.other)}</tr>
                <tr className="border-t-2 border-border bg-muted/30"><td className={cn(td, "font-semibold")}>C {t("net")}</td>{headCells(r.s4.c, true)}</tr>
                <tr className="border-t border-border/50 text-muted-foreground"><td className={td}>D(1) {t("ineligible")}</td>{headCells(r.s4.d.ineligible)}</tr>
              </tbody>
            </TableShell>
          </Section>

          <Section title={t("s61")} hint={t("s61Hint")}>
            <TableShell minWidth={760}>
              <thead><tr><th className={th}>{t("head")}</th><th className={thr}>{t("liabilityCol")}</th><th className={thr}>{t("paidItc")}</th><th className={thr}>{t("paidCash")}</th><th className={thr}>{t("closing")}</th></tr></thead>
              <tbody>
                {(["igst", "cgst", "sgst", "cess"] as const).map((k) => {
                  const used = r.payment.liability[k] - r.payment.cash[k];
                  return (
                    <tr key={k} className="border-t border-border/50">
                      <td className={cn(td, "font-medium uppercase")}>{k === "cess" ? tc("cess") : k}</td>
                      <td className={tdr}>{n(r.payment.liability[k])}</td>
                      <td className={tdr}>{n(Math.max(0, used))}</td>
                      <td className={cn(tdr, r.payment.cash[k] > 0 && "font-semibold text-amber-700 dark:text-amber-300")}>{n(r.payment.cash[k])}</td>
                      <td className={tdr}>{n(r.payment.closingItc[k])}</td>
                    </tr>
                  );
                })}
              </tbody>
            </TableShell>
            <p className="mt-3 text-xs text-muted-foreground">{t("orderNote")}</p>
          </Section>
        </div>
      ) : null}
    </div>
  );
}
