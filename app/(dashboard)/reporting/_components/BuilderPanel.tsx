"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Spec } from "./shared";

const MEASURES = { invoices: ["revenue", "billed", "tax", "outstanding", "count"], expenses: ["spendNet", "spendGross", "itcClaimable", "unpaid", "count"] } as const;
const DIMS = { invoices: ["month", "quarter", "year", "client", "status", "currency", "taxRate"], expenses: ["month", "quarter", "year", "category", "vendor", "paymentStatus", "itcStatus"] } as const;
export const DEFAULT_SPEC: Spec = { dataset: "invoices", measures: ["revenue"], dimension: "month", filters: {}, limit: 100 };

/** Pick what to measure, how to group it and which records to include. Only choices from the menu are sent; the server checks them again. */
export function BuilderPanel({ spec, onRun, busy }: { spec: Spec; onRun: (s: Spec) => void; busy: boolean }) {
  const t = useTranslations("ReportingCenter");
  const [s, setS] = useState<Spec>(spec);
  const label = (k: string) => (t.has(`label.${k}`) ? t(`label.${k}`) : k);
  const ds = s.dataset;
  const toggle = (m: string) => setS((cur) => { const has = cur.measures.includes(m); const next = has ? cur.measures.filter((x) => x !== m) : [...cur.measures, m].slice(0, 4); return { ...cur, measures: next.length ? next : cur.measures }; });
  const setFilter = (patch: Partial<Spec["filters"]>) => setS((cur) => ({ ...cur, filters: { ...cur.filters, ...patch } }));

  return (
    <section className="space-y-4 rounded-3xl border bg-card p-5">
      <h2 className="text-sm font-semibold">{t("builder.title")}</h2>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <Label className="text-xs">{t("builder.dataset")}</Label>
          <Select value={ds} onValueChange={(v) => setS({ dataset: v as Spec["dataset"], measures: [MEASURES[v as Spec["dataset"]][0]], dimension: "month", filters: {}, limit: s.limit })}><SelectTrigger aria-label={t("builder.dataset")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="invoices">{t("builder.invoices")}</SelectItem><SelectItem value="expenses">{t("builder.expenses")}</SelectItem></SelectContent></Select>
        </div>
        <div>
          <Label className="text-xs">{t("builder.groupBy")}</Label>
          <Select value={s.dimension ?? "none"} onValueChange={(v) => setS({ ...s, dimension: v === "none" ? null : v })}><SelectTrigger aria-label={t("builder.groupBy")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{t("builder.noGrouping")}</SelectItem>{DIMS[ds].map((d) => <SelectItem key={d} value={d}>{label(d)}</SelectItem>)}</SelectContent></Select>
        </div>
        <div>
          <Label className="text-xs">{t("builder.rows")}</Label>
          <Select value={String(s.limit ?? 100)} onValueChange={(v) => setS({ ...s, limit: Number(v) })}><SelectTrigger aria-label={t("builder.rows")}><SelectValue /></SelectTrigger><SelectContent>{[25, 100, 250, 500].map((n) => <SelectItem key={n} value={String(n)}>{t("builder.topN", { count: n })}</SelectItem>)}</SelectContent></Select>
        </div>
      </div>
      <div>
        <Label className="text-xs">{t("builder.measures")}</Label>
        <div className="mt-1.5 flex flex-wrap gap-2">{MEASURES[ds].map((m) => <button key={m} type="button" onClick={() => toggle(m)} aria-pressed={s.measures.includes(m)} className={cn("rounded-full border px-3 py-1 text-sm transition-colors", s.measures.includes(m) ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:text-foreground")}>{label(m)}</button>)}</div>
        <p className="mt-1 text-[11px] text-muted-foreground">{t("builder.measuresHint")}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {ds === "invoices" ? <div><Label className="text-xs" htmlFor="bf-client">{t("builder.clientContains")}</Label><Input id="bf-client" value={s.filters.client ?? ""} maxLength={80} onChange={(e) => setFilter({ client: e.target.value || undefined })} /></div> : <div><Label className="text-xs" htmlFor="bf-vendor">{t("builder.vendorContains")}</Label><Input id="bf-vendor" value={s.filters.vendor ?? ""} maxLength={80} onChange={(e) => setFilter({ vendor: e.target.value || undefined })} /></div>}
        <div>
          <Label className="text-xs">{ds === "invoices" ? t("builder.invoiceStatus") : t("builder.paymentStatus")}</Label>
          <Select value={s.filters.status?.[0] ?? "any"} onValueChange={(v) => setFilter({ status: v === "any" ? undefined : [v] })}><SelectTrigger aria-label={t("builder.statusFilter")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="any">{t("builder.any")}</SelectItem>{(ds === "invoices" ? ["PENDING", "PARTIALLY_PAID", "PAID"] : ["PAID", "UNPAID"]).map((v) => <SelectItem key={v} value={v}>{t.has(`value.${v}`) ? t(`value.${v}`) : v}</SelectItem>)}</SelectContent></Select>
        </div>
        <div><Label className="text-xs" htmlFor="bf-min">{t("builder.minAmount")}</Label><Input id="bf-min" type="number" min="0" inputMode="decimal" value={s.filters.minAmount ?? ""} onChange={(e) => setFilter({ minAmount: e.target.value ? Number(e.target.value) : undefined })} /></div>
      </div>
      <Button onClick={() => onRun(s)} disabled={busy}>{t("builder.run")}</Button>
    </section>
  );
}
