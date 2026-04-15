import type { AlertsResponse, CashFlowHorizonType, CashFlowScenarioTag, SnapshotDetail, SnapshotListItem } from "./types";

export async function refreshCashForecast(input: {
  horizonType: CashFlowHorizonType;
  scenarioTag: CashFlowScenarioTag;
  startDate?: Date;
}) {
  const res = await fetch("/api/cash-flow/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      horizonType: input.horizonType,
      scenarioTag: input.scenarioTag,
      startDate: input.startDate ? input.startDate.toISOString() : undefined,
    }),
  });
  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    throw new Error(json?.error ?? "Failed to refresh forecast");
  }
  return json as { snapshotId: string };
}

export async function fetchCashFlowAlerts(input: { horizonType: CashFlowHorizonType; scenarioTag: CashFlowScenarioTag; limit?: number }): Promise<AlertsResponse> {
  const qs = new URLSearchParams({
    horizonType: input.horizonType,
    scenarioTag: input.scenarioTag,
    ...(input.limit ? { limit: String(input.limit) } : {}),
  });
  const res = await fetch(`/api/cash-flow/alerts?${qs.toString()}`, { cache: "no-store" });
  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) throw new Error(json?.error ?? "Failed to load alerts");
  return (json?.data ?? { snapshot: null, alerts: [] }) as AlertsResponse;
}

export async function fetchSnapshots(input: { horizonType: CashFlowHorizonType; scenarioTag: CashFlowScenarioTag; limit?: number }): Promise<SnapshotListItem[]> {
  const qs = new URLSearchParams({
    horizonType: input.horizonType,
    scenarioTag: input.scenarioTag,
    ...(input.limit ? { limit: String(input.limit) } : {}),
  });
  const res = await fetch(`/api/cash-flow/snapshots?${qs.toString()}`, { cache: "no-store" });
  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) throw new Error(json?.error ?? "Failed to load snapshots");
  return (json?.data ?? []) as SnapshotListItem[];
}

export async function fetchCashFlowSnapshotWithPeriods(input: { horizonType: CashFlowHorizonType; scenarioTag: CashFlowScenarioTag }): Promise<SnapshotDetail | null> {
  const list = await fetchSnapshots({ horizonType: input.horizonType, scenarioTag: input.scenarioTag, limit: 1 });
  const head = list[0];
  if (!head) return null;

  const res = await fetch(`/api/cash-flow/snapshot/${head.id}`, { cache: "no-store" });
  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) throw new Error(json?.error ?? "Failed to load snapshot");
  return (json?.data ?? null) as SnapshotDetail | null;
}

export async function listAssumptions(): Promise<Array<{ key: string; valueJson: any }>> {
  const res = await fetch("/api/cash-flow/assumptions", { cache: "no-store" });
  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) throw new Error(json?.error ?? "Failed to load assumptions");
  return (json?.data ?? []).map((row: any) => ({ key: row.key, valueJson: row.valueJson }));
}

export async function upsertAssumption(input: { key: string; valueJson: any; effectiveFrom?: Date; isActive?: boolean }) {
  const res = await fetch("/api/cash-flow/assumptions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      key: input.key,
      valueJson: input.valueJson,
      effectiveFrom: input.effectiveFrom ? input.effectiveFrom.toISOString() : undefined,
      isActive: input.isActive,
    }),
  });
  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) throw new Error(json?.error ?? "Failed to save assumption");
  return json?.data ?? null;
}

export async function refreshSnapshot(input: { horizonType: CashFlowHorizonType; scenarioTag: CashFlowScenarioTag }) {
  return refreshCashForecast({ horizonType: input.horizonType, scenarioTag: input.scenarioTag });
}

export async function fetchLatestSnapshot(input: { horizonType: CashFlowHorizonType; scenarioTag: CashFlowScenarioTag }): Promise<SnapshotListItem | null> {
  const list = await fetchSnapshots({ horizonType: input.horizonType, scenarioTag: input.scenarioTag, limit: 1 });
  return list[0] ?? null;
}

export function formatMoney(value: unknown, currency = "INR", locale = "en-IN") {
  const n = Number(typeof value === "string" ? value : (value as any)?.toString?.() ?? value);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

