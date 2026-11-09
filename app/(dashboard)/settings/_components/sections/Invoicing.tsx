"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Field, Panel, ReadOnlyBanner, SaveBar, useSectionForm } from "../form-kit";
import type { SectionProps } from "./types";

const TERMS = [0, 7, 15, 30, 45, 60];

function fyLabel(now = new Date()) {
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${String(y).slice(2)}-${String((y + 1) % 100).padStart(2, "0")}`;
}

export function InvoicingSection({ data, canManage }: SectionProps) {
  const t = useTranslations("SettingsHub.invoicing");
  const form = useSectionForm({
    section: "invoicing",
    initial: { invoiceTheme: data.invoiceTheme === "DESIGN_2" ? "DESIGN_2" : "DESIGN_1", invoicePrefix: data.invoicePrefix ?? "INV", invoiceTermsDays: String(data.invoiceTermsDays ?? 7) },
    toPayload: (v) => ({ ...v, invoiceTermsDays: Number(v.invoiceTermsDays) }),
  });
  const { values: v, set, errors } = form;
  const prefix = (v.invoicePrefix || "INV").toUpperCase();
  return (
    <div className="space-y-5">
      {!canManage ? <ReadOnlyBanner /> : null}
      <Panel title={t("theme")} description={t("themeHint")}>
        <div role="radiogroup" aria-label={t("theme")} className="grid gap-3 sm:grid-cols-2">
          {(["DESIGN_1", "DESIGN_2"] as const).map((d) => (
            <button key={d} type="button" role="radio" aria-checked={v.invoiceTheme === d} disabled={!canManage} onClick={() => set("invoiceTheme", d)}
              className={cn("relative rounded-xl border p-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60", v.invoiceTheme === d ? "border-indigo-500 bg-indigo-50/60 dark:bg-indigo-500/10" : "border-border/70 hover:border-indigo-300")}>
              <div className="mb-3 h-24 overflow-hidden rounded-lg border border-border/60 bg-background p-2" aria-hidden>
                {d === "DESIGN_1" ? (
                  <div className="space-y-1.5"><div className="flex justify-between"><div className="h-2 w-16 rounded bg-zinc-300" /><div className="h-2 w-8 rounded bg-zinc-200" /></div><div className="h-1.5 w-full rounded bg-zinc-200" /><div className="h-1.5 w-4/5 rounded bg-zinc-200" /><div className="h-1.5 w-3/5 rounded bg-zinc-200" /></div>
                ) : (
                  <div className="space-y-1.5"><div className="-m-2 mb-1 flex h-7 items-center justify-between bg-zinc-800 px-2"><div className="h-2 w-16 rounded bg-zinc-500" /><div className="h-2 w-8 rounded bg-zinc-600" /></div><div className="h-1.5 w-full rounded bg-zinc-200" /><div className="h-1.5 w-4/5 rounded bg-zinc-200" /></div>
                )}
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
        <p className="mt-3 text-xs text-muted-foreground">{t("termsNote")}</p>
      </Panel>
      <SaveBar {...form} onSave={form.save} onReset={form.reset} disabled={!canManage} />
    </div>
  );
}
