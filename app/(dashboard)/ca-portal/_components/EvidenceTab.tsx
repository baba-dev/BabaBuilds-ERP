"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, FileArchive, FileSpreadsheet, FolderOpen, Landmark, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section, downloadFile, formatDay, useJson, useMoney, type Overview } from "./ca-utils";

const REGISTERS = ["sales", "purchases", "tds", "calendar", "summary"] as const;
type Activity = { id: string; action: string; actor: string; at: string };

export function EvidenceTab({ data, fy }: { data: Overview; fy: string }) {
  const t = useTranslations("CaCompliance.evidence");
  const { locale } = useMoney();
  const activity = useJson<{ activity: Activity[] }>("/api/ca/activity");
  const [busy, setBusy] = useState<string | null>(null);
  const canExport = data.access.export;

  async function run(key: string, url: string, filename: string) {
    setBusy(key);
    const res = await downloadFile(url, filename);
    setBusy(null);
    if (!res.ok) toast.error(res.error); else toast.success(t("downloaded"));
    activity.reload();
  }
  const actionLabel = (a: string) => (t.has(`activity.actions.${a}`) ? t(`activity.actions.${a}`) : a.toLowerCase().replace(/_/g, " "));

  return (
    <div className="space-y-5">
      {!canExport ? <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">{t("noExport")}</p> : null}
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title={t("pack.title")} hint={t("pack.body")} className="lg:row-span-1">
          <ul className="mb-4 grid grid-cols-1 gap-1.5 text-sm text-muted-foreground sm:grid-cols-2">
            {(["registers", "calendar", "invoices", "index"] as const).map((k) => <li key={k} className="flex items-center gap-2"><Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden />{t(`pack.includes.${k}`)}</li>)}
          </ul>
          <Button disabled={!canExport || busy !== null} onClick={() => run("pack", `/api/ca/export/pack?fy=${encodeURIComponent(fy)}`, `CA_Evidence_FY${fy}.zip`)}>
            {busy === "pack" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileArchive className="size-4" aria-hidden />}{busy === "pack" ? t("pack.preparing") : t("pack.cta")}
          </Button>
        </Section>
        <Section title={t("registers.title")} hint={t("registers.hint")}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {REGISTERS.map((r) => (
              <Button key={r} variant="outline" size="sm" className="justify-start" disabled={!canExport || busy !== null} onClick={() => run(r, `/api/ca/export/registers?fy=${encodeURIComponent(fy)}&type=${r}`, `CA_${r}_FY${fy}.csv`)}>
                {busy === r ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileSpreadsheet className="size-4" aria-hidden />}{t(`registers.${r}`)}
              </Button>
            ))}
          </div>
        </Section>
        {data.access.gst ? (
          <Section title={t("gst.title")} hint={t("gst.body")}>
            <Button asChild variant="outline" size="sm"><Link href={`/tax?tab=tools&fy=${encodeURIComponent(fy)}`}><Landmark className="size-4" aria-hidden />{t("gst.cta")}</Link></Button>
          </Section>
        ) : null}
        <Section title={t("vault.title")} hint={t("vault.body")}>
          <Button asChild variant="outline" size="sm"><Link href="/documents"><FolderOpen className="size-4" aria-hidden />{t("vault.cta")}</Link></Button>
        </Section>
      </div>

      <Section title={t("activity.title")} hint={t("activity.hint")}>
        {activity.data && activity.data.activity.length === 0 ? <p className="text-sm text-muted-foreground">{t("activity.empty")}</p> : null}
        <ul className="divide-y divide-border/60">
          {(activity.data?.activity ?? []).slice(0, 20).map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="min-w-0"><span className="font-medium">{a.actor}</span> <span className="text-muted-foreground">{actionLabel(a.action)}</span></span>
              <span className="text-xs tabular-nums text-muted-foreground">{formatDay(a.at, locale)}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
