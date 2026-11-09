"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUpRight, CheckCircle2, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { validateGstin } from "@/lib/gst/gstin";
import { stateName } from "@/lib/gst/states";
import { validateUdyam } from "@/lib/msme/udyam";
import { Field, Panel, ReadOnlyBanner, SaveBar, useSectionForm } from "../form-kit";
import type { SectionProps } from "./types";

const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** Older rows hold the rate as a percent (18), newer ones as a fraction (0.18); the invoice resolver accepts both, so this does too. */
function rateToPercent(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return "";
  return String(rate > 1 ? Math.round(rate * 100) / 100 : Math.round(rate * 10000) / 100);
}

type GstSummary = { registrationType: string; filingFrequency: string; stateCode: string | null };

export function TaxSection({ data, canManage }: SectionProps) {
  const t = useTranslations("SettingsHub.tax");
  const india = (data.countryCode ?? "IN") === "IN";
  const [gst, setGst] = useState<GstSummary | null>(null);
  useEffect(() => {
    if (!india) return;
    let off = false;
    fetch("/api/gst/settings").then((r) => (r.ok ? r.json() : null)).then((d) => { if (!off && d) setGst(d as GstSummary); }).catch(() => undefined);
    return () => { off = true; };
  }, [india]);

  const form = useSectionForm({
    section: "tax",
    prefill: "tax",
    initial: { panNumber: data.panNumber ?? "", gstin: data.gstin ?? "", udyamNumber: data.udyamNumber ?? "", defaultSacCode: data.defaultSacCode ?? "998313", defaultTaxRatePercent: rateToPercent(data.defaultTaxRate), taxLabel: data.taxLabel ?? "", taxIdLabel: data.taxIdLabel ?? "" },
    toPayload: (v) => ({ ...v, defaultTaxRatePercent: v.defaultTaxRatePercent.trim() === "" ? null : Number(v.defaultTaxRatePercent) }),
  });
  const { values: v, set, errors } = form;
  const gstinCheck = v.gstin.trim().length === 15 ? validateGstin(v.gstin.trim().toUpperCase()) : null;
  const udyamCheck = v.udyamNumber.trim() ? validateUdyam(v.udyamNumber) : null;
  const panBad = india && v.panNumber.trim() !== "" && !PAN.test(v.panNumber.trim().toUpperCase());

  return (
    <div className="space-y-5">
      {!canManage ? <ReadOnlyBanner /> : null}
      <Panel title={t("ids")} description={india ? t("idsHintIn") : t("idsHint")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={india ? t("pan") : t("taxId")} error={errors.panNumber ?? (panBad ? t("panBad") : null)} hint={india ? t("panHint") : undefined}>
            {(p) => <Input {...p} value={v.panNumber} maxLength={20} spellCheck={false} onChange={(e) => set("panNumber", e.target.value.toUpperCase())} disabled={!canManage} className="font-mono tracking-wider" />}
          </Field>
          {india ? (
            <>
              <Field label={t("gstin")} error={errors.gstin ?? (gstinCheck && !gstinCheck.valid ? t("gstinBad") : null)} hint={gstinCheck ? undefined : t("gstinHint")}>
                {(p) => (
                  <div className="relative">
                    <Input {...p} value={v.gstin} maxLength={15} spellCheck={false} onChange={(e) => set("gstin", e.target.value.toUpperCase())} disabled={!canManage} className="pe-9 font-mono tracking-wider" aria-invalid={p["aria-invalid"] || (gstinCheck ? !gstinCheck.valid : undefined)} />
                    {gstinCheck ? (gstinCheck.valid ? <CheckCircle2 className="absolute end-3 top-1/2 size-4 -translate-y-1/2 text-emerald-500" aria-hidden /> : <XCircle className="absolute end-3 top-1/2 size-4 -translate-y-1/2 text-rose-500" aria-hidden />) : null}
                  </div>
                )}
              </Field>
              <Field className="sm:col-span-2" label={t("udyam")} error={errors.udyamNumber ?? (udyamCheck && !udyamCheck.valid ? t("udyamBad") : null)} hint={udyamCheck?.valid ? t("udyamOk") : t("udyamHint")}>
                {(p) => <Input {...p} value={v.udyamNumber} maxLength={24} spellCheck={false} placeholder="UDYAM-MH-12-0000001" onChange={(e) => set("udyamNumber", e.target.value.toUpperCase())} disabled={!canManage} className="font-mono tracking-wider" />}
              </Field>
            </>
          ) : (
            <>
              <Field label={t("taxLabel")} hint={t("taxLabelHint")}>{(p) => <Input {...p} value={v.taxLabel} maxLength={20} onChange={(e) => set("taxLabel", e.target.value)} disabled={!canManage} />}</Field>
              <Field label={t("taxIdLabel")} hint={t("taxIdLabelHint")}>{(p) => <Input {...p} value={v.taxIdLabel} maxLength={20} onChange={(e) => set("taxIdLabel", e.target.value)} disabled={!canManage} />}</Field>
            </>
          )}
        </div>
        {gstinCheck?.valid ? <p className="mt-3 text-xs text-muted-foreground">{t("gstinState", { state: stateName(gstinCheck.stateCode) })}</p> : null}
      </Panel>
      <Panel title={t("defaults")} description={t("defaultsHint")}>
        <div className="grid gap-4 sm:grid-cols-2">
          {india ? <Field label={t("sac")} hint={t("sacHint")} error={errors.defaultSacCode}>{(p) => <Input {...p} inputMode="numeric" value={v.defaultSacCode} maxLength={8} onChange={(e) => set("defaultSacCode", e.target.value.replace(/\D/g, ""))} disabled={!canManage} className="font-mono" />}</Field> : null}
          <Field label={t("rate")} hint={t("rateHint")} error={errors.defaultTaxRatePercent}>{(p) => <Input {...p} inputMode="decimal" value={v.defaultTaxRatePercent} placeholder="18" onChange={(e) => set("defaultTaxRatePercent", e.target.value.replace(/[^\d.]/g, ""))} disabled={!canManage} className="max-w-40" />}</Field>
        </div>
      </Panel>
      {india ? (
        <Panel title={t("registration")} description={t("registrationHint")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{gst ? t("registrationLine", { type: t(`regType.${gst.registrationType}`), freq: t(`freq.${gst.filingFrequency}`) }) : t("registrationLoading")}</p>
            <div className="flex flex-wrap gap-3 text-sm font-medium">
              <Link href="/tax?tab=setup" className="inline-flex items-center gap-1 text-indigo-600 hover:underline dark:text-indigo-300">{t("gstSetup")}<ArrowUpRight className="size-3.5 rtl:-scale-x-100" aria-hidden /></Link>
              <Link href="/ca-portal?tab=setup" className="inline-flex items-center gap-1 text-indigo-600 hover:underline dark:text-indigo-300">{t("caSetup")}<ArrowUpRight className="size-3.5 rtl:-scale-x-100" aria-hidden /></Link>
            </div>
          </div>
        </Panel>
      ) : null}
      <SaveBar {...form} onSave={form.save} onReset={form.reset} disabled={!canManage} />
    </div>
  );
}
