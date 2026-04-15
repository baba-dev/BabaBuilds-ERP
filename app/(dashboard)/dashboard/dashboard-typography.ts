import { cn } from "@/lib/utils";

export const dashboardTypography = {
  sectionTitle: "text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50",
  cardTitle: "text-sm font-semibold text-zinc-900 dark:text-zinc-100",
  cardSubtitle: "text-sm text-zinc-500 dark:text-zinc-400 leading-tight",
  labelUpper: "text-xs text-zinc-500 dark:text-zinc-400 font-semibold tracking-wider uppercase",
  labelUpperStrong:
    "text-xs text-zinc-500 dark:text-zinc-400 font-bold tracking-wider uppercase",
  value4xlLight:
    "text-4xl font-light tracking-tight tabular-nums text-zinc-900 dark:text-white",
  value3xlLight:
    "text-3xl font-light tracking-tight tabular-nums text-zinc-900 dark:text-white",
  value2xlLight:
    "text-2xl font-light tracking-tight tabular-nums text-zinc-900 dark:text-white",
  valueSmBold: "text-sm font-bold text-zinc-900 dark:text-zinc-200",
  helper: "text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed",
  helperXs: "text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed",
  kpiBadge: "h-5 text-[10px] font-bold uppercase tracking-wider",
};

export function dt(...classes: Array<string | undefined | false | null>) {
  return cn(...classes);
}

