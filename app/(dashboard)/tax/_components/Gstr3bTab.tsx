"use client";

import { useTranslations } from "next-intl";
import { Wallet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Gstr3bReport } from "@/lib/gst/gstr3b";
import type { TaxHeads, TaxRow } from "@/lib/gst/money";
import { stateName } from "@/lib/gst/states";
import { PeriodBar } from "./PeriodBar";
import { Input } from "@/components/ui/input";
import { formatDay, Section, Stat, TableShell, td, tdr, th, thr, useJson, useMoney, type GstAccessFlags, type ObligationView } from "./gst-utils";
import { Explain } from "./ExplainDrawer";
import { useState } from "react";
import { Download, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";

type Resp = { report: Gstr3bReport; gstin: string | null; invoiceCount: number };

export function Gstr3bTab({ obligations, period, onPeriod, onFile, access, onChanged }: { obligations: ObligationView[]; period: string; onPeriod: (p: string) => void; onFile: (o: ObligationView) => void; access: GstAccessFlags; onChanged: () => void }) {
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
      <PeriodBar obligations={rows} value={period} onChange={onPeriod} onFile={onFile} access={access} onChanged={onChanged}>
        <Button size="sm" variant="outline" asChild><a href={`/api/gst/gstr3b/export?period=${encodeURIComponent(period)}`}><Download className="me-1.5 size-4" aria-hidden />CSV</a></Button>
      </PeriodBar>
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

          {sum(r.payment.itcHeld) > 0 ? (
            <p className="flex items-center justify-between gap-3 rounded-xl bg-violet-50 px-4 py-2.5 text-xs text-violet-900 dark:bg-violet-500/10 dark:text-violet-200">
              <span>{t("heldNote", { amount: m(sum(r.payment.itcHeld)) })}</span>
              <Explain k="itc_held" scope={{ period }}>{t("heldWhich")}</Explain>
            </p>
          ) : null}
          {sum(r.payment.cashCredits) > 0 ? <p className="rounded-xl bg-sky-50 px-4 py-2.5 text-xs text-sky-900 dark:bg-sky-500/10 dark:text-sky-200">{t("tdsNote", { amount: m(sum(r.payment.cashCredits)) })}</p> : null}

          <Section title={t("s31")} hint={t("s31Hint")}>
            <TableShell minWidth={760}>
              <thead><tr><th className={th}>{t("nature")}</th>{head}</tr></thead>
              <tbody>
                <tr className="border-t border-border/50"><td className={td}><Explain k="outward" scope={{ period }}>(a) {t("a")}</Explain></td>{rowCells(r.s31.a)}</tr>
                <tr className="border-t border-border/50"><td className={td}><Explain k="zero_rated" scope={{ period }}>(b) {t("b")}</Explain></td>{rowCells(r.s31.b)}</tr>
                <tr className="border-t border-border/50"><td className={td}><Explain k="nil" scope={{ period }}>(c) {t("c")}</Explain></td><td className={tdr}>{n(r.s31.c.taxable)}</td><td className={tdr} colSpan={4} /></tr>
                <tr className="border-t border-border/50"><td className={td}><Explain k="rcm" scope={{ period }}>(d) {t("d")}</Explain></td>{rowCells(r.s31.d)}</tr>
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
                <tr className="border-t border-border/50"><td className={td}><Explain k="itc_rcm" scope={{ period }}>A(3) {t("rcmItc")}</Explain></td>{headCells(r.s4.a.rcm)}</tr>
                <tr className="border-t border-border/50"><td className={td}><Explain k="itc_other" scope={{ period }}>A(5) {t("otherItc")}</Explain></td>{headCells(r.s4.a.other)}</tr>
                <tr className="border-t border-border/50"><td className={td}><Explain k="reversals" scope={{ period }}>B(1) {t("rules")}</Explain></td>{headCells(r.s4.b.rules)}</tr>
                <tr className="border-t border-border/50"><td className={td}><Explain k="reversals" scope={{ period }}>B(2) {t("reversalOther")}</Explain></td>{headCells(r.s4.b.other)}</tr>
                <tr className="border-t-2 border-border bg-muted/30"><td className={cn(td, "font-semibold")}>C {t("net")}</td>{headCells(r.s4.c, true)}</tr>
                <tr className="border-t border-border/50 text-muted-foreground"><td className={td}><Explain k="itc_ineligible" scope={{ period }}>D(1) {t("ineligible")}</Explain></td>{headCells(r.s4.d.ineligible)}</tr>
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
          <PortalCompare report={r} />
        </div>
      ) : null}
    </div>
  );
}

type Num = string;
/** Compare our figures with the portal's auto-drafted GSTR-3B before filing: type in what the portal shows, see the gaps. */
function PortalCompare({ report }: { report: Gstr3bReport }) {
  const t = useTranslations("GstHub.g3.compare");
  const { n } = useMoney();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Record<string, Num>>({});
  const rows: Array<{ key: string; label: string; ours: number }> = [
    { key: "taxable", label: t("taxable"), ours: report.s31.a.taxable },
    { key: "igst", label: t("igst"), ours: report.s31.a.igst },
    { key: "cgst", label: t("cgst"), ours: report.s31.a.cgst },
    { key: "sgst", label: t("sgst"), ours: report.s31.a.sgst },
    { key: "itcIgst", label: t("itcIgst"), ours: report.s4.c.igst },
    { key: "itcCgst", label: t("itcCgst"), ours: report.s4.c.cgst },
    { key: "itcSgst", label: t("itcSgst"), ours: report.s4.c.sgst },
  ];
  return (
    <section className="rounded-2xl border border-border/70 bg-card shadow-sm">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3.5 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><Scale className="size-4" aria-hidden /></span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{t("title")}</span><span className="block text-xs text-muted-foreground">{t("hint")}</span></span>
      </button>
      {open ? (
        <div className="border-t border-border/60 p-4 sm:p-5">
          <TableShell minWidth={520}>
            <thead><tr><th className={th}>{t("line")}</th><th className={thr}>{t("ours")}</th><th className={thr}>{t("portal")}</th><th className={thr}>{t("diff")}</th></tr></thead>
            <tbody>
              {rows.map((row) => {
                const typed = v[row.key];
                const diff = typed === undefined || typed === "" ? null : Math.round((row.ours - Number(typed)) * 100) / 100;
                return (
                  <tr key={row.key} className="border-t border-border/50">
                    <td className={td}>{row.label}</td>
                    <td className={tdr}>{n(row.ours)}</td>
                    <td className="px-2 py-1.5"><Input aria-label={`${row.label} ${t("portal")}`} inputMode="decimal" value={v[row.key] ?? ""} onChange={(e) => setV((p) => ({ ...p, [row.key]: e.target.value }))} className="h-8 w-28 text-end tabular-nums sm:w-32" placeholder="0" /></td>
                    <td className={cn(tdr, diff !== null && Math.abs(diff) > 1 && "font-semibold text-rose-600 dark:text-rose-400", diff !== null && Math.abs(diff) <= 1 && "text-emerald-600")}>{diff === null ? "—" : n(diff)}</td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
          <p className="mt-3 text-xs text-muted-foreground">{t("note")}</p>
        </div>
      ) : null}
    </section>
  );
}
