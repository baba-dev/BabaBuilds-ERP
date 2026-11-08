import type { ProposalDisplayStatus } from "@/lib/proposals/status";

export { formatMoney, formatMoneyCompact, initials, readApiError } from "@/app/(dashboard)/income/_components/income-utils";

export const STATUS_ORDER: ProposalDisplayStatus[] = ["DRAFT", "SENT", "VIEWED", "REVISION_REQUESTED", "ACCEPTED", "INVOICED", "DECLINED", "EXPIRED"];

export const STATUS_STYLES: Record<ProposalDisplayStatus, { chip: string; dot: string }> = {
  DRAFT: {
    chip: "bg-zinc-100 text-zinc-700 ring-zinc-500/20 dark:bg-zinc-500/10 dark:text-zinc-300 dark:ring-zinc-400/20",
    dot: "bg-zinc-400",
  },
  SENT: {
    chip: "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20",
    dot: "bg-sky-500",
  },
  VIEWED: {
    chip: "bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/20",
    dot: "bg-indigo-500",
  },
  REVISION_REQUESTED: {
    chip: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20",
    dot: "bg-amber-500",
  },
  ACCEPTED: {
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20",
    dot: "bg-emerald-500",
  },
  INVOICED: {
    chip: "bg-teal-50 text-teal-700 ring-teal-600/20 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-400/20",
    dot: "bg-teal-500",
  },
  DECLINED: {
    chip: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20",
    dot: "bg-rose-500",
  },
  EXPIRED: {
    chip: "bg-orange-50 text-orange-800 ring-orange-600/20 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-400/20",
    dot: "bg-orange-500",
  },
};

export function formatDate(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
}

export function formatDateTime(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** "3 h ago" style text without pulling in a date library. */
export function timeAgo(iso: string, locale: string, now = Date.now()) {
  const diff = Date.parse(iso) - now;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), "hour");
  return rtf.format(Math.round(diff / 86_400_000), "day");
}

export type ProposalRowAction =
  | "open"
  | "edit"
  | "send"
  | "copyLink"
  | "preview"
  | "duplicate"
  | "accept"
  | "decline"
  | "reopen"
  | "convert"
  | "viewInvoice"
  | "delete"
  | "archive"
  | "unarchive";

/** What the owner can do next from each state. The server re-checks every one of these. */
export function availableActions(status: ProposalDisplayStatus, stored: string, archived: boolean): ProposalRowAction[] {
  if (archived) return ["open", "duplicate", "unarchive"];
  switch (stored) {
    case "DRAFT":
      return ["send", "edit", "duplicate", "delete"];
    case "SENT":
    case "VIEWED":
    case "REVISION_REQUESTED":
      return status === "EXPIRED"
        ? ["edit", "copyLink", "duplicate", "decline", "delete"]
        : ["send", "copyLink", "preview", "edit", "duplicate", "accept", "decline", "delete"];
    case "DECLINED":
      return ["reopen", "edit", "duplicate", "delete"];
    case "ACCEPTED":
      return ["convert", "copyLink", "preview", "duplicate", "archive"];
    case "INVOICED":
      return ["viewInvoice", "preview", "duplicate", "archive"];
    default:
      return ["duplicate"];
  }
}
