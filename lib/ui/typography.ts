import { cn } from "@/lib/utils";

/**
 * Appwide typography contract.
 *
 * Metric weight guidance:
 * - Use `metricValueLg` (light) for primary KPI values where visual calm is preferred.
 * - Use `metricValueLgStrong`/`metricValueMd` when a metric must read as an anchor or alert.
 * Keeping this consistent prevents cards in the same row from feeling mismatched in emphasis.
 */
export const typography = {
  pageTitle:
    "text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50",
  sectionHeader:
    "text-lg sm:text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100",

  sectionTitle: "text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50",
  cardTitle: "text-sm font-semibold text-zinc-900 dark:text-zinc-100",
  cardSubtitle: "text-sm text-zinc-500 dark:text-zinc-400 leading-tight",

  labelUpper:
    "text-xs text-zinc-500 dark:text-zinc-400 font-semibold tracking-wider uppercase",
  labelUpperStrong:
    "text-xs text-zinc-500 dark:text-zinc-400 font-bold tracking-wider uppercase",

  metricValueXl:
    "text-4xl font-light tracking-tight tabular-nums text-zinc-900 dark:text-white",
  metricValueLg:
    "text-3xl font-light tracking-tight tabular-nums text-zinc-900 dark:text-white",
  metricValueLgStrong:
    "text-3xl font-semibold tracking-tight tabular-nums text-zinc-900 dark:text-white",
  metricValueMd:
    "text-2xl font-light tracking-tight tabular-nums text-zinc-900 dark:text-white",
  metricValueSm: "text-sm font-bold text-zinc-900 dark:text-zinc-200",

  helper: "text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed",
  helperXs: "text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed",

  kpiBadge: "h-5 text-[10px] font-bold uppercase tracking-wider",

  bodyCopy:
    "text-sm sm:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed",
  richContent:
    "prose prose-zinc dark:prose-invert max-w-none prose-headings:tracking-tight prose-p:leading-relaxed prose-li:leading-relaxed prose-pre:rounded-xl prose-img:rounded-xl",
  cardBody:
    "text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed",
} as const;

export function tx(...classes: Array<string | undefined | false | null>) {
  return cn(...classes);
}
