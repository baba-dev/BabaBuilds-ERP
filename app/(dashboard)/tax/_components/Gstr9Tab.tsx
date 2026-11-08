"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Download, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Gstr9Report } from "@/lib/gst/gstr9";
import type { TaxRow } from "@/lib/gst/money";
import { ReturnEmblem } from "./art/GstArt";
import { formatDay, readError, Section, Stat, StatusChip, TableShell, td, tdr, th, thr, useJson, useMoney, type ObligationView } from "./gst-utils";

type Manual = { key: string; table: string; label: string };
type Resp = {
  report: Gstr9Report;
  inputs: Record<string, Partial<TaxRow>> & { lateFeePaid?: number; interestPaid?: number };
  filing: { status: string; filedAt: string | null; arn: string | null } | null;
  drift: Array<{ returnType: string; periodKey: string; filedTax: number; currentTax: number }>;
  manualRows: Manual[];
  registrationType: string;
};

const HEADS = ["taxable", "igst", "cgst", "sgst", "cess"] as const;

export function Gstr9Tab({ fy, obligation, onFile }: { fy: string; obligation: ObligationView | undefined; onFile: (o: ObligationView) => void }) {
  const t = useTranslations("GstHub.g9");
  const tc = useTranslations("GstHub");
  const { n, c, locale } = useMoney();
  const { data, loading, error, reload } = useJson<Resp>(`/api/gst/gstr9?fy=${encodeURIComponent(fy)}`);
  const r = data?.report;

  const rowCells = (x: Partial<TaxRow>) => HEADS.map((h) => <td key={h} className={tdr}>{h in x ? n((x as Record<string, number>)[h]) : "—"}</td>);
  const head = (<><th className={thr}>{tc("g3.taxable")}</th><th className={thr}>IGST</th><th className={thr}>CGST</th><th className={thr}>SGST</th><th className={thr}>{tc("cess")}</th></>);
  const headNoTaxable = (<><th className={thr} /><th className={thr}>IGST</th><th className={thr}>CGST</th><th className={thr}>SGST</th><th className={thr}>{tc("cess")}</th></>);

  return (
    <div className="space-y-5">
      <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-r from-teal-50 via-card to-card p-4 shadow-sm dark:from-teal-500/10 sm:p-5">
        <ReturnEmblem type="GSTR9" size={48} />
        <div className="min-w-0">
          <h3 className="font-semibold">{t("title", { fy })}</h3>
          <p className="text-xs text-muted-foreground">{t("subtitle", { date: obligation ? formatDay(obligation.extendedDueDate ?? obligation.dueDate, locale) : "—" })}</p>
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          {obligation ? <StatusChip status={obligation.status} label={tc(`status.${obligation.status}`)} /> : null}
          <Button size="sm" variant="outline" asChild><a href={`/api/gst/gstr9/export?fy=${encodeURIComponent(fy)}`}><Download className="me-1.5 size-4" aria-hidden />CSV</a></Button>
          {obligation ? <Button size="sm" variant={obligation.status === "FILED" ? "outline" : "default"} onClick={() => onFile(obligation)}>{obligation.status === "FILED" ? tc("edit") : tc("markFiled")}</Button> : null}
        </div>
      </div>

      {error ? <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p> : null}
      {loading && !r ? <div className="space-y-3"><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-60 rounded-2xl" /></div> : null}

      {r && data ? (
        <div className={cn("space-y-5 transition-opacity", loading && "opacity-60")}>
          {data.registrationType === "COMPOSITION" ? <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">{t("composition")}</p> : null}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <Stat label={t("turnover")} value={c(r.turnover)} sub={t("turnoverHint")} accent="bg-teal-500" />
            <Stat label={t("itcNet")} value={c(r.t7.j_net.igst + r.t7.j_net.cgst + r.t7.j_net.sgst + r.t7.j_net.cess)} sub={t("itcNetHint")} accent="bg-emerald-500" />
            <Stat label={t("taxPayable")} value={c(r.t9.reduce((s, h) => s + h.payable, 0))} sub={t("taxPayableHint", { cash: c(r.t9.reduce((s, h) => s + h.cash, 0)) })} accent="bg-indigo-500" />
            <Stat label={t("lateFee")} value={c(r.t19.lateFeeEstimate)} sub={t("lateFeeHint")} accent="bg-rose-500" />
          </div>

          <div className="space-y-2">
            {r.gstr9Optional ? <Note tone="info">{t("optional")}</Note> : null}
            {r.gstr9cRequired ? <Note tone="warn">{t("gstr9c")}</Note> : null}
            {Math.abs(r.reconciliation.difference) > 1 ? <Note tone="warn">{t("recon", { diff: n(r.reconciliation.difference) })}</Note> : null}
            {data.drift.length > 0 ? <Note tone="warn">{t("drift", { count: data.drift.length, periods: data.drift.map((d) => d.periodKey).join(", ") })}</Note> : null}
          </div>

          <Section title={t("t4")} hint={t("t4Hint")}>
            <TableShell minWidth={720}>
              <thead><tr><th className={th}>{t("nature")}</th>{head}</tr></thead>
              <tbody>
                {Object.entries(r.t4).map(([k, v]) => <tr key={k} className={cn("border-t border-border/50", ["h", "m", "n"].includes(k) && "bg-muted/30 font-semibold")}><td className={td}>4{k.toUpperCase()} · {t(`t4rows.${k}`)}</td>{rowCells(v)}</tr>)}
              </tbody>
            </TableShell>
          </Section>

          <Section title={t("t5")} hint={t("t5Hint")}>
            <TableShell minWidth={520}>
              <thead><tr><th className={th}>{t("nature")}</th><th className={thr}>{tc("g3.taxable")}</th></tr></thead>
              <tbody>{Object.entries(r.t5).filter(([k]) => k !== "n").map(([k, v]) => <tr key={k} className={cn("border-t border-border/50", k === "g" && "bg-muted/30 font-semibold")}><td className={td}>5{k.toUpperCase()} · {t(`t5rows.${k}`)}</td><td className={tdr}>{n(v.taxable)}</td></tr>)}</tbody>
            </TableShell>
          </Section>

          <Section title={t("t6")} hint={t("t6Hint")}>
            <TableShell minWidth={680}>
              <thead><tr><th className={th}>{t("nature")}</th>{headNoTaxable}</tr></thead>
              <tbody>{Object.entries(r.t6).filter(([k]) => k !== "m_total").map(([k, v]) => <tr key={k} className={cn("border-t border-border/50", ["i_subtotal", "a_per3b"].includes(k) && "bg-muted/30 font-semibold")}><td className={td}>{t(`t6rows.${k}`)}</td><td className={tdr} />{["igst", "cgst", "sgst", "cess"].map((h) => <td key={h} className={tdr}>{n((v as Record<string, number>)[h])}</td>)}</tr>)}</tbody>
            </TableShell>
          </Section>

          <Section title={t("t7")} hint={t("t7Hint")}>
            <TableShell minWidth={680}>
              <thead><tr><th className={th}>{t("nature")}</th>{headNoTaxable}</tr></thead>
              <tbody>{Object.entries(r.t7).map(([k, v]) => <tr key={k} className={cn("border-t border-border/50", ["i_total", "j_net"].includes(k) && "bg-muted/30 font-semibold")}><td className={td}>{t(`t7rows.${k}`)}</td><td className={tdr} />{["igst", "cgst", "sgst", "cess"].map((h) => <td key={h} className={tdr}>{n((v as Record<string, number>)[h])}</td>)}</tr>)}</tbody>
            </TableShell>
          </Section>

          <Section title={t("t8")} hint={t("t8Hint")}>
            <TableShell minWidth={680}>
              <thead><tr><th className={th}>{t("nature")}</th>{headNoTaxable}</tr></thead>
              <tbody>
                {([["as2b", r.t8.as2b], ["asBooks", r.t8.asBooks], ["difference", r.t8.difference]] as const).map(([k, v]) => (
                  <tr key={k} className={cn("border-t border-border/50", k === "difference" && "bg-muted/30 font-semibold")}><td className={td}>{t(`t8rows.${k}`)}</td><td className={tdr} />{["igst", "cgst", "sgst", "cess"].map((h) => <td key={h} className={cn(tdr, k === "difference" && Math.abs((v as unknown as Record<string, number>)[h]) > 1 && "text-rose-600")}>{n((v as unknown as Record<string, number>)[h])}</td>)}</tr>
                ))}
              </tbody>
            </TableShell>
          </Section>

          <Section title={t("t9")} hint={t("t9Hint")}>
            <TableShell minWidth={560}>
              <thead><tr><th className={th}>{tc("g3.head")}</th><th className={thr}>{t("payable")}</th><th className={thr}>{t("paidCash")}</th><th className={thr}>{t("paidItc")}</th></tr></thead>
              <tbody>{r.t9.map((h) => <tr key={h.head} className="border-t border-border/50"><td className={cn(td, "font-medium")}>{h.head}</td><td className={tdr}>{n(h.payable)}</td><td className={tdr}>{n(h.cash)}</td><td className={tdr}>{n(h.itc)}</td></tr>)}</tbody>
            </TableShell>
          </Section>

          <ManualInputs key={`${fy}-${loading ? "l" : "r"}`} fy={fy} rows={data.manualRows} inputs={data.inputs} onSaved={reload} />

          {[{ k: "t17", rows: r.t17 }, { k: "t18", rows: r.t18 }].map((g) => (
            <Section key={g.k} title={t(g.k)} hint={t(`${g.k}Hint`)}>
              {g.rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("noHsn")}</p> : (
                <TableShell minWidth={720}>
                  <thead><tr><th className={th}>HSN/SAC</th><th className={thr}>{tc("g1.rate")}</th><th className={thr}>{tc("g3.taxable")}</th><th className={thr}>IGST</th><th className={thr}>CGST</th><th className={thr}>SGST</th><th className={thr}>{tc("cess")}</th></tr></thead>
                  <tbody>{g.rows.map((h) => <tr key={`${h.hsn}-${h.rate}`} className="border-t border-border/50"><td className={cn(td, "font-mono")}>{h.hsn}</td><td className={tdr}>{h.rate}%</td><td className={tdr}>{n(h.taxable)}</td><td className={tdr}>{n(h.igst)}</td><td className={tdr}>{n(h.cgst)}</td><td className={tdr}>{n(h.sgst)}</td><td className={tdr}>{n(h.cess)}</td></tr>)}</tbody>
                </TableShell>
              )}
            </Section>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Note({ tone, children }: { tone: "info" | "warn"; children: React.ReactNode }) {
  const Icon = tone === "warn" ? AlertTriangle : Info;
  return (
    <p className={cn("flex items-start gap-2.5 rounded-xl px-4 py-2.5 text-xs", tone === "warn" ? "bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200" : "bg-sky-50 text-sky-900 dark:bg-sky-500/10 dark:text-sky-200")}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function ManualInputs({ fy, rows, inputs, onSaved }: { fy: string; rows: Manual[]; inputs: Resp["inputs"]; onSaved: () => void }) {
  const t = useTranslations("GstHub.g9");
  const tc = useTranslations("GstHub");
  const [values, setValues] = useState<Record<string, Record<string, string>>>(() => {
    const init: Record<string, Record<string, string>> = {};
    for (const row of rows) {
      const cur = inputs[row.key] as Partial<TaxRow> | undefined;
      init[row.key] = Object.fromEntries(HEADS.map((h) => [h, cur && cur[h] ? String(cur[h]) : ""]));
    }
    init.__meta = { lateFeePaid: inputs.lateFeePaid ? String(inputs.lateFeePaid) : "", interestPaid: inputs.interestPaid ? String(inputs.interestPaid) : "" };
    return init;
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const out: Record<string, Record<string, number>> = {};
      for (const row of rows) {
        const entry: Record<string, number> = {};
        for (const h of HEADS) {
          const v = Number(values[row.key]?.[h]);
          if (Number.isFinite(v) && v !== 0) entry[h] = v;
        }
        if (Object.keys(entry).length) out[row.key] = entry;
      }
      const res = await fetch("/api/gst/gstr9", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fy, rows: out, lateFeePaid: Number(values.__meta.lateFeePaid) || 0, interestPaid: Number(values.__meta.interestPaid) || 0 }),
      });
      if (!res.ok) throw new Error(await readError(res, t("saveFailed")));
      toast.success(t("saved"));
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("saveFailed"));
    } finally {
      setBusy(false);
    }
  }
  const set = (k: string, h: string, v: string) => setValues((p) => ({ ...p, [k]: { ...p[k], [h]: v } }));
  const tables = Array.from(new Set(rows.map((r) => r.table)));

  return (
    <Section title={t("manual")} hint={t("manualHint")} right={<Button size="sm" onClick={save} disabled={busy}>{busy ? <Loader2 className="me-2 size-4 animate-spin" aria-hidden /> : null}{t("save")}</Button>}>
      <div className="space-y-5">
        {tables.map((tbl) => (
          <div key={tbl}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("tableN", { n: tbl })}</p>
            <TableShell minWidth={820}>
              <thead><tr><th className={th}>{t("nature")}</th><th className={thr}>{tc("g3.taxable")}</th><th className={thr}>IGST</th><th className={thr}>CGST</th><th className={thr}>SGST</th><th className={thr}>{tc("cess")}</th></tr></thead>
              <tbody>
                {rows.filter((r) => r.table === tbl).map((row) => (
                  <tr key={row.key} className="border-t border-border/50">
                    <td className={cn(td, "max-w-[280px]")}>{t(`manualRows.${row.key}`)}</td>
                    {HEADS.map((h) => (
                      <td key={h} className="px-2 py-1.5"><Input aria-label={`${t(`manualRows.${row.key}`)} ${h}`} inputMode="decimal" value={values[row.key]?.[h] ?? ""} onChange={(e) => set(row.key, h, e.target.value)} className="h-8 w-24 text-end tabular-nums sm:w-28" placeholder="0" /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </TableShell>
          </div>
        ))}
        <div className="grid max-w-md grid-cols-2 gap-3">
          <label className="space-y-1.5 text-xs font-medium">{t("lateFeePaid")}<Input inputMode="decimal" value={values.__meta.lateFeePaid} onChange={(e) => set("__meta", "lateFeePaid", e.target.value)} placeholder="0" /></label>
          <label className="space-y-1.5 text-xs font-medium">{t("interestPaid")}<Input inputMode="decimal" value={values.__meta.interestPaid} onChange={(e) => set("__meta", "interestPaid", e.target.value)} placeholder="0" /></label>
        </div>
      </div>
    </Section>
  );
}
