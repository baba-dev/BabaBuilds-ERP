import type { CashFlowHorizonType, CashFlowScenarioTag } from "./types";

export const CASH_FLOW_DEFAULT_HORIZON: CashFlowHorizonType = "WEEKLY_13";
export const CASH_FLOW_DEFAULT_SCENARIO: CashFlowScenarioTag = "BASE";

export function coerceHorizonType(value: string | null | undefined): CashFlowHorizonType | null {
  if (!value) return null;
  if (value === "DAILY_30" || value === "WEEKLY_13" || value === "MONTHLY_12") return value;
  return null;
}

export function coerceScenarioTag(value: string | null | undefined): CashFlowScenarioTag | null {
  if (!value) return null;
  if (value === "BASE" || value === "BEST_CASE" || value === "WORST_CASE") return value;
  return null;
}

export function buildCashFlowContextQuery(input: { horizonType: CashFlowHorizonType; scenarioTag: CashFlowScenarioTag }) {
  const qs = new URLSearchParams();
  qs.set("horizonType", input.horizonType);
  qs.set("scenarioTag", input.scenarioTag);
  return qs.toString();
}

