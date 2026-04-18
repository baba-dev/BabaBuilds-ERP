import { cn } from "@/lib/utils";

/**
 * Appwide typography contract.
 *
 * Guidelines:
 * - Prefer these roles over ad-hoc class strings to keep hierarchy consistent across pages.
 * - Keep roles mostly color-agnostic; use `text-foreground` / `text-muted-foreground` for semantic tone.
 *
 * Metric weight guidance:
 * - Use `metricValueLg` (light) for primary KPI values where visual calm is preferred.
 * - Use `metricValueLgStrong`/`metricValueMd` when a metric must read as an anchor or alert.
 * Keeping this consistent prevents cards in the same row from feeling mismatched in emphasis.
 */
export const typography = {
  pageTitle:
    "text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground",
  sectionHeader:
    "text-lg sm:text-xl font-semibold tracking-tight text-foreground",

  sectionTitle: "text-lg font-semibold tracking-tight text-foreground",
  cardTitle: "text-sm font-semibold text-foreground",
  cardSubtitle: "text-sm text-muted-foreground leading-tight",

  labelUpper:
    "text-xs text-muted-foreground font-semibold tracking-wider uppercase",
  labelUpperStrong:
    "text-xs text-muted-foreground font-bold tracking-wider uppercase",

  metricValueXl:
    "text-4xl font-light tracking-tight tabular-nums text-foreground",
  metricValueLg:
    "text-3xl font-light tracking-tight tabular-nums text-foreground",
  metricValueLgStrong:
    "text-3xl font-semibold tracking-tight tabular-nums text-foreground",
  metricValueMd:
    "text-2xl font-light tracking-tight tabular-nums text-foreground",
  metricValueSm: "text-sm font-bold text-foreground",

  helper: "text-sm text-muted-foreground leading-relaxed",
  helperXs: "text-xs text-muted-foreground leading-relaxed",

  kpiBadge: "h-5 text-[10px] font-bold uppercase tracking-wider",

  bodyCopy:
    "text-sm sm:text-base text-muted-foreground leading-relaxed",
  richContent:
    "prose prose-zinc dark:prose-invert max-w-none prose-headings:tracking-tight prose-p:leading-relaxed prose-li:leading-relaxed prose-pre:rounded-xl prose-img:rounded-xl",
  cardBody:
    "text-xs sm:text-sm text-muted-foreground leading-relaxed",
} as const;

export function tx(...classes: Array<string | undefined | false | null>) {
  return cn(...classes);
}
