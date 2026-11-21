"use client";

import { useFormatter, useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { INVOICE_DESIGN_IDS, isInvoiceDesignId, type InvoiceDesignId } from "@/lib/invoice-templates/catalog";
import { Field, Panel, ReadOnlyBanner, SaveBar, useSectionForm } from "../form-kit";
import type { SectionProps } from "./types";

const TERMS = [0, 7, 15, 30, 45, 60];

function fyLabel(now = new Date()) {
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${String(y).slice(2)}-${String((y + 1) % 100).padStart(2, "0")}`;
}

/** A tiny wireframe of each design for the picker (the full previews live on the compare page). */
function DesignWireframe({ id }: { id: InvoiceDesignId }) {
  if (id === "DESIGN_1") {
    return <div className="space-y-1.5"><div className="flex justify-between"><div className="h-2 w-16 rounded bg-zinc-300" /><div className="h-2 w-8 rounded bg-zinc-200" /></div><div className="h-1.5 w-full rounded bg-zinc-200" /><div className="h-1.5 w-4/5 rounded bg-zinc-200" /><div className="h-1.5 w-3/5 rounded bg-zinc-200" /></div>;
  }
  if (id === "DESIGN_2") {
    return <div className="space-y-1.5"><div className="-m-2 mb-1 flex h-7 items-center justify-between bg-zinc-800 px-2"><div className="h-2 w-16 rounded bg-zinc-500" /><div className="h-2 w-8 rounded bg-zinc-600" /></div><div className="h-1.5 w-full rounded bg-zinc-200" /><div className="h-1.5 w-4/5 rounded bg-zinc-200" /></div>;
  }
  if (id === "DESIGN_3") {
    return <div className="space-y-1.5"><div className="flex items-center justify-between"><div className="h-2 w-14 rounded bg-blue-900/70" /><div className="h-2.5 w-10 rounded bg-blue-800" /></div><div className="h-1 w-full rounded bg-blue-800" /><div className="grid grid-cols-2 gap-1.5"><div className="h-3 rounded bg-zinc-200" /><div className="h-3 rounded bg-zinc-200" /></div><div className="h-2 w-full rounded bg-blue-800" /><div className="h-1.5 w-full rounded bg-zinc-200" /><div className="flex justify-between"><div className="h-2 w-12 rounded bg-blue-100" /><div className="h-2.5 w-10 rounded bg-blue-800" /></div></div>;
  }
  if (id === "DESIGN_4") {
    return <div className="space-y-1.5"><div className="flex gap-1.5"><div className="h-9 flex-1 rounded-sm bg-teal-700 p-1"><div className="h-1.5 w-8 rounded bg-white/70" /><div className="mt-1 h-3 w-14 rounded bg-white" /></div><div className="grid size-9 grid-cols-4 gap-px rounded-sm border border-teal-700 p-0.5">{Array.from({ length: 16 }, (_, i) => <div key={i} className={i % 3 === 0 || i % 5 === 0 ? "bg-zinc-800" : "bg-transparent"} />)}</div></div><div className="h-1.5 w-full rounded bg-zinc-200" /><div className="h-1.5 w-3/4 rounded bg-zinc-200" /></div>;
  }
  return <div className="flex gap-2"><div className="w-1 rounded bg-indigo-600" /><div className="flex-1 space-y-1.5"><div className="h-3 w-12 rounded bg-zinc-800" /><div className="h-4 w-full rounded bg-indigo-100" /><div className="h-2 w-full rounded bg-indigo-200" /><div className="h-1.5 w-full rounded bg-zinc-200" /><div className="h-2 w-full rounded bg-indigo-200" /></div></div>;
}

export function InvoicingSection({ data, canManage }: SectionProps) {
  const t = useTranslations("SettingsHub.invoicing");
  const form = useSectionForm({
    section: "invoicing",
    initial: { invoiceTheme: isInvoiceDesignId(data.invoiceTheme) ? data.invoiceTheme : "DESIGN_1", invoicePrefix: data.invoicePrefix ?? "INV", invoiceTermsDays: String(data.invoiceTermsDays ?? 7) },
    toPayload: (v) => ({ ...v, invoiceTermsDays: Number(v.invoiceTermsDays) }),
  });
  const { values: v, set, errors } = form;
  const format = useFormatter();
  const prefix = (v.invoicePrefix || "INV").toUpperCase();
  const terms = Number(v.invoiceTermsDays) || 0;
  const today = new Date();
  const due = new Date(today.getTime() + terms * 86_400_000);
  return (
    <div className="space-y-5">
      {!canManage ? <ReadOnlyBanner /> : null}
      <Panel title={t("theme")} description={t("themeHint")}>
        <div role="radiogroup" aria-label={t("theme")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {INVOICE_DESIGN_IDS.map((d) => (
            <button key={d} type="button" role="radio" aria-checked={v.invoiceTheme === d} disabled={!canManage} onClick={() => set("invoiceTheme", d)}
              className={cn("relative rounded-xl border p-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60", v.invoiceTheme === d ? "border-indigo-500 bg-indigo-50/60 dark:bg-indigo-500/10" : "border-border/70 hover:border-indigo-300")}>
              <div className="mb-3 h-24 overflow-hidden rounded-lg border border-border/60 bg-background p-2" aria-hidden>
                <DesignWireframe id={d} />
              </div>
              <p className="text-sm font-semibold">{t(`design.${d}`)}</p>
              <p className="text-xs text-muted-foreground">{t(`designHint.${d}`)}</p>
              {v.invoiceTheme === d ? <CheckCircle2 className="absolute end-3 top-3 size-5 text-indigo-600" aria-hidden /> : null}
            </button>
          ))}
        </div>
      </Panel>
      <Panel title={t("numbering")} description={t("numberingHint")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("prefix")} error={errors.invoicePrefix} hint={t("prefixHint")}>{(p) => <Input {...p} value={v.invoicePrefix} maxLength={10} onChange={(e) => set("invoicePrefix", e.target.value.toUpperCase())} disabled={!canManage} className="font-mono" />}</Field>
          <div className="space-y-1.5"><p className="text-sm font-medium">{t("preview")}</p><p className="flex h-10 items-center rounded-md border border-dashed border-border bg-muted/30 px-3 font-mono text-sm">{prefix}/{fyLabel()}/001</p></div>
        </div>
      </Panel>
      <Panel title={t("terms")} description={t("termsHint")}>
        <Field label={t("termsLabel")} error={errors.invoiceTermsDays}>
          {(p) => (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("termsLabel")}>
                {TERMS.map((d) => <button key={d} type="button" disabled={!canManage} aria-pressed={v.invoiceTermsDays === String(d)} onClick={() => set("invoiceTermsDays", String(d))} className={cn("rounded-full border px-3 py-1 text-xs font-medium tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", v.invoiceTermsDays === String(d) ? "border-indigo-500 bg-indigo-600 text-white" : "border-border/70 hover:border-indigo-300")}>{d === 0 ? t("dueOnReceipt") : t("days", { count: d })}</button>)}
              </div>
              <Input {...p} inputMode="numeric" value={v.invoiceTermsDays} maxLength={3} onChange={(e) => set("invoiceTermsDays", e.target.value.replace(/\D/g, ""))} disabled={!canManage} className="max-w-32" />
            </div>
          )}
        </Field>
        <p className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-sm">{t("dueExample", { date: format.dateTime(today, { dateStyle: "medium" }), due: format.dateTime(due, { dateStyle: "medium" }) })}</p>
        <p className="mt-3 text-xs text-muted-foreground">{t("termsNote")}</p>
      </Panel>
      <SaveBar {...form} onSave={form.save} onReset={form.reset} disabled={!canManage} />
    </div>
  );
}
