"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from "next/link";
import { pendingPrefillSections, readAiPrefill } from "@/lib/settings/ai-prefill";
import { Field, Panel, ReadOnlyBanner, SaveBar, useSectionForm } from "../form-kit";
import { ImageField } from "../ImageField";
import type { SectionProps } from "./types";

const LANGUAGES: Array<{ code: string; name: string }> = [
  { code: "en-IN", name: "English (India)" },
  { code: "es", name: "Español" },
  { code: "hi", name: "हिन्दी" },
  { code: "ar", name: "العربية" },
];

export function BusinessSection({ data, canManage, reload }: SectionProps) {
  const t = useTranslations("SettingsHub.business");
  const form = useSectionForm({
    section: "business",
    prefill: "business",
    initial: { companyName: data.companyName ?? "", proprietorName: data.proprietorName ?? "", address: data.address ?? "", email: data.email ?? "", phone: data.phone ?? "", website: data.website ?? "", locale: data.locale ?? "en-IN" },
    onSaved: (changed) => { if (changed.includes("locale")) window.location.reload(); },
  });
  const { values: v, set, errors } = form;
  const others = pendingPrefillSections(readAiPrefill(), "business");
  return (
    <div className="space-y-5">
      {!canManage ? <ReadOnlyBanner /> : null}
      {others.length ? <p role="status" className="rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-900 dark:bg-indigo-500/10 dark:text-indigo-200">{t("aiOthers")} {others.map((o) => <Link key={o} href={`/settings?section=${o}`} className="me-3 font-semibold underline">{t(`aiLink.${o}`)}</Link>)}</p> : null}
      <Panel title={t("identity")} description={t("identityHint")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("companyName")} required error={errors.companyName}>{(p) => <Input {...p} value={v.companyName} maxLength={120} onChange={(e) => set("companyName", e.target.value)} disabled={!canManage} autoComplete="organization" />}</Field>
          <Field label={t("proprietorName")} required error={errors.proprietorName}>{(p) => <Input {...p} value={v.proprietorName} maxLength={120} onChange={(e) => set("proprietorName", e.target.value)} disabled={!canManage} autoComplete="name" />}</Field>
          <Field className="sm:col-span-2" label={t("address")} required hint={t("addressHint")} error={errors.address}>{(p) => <Textarea {...p} rows={2} value={v.address} maxLength={400} onChange={(e) => set("address", e.target.value)} disabled={!canManage} autoComplete="street-address" />}</Field>
          <Field label={t("email")} required hint={t("emailHint")} error={errors.email}>{(p) => <Input {...p} type="email" value={v.email} onChange={(e) => set("email", e.target.value)} disabled={!canManage} autoComplete="email" />}</Field>
          <Field label={t("phone")} error={errors.phone}>{(p) => <Input {...p} type="tel" value={v.phone} onChange={(e) => set("phone", e.target.value)} disabled={!canManage} autoComplete="tel" />}</Field>
          <Field className="sm:col-span-2" label={t("website")} error={errors.website}>{(p) => <Input {...p} type="url" inputMode="url" value={v.website} placeholder="https://" onChange={(e) => set("website", e.target.value)} disabled={!canManage} />}</Field>
        </div>
      </Panel>
      <Panel title={t("language")} description={t("languageHint")}>
        <Field label={t("languageLabel")}>
          {(p) => (
            <Select value={v.locale} onValueChange={(x) => set("locale", x)} disabled={!canManage}>
              <SelectTrigger {...p} className="w-full sm:w-72"><SelectValue /></SelectTrigger>
              <SelectContent>{LANGUAGES.map((l) => <SelectItem key={l.code} value={l.code}>{l.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </Field>
      </Panel>
      <Panel title={t("branding")} description={t("brandingHint")}>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2"><p className="text-sm font-medium">{t("logo")}</p><ImageField kind="logo" url={data.logoUrl} disabled={!canManage} onChanged={reload} /></div>
          <div className="space-y-2"><p className="text-sm font-medium">{t("signature")}</p><ImageField kind="signature" url={data.signatureUrl} disabled={!canManage} onChanged={reload} /></div>
        </div>
      </Panel>
      <SaveBar {...form} onSave={form.save} onReset={form.reset} disabled={!canManage} />
    </div>
  );
}
