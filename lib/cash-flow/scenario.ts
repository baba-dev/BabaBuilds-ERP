import { addDays } from "date-fns";
import { Prisma } from "@prisma/client";
import type { CashForecastDirection, CashForecastScenarioTag, ForecastAssumptions, ForecastLineDraft } from "@/lib/cash-flow/types";
import { toDecimal } from "@/lib/money";

export function getScenarioDefaults(scenario: CashForecastScenarioTag): ForecastAssumptions {
  const common = { minimumCashThreshold: 0, defaultInvoicePaymentTermsDays: 30, overdueCollectionDays: 7 };
  switch (scenario) {
    case "BEST_CASE":
      return { ...common, collectionsDelayDays: -3, inflowHaircutPercent: 0, outflowIncreasePercent: -2, movePOEarlierLaterDays: 3, overdueCollectionDays: 4 };
    case "WORST_CASE":
      return { ...common, collectionsDelayDays: 10, inflowHaircutPercent: 8, outflowIncreasePercent: 10, movePOEarlierLaterDays: -7, overdueCollectionDays: 21 };
    case "BASE":
    default:
      return { ...common, collectionsDelayDays: 0, inflowHaircutPercent: 0, outflowIncreasePercent: 0, movePOEarlierLaterDays: 0 };
  }
}

/** What a scenario may move: money coming in from customers (late or short), and supplier payments (earlier or later). Actuals, tax, payroll and manual entries never move. */
const isCollection = (l: ForecastLineDraft) => l.direction === "INFLOW" && (l.sourceType === "INVOICE" || l.sourceType === "RETAINER");
const isSupplierPayment = (l: ForecastLineDraft) => l.direction === "OUTFLOW" && (l.sourceType === "PURCHASE_ORDER" || l.sourceType === "EXPENSE");
const isProjected = (l: ForecastLineDraft) => l.classification !== "ACTUAL" && l.classification !== "MANUAL";

export function applyScenarioToDate(date: Date, line: Pick<ForecastLineDraft, "direction" | "sourceType" | "classification">, a: ForecastAssumptions): Date {
  if (line.classification === "ACTUAL" || line.classification === "MANUAL") return date;
  const l = line as ForecastLineDraft;
  if (isCollection(l)) return addDays(date, a.collectionsDelayDays ?? 0);
  if (isSupplierPayment(l)) return addDays(date, a.movePOEarlierLaterDays ?? 0);
  return date;
}

export function applyScenarioToAmount(amount: Prisma.Decimal, line: Pick<ForecastLineDraft, "direction" | "sourceType" | "classification">, a: ForecastAssumptions): Prisma.Decimal {
  const abs = toDecimal(amount).abs();
  const l = line as ForecastLineDraft;
  if (!isProjected(l)) return abs;
  if (l.direction === "INFLOW") {
    const haircut = Math.min(100, Math.max(0, a.inflowHaircutPercent ?? 0));
    return abs.mul(new Prisma.Decimal(1).minus(new Prisma.Decimal(haircut).div(100)));
  }
  if (l.sourceType === "TAX") return abs; // tax due dates and amounts are not discretionary
  const bump = a.outflowIncreasePercent ?? 0;
  return abs.mul(new Prisma.Decimal(1).plus(new Prisma.Decimal(bump).div(100)));
}

export function applyScenarioToLine(line: ForecastLineDraft, scenario: CashForecastScenarioTag, a: ForecastAssumptions): ForecastLineDraft {
  const direction: CashForecastDirection = line.direction ?? (toDecimal(line.amount).gte(0) ? "INFLOW" : "OUTFLOW");
  const withDir = { ...line, direction };
  return { ...withDir, scenarioTag: scenario, expectedDate: applyScenarioToDate(new Date(line.expectedDate), withDir, a), amount: applyScenarioToAmount(toDecimal(line.amount), withDir, a) };
}
