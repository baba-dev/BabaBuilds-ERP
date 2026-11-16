"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Sheet = {
  year: number; month: number; canManage: boolean;
  dates: { date: string; dow: number }[];
  rows: { employeeId: string; name: string; days: string[]; totals: { present: number; paidLeave: number; unpaidLeave: number; absent: number; missing: number } }[];
};

const CELL: Record<string, string> = {
  P: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", L: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
  R: "bg-sky-500/15 text-sky-700 dark:text-sky-300", A: "bg-rose-500/20 text-rose-700 dark:text-rose-300",
  H: "bg-orange-500/15 text-orange-700 dark:text-orange-300", LV: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  UL: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300", HOL: "bg-zinc-400/25 text-zinc-600 dark:text-zinc-300",
  OFF: "bg-zinc-200/50 text-zinc-400 dark:bg-zinc-800/50", "": "text-rose-400", "-": "text-zinc-300",
};
const SETTABLE = ["PRESENT", "LATE", "REMOTE", "HALF_DAY", "ABSENT"] as const;
const LEGEND = ["P", "L", "R", "A", "H", "LV", "UL", "HOL", "OFF"] as const;

/** Month grid. People with attendance-manage rights can click a day to correct it. */
export function AttendanceSheet({ refreshKey = 0 }: { refreshKey?: number }) {
  const t = useTranslations("WorkforceHub");
  const locale = useLocale();
  const [cursor, setCursor] = useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() + 1 }; });
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [edit, setEdit] = useState<{ employeeId: string; date: string; recordId?: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/workforce/attendance/sheet?year=${cursor.year}&month=${cursor.month}`);
    if (res.ok) setSheet((await res.json()) as Sheet);
  }, [cursor]);
  useEffect(() => { void load(); }, [load, refreshKey]);

  async function setStatus(status: (typeof SETTABLE)[number] | "CLEAR") {
    if (!edit) return;
    let res: Response;
    if (status === "CLEAR") {
      const found = await fetch(`/api/workforce/attendance?employeeId=${edit.employeeId}&from=${edit.date}&to=${edit.date}`).then((r) => r.json() as Promise<{ records: { id: string }[] }>);
      const id = found.records[0]?.id;
      if (!id) { setEdit(null); return; }
      res = await fetch(`/api/workforce/attendance/${id}`, { method: "DELETE" });
    } else {
      res = await fetch("/api/workforce/attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "SET", employeeId: edit.employeeId, date: edit.date, status }) });
    }
    if (!res.ok) { const j = (await res.json().catch(() => ({}))) as { error?: string }; toast.error(j.error ?? t("error")); return; }
    toast.success(t("sheet.saved"));
    setEdit(null);
    await load();
  }

  const monthLabel = new Date(Date.UTC(cursor.year, cursor.month - 1, 1)).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });
  const step = (n: number) => setCursor((c) => { const d = new Date(Date.UTC(c.year, c.month - 1 + n, 1)); return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }; });

  return (
    <section className="rounded-2xl border border-zinc-200/60 bg-white/60 shadow-sm dark:border-zinc-700/50 dark:bg-zinc-950/40" aria-labelledby="wf-sheet">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200/60 px-4 py-3 dark:border-zinc-800/60">
        <h2 id="wf-sheet" className="text-sm font-black text-zinc-900 dark:text-zinc-100">{t("sheet.title")}</h2>
        <div className="flex items-center gap-1">
          <button aria-label={t("sheet.prev")} onClick={() => step(-1)} className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"><ChevronLeft className="h-4 w-4 rtl:rotate-180" /></button>
          <span className="min-w-32 text-center text-sm font-semibold capitalize">{monthLabel}</span>
          <button aria-label={t("sheet.next")} onClick={() => step(1)} className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"><ChevronRight className="h-4 w-4 rtl:rotate-180" /></button>
        </div>
      </header>
      {!sheet ? <div className="h-48 animate-pulse" /> : sheet.rows.length === 0 ? <p className="p-6 text-sm text-zinc-500">{t("sheet.empty")}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th className="sticky start-0 z-10 min-w-36 bg-white px-3 py-2 text-start font-semibold dark:bg-zinc-950" />
                {sheet.dates.map((d) => <th key={d.date} className={cn("min-w-7 px-0.5 py-2 text-center font-medium tabular-nums", (d.dow === 0 || d.dow === 6) && "text-zinc-400")}>{Number(d.date.slice(8))}</th>)}
                <th className="px-2 text-center">{t("sheet.totalPresent")}</th><th className="px-2 text-center">{t("sheet.totalLeave")}</th><th className="px-2 text-center">{t("sheet.totalAbsent")}</th><th className="px-2 text-center">{t("sheet.totalMissing")}</th>
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((r) => (
                <tr key={r.employeeId}>
                  <td className="sticky start-0 z-10 truncate bg-white px-3 py-1 font-medium dark:bg-zinc-950">{r.name}</td>
                  {r.days.map((c, i) => {
                    const date = sheet.dates[i]!.date;
                    const label = c ? t(`legend.${c}`) : "";
                    const editable = sheet.canManage && c !== "-" && !["OFF", "HOL", "LV", "UL"].includes(c);
                    return (
                      <td key={date} className="p-0.5 text-center">
                        <button type="button" disabled={!editable} onClick={() => setEdit({ employeeId: r.employeeId, date })} title={label} aria-label={`${r.name} ${date} ${label}`}
                          className={cn("h-7 w-7 rounded-md text-[10px] font-bold", CELL[c], editable && "hover:ring-2 hover:ring-teal-500/50", edit?.employeeId === r.employeeId && edit.date === date && "ring-2 ring-teal-500")}>
                          {c === "" ? "·" : c === "-" ? "" : c.length > 1 ? c.slice(0, 2) : c}
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-2 text-center tabular-nums">{r.totals.present}</td>
                  <td className="px-2 text-center tabular-nums">{r.totals.paidLeave + r.totals.unpaidLeave}</td>
                  <td className="px-2 text-center tabular-nums">{r.totals.absent}</td>
                  <td className={cn("px-2 text-center tabular-nums", r.totals.missing > 0 && "font-semibold text-rose-500")}>{r.totals.missing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && (
        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200/60 px-4 py-3 dark:border-zinc-800/60" role="group" aria-label={edit.date}>
          <span className="me-2 text-xs font-semibold">{edit.date}</span>
          {SETTABLE.map((s) => <button key={s} onClick={() => void setStatus(s)} className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold hover:bg-teal-500/10 dark:border-zinc-700">{t(`status.${s}`)}</button>)}
          <button onClick={() => void setStatus("CLEAR")} className="rounded-full border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-500/10">{t("sheet.clear")}</button>
        </div>
      )}
      <footer className="flex flex-wrap gap-x-4 gap-y-1 border-t border-zinc-200/60 px-4 py-3 text-[11px] text-zinc-500 dark:border-zinc-800/60">
        {LEGEND.map((c) => <span key={c} className="inline-flex items-center gap-1.5"><span className={cn("inline-block h-4 w-5 rounded text-center text-[9px] font-bold leading-4", CELL[c])}>{c.slice(0, 2)}</span>{t(`legend.${c}`)}</span>)}
        {sheet?.canManage && <span className="ms-auto">{t("sheet.hint")}</span>}
      </footer>
    </section>
  );
}
