"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, Panel, ReadOnlyBanner, SaveBar, SecretField, useSectionForm } from "../form-kit";
import type { SectionProps } from "./types";

const PRESETS = [
  { key: "gmail", host: "smtp.gmail.com", port: "587" },
  { key: "outlook", host: "smtp.office365.com", port: "587" },
  { key: "zoho", host: "smtp.zoho.in", port: "587" },
];

export function EmailSection({ data, canManage, reload }: SectionProps) {
  const t = useTranslations("SettingsHub.email");
  const [testing, setTesting] = useState(false);
  const form = useSectionForm({
    section: "email",
    initial: { smtpHost: data.smtpHost ?? "", smtpPort: data.smtpPort ? String(data.smtpPort) : "", smtpUser: data.smtpUser ?? "", smtpFromEmail: data.smtpFromEmail ?? "" },
    toPayload: (v) => ({ ...v, smtpPort: v.smtpPort.trim() ? Number(v.smtpPort) : null }),
  });
  const { values: v, set, errors } = form;

  async function sendTest() {
    setTesting(true);
    try {
      const res = await fetch("/api/settings/email-test", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string; sentTo?: string };
      if (res.ok) toast.success(t("testSent", { email: body.sentTo ?? "" }));
      else toast.error(body.error ?? t("testFailed"));
    } catch { toast.error(t("testFailed")); } finally { setTesting(false); }
  }

  return (
    <div className="space-y-5">
      {!canManage ? <ReadOnlyBanner /> : null}
      <Panel title={t("server")} description={t("serverHint")}>
        <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label={t("presets")}>
          <span className="text-xs text-muted-foreground">{t("presets")}</span>
          {PRESETS.map((p) => <Button key={p.key} type="button" size="sm" variant="outline" disabled={!canManage} onClick={() => { set("smtpHost", p.host); set("smtpPort", p.port); }}>{t(`preset.${p.key}`)}</Button>)}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field className="sm:col-span-2" label={t("host")} error={errors.smtpHost}>{(p) => <Input {...p} value={v.smtpHost} placeholder="smtp.example.com" spellCheck={false} onChange={(e) => set("smtpHost", e.target.value)} disabled={!canManage} />}</Field>
          <Field label={t("port")} error={errors.smtpPort} hint={t("portHint")}>{(p) => <Input {...p} inputMode="numeric" value={v.smtpPort} placeholder="587" maxLength={5} onChange={(e) => set("smtpPort", e.target.value.replace(/\D/g, ""))} disabled={!canManage} />}</Field>
          <Field className="sm:col-span-3" label={t("user")} error={errors.smtpUser}>{(p) => <Input {...p} value={v.smtpUser} autoComplete="off" onChange={(e) => set("smtpUser", e.target.value)} disabled={!canManage} />}</Field>
          <Field className="sm:col-span-3" label={t("from")} hint={t("fromHint")} error={errors.smtpFromEmail}>{(p) => <Input {...p} type="email" value={v.smtpFromEmail} onChange={(e) => set("smtpFromEmail", e.target.value)} disabled={!canManage} />}</Field>
        </div>
      </Panel>
      <Panel title={t("password")} description={t("passwordHint")}>
        <SecretField secretKey="smtpPassword" label={t("password")} configured={!!data.hasSmtpPassword} disabled={!canManage} onChanged={reload} />
      </Panel>
      <Panel title={t("test")} description={t("testHint")}>
        <Button type="button" variant="outline" disabled={!canManage || testing || !data.smtpHost || !data.hasSmtpPassword || form.dirty} onClick={() => void sendTest()}>{testing ? <Loader2 className="me-1.5 size-4 animate-spin" aria-hidden /> : <Send className="me-1.5 size-4" aria-hidden />}{t("sendTest")}</Button>
        {form.dirty ? <p className="mt-2 text-xs text-muted-foreground">{t("saveFirst")}</p> : null}
      </Panel>
      <SaveBar {...form} onSave={form.save} onReset={form.reset} disabled={!canManage} />
    </div>
  );
}
