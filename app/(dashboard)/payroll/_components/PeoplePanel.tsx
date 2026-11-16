"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Banknote, ChevronRight, Plus, Search, ShieldAlert, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PeopleArt } from "./art/PayrollArt";
import { PersonSheet } from "./PersonSheet";
import type { PeopleResponse, PayrollPerson } from "./shared";

const FILTERS = ["all", "READY", "ATTENTION", "NO_PAY_STRUCTURE", "exited"] as const;
type Filter = (typeof FILTERS)[number];

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
const TONE: Record<string, string> = { READY: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", ATTENTION: "bg-amber-500/15 text-amber-700 dark:text-amber-300", NO_PAY_STRUCTURE: "bg-rose-500/10 text-rose-700 dark:text-rose-300" };

export function PeoplePanel({ data, money, locale, canEdit, onChanged }: { data: PeopleResponse; money: (n: number) => string; locale: string; canEdit: boolean; onChanged: () => void }) {
  const t = useTranslations("PayrollHub");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, READY: 0, ATTENTION: 0, NO_PAY_STRUCTURE: 0, exited: 0 };
    for (const p of data.people) {
      const gone = p.status === "INACTIVE";
      if (gone) c.exited += 1; else { c.all += 1; c[p.readiness] += 1; }
    }
    return c;
  }, [data.people]);

  const rows = useMemo(() => data.people.filter((p) => {
    const gone = p.status === "INACTIVE";
    if (filter === "exited" ? !gone : gone) return false;
    if (filter !== "all" && filter !== "exited" && p.readiness !== filter) return false;
    const s = q.trim().toLowerCase();
    return !s || p.name.toLowerCase().includes(s) || (p.employeeCode ?? "").toLowerCase().includes(s) || (p.department ?? "").toLowerCase().includes(s);
  }), [data.people, q, filter]);

  const openPerson = (id: string | null) => { setSelected(id); setOpen(true); };
  const empty = data.people.length === 0;

  return (
    <div className="space-y-4">
      {empty ? (
        <div className="grid items-center gap-6 rounded-3xl border bg-gradient-to-br from-indigo-500/5 to-amber-500/5 p-6 sm:p-10 md:grid-cols-[1fr_280px]">
          <div>
            <h2 className="text-xl font-semibold sm:text-2xl">{t("people.emptyTitle")}</h2>
            <p className="mt-2 max-w-lg text-sm text-muted-foreground">{t("people.emptyBody")}</p>
            <Button className="mt-5 gap-2" onClick={() => openPerson(null)} disabled={!canEdit}><Plus className="h-4 w-4" />{t("people.add")}</Button>
          </div>
          <div className="mx-auto h-44 w-full max-w-xs"><PeopleArt /></div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1 sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("people.search")} className="pl-9" aria-label={t("people.search")} /></div>
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f} className={cn("rounded-full border px-3 py-1.5 text-xs transition-colors", filter === f ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>{t(`people.filter.${f}`)} <span className="opacity-70">{counts[f]}</span></button>
              ))}
            </div>
            <Button className="ml-auto gap-1.5" onClick={() => openPerson(null)} disabled={!canEdit}><Plus className="h-4 w-4" />{t("people.add")}</Button>
          </div>

          {rows.length === 0 ? <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">{t("people.noMatch")}</p> : (
            <>
              <div className="hidden overflow-hidden rounded-2xl border bg-card md:block">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">{t("people.col.person")}</th><th className="px-4 py-3">{t("people.col.department")}</th><th className="px-4 py-3 text-right">{t("people.col.ctc")}</th><th className="px-4 py-3 text-right">{t("people.col.monthly")}</th><th className="px-4 py-3">{t("people.col.status")}</th><th className="w-8" /></tr></thead>
                  <tbody className="divide-y">
                    {rows.map((p) => <PersonRow key={p.id} p={p} money={money} t={t} onOpen={() => openPerson(p.id)} />)}
                  </tbody>
                </table>
              </div>
              <ul className="space-y-2 md:hidden">
                {rows.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => openPerson(p.id)} className="flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-sm font-semibold text-indigo-600">{initials(p.name) || <UserRound className="h-4 w-4" />}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{p.name}</span><span className="block truncate text-xs text-muted-foreground">{p.designation ?? p.department ?? t("people.noRole")}</span></span>
                      <span className="text-right"><span className="block text-sm font-semibold tabular-nums">{p.pay ? money(p.pay.monthlyGross) : "-"}</span><span className={cn("mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px]", TONE[p.readiness])}>{t(`people.readiness.${p.readiness}`)}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      <PersonSheet open={open} onOpenChange={setOpen} personId={selected} meta={data.meta} canEdit={canEdit} money={money} locale={locale} onSaved={onChanged} />
    </div>
  );
}

function PersonRow({ p, money, t, onOpen }: { p: PayrollPerson; money: (n: number) => string; t: ReturnType<typeof useTranslations>; onOpen: () => void }) {
  return (
    <tr className="cursor-pointer hover:bg-muted/40" onClick={onOpen}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-xs font-semibold text-indigo-600">{initials(p.name)}</span>
          <div className="min-w-0"><p className="truncate font-medium">{p.name}</p><p className="truncate text-xs text-muted-foreground">{[p.employeeCode, p.designation].filter(Boolean).join(" · ") || p.email || ""}</p></div>
        </div>
      </td>
      <td className="px-4 py-3 text-muted-foreground">{p.department ?? "-"}</td>
      <td className="px-4 py-3 text-right tabular-nums">{p.pay ? money(p.pay.annualCtc) : "-"}</td>
      <td className="px-4 py-3 text-right tabular-nums">{p.pay ? money(p.pay.monthlyGross) : "-"}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", TONE[p.readiness])}>{t(`people.readiness.${p.readiness}`)}</span>
          {p.gaps.includes("NO_BANK") ? <span title={t("people.gap.NO_BANK")} className="text-amber-600"><Banknote className="h-3.5 w-3.5" /></span> : null}
          {p.gaps.includes("NO_PAN") ? <span title={t("people.gap.NO_PAN")} className="text-amber-600"><ShieldAlert className="h-3.5 w-3.5" /></span> : null}
        </div>
      </td>
      <td className="pr-3 text-muted-foreground"><ChevronRight className="h-4 w-4" /></td>
    </tr>
  );
}
