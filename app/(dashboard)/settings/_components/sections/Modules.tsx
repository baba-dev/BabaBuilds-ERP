"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowUpRight, CheckCircle2, ChevronDown, Lock, PauseCircle, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { MODULE_CATALOG, MODULE_GROUP_ORDER, type ModuleEntry } from "@/lib/settings/modules-catalog";
import { moduleMeta } from "@/lib/module-registry";
import type { ModuleKey } from "@/lib/module-keys";
import { NavIcon } from "../nav-icon";
import { Panel, ReadOnlyBanner } from "../form-kit";
import type { SectionProps } from "./types";

type State = "enabled" | "disabled" | "plan_required" | "paused";
type ModuleStateRow = { key: ModuleKey; state: State; enabledAt: string | null; config: Record<string, unknown> };
type Filter = "all" | "on" | "off";

const CHIP: Record<State, string> = {
  enabled: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20",
  disabled: "bg-muted text-muted-foreground ring-border",
  paused: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/20",
  plan_required: "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/20",
};

/** One list, one row component, for every optional module. Turning a module off hides it and keeps its data; the toast offers Undo. */
export function ModulesSection({ canManage }: SectionProps) {
  const t = useTranslations("SettingsHub.modules");
  const format = useFormatter();
  const [rows, setRows] = useState<Record<string, ModuleStateRow> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ModuleEntry | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/workspace/modules?detail=1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load"))))
      .then((d: { states: ModuleStateRow[] }) => setRows(Object.fromEntries(d.states.map((s) => [s.key, s]))))
      .catch(() => { setRows({}); toast.error(t("loadFailed")); });
  }, [t]);
  useEffect(load, [load]);

  const patch = (key: string, next: Partial<ModuleStateRow>) => setRows((cur) => (cur ? { ...cur, [key]: { ...cur[key], ...next } } : cur));
  const nameOf = (key: string) => t(`items.${key}.name`);

  async function toggle(entry: ModuleEntry, on: boolean, fromUndo = false) {
    setBusy(entry.key);
    const before = rows?.[entry.key]?.state;
    patch(entry.key, { state: on ? "enabled" : "disabled" });
    try {
      const res = await fetch("/api/workspace/modules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ moduleKey: entry.key, enabled: on }) });
      const body = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
      if (!res.ok) {
        if (before) patch(entry.key, { state: before });
        toast.error(body.code === "PAID_PLAN_REQUIRED" ? t("paidRequired") : body.error ?? t("failed"));
        return;
      }
      window.dispatchEvent(new Event("erp:modules-changed"));
      if (fromUndo) toast.success(t("turnedOn", { name: nameOf(entry.key) }));
      else if (on) toast.success(t("turnedOn", { name: nameOf(entry.key) }), { action: { label: t("open"), onClick: () => { window.location.href = entry.href; } } });
      else toast.success(t("turnedOff", { name: nameOf(entry.key) }), { action: { label: t("undo"), onClick: () => void toggle(entry, true, true) } });
      if (on) load();
    } catch {
      if (before) patch(entry.key, { state: before });
      toast.error(t("failed"));
    } finally { setBusy(null); setConfirm(null); }
  }

  async function setOption(entry: ModuleEntry, option: string, value: boolean) {
    const prev = rows?.[entry.key]?.config ?? {};
    patch(entry.key, { config: { ...prev, [option]: value } });
    try {
      const res = await fetch("/api/workspace/modules/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ moduleKey: entry.key, options: { [option]: value } }) });
      if (!res.ok) throw new Error("save");
      toast.success(t("options.saved"));
    } catch { patch(entry.key, { config: prev }); toast.error(t("options.failed")); }
  }

  const q = query.trim().toLowerCase();
  const isOn = (k: string) => rows?.[k]?.state === "enabled";
  const counts = useMemo(() => ({ all: MODULE_CATALOG.length, on: MODULE_CATALOG.filter((m) => rows?.[m.key]?.state === "enabled").length }), [rows]);
  const items = useMemo(() => MODULE_CATALOG.filter((m) => {
    const on = rows?.[m.key]?.state === "enabled";
    if (filter === "on" && !on) return false;
    if (filter === "off" && on) return false;
    return !q || t(`items.${m.key}.name`).toLowerCase().includes(q) || t(`items.${m.key}.body`).toLowerCase().includes(q);
  }), [rows, filter, q, t]);

  return (
    <div className="space-y-5">
      {!canManage ? <ReadOnlyBanner /> : null}

      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-indigo-50 via-background to-background p-5 dark:from-indigo-950/30">
        <Sparkles className="pointer-events-none absolute -end-3 -top-3 size-24 text-indigo-200/60 dark:text-indigo-500/10" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0"><h2 className="text-base font-semibold">{t("headline")}</h2><p className="mt-0.5 max-w-xl text-sm text-muted-foreground">{t("headlineHint")}</p></div>
          {rows ? (
            <div className="flex items-center gap-3" aria-label={t("summary", { on: counts.on, total: counts.all })}>
              <div className="flex gap-1" aria-hidden>{MODULE_CATALOG.map((m) => <span key={m.key} className={cn("h-6 w-1.5 rounded-full transition-colors", isOn(m.key) ? "bg-indigo-500" : "bg-indigo-200 dark:bg-indigo-900")} />)}</div>
              <p className="text-sm font-medium tabular-nums">{t("summary", { on: counts.on, total: counts.all })}</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label={t("filters.all")} className="inline-flex rounded-xl border border-border/70 p-1">
          {(["all", "on", "off"] as const).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={cn("rounded-lg px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", filter === f ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200" : "text-muted-foreground hover:text-foreground")}>
              {t(`filters.${f}`)}{rows ? <span className="ms-1.5 text-xs tabular-nums opacity-70">{f === "all" ? counts.all : f === "on" ? counts.on : counts.all - counts.on}</span> : null}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="h-9 ps-9" /></div>
      </div>

      {!rows ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div> : null}

      {rows ? MODULE_GROUP_ORDER.map((g) => {
        const list = items.filter((m) => m.group === g);
        if (!list.length) return null;
        return (
          <Panel key={g} title={t(`groups.${g}`)}>
            <ul className="-my-1 divide-y divide-border/60">
              {list.map((m) => {
                const row = rows[m.key];
                const state: State = row?.state ?? "disabled";
                const on = state === "enabled";
                const locked = state === "plan_required" || state === "paused";
                const labelId = `mod-${m.key}`;
                const expanded = open === m.key;
                const missing = on ? moduleMeta(m.key).suggests.filter((s) => rows[s] && rows[s].state === "disabled") : [];
                const meta = moduleMeta(m.key);
                const AR = m.key === "AR_COLLECTIONS";
                return (
                  <li key={m.key} className="py-4">
                    <div className="flex items-start gap-3">
                      <span className={cn("mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors", on ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200" : "bg-muted text-muted-foreground")}><NavIcon name={m.icon} className="size-5" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p id={labelId} className="text-sm font-semibold">{nameOf(m.key)}</p>
                          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", CHIP[state])}>
                            {state === "enabled" ? <CheckCircle2 className="size-3" aria-hidden /> : state === "paused" ? <PauseCircle className="size-3" aria-hidden /> : state === "plan_required" ? <Lock className="size-3" aria-hidden /> : null}
                            {t(`status.${state === "enabled" ? "on" : state === "disabled" ? "off" : state === "paused" ? "paused" : "needsPlan"}`)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t(`items.${m.key}.body`)}</p>
                        {state === "paused" ? <p className="mt-1.5 text-xs text-amber-800 dark:text-amber-200">{t("planEnded")}</p> : state === "plan_required" ? <p className="mt-1.5 text-xs text-muted-foreground">{t("needsPlanBody")}</p> : null}

                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                          {on ? <Link href={m.href} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-300">{t("open")}<ArrowUpRight className="size-3 rtl:-scale-x-100" aria-hidden /></Link> : null}
                          {locked ? <Link href="/settings/billing" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-300">{t("upgrade")}<ArrowUpRight className="size-3 rtl:-scale-x-100" aria-hidden /></Link> : null}
                          <button type="button" onClick={() => setOpen(expanded ? null : m.key)} aria-expanded={expanded} aria-controls={`${labelId}-more`} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            {expanded ? t("hideDetails") : t("details")}<ChevronDown className={cn("size-3 transition-transform", expanded && "rotate-180")} aria-hidden />
                          </button>
                          {on && row?.enabledAt ? <span className="text-xs text-muted-foreground">{t("since", { date: format.dateTime(new Date(row.enabledAt), { dateStyle: "medium" }) })}</span> : null}
                        </div>

                        <AnimatePresence initial={false}>
                          {expanded ? (
                            <motion.div id={`${labelId}-more`} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                              <ul className="mt-3 space-y-1.5 text-xs text-muted-foreground">{(["h1", "h2"] as const).map((h) => <li key={h} className="flex gap-2"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-indigo-400" aria-hidden />{t(`items.${m.key}.${h}`)}</li>)}</ul>
                              {meta.suggests.length ? <p className="mt-2 text-xs text-muted-foreground">{t("worksWith", { names: meta.suggests.map(nameOf).join(", ") })}</p> : null}
                            </motion.div>
                          ) : null}
                        </AnimatePresence>

                        {on && AR ? (
                          <div className="mt-3 flex items-start justify-between gap-3 rounded-xl bg-muted/40 px-3.5 py-3">
                            <div className="min-w-0"><p id="ar-auto" className="text-xs font-semibold">{t("options.AR_COLLECTIONS.autoReminders.title")}</p><p className="mt-0.5 text-xs text-muted-foreground">{t("options.AR_COLLECTIONS.autoReminders.body")}</p></div>
                            <Switch checked={row?.config?.autoReminders === true} disabled={!canManage} aria-labelledby="ar-auto" onCheckedChange={(c) => void setOption(m, "autoReminders", c)} />
                          </div>
                        ) : null}

                        {missing.length ? (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {missing.map((s) => <button key={s} type="button" disabled={!canManage || busy === s} onClick={() => { const e = MODULE_CATALOG.find((x) => x.key === s); if (e) void toggle(e, true); }} className="rounded-full border border-dashed border-indigo-300 px-3 py-1 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 dark:text-indigo-300 dark:hover:bg-indigo-500/10">{t("turnOnSuggested", { name: nameOf(s) })}</button>)}
                          </div>
                        ) : null}
                      </div>
                      <Switch checked={on} disabled={!canManage || locked || busy === m.key} aria-labelledby={labelId} onCheckedChange={(c) => (c ? void toggle(m, true) : setConfirm(m))} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>
        );
      }) : null}
      {rows && items.length === 0 ? <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{q ? t("noMatch") : t("emptyFilter")}</p> : null}
      <p className="text-xs text-muted-foreground">{t("shopNote")}</p>

      <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm ? t("confirmTitle", { name: nameOf(confirm.key) }) : ""}</AlertDialogTitle>
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
