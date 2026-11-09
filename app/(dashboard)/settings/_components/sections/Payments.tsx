"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckCircle2, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Field, Panel, ReadOnlyBanner, SaveBar, SecretField, useSectionForm } from "../form-kit";
import type { SectionProps } from "./types";

export function PaymentsSection({ data, canManage, reload }: SectionProps) {
  const t = useTranslations("SettingsHub.payments");
  const india = (data.countryCode ?? "IN") === "IN";
  const entitled = !!data.billingEntitlements?.canUsePaymentGateways;
  const locked = !canManage || !entitled;
  const [tab, setTab] = useState<"RAZORPAY" | "STRIPE">((data.defaultGateway as "RAZORPAY" | "STRIPE") || (india ? "RAZORPAY" : "STRIPE"));
  const form = useSectionForm({
    section: "payments",
    initial: { razorpayKeyId: data.razorpayKeyId ?? "", stripePublishableKey: data.stripePublishableKey ?? "", defaultGateway: (data.defaultGateway as "RAZORPAY" | "STRIPE") || (india ? "RAZORPAY" : "STRIPE") },
  });
  const { values: v, set, errors } = form;
  const ready = { RAZORPAY: !!data.razorpayKeyId && !!data.hasRazorpayKeySecret, STRIPE: !!data.stripePublishableKey && !!data.hasStripeSecretKey };
  return (
    <div className="space-y-5">
      {!canManage ? <ReadOnlyBanner /> : null}
      {!entitled ? (
        <p role="status" className="flex flex-wrap items-center gap-2 rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-900 dark:bg-indigo-500/10 dark:text-indigo-200"><Lock className="size-4 shrink-0" aria-hidden />{t("paid")}<Link href="/settings/billing" className="font-semibold underline">{t("upgrade")}</Link></p>
      ) : null}
      <Panel title={t("title")} description={t("hint")}>
        <div role="tablist" aria-label={t("title")} className="mb-5 inline-flex rounded-xl border border-border/70 p-1">
          {(["RAZORPAY", "STRIPE"] as const).map((g) => (
            <button key={g} type="button" role="tab" aria-selected={tab === g} onClick={() => setTab(g)} className={cn("flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", tab === g ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200" : "text-muted-foreground")}>
              {t(`gateway.${g}`)}{ready[g] ? <CheckCircle2 className="size-3.5 text-emerald-600" aria-label={t("ready")} /> : null}
            </button>
          ))}
        </div>
        {tab === "RAZORPAY" ? (
          <div className="grid gap-4" role="tabpanel">
            <Field label={t("razorpayKeyId")} error={errors.razorpayKeyId} hint={t("razorpayHint")}>{(p) => <Input {...p} value={v.razorpayKeyId} spellCheck={false} placeholder="rzp_live_…" onChange={(e) => set("razorpayKeyId", e.target.value.trim())} disabled={locked} className="font-mono" />}</Field>
            <SecretField secretKey="razorpayKeySecret" label={t("razorpaySecret")} configured={!!data.hasRazorpayKeySecret} disabled={locked} onChanged={reload} />
          </div>
        ) : (
          <div className="grid gap-4" role="tabpanel">
            <Field label={t("stripeKey")} error={errors.stripePublishableKey} hint={t("stripeHint")}>{(p) => <Input {...p} value={v.stripePublishableKey} spellCheck={false} placeholder="pk_live_…" onChange={(e) => set("stripePublishableKey", e.target.value.trim())} disabled={locked} className="font-mono" />}</Field>
            <SecretField secretKey="stripeSecretKey" label={t("stripeSecret")} configured={!!data.hasStripeSecretKey} disabled={locked} onChanged={reload} />
          </div>
        )}
      </Panel>
      <Panel title={t("default")} description={t("defaultHint")}>
        <div role="radiogroup" aria-label={t("default")} className="flex flex-wrap gap-2">
          {(["RAZORPAY", "STRIPE"] as const).map((g) => (
            <Button key={g} type="button" role="radio" aria-checked={v.defaultGateway === g} variant={v.defaultGateway === g ? "default" : "outline"} disabled={locked} onClick={() => set("defaultGateway", g)}>{t(`gateway.${g}`)}</Button>
          ))}
        </div>
      </Panel>
      <SaveBar {...form} onSave={form.save} onReset={form.reset} disabled={locked} />
    </div>
  );
}
