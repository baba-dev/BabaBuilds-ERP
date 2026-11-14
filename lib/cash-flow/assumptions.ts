import type { CashForecastScenarioTag, ForecastAssumptions } from "@/lib/cash-flow/types";
import { getScenarioDefaults } from "@/lib/cash-flow/scenario";

export const SCENARIOS: CashForecastScenarioTag[] = ["BASE", "BEST_CASE", "WORST_CASE"];
export const scenarioKey = (tag: CashForecastScenarioTag) => `cashForecast.scenario.${tag}`;

const num = (v: unknown, min: number, max: number): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
};

export type RecurringOutflow = NonNullable<ForecastAssumptions["recurringOutflows"]>[number];

/** Clamp stored or submitted assumption values to sane ranges; unknown keys are dropped. */
export function sanitizeAssumptions(raw: unknown): Partial<ForecastAssumptions> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Partial<ForecastAssumptions> = {};
  const set = <K extends keyof ForecastAssumptions>(k: K, v: ForecastAssumptions[K] | undefined) => { if (v !== undefined) out[k] = v; };
  set("collectionsDelayDays", num(r.collectionsDelayDays, -30, 120));
  set("inflowHaircutPercent", num(r.inflowHaircutPercent, 0, 100));
  set("outflowIncreasePercent", num(r.outflowIncreasePercent, -50, 200));
  set("movePOEarlierLaterDays", num(r.movePOEarlierLaterDays, -60, 60));
  set("minimumCashThreshold", num(r.minimumCashThreshold, 0, 1e12));
  set("defaultInvoicePaymentTermsDays", num(r.defaultInvoicePaymentTermsDays, 0, 365));
  set("overdueCollectionDays", num(r.overdueCollectionDays, 0, 120));
  if (Array.isArray(r.recurringOutflows)) {
    set("recurringOutflows", r.recurringOutflows
      .map((o): RecurringOutflow | null => {
        const x = o as Record<string, unknown>;
        const amount = num(x.amount, 0, 1e12);
        const day = num(x.dayOfMonth, 1, 31);
        const title = typeof x.title === "string" ? x.title.trim().slice(0, 80) : "";
        if (!amount || !day || !title) return null;
        return { title, amount, dayOfMonth: Math.round(day), category: typeof x.category === "string" ? x.category.slice(0, 40) : undefined };
      })
      .filter((o): o is RecurringOutflow => o !== null)
      .slice(0, 30));
  }
  return out;
}

/** Defaults for a scenario overlaid with what the workspace saved. The cash cushion is shared: it is read from the base scenario. */
export function mergeAssumptions(tag: CashForecastScenarioTag, stored: Partial<ForecastAssumptions> | undefined, baseStored?: Partial<ForecastAssumptions>): ForecastAssumptions {
  const merged = { ...getScenarioDefaults(tag), ...sanitizeAssumptions(stored) };
  merged.minimumCashThreshold = sanitizeAssumptions(baseStored).minimumCashThreshold ?? merged.minimumCashThreshold ?? 0;
  if (tag !== "BASE" && !stored?.recurringOutflows) merged.recurringOutflows = sanitizeAssumptions(baseStored).recurringOutflows;
  return merged;
}

export async function loadScenarioAssumptions(workspaceId: string): Promise<Record<CashForecastScenarioTag, ForecastAssumptions>> {
  const { prisma } = await import("@/lib/prisma");
  const rows = await prisma.cashForecastAssumption.findMany({
    where: { workspaceId, isActive: true, key: { in: SCENARIOS.map(scenarioKey) } },
    orderBy: { updatedAt: "desc" },
    select: { key: true, valueJson: true },
  });
  const stored = new Map<string, Partial<ForecastAssumptions>>();
  for (const r of rows) if (!stored.has(r.key)) stored.set(r.key, (r.valueJson ?? {}) as Partial<ForecastAssumptions>);
  const base = stored.get(scenarioKey("BASE"));
  return {
    BASE: mergeAssumptions("BASE", base, base),
    BEST_CASE: mergeAssumptions("BEST_CASE", stored.get(scenarioKey("BEST_CASE")), base),
    WORST_CASE: mergeAssumptions("WORST_CASE", stored.get(scenarioKey("WORST_CASE")), base),
  };
}
