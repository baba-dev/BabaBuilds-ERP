"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { CalendarDays, Crosshair, Lock, MessageSquare, ShieldCheck } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import { EmptyMark } from "./CaArt";
import { cn } from "@/lib/utils";
import { blockedKinds } from "@/lib/ca/readiness";
import { GROUPS, StateChip, formatDay, periodLabel, useJson, useKindName, useMoney, type CaItemView, type Overview } from "./ca-utils";

type Team = { members: Array<{ userId: string; name: string }> };
type StatusFilter = "all" | "open" | "filed" | "overdue";

const RAIL: Record<string, string> = {
  FILED: "border-s-emerald-500", OVERDUE: "border-s-rose-500", DUE_SOON: "border-s-amber-500", READY: "border-s-sky-500",
  IN_PROGRESS: "border-s-indigo-500", UPCOMING: "border-s-zinc-300 dark:border-s-zinc-600", NOT_APPLICABLE: "border-s-zinc-200 dark:border-s-zinc-700",
};
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

function monthHeading(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
}

export function CalendarTab({ data, onOpen, goto }: { data: Overview; onOpen: (i: CaItemView) => void; goto: (tab: string) => void }) {
  const t = useTranslations("CaCompliance.calendar");
  const tShort = useTranslations("CaCompliance.readiness.short");
  const { locale, c } = useMoney();
  const kindName = useKindName();
  const team = useJson<Team>("/api/ca/team");
  const reduce = useReducedMotion();
  const now = useMemo(() => new Date(), []);
  const [group, setGroup] = useState<string>("ALL");
  const [status, setStatus] = useState<StatusFilter>("all");
  const owners = useMemo(() => new Map((team.data?.members ?? []).map((m) => [m.userId, m.name])), [team.data]);
  const blocked = useMemo(() => blockedKinds(data.readiness), [data.readiness]);

  const visible = useMemo(() => data.items.filter((i) => {
    if (group !== "ALL" && i.group !== group) return false;
    if (status === "open") return i.state !== "FILED" && i.state !== "NOT_APPLICABLE";
    if (status === "filed") return i.state === "FILED";
    if (status === "overdue") return i.state === "OVERDUE";
    return true;
  }), [data.items, group, status]);

  const months = useMemo(() => {
    const out: Array<{ key: string; rows: CaItemView[] }> = [];
    for (const i of visible) {
      const key = i.effectiveDue.slice(0, 7);
      const last = out[out.length - 1];
      if (last && last.key === key) last.rows.push(i); else out.push({ key, rows: [i] });
    }
    return out;
  }, [visible]);

  const firstFutureId = useMemo(() => visible.find((i) => new Date(i.effectiveDue).getTime() >= now.getTime())?.id ?? null, [visible, now]);
  const jump = () => {
    const target = data.progress.next ? document.getElementById(`ca-item-${data.progress.next.id}`) ?? (firstFutureId ? document.getElementById(`ca-item-${firstFutureId}`) : null) : firstFutureId ? document.getElementById(`ca-item-${firstFutureId}`) : null;
    target?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  };

  const chip = (active: boolean) => cn("shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-400/30 dark:bg-indigo-500/15 dark:text-indigo-200" : "border-border/70 bg-card text-muted-foreground hover:text-foreground");

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" role="group" aria-label={t("groupLabel")}>
          <button type="button" className={chip(group === "ALL")} onClick={() => setGroup("ALL")}>{t("filters.all")}</button>
          {GROUPS.filter((g) => data.items.some((i) => i.group === g)).map((g) => <button key={g} type="button" className={chip(group === g)} onClick={() => setGroup(g)}>{t(`filters.${g}`)}</button>)}
        </div>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" role="group" aria-label={t("statusLabel")}>
          {(["all", "open", "overdue", "filed"] as const).map((s) => <button key={s} type="button" className={chip(status === s)} onClick={() => setStatus(s)}>{t(`status.${s}`)}</button>)}
          <button type="button" onClick={jump} className="ms-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Crosshair className="size-3.5" aria-hidden />{t("jumpNext")}</button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center"><EmptyMark><CalendarDays className="size-6" aria-hidden /></EmptyMark><p className="mt-3 text-sm text-muted-foreground">{t("empty")}</p></div>
      ) : months.map((mo, mi) => (
        <section key={mo.key} aria-label={monthHeading(mo.rows[0].effectiveDue, locale)}>
          <h3 className="sticky top-0 z-10 -mx-1 mb-2 bg-background/85 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">{monthHeading(mo.rows[0].effectiveDue, locale)}</h3>
          <ul className="space-y-2">
            {mo.rows.map((i, ri) => {
              const heldBy = blocked.get(i.kind);
              const late = i.daysToDue < 0;
              const done = i.state === "FILED" || i.state === "NOT_APPLICABLE";
              return (
                <motion.li key={i.id} id={`ca-item-${i.id}`} className="scroll-mt-24" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: Math.min(0.2, (mi + ri) * 0.015) }}>
                  {i.id === firstFutureId ? <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300" role="separator" aria-label={t("today")}><span className="h-px flex-1 bg-indigo-300/60 dark:bg-indigo-400/30" /><span className="rounded-full bg-indigo-50 px-2 py-0.5 ring-1 ring-indigo-200/70 dark:bg-indigo-500/15 dark:ring-indigo-400/20">{t("today")} · {formatDay(now.toISOString(), locale)}</span><span className="h-px flex-1 bg-indigo-300/60 dark:bg-indigo-400/30" /></div> : null}
                  <button type="button" onClick={() => onOpen(i)} className={cn("flex w-full items-start justify-between gap-3 rounded-2xl border border-border/70 border-s-4 bg-card p-3.5 text-start shadow-sm transition-all hover:-translate-y-px hover:bg-muted/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none", RAIL[i.state], done && "opacity-80")}>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        <span className="truncate">{kindName(i)}</span>
                        {i.statusLocked ? <Lock className="size-3 shrink-0 text-muted-foreground" aria-label={t("gstLocked")} /> : null}
                        {i.signedOffAt ? <ShieldCheck className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" aria-label={t("signedOff")} /> : null}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {periodLabel(i.periodKey, locale)}
                        {i.cumulativePercent ? ` · ${t("advance", { percent: i.cumulativePercent })}` : ""}
                        {i.amount ? ` · ${c(i.amount)}` : ""}
                      </p>
                      {heldBy ? <p className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-300">{t("heldBy", { what: Array.from(new Set(heldBy)).map((code) => tShort(code)).slice(0, 2).join(" · ") })}</p> : null}
                      {i.ownerUserId && owners.get(i.ownerUserId) ? <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground"><span className="flex size-4 items-center justify-center rounded-full bg-indigo-100 text-[9px] font-bold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200" aria-hidden>{initials(owners.get(i.ownerUserId) ?? "")}</span>{owners.get(i.ownerUserId)}</p> : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5 text-end text-xs">
                      <StateChip state={i.state} />
                      <p className="font-medium tabular-nums">{formatDay(i.effectiveDue, locale)}</p>
                      <p className={cn(i.state === "OVERDUE" ? "text-rose-600 dark:text-rose-300" : "text-muted-foreground")}>
                        {done ? (i.filedAt ? t("filedOn", { date: formatDay(i.filedAt, locale) }) : "") : late ? t("daysLate", { count: -i.daysToDue }) : t("daysLeft", { count: i.daysToDue })}
                      </p>
                      {i.dueOverride ? <p className="text-amber-700 dark:text-amber-300">{t("extended", { date: formatDay(i.dueOverride, locale) })}</p> : null}
                    </div>
                  </button>
                </motion.li>
              );
            })}
          </ul>
        </section>
      ))}

      {data.items.some((i) => blocked.has(i.kind)) ? (
        <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground"><MessageSquare className="size-3.5" aria-hidden />
          <button type="button" onClick={() => goto("readiness")} className="font-medium text-indigo-600 hover:underline dark:text-indigo-300">{t("seeReadiness")}</button>
        </p>
      ) : null}
    </div>
  );
}
