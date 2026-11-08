import type { RetainerDisplayStatus } from "@/lib/retainers/status";

export { formatMoney, formatMoneyCompact, initials, readApiError } from "@/app/(dashboard)/income/_components/income-utils";
export { formatDate, formatDateTime } from "@/app/(dashboard)/proposals/_components/proposal-utils";

export const STATUS_ORDER: RetainerDisplayStatus[] = ["DUE", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"];

export const STATUS_STYLES: Record<RetainerDisplayStatus, { chip: string; dot: string }> = {
  ACTIVE: { chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20", dot: "bg-emerald-500" },
  DUE: { chip: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20", dot: "bg-amber-500" },
  PAUSED: { chip: "bg-zinc-100 text-zinc-700 ring-zinc-500/20 dark:bg-zinc-500/10 dark:text-zinc-300 dark:ring-zinc-400/20", dot: "bg-zinc-400" },
  COMPLETED: { chip: "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20", dot: "bg-sky-500" },
  CANCELLED: { chip: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20", dot: "bg-rose-500" },
};

export type RetainerRowAction = "open" | "billNow" | "edit" | "pause" | "resume" | "cancel" | "delete" | "addUsage" | "viewInvoices" | "schedulePrice" | "previewInvoice" | "exportInvoices";

/** What the owner can do next; the server re-checks every one. */
export function availableActions(status: string, cyclesBilled: number): RetainerRowAction[] {
  switch (status) {
    case "ACTIVE":
      return ["billNow", "previewInvoice", "addUsage", "schedulePrice", "edit", "pause", "viewInvoices", "exportInvoices", cyclesBilled === 0 ? "delete" : "cancel"];
    case "PAUSED":
      return ["resume", "edit", "schedulePrice", "viewInvoices", "exportInvoices", cyclesBilled === 0 ? "delete" : "cancel"];
    default:
      return ["viewInvoices", "exportInvoices"];
  }
}
