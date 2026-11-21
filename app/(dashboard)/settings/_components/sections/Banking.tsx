"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, Panel, ReadOnlyBanner, SaveBar, useSectionForm } from "../form-kit";
import type { SectionProps } from "./types";
import { UpiQrCard } from "./UpiQrCard";
import { useSettingsData } from "../settings-data";

const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export function BankingSection({ data, canManage }: SectionProps) {
  const t = useTranslations("SettingsHub.banking");
  const india = (data.countryCode ?? "IN") === "IN";
  const masked = data.primaryBankAccount?.accountNumberDisplay || data.primaryBankAccount?.maskedAccountNumber || "";
  const [changing, setChanging] = useState(!masked);
  const { reload } = useSettingsData();
  const form = useSectionForm({
    section: "banking",
    prefill: "banking",
    initial: { bankName: data.bankName ?? "", accountName: data.accountName ?? "", accountNumber: "", ifscCode: data.ifscCode ?? "", routingLabel: data.routingLabel ?? "", upiVpa: data.upiVpa ?? "", upiPayeeName: data.upiPayeeName ?? "" },
    // The masked number is never posted back; a number is sent only when the user typed one.
    toPayload: (v) => ({ ...v, accountNumber: v.accountNumber.trim() || null, upiVpa: v.upiVpa.trim() || null, upiPayeeName: v.upiPayeeName.trim() || null }),
  });
  const { values: v, set, errors } = form;
  const ifscBad = india && v.ifscCode.trim() !== "" && !IFSC.test(v.ifscCode.trim().toUpperCase());
  const routingName = india ? t("ifsc") : (data.routingLabel || t("routing"));
  return (
    <div className="space-y-5">
      {!canManage ? <ReadOnlyBanner /> : null}
      <Panel title={t("title")} description={t("hint")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("bankName")} required error={errors.bankName}>{(p) => <Input {...p} value={v.bankName} maxLength={120} onChange={(e) => set("bankName", e.target.value)} disabled={!canManage} />}</Field>
          <Field label={t("holder")} required error={errors.accountName} hint={t("holderHint")}>{(p) => <Input {...p} value={v.accountName} maxLength={120} onChange={(e) => set("accountName", e.target.value)} disabled={!canManage} />}</Field>
          <Field label={t("number")} hint={masked && !changing ? t("numberHint") : t("numberNew")} error={errors.accountNumber}>
            {(p) => masked && !changing ? (
              <div className="flex gap-2"><span id={p.id} className="flex h-10 flex-1 items-center rounded-md border border-border bg-muted/30 px-3 font-mono text-sm tracking-widest">{masked}</span><Button type="button" variant="outline" disabled={!canManage} onClick={() => setChanging(true)}>{t("change")}</Button></div>
            ) : (
              <Input {...p} value={v.accountNumber} inputMode="numeric" autoComplete="off" maxLength={34} onChange={(e) => set("accountNumber", e.target.value)} disabled={!canManage} className="font-mono tracking-wider" />
            )}
          </Field>
          <Field label={routingName} error={errors.ifscCode ?? (ifscBad ? t("ifscBad") : null)} hint={india ? t("ifscHint") : undefined}>{(p) => <Input {...p} value={v.ifscCode} maxLength={20} spellCheck={false} onChange={(e) => set("ifscCode", e.target.value.toUpperCase())} disabled={!canManage} className="font-mono tracking-wider" />}</Field>
          {!india ? <Field label={t("routingLabel")} hint={t("routingLabelHint")}>{(p) => <Input {...p} value={v.routingLabel} maxLength={30} onChange={(e) => set("routingLabel", e.target.value)} disabled={!canManage} />}</Field> : null}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">{t("printed")}</p>
      </Panel>
      <UpiQrCard vpa={v.upiVpa} payee={v.upiPayeeName} onVpa={(x) => set("upiVpa", x)} onPayee={(x) => set("upiPayeeName", x)} errors={errors} qrs={data.paymentQrs ?? []} canManage={canManage} onChanged={reload} />
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{t("moreAccounts")}</p><Link href="/reconciliation" className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-300">{t("openReconciliation")}<ArrowUpRight className="size-3.5 rtl:-scale-x-100" aria-hidden /></Link></div>
      </Panel>
      <SaveBar {...form} onSave={form.save} onReset={form.reset} disabled={!canManage} />
    </div>
  );
}
