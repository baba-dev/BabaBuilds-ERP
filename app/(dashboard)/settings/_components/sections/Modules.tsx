"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUpRight, Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { MODULE_CATALOG, MODULE_GROUP_ORDER, type ModuleEntry } from "@/lib/settings/modules-catalog";
import { NavIcon } from "../nav-icon";
import { Panel, ReadOnlyBanner } from "../form-kit";
import type { SectionProps } from "./types";

/** One list, one toggle component, for every optional module. Turning a module off hides it and keeps its data. */
export function ModulesSection({ canManage }: SectionProps) {
  const t = useTranslations("SettingsHub.modules");
  const [enabled, setEnabled] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ModuleEntry | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(() => {
    fetch("/api/workspace/modules").then((r) => (r.ok ? r.json() : Promise.reject(new Error("load")))).then((d: { modules?: string[] }) => setEnabled(new Set(d.modules ?? []))).catch(() => { setEnabled(new Set()); toast.error(t("loadFailed")); });
  }, [t]);
  useEffect(load, [load]);

  async function toggle(entry: ModuleEntry, on: boolean) {
    setBusy(entry.key);
    try {
      const res = await fetch("/api/workspace/modules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ moduleKey: entry.key, enabled: on }) });
      const body = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
      if (!res.ok) { toast.error(body.code === "PAID_PLAN_REQUIRED" ? t("paidRequired") : body.error ?? t("failed")); return; }
      setEnabled((cur) => { const next = new Set(cur ?? []); if (on) next.add(entry.key); else next.delete(entry.key); return next; });
      toast.success(on ? t("turnedOn", { name: t(`items.${entry.key}.name`) }) : t("turnedOff", { name: t(`items.${entry.key}.name`) }));
      // The sidebar reads modules on load, so a refresh keeps it in step.
      window.dispatchEvent(new Event("erp:modules-changed"));
    } catch { toast.error(t("failed")); } finally { setBusy(null); setConfirm(null); }
  }

  const q = query.trim().toLowerCase();
  const items = useMemo(() => MODULE_CATALOG.filter((m) => !q || t(`items.${m.key}.name`).toLowerCase().includes(q) || t(`items.${m.key}.body`).toLowerCase().includes(q)), [q, t]);
  const onCount = enabled ? MODULE_CATALOG.filter((m) => enabled.has(m.key)).length : 0;

  return (
    <div className="space-y-5">
      {!canManage ? <ReadOnlyBanner /> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{enabled ? t("summary", { on: onCount, total: MODULE_CATALOG.length }) : t("loading")}</p>
        <div className="relative w-full sm:w-64"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="h-9 ps-9" /></div>
      </div>
      {!enabled ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div> : null}
      {enabled ? MODULE_GROUP_ORDER.map((g) => {
        const list = items.filter((m) => m.group === g);
        if (!list.length) return null;
        return (
          <Panel key={g} title={t(`groups.${g}`)}>
            <ul className="-my-1 divide-y divide-border/60">
              {list.map((m) => {
                const on = enabled.has(m.key);
                const labelId = `mod-${m.key}`;
                return (
                  <li key={m.key} className="flex items-start gap-3 py-3.5">
                    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><NavIcon name={m.icon} className="size-4.5" /></span>
                    <div className="min-w-0 flex-1">
                      <p id={labelId} className="text-sm font-semibold">{t(`items.${m.key}.name`)}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t(`items.${m.key}.body`)}</p>
                      {on ? <Link href={m.href} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-300">{t("open")}<ArrowUpRight className="size-3 rtl:-scale-x-100" aria-hidden /></Link> : null}
                    </div>
                    <Switch checked={on} disabled={!canManage || busy === m.key} aria-labelledby={labelId} onCheckedChange={(c) => (c ? void toggle(m, true) : setConfirm(m))} />
                  </li>
                );
              })}
            </ul>
          </Panel>
        );
      }) : null}
      {enabled && items.length === 0 ? <p className="text-sm text-muted-foreground">{t("noMatch")}</p> : null}
      <p className="text-xs text-muted-foreground">{t("shopNote")}</p>
      <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm ? t("confirmTitle", { name: t(`items.${confirm.key}.name`) }) : ""}</AlertDialogTitle>
            <AlertDialogDescription>{t("confirmBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirm) void toggle(confirm, false); }}>{t("turnOff")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
