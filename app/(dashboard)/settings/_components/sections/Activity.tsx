"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Blocks, History, KeyRound, Mail, Settings2, ImageIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel, ReadOnlyBanner } from "../form-kit";
import type { SectionProps } from "./types";

type Row = { id: string; action: string; actor: string; section: string | null; fields: string[]; secret: string | null; kind: string | null; module: string | null; at: string };

const words = (f: string) => f.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();

/** Who changed what in settings, newest first. Field names only; values are never logged. */
export function ActivitySection({ canManage }: SectionProps) {
  const t = useTranslations("SettingsHub.activity");
  const nav = useTranslations("SettingsHub.nav");
  const mods = useTranslations("SettingsHub.modules.items");
  const format = useFormatter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!canManage) return;
    let off = false;
    fetch("/api/settings/activity", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("load")))).then((d: { activity: Row[] }) => { if (!off) setRows(d.activity); }).catch(() => { if (!off) { setFailed(true); setRows([]); } });
    return () => { off = true; };
  }, [canManage]);

  if (!canManage) return <ReadOnlyBanner />;
  if (!rows) return <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>;

  const describe = (r: Row): { icon: typeof History; text: string } => {
    if (r.action === "settings_secret_rotated" || r.action === "settings_secret_cleared") return { icon: KeyRound, text: t(r.action === "settings_secret_rotated" ? "secretSet" : "secretCleared", { name: t(`secrets.${r.secret ?? "unknown"}`) }) };
    if (r.action === "settings_branding_updated" || r.action === "settings_branding_removed") return { icon: ImageIcon, text: t(r.action === "settings_branding_updated" ? "brandingSet" : "brandingCleared", { name: t(`branding.${r.kind ?? "logo"}`) }) };
    if (r.action.startsWith("settings_module_")) {
      const name = r.module && mods.has(`${r.module}.name`) ? mods(`${r.module}.name`) : (r.module ?? "");
      return { icon: Blocks, text: t(r.action === "settings_module_enabled" ? "moduleOn" : r.action === "settings_module_disabled" ? "moduleOff" : "moduleOption", { name }) };
    }
    if (r.action === "settings_email_test") return { icon: Mail, text: t("emailTest") };
    return { icon: Settings2, text: r.section && r.fields.length ? t("changed", { section: nav.has(r.section) ? nav(r.section) : r.section, fields: r.fields.map(words).join(", ") }) : t("saved") };
  };

  return (
    <div className="space-y-5">
      <Panel title={t("title")} description={t("hint")}>
        {failed ? <p role="alert" className="text-sm text-rose-600">{t("failed")}</p> : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center"><History className="size-8 text-muted-foreground" aria-hidden /><p className="text-sm font-medium">{t("emptyTitle")}</p><p className="max-w-sm text-xs text-muted-foreground">{t("emptyBody")}</p></div>
        ) : (
          <ol className="-my-1 divide-y divide-border/60">
            {rows.map((r) => {
              const d = describe(r);
              const Icon = d.icon;
              return (
                <li key={r.id} className="flex items-start gap-3 py-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><Icon className="size-4" aria-hidden /></span>
                  <div className="min-w-0 flex-1"><p className="text-sm">{d.text}</p><p className="truncate text-xs text-muted-foreground">{r.actor}</p></div>
                  <time dateTime={r.at} className="shrink-0 text-xs text-muted-foreground" title={format.dateTime(new Date(r.at), { dateStyle: "medium", timeStyle: "short" })}>{format.relativeTime(new Date(r.at))}</time>
                </li>
              );
            })}
          </ol>
        )}
      </Panel>
    </div>
  );
}
