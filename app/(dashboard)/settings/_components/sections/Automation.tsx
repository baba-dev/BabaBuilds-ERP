"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpRight, CheckCircle2, CircleDashed } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { SaveBar, Panel, ReadOnlyBanner, useSectionForm } from "../form-kit";
import type { SectionProps } from "./types";

function Status({ on, label }: { on: boolean; label: string }) {
  return <span className={`inline-flex items-center gap-1 text-xs font-medium ${on ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`}>{on ? <CheckCircle2 className="size-3.5" aria-hidden /> : <CircleDashed className="size-3.5" aria-hidden />}{label}</span>;
}

/** Reminders and automations in one place: the ones with a switch here, and where the others are controlled. */
export function AutomationSection({ data, canManage }: SectionProps) {
  const t = useTranslations("SettingsHub.automation");
  const india = (data.countryCode ?? "IN") === "IN";
  const [modules, setModules] = useState<string[] | null>(null);
  useEffect(() => {
    let off = false;
    fetch("/api/workspace/modules").then((r) => (r.ok ? r.json() : null)).then((d: { modules?: string[] } | null) => { if (!off) setModules(d?.modules ?? []); }).catch(() => { if (!off) setModules([]); });
    return () => { off = true; };
  }, []);
  const form = useSectionForm({ section: "automation", initial: { gstRemindersEnabled: data.gstRemindersEnabled ?? true } });
  const mailReady = !!data.smtpHost && !!data.hasSmtpPassword;
  const rows: Array<{ key: string; on: boolean; href: string }> = [
    { key: "mail", on: mailReady, href: "/settings?section=email" },
    { key: "collections", on: !!modules?.includes("AR_COLLECTIONS"), href: modules?.includes("AR_COLLECTIONS") ? "/ar-collections" : "/settings?section=modules" },
    { key: "retainers", on: true, href: "/retainers" },
    { key: "cashflow", on: !!modules?.includes("CASH_FLOW"), href: modules?.includes("CASH_FLOW") ? "/cash-flow" : "/settings?section=modules" },
  ];
  return (
    <div className="space-y-5">
      {!canManage ? <ReadOnlyBanner /> : null}
      {india ? (
        <Panel title={t("gstTitle")} description={t("gstHint")}>
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-sm font-semibold" id="gst-rem-label">{t("gstReminders")}</p><p className="text-xs text-muted-foreground">{t("gstRemindersHint")}</p></div>
            <Switch checked={form.values.gstRemindersEnabled} onCheckedChange={(c) => form.set("gstRemindersEnabled", c)} disabled={!canManage} aria-labelledby="gst-rem-label" />
          </div>
        </Panel>
      ) : null}
      <Panel title={t("others")} description={t("othersHint")}>
        <ul className="divide-y divide-border/60">
          {rows.map((r) => (
            <li key={r.key} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0"><p className="text-sm font-medium">{t(`row.${r.key}.title`)}</p><p className="text-xs text-muted-foreground">{t(`row.${r.key}.body`)}</p></div>
              <div className="flex items-center gap-4"><Status on={r.on} label={r.on ? t("active") : t("off")} /><Link href={r.href} className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-300">{t("manage")}<ArrowUpRight className="size-3.5 rtl:-scale-x-100" aria-hidden /></Link></div>
            </li>
          ))}
        </ul>
      </Panel>
      <SaveBar {...form} onSave={form.save} onReset={form.reset} disabled={!canManage || !india} />
    </div>
  );
}
