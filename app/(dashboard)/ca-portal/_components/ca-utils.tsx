"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { CaOverview } from "@/lib/ca/data";
import type { CaItemView, CaState } from "@/lib/ca/calendar";

export type Access = { manage: boolean; request: boolean; signoff: boolean; export: boolean; invite: boolean; gst: boolean };
export type Overview = CaOverview & { me: { userId: string }; access: Access };
export type { CaItemView, CaState };

export { Section, Stat, callApi, formatDay, periodLabel, readError, useMoney, useUrlState } from "../../tax/_components/gst-utils";
export { useJson } from "../../income/_components/use-income-data";

export const STATE_STYLE: Record<CaState, { chip: string; dot: string }> = {
  FILED: { chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20", dot: "bg-emerald-500" },
  OVERDUE: { chip: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20", dot: "bg-rose-500" },
  DUE_SOON: { chip: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20", dot: "bg-amber-500" },
  READY: { chip: "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20", dot: "bg-sky-500" },
  IN_PROGRESS: { chip: "bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/20", dot: "bg-indigo-500" },
  UPCOMING: { chip: "bg-zinc-100 text-zinc-600 ring-zinc-500/20 dark:bg-zinc-500/10 dark:text-zinc-300 dark:ring-zinc-400/20", dot: "bg-zinc-400" },
  NOT_APPLICABLE: { chip: "bg-zinc-50 text-zinc-400 ring-zinc-400/20 dark:bg-zinc-500/5 dark:text-zinc-500 dark:ring-zinc-500/20", dot: "bg-zinc-300" },
};

export function StateChip({ state }: { state: CaState }) {
  const t = useTranslations("CaCompliance.state");
  const s = STATE_STYLE[state];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", s.chip)}>
      <span className={cn("size-1.5 rounded-full", s.dot)} aria-hidden />
      {t(state)}
    </span>
  );
}

/** Name of an obligation: GST rows carry their own label, the rest are translated by kind. */
export function useKindName() {
  const t = useTranslations("CaCompliance.kinds");
  return (item: Pick<CaItemView, "kind" | "label">) => (item.label ? item.label : t(item.kind));
}

export const GROUPS = ["GST", "TDS", "INCOME_TAX", "PAYROLL", "ROC", "YEAR"] as const;

/** Where the "needs your attention" areas of readiness link to is decided by the engine; this keeps the tab ids in one place. */
export const TABS = ["overview", "calendar", "readiness", "requests", "evidence", "setup"] as const;
export type Tab = (typeof TABS)[number];

/** Downloads a file from an API route, showing the server's message when it refuses (rate limit, permission) instead of navigating to JSON. */
export async function downloadFile(url: string, filename: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { ok: false, error: (body && typeof body.error === "string" && body.error) || (body?.error && typeof body.error.message === "string" && body.error.message) || `Download failed (${res.status})` };
    }
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}
