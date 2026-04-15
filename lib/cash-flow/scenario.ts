import { addDays } from "date-fns";
import { Prisma } from "@prisma/client";
import type { CashForecastDirection, CashForecastScenarioTag, ForecastAssumptions, ForecastLineDraft } from "@/lib/cash-flow/types";
import { toDecimal } from "@/lib/money";

export function getScenarioDefaults(scenario: CashForecastScenarioTag): ForecastAssumptions {
  // Deterministic defaults; can be overridden by CashForecastAssumption records later.
  switch (scenario) {
    case "BEST_CASE":
      return {
        collectionsDelayDays: -3,
        inflowHaircutPercent: 0,
        outflowIncreasePercent: -2,
        movePOEarlierLaterDays: 3,
        minimumCashThreshold: 0,
        defaultInvoicePaymentTermsDays: 30,
      };
    case "WORST_CASE":
      return {
        collectionsDelayDays: 10,
        inflowHaircutPercent: 8,
        outflowIncreasePercent: 10,
        movePOEarlierLaterDays: -7,
        minimumCashThreshold: 0,
        defaultInvoicePaymentTermsDays: 30,
      };
    case "BASE":
    default:
      return {
        collectionsDelayDays: 0,
        inflowHaircutPercent: 0,
        outflowIncreasePercent: 0,
        movePOEarlierLaterDays: 0,
        minimumCashThreshold: 0,
        defaultInvoicePaymentTermsDays: 30,
      };
  }
}

export function applyScenarioToDate(date: Date, scenario: CashForecastScenarioTag, assumptions: ForecastAssumptions): Date {
  const shift = assumptions.collectionsDelayDays ?? getScenarioDefaults(scenario).collectionsDelayDays ?? 0;
  return addDays(date, shift);
}

export function applyScenarioToAmount(
  amount: Prisma.Decimal,
  scenario: CashForecastScenarioTag,
  assumptions: ForecastAssumptions,
  direction: CashForecastDirection
): Prisma.Decimal {
  const abs = toDecimal(amount).abs();
  if (direction === "INFLOW") {
    const haircut = Math.max(0, assumptions.inflowHaircutPercent ?? 0);
    return abs.mul(new Prisma.Decimal(1).minus(new Prisma.Decimal(haircut).div(100)));
  }
  const bump = assumptions.outflowIncreasePercent ?? 0;
  return abs.mul(new Prisma.Decimal(1).plus(new Prisma.Decimal(bump).div(100)));
}

export function applyScenarioToLine(line: ForecastLineDraft, scenario: CashForecastScenarioTag, assumptions: ForecastAssumptions): ForecastLineDraft {
  const expectedDate = applyScenarioToDate(line.expectedDate, scenario, assumptions);
  const direction = line.direction ?? (toDecimal(line.amount).gte(0) ? "INFLOW" : "OUTFLOW");
  const amount = line.classification === "ACTUAL" ? toDecimal(line.amount).abs() : applyScenarioToAmount(line.amount, scenario, assumptions, direction);
  return {
    ...line,
    scenarioTag: scenario,
    direction,
    expectedDate,
    amount,
  };
}

