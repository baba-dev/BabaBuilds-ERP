"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import type { CashFlowHorizonType, CashFlowScenarioTag } from "./types";

export const CASH_FLOW_DEFAULT_HORIZON: CashFlowHorizonType = "WEEKLY_13";
export const CASH_FLOW_DEFAULT_SCENARIO: CashFlowScenarioTag = "BASE";

export type CashFlowContext = {
  horizonType: CashFlowHorizonType;
  scenarioTag: CashFlowScenarioTag;
};

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

export function getCashFlowContextFromSearchParams(searchParams: URLSearchParams): CashFlowContext {
  const horizonType = coerceHorizonType(searchParams.get("horizonType")) ?? CASH_FLOW_DEFAULT_HORIZON;
  const scenarioTag = coerceScenarioTag(searchParams.get("scenarioTag")) ?? CASH_FLOW_DEFAULT_SCENARIO;
  return { horizonType, scenarioTag };
}

export function readCashFlowContextFromSearchParams(
  searchParams: URLSearchParams,
  fallback?: CashFlowContext,
): CashFlowContext {
  const ctx = getCashFlowContextFromSearchParams(searchParams);
  return {
    horizonType: ctx.horizonType ?? fallback?.horizonType ?? CASH_FLOW_DEFAULT_HORIZON,
    scenarioTag: ctx.scenarioTag ?? fallback?.scenarioTag ?? CASH_FLOW_DEFAULT_SCENARIO,
  };
}

export function readCashFlowContextFromUrl(fallback?: CashFlowContext): CashFlowContext {
  if (typeof window === "undefined") {
    return fallback ?? { horizonType: CASH_FLOW_DEFAULT_HORIZON, scenarioTag: CASH_FLOW_DEFAULT_SCENARIO };
  }
  const params = new URLSearchParams(window.location.search);
  return readCashFlowContextFromSearchParams(params, fallback);
}

export function writeCashFlowContextToUrl(input: CashFlowContext, opts?: { replace?: boolean }) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("horizonType", input.horizonType);
  url.searchParams.set("scenarioTag", input.scenarioTag);
  if (opts?.replace ?? true) {
    window.history.replaceState({}, "", url.toString());
  } else {
    window.history.pushState({}, "", url.toString());
  }
}

// Back-compat naming (used across pages during refactor)
export const updateCashFlowContextInUrl = writeCashFlowContextToUrl;

export function useCashFlowContextFromUrl(fallback?: CashFlowContext): CashFlowContext {
  const search = useSearchParams();
  return useMemo(() => readCashFlowContextFromSearchParams(search, fallback), [search, fallback]);
}

export function useCashFlowUrlContext(fallback?: CashFlowContext): CashFlowContext {
  return useCashFlowContextFromUrl(fallback);
}

export function useCashFlowContextRouterSync() {
  // Reserved for future: sync context changes via router.
  // For now, URL updates are done via history.replaceState in writeCashFlowContextToUrl().
  return null;
}

