"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Download, FileJson } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Gstr1Report } from "@/lib/gst/gstr1";
import { stateName } from "@/lib/gst/states";
import { EmptyArt } from "./art/GstArt";
import { PeriodBar } from "./PeriodBar";
import { Stat, TableShell, td, tdr, th, thr, useJson, useMoney, type GstAccessFlags, type ObligationView } from "./gst-utils";

type Resp = { report: Gstr1Report; gstin: string | null; stateCode: string | null; prevTurnover: number };

function Block({ id, title, hint, count, children, defaultOpen }: { id: string; title: string; hint?: string; count: number; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen && count > 0);
  return (
    <section className="rounded-2xl border border-border/70 bg-card shadow-sm">
      <button type="button" aria-expanded={open} aria-controls={`g1-${id}`} onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3.5 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-5">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{title}</span>
          {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
        </span>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", count > 0 ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300" : "bg-muted text-muted-foreground")}>{count}</span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? <div id={`g1-${id}`} className="border-t border-border/60 p-3 sm:p-4">{children}</div> : null}
    </section>
  );
}

export function Gstr1Tab({ obligations, period, onPeriod, onFile, access, onChanged }: { obligations: ObligationView[]; period: string; onPeriod: (p: string) => void; onFile: (o: ObligationView) => void; access: GstAccessFlags; onChanged: () => void }) {
  const t = useTranslations("GstHub.g1");
  const tc = useTranslations("GstHub");
  const { c, n } = useMoney();
  const { data, loading, error } = useJson<Resp>(period ? `/api/gst/gstr1?period=${encodeURIComponent(period)}` : null);
  const r = data?.report;
  const rows = obligations.filter((o) => o.returnType === "GSTR1");
  const taxTotal = r ? r.summary.igst + r.summary.cgst + r.summary.sgst + r.summary.cess : 0;
  const pos = (code: string) => stateName(code) || code;
  const taxCells = (l: { igst: number; cgst: number; sgst: number; cess: number }) => (
    <>
      <td className={tdr}>{n(l.igst)}</td><td className={tdr}>{n(l.cgst)}</td><td className={tdr}>{n(l.sgst)}</td><td className={tdr}>{n(l.cess)}</td>
    </>
  );
  const taxHead = (<><th className={thr}>IGST</th><th className={thr}>CGST</th><th className={thr}>SGST</th><th className={thr}>{tc("cess")}</th></>);

  return (
    <div className="space-y-5">
      <PeriodBar obligations={rows} value={period} onChange={onPeriod} onFile={onFile} access={access} onChanged={onChanged}>
        <Button size="sm" variant="outline" asChild><a href={`/api/gst/gstr1/export?period=${encodeURIComponent(period)}&format=csv`}><Download className="me-1.5 size-4" aria-hidden />CSV</a></Button>
        <Button size="sm" variant="outline" asChild><a href={`/api/gst/gstr1/export?period=${encodeURIComponent(period)}&format=json`}><FileJson className="me-1.5 size-4" aria-hidden />{t("portalJson")}</a></Button>
      </PeriodBar>
      <p className="rounded-xl bg-indigo-50/70 px-4 py-2.5 text-xs text-indigo-900 dark:bg-indigo-500/10 dark:text-indigo-200">{t("intro")}</p>

      {error ? <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p> : null}
      {loading && !r ? <div className="space-y-3"><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-40 rounded-2xl" /></div> : null}
      {r ? (
        <div className={cn("space-y-5 transition-opacity", loading && "opacity-60")}>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <Stat label={t("taxable")} value={c(r.summary.taxable)} sub={t("invoicesHint", { count: r.summary.invoiceCount })} accent="bg-indigo-500" />
            <Stat label={t("tax")} value={c(taxTotal)} sub={`IGST ${c(r.summary.igst)} · CGST ${c(r.summary.cgst)} · SGST ${c(r.summary.sgst)}`} accent="bg-emerald-500" />
            <Stat label={t("value")} value={c(r.summary.value)} sub={t("notesHint", { count: r.summary.creditNoteCount + r.summary.debitNoteCount })} accent="bg-sky-500" />
            <Stat label={t("hsnDigits")} value={data && data.prevTurnover > 50_000_000 ? "6" : "4"} sub={t("hsnHint")} accent="bg-amber-500" />
          </div>

          {r.isNil ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-8 text-center"><EmptyArt variant="returns" /><p className="text-sm font-medium">{t("nilTitle")}</p><p className="max-w-sm text-xs text-muted-foreground">{t("nilBody")}</p></div>
          ) : (
            <div className="space-y-3">
              <Block id="b2b" title={t("b2b")} hint={t("b2bHint")} count={r.b2b.reduce((s, p) => s + p.invoices.length, 0)} defaultOpen>
                <TableShell minWidth={820}>
                  <thead><tr><th className={th}>{t("invoice")}</th><th className={th}>{t("date")}</th><th className={th}>{t("party")}</th><th className={th}>{t("pos")}</th><th className={thr}>{t("rate")}</th><th className={thr}>{t("taxableCol")}</th>{taxHead}</tr></thead>
                  <tbody>
                    {r.b2b.flatMap((p) => p.invoices.flatMap((i) => i.lines.map((l, idx) => (
                      <tr key={`${i.id}-${idx}`} className="border-t border-border/50">
                        <td className={cn(td, "font-medium")}>{idx === 0 ? <>{i.number}{i.rcm ? <span className="ms-1.5 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800">RCM</span> : null}</> : ""}</td>
                        <td className={td}>{idx === 0 ? i.date : ""}</td>
                        <td className={td}>{idx === 0 ? <><span className="block">{p.name}</span><span className="block font-mono text-[10px] text-muted-foreground">{p.gstin}</span></> : ""}</td>
                        <td className={td}>{idx === 0 ? pos(i.pos) : ""}</td>
                        <td className={tdr}>{l.rate}%</td><td className={tdr}>{n(l.taxable)}</td>{taxCells(l)}
                      </tr>
                    ))))}
                  </tbody>
                </TableShell>
              </Block>

              <Block id="b2cl" title={t("b2cl")} hint={t("b2clHint")} count={r.b2cl.length}>
                <TableShell minWidth={720}>
                  <thead><tr><th className={th}>{t("invoice")}</th><th className={th}>{t("date")}</th><th className={th}>{t("pos")}</th><th className={thr}>{t("rate")}</th><th className={thr}>{t("taxableCol")}</th>{taxHead}</tr></thead>
                  <tbody>{r.b2cl.flatMap((i) => i.lines.map((l, idx) => <tr key={`${i.id}-${idx}`} className="border-t border-border/50"><td className={cn(td, "font-medium")}>{idx === 0 ? i.number : ""}</td><td className={td}>{idx === 0 ? i.date : ""}</td><td className={td}>{idx === 0 ? pos(i.pos) : ""}</td><td className={tdr}>{l.rate}%</td><td className={tdr}>{n(l.taxable)}</td>{taxCells(l)}</tr>))}</tbody>
                </TableShell>
              </Block>

              <Block id="b2cs" title={t("b2cs")} hint={t("b2csHint")} count={r.b2cs.length}>
                <TableShell minWidth={680}>
                  <thead><tr><th className={th}>{t("pos")}</th><th className={th}>{t("supply")}</th><th className={thr}>{t("rate")}</th><th className={thr}>{t("taxableCol")}</th>{taxHead}</tr></thead>
                  <tbody>{r.b2cs.map((s) => <tr key={`${s.pos}-${s.rate}-${s.interState}`} className="border-t border-border/50"><td className={td}>{pos(s.pos)}</td><td className={td}>{s.interState ? t("inter") : t("intra")}</td><td className={tdr}>{s.rate}%</td><td className={tdr}>{n(s.taxable)}</td>{taxCells(s)}</tr>)}</tbody>
                </TableShell>
              </Block>

              <Block id="exp" title={t("exports")} hint={t("exportsHint")} count={r.exports.length}>
                <TableShell minWidth={640}>
                  <thead><tr><th className={th}>{t("invoice")}</th><th className={th}>{t("date")}</th><th className={th}>{t("type")}</th><th className={thr}>{t("rate")}</th><th className={thr}>{t("taxableCol")}</th><th className={thr}>IGST</th></tr></thead>
                  <tbody>{r.exports.flatMap((i) => i.lines.map((l, idx) => <tr key={`${i.id}-${idx}`} className="border-t border-border/50"><td className={cn(td, "font-medium")}>{idx === 0 ? i.number : ""}</td><td className={td}>{idx === 0 ? i.date : ""}</td><td className={td}>{i.supplyType === "EXPWP" ? t("withPayment") : t("underLut")}</td><td className={tdr}>{l.rate}%</td><td className={tdr}>{n(l.taxable)}</td><td className={tdr}>{n(l.igst)}</td></tr>))}</tbody>
                </TableShell>
              </Block>

              <Block id="sez" title={t("sez")} hint={t("sezHint")} count={r.sez.reduce((s, p) => s + p.invoices.length, 0)}>
                <TableShell minWidth={720}>
                  <thead><tr><th className={th}>{t("invoice")}</th><th className={th}>{t("date")}</th><th className={th}>{t("party")}</th><th className={th}>{t("type")}</th><th className={thr}>{t("taxableCol")}</th><th className={thr}>IGST</th></tr></thead>
                  <tbody>{r.sez.flatMap((p) => p.invoices.flatMap((i) => i.lines.map((l, idx) => <tr key={`${i.id}-${idx}`} className="border-t border-border/50"><td className={cn(td, "font-medium")}>{idx === 0 ? i.number : ""}</td><td className={td}>{idx === 0 ? i.date : ""}</td><td className={td}>{idx === 0 ? <><span className="block">{p.name}</span><span className="block font-mono text-[10px] text-muted-foreground">{p.gstin}</span></> : ""}</td><td className={td}>{i.supplyType === "SEZWP" ? t("withPayment") : t("withoutPayment")}</td><td className={tdr}>{n(l.taxable)}</td><td className={tdr}>{n(l.igst)}</td></tr>)))}</tbody>
                </TableShell>
              </Block>

              <Block id="amend" title={t("amend")} hint={t("amendHint")} count={r.amendments.b2b.length + r.amendments.b2cs.length}>
                <TableShell minWidth={760}>
                  <thead><tr><th className={th}>{t("invoice")}</th><th className={th}>{t("table")}</th><th className={thr}>{t("original")}</th><th className={thr}>{t("revised")}</th><th className={thr}>{t("delta")}</th><th className={thr}>{t("tax")}</th></tr></thead>
                  <tbody>{[...r.amendments.b2b.map((a) => ({ a, tbl: "9A" })), ...r.amendments.b2cs.map((a) => ({ a, tbl: "10" }))].map(({ a, tbl }) => <tr key={a.id} className="border-t border-border/50"><td className={cn(td, "font-medium")}>{a.originalNumber}<span className="block text-xs font-normal text-muted-foreground">{a.originalPeriodKey} · {a.reason}</span></td><td className={td}>{tbl}</td><td className={tdr}>{n(a.original.taxable)}</td><td className={tdr}>{n(a.revised.taxable)}</td><td className={tdr}>{n(a.delta.taxable)}</td><td className={tdr}>{n(a.delta.igst + a.delta.cgst + a.delta.sgst)}</td></tr>)}</tbody>
                </TableShell>
              </Block>

              <Block id="adv" title={t("adv")} hint={t("advHint")} count={r.advances.received.length + r.advances.adjusted.length}>
                <TableShell minWidth={680}>
                  <thead><tr><th className={th}>{t("advKind")}</th><th className={th}>{t("pos")}</th><th className={thr}>{t("rate")}</th><th className={thr}>{t("taxableCol")}</th>{taxHead}</tr></thead>
                  <tbody>{[...r.advances.received.map((a) => ({ a, k: "11A", sign: 1 })), ...r.advances.adjusted.map((a) => ({ a, k: "11B", sign: -1 }))].map(({ a, k, sign }) => <tr key={`${k}-${a.pos}-${a.rate}`} className="border-t border-border/50"><td className={td}>{k === "11A" ? t("advReceived") : t("advAdjusted")}</td><td className={td}>{pos(a.pos)}</td><td className={tdr}>{a.rate}%</td><td className={tdr}>{n(sign * a.taxable)}</td>{taxCells({ igst: sign * a.igst, cgst: sign * a.cgst, sgst: sign * a.sgst, cess: 0 })}</tr>)}</tbody>
                </TableShell>
              </Block>

              <Block id="eco" title={t("eco")} hint={t("ecoHint")} count={r.eco.length}>
                <TableShell minWidth={520}>
                  <thead><tr><th className={th}>{t("ecoGstin")}</th><th className={thr}>{t("invoices")}</th><th className={thr}>{t("taxableCol")}</th><th className={thr}>{t("tax")}</th></tr></thead>
                  <tbody>{r.eco.map((e) => <tr key={e.gstin} className="border-t border-border/50"><td className={cn(td, "font-mono text-xs")}>{e.gstin}</td><td className={tdr}>{e.invoices}</td><td className={tdr}>{n(e.taxable)}</td><td className={tdr}>{n(e.igst + e.cgst + e.sgst + e.cess)}</td></tr>)}</tbody>
                </TableShell>
              </Block>

              <Block id="nil" title={t("nil")} hint={t("nilHint")} count={r.nil.length}>
                <TableShell minWidth={520}>
                  <thead><tr><th className={th}>{t("supply")}</th><th className={thr}>{t("nilRated")}</th><th className={thr}>{t("exempted")}</th><th className={thr}>{t("nonGst")}</th></tr></thead>
                  <tbody>{r.nil.map((x) => <tr key={x.key} className="border-t border-border/50"><td className={td}>{t(`nilKey.${x.key}`)}</td><td className={tdr}>{n(x.nil)}</td><td className={tdr}>{n(x.exempt)}</td><td className={tdr}>{n(x.nonGst)}</td></tr>)}</tbody>
                </TableShell>
              </Block>

              <Block id="cdn" title={t("cdn")} hint={t("cdnHint")} count={r.cdnr.reduce((s, p) => s + p.notes.length, 0) + r.cdnur.length}>
                <TableShell minWidth={760}>
                  <thead><tr><th className={th}>{t("note")}</th><th className={th}>{t("type")}</th><th className={th}>{t("date")}</th><th className={th}>{t("against")}</th><th className={th}>{t("party")}</th><th className={thr}>{t("taxableCol")}</th><th className={thr}>{t("tax")}</th></tr></thead>
                  <tbody>
                    {[...r.cdnr.flatMap((p) => p.notes.map((x) => ({ x, name: p.name }))), ...r.cdnur.map((x) => ({ x, name: "" }))].map(({ x, name }) => (
                      <tr key={x.id} className="border-t border-border/50"><td className={cn(td, "font-medium")}>{x.number}</td><td className={td}>{x.noteType === "D" ? t("debit") : t("credit")}</td><td className={td}>{x.date}</td><td className={td}>{x.originalNumber}</td><td className={td}>{name || t("unregistered")}</td><td className={tdr}>{n(x.lines.reduce((s, l) => s + l.taxable, 0))}</td><td className={tdr}>{n(x.lines.reduce((s, l) => s + l.igst + l.cgst + l.sgst + l.cess, 0))}</td></tr>
                    ))}
                  </tbody>
                </TableShell>
              </Block>

              <Block id="hsn" title={t("hsn")} hint={t("hsnTableHint")} count={r.hsnB2b.length + r.hsnB2c.length}>
                {[{ key: "b2b", rows: r.hsnB2b, label: t("hsnB2b") }, { key: "b2c", rows: r.hsnB2c, label: t("hsnB2c") }].filter((g) => g.rows.length > 0).map((g) => (
                  <div key={g.key} className="mb-4 last:mb-0">
                    <p className="mb-2 text-xs font-semibold text-muted-foreground">{g.label}</p>
                    <TableShell minWidth={780}>
                      <thead><tr><th className={th}>HSN/SAC</th><th className={th}>{t("description")}</th><th className={thr}>{t("rate")}</th><th className={thr}>{t("taxableCol")}</th>{taxHead}</tr></thead>
                      <tbody>{g.rows.map((h) => <tr key={`${h.hsn}-${h.rate}`} className="border-t border-border/50"><td className={cn(td, "font-mono")}>{h.hsn}</td><td className={td}>{h.description}</td><td className={tdr}>{h.rate}%</td><td className={tdr}>{n(h.taxable)}</td>{taxCells(h)}</tr>)}</tbody>
                    </TableShell>
                  </div>
                ))}
              </Block>

              <Block id="docs" title={t("docs")} hint={t("docsHint")} count={r.docs.length}>
                <TableShell minWidth={560}>
                  <thead><tr><th className={th}>{t("docType")}</th><th className={th}>{t("from")}</th><th className={th}>{t("to")}</th><th className={thr}>{t("total")}</th><th className={thr}>{t("cancelled")}</th><th className={thr}>{t("net")}</th></tr></thead>
                  <tbody>{r.docs.map((d) => <tr key={d.type} className="border-t border-border/50"><td className={td}>{t(`docKey.${d.type}`)}</td><td className={cn(td, "font-mono")}>{d.from}</td><td className={cn(td, "font-mono")}>{d.to}</td><td className={tdr}>{d.total}</td><td className={tdr}>{d.cancelled}</td><td className={tdr}>{d.net}</td></tr>)}</tbody>
                </TableShell>
              </Block>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
