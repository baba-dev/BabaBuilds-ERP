import type { ForecastSnapshotResult } from "@/lib/cash-flow/forecast-engine";
import type { ForecastLineDraft, ForecastSourceData } from "@/lib/cash-flow/types";

const n = (v: unknown) => { const x = Number(v?.toString?.() ?? v); return Number.isFinite(x) ? x : 0; };

export type ActionItem = { title: string; amount: number; date: string | null; sourceType: string; sourceId: string | null; note?: string };
export type CashAction = {
  kind: "SHORTFALL" | "CHASE_RECEIVABLES" | "DEFER_PAYMENTS" | "WORST_CASE" | "CONCENTRATION" | "SETUP_ACCOUNT" | "OVERDUE_BILLS";
  severity: "critical" | "warning" | "info";
  amount?: number;
  date?: string | null;
  items: ActionItem[];
  /** Page to act on this in. */
  href: string;
  /** Values the interface puts into translated sentences. */
  params?: Record<string, string | number>;
};

export const hrefFor = (sourceType: string): string => {
  switch (sourceType) {
    case "INVOICE": return "/ar-collections";
    case "RETAINER": return "/retainers";
    case "EXPENSE": return "/expenses";
    case "PURCHASE_ORDER": return "/inventory/purchase-orders";
    case "PAYROLL": return "/payroll";
    case "TAX": return "/tax";
    case "BANK_TRANSACTION": return "/reconciliation";
    default: return "/cash-flow";
  }
};

const toItem = (l: ForecastLineDraft): ActionItem => ({ title: l.title, amount: n(l.amount), date: new Date(l.expectedDate).toISOString(), sourceType: l.sourceType, sourceId: l.sourceId ?? null });
const top = (lines: ForecastLineDraft[], k = 5) => [...lines].sort((a, b) => n(b.amount) - n(a.amount)).slice(0, k).map(toItem);

/** Ranked, specific things to do about the forecast. Nothing here is generic advice: each item points at records in the data. */
export function buildActions(base: ForecastSnapshotResult, worst: ForecastSnapshotResult, sources: ForecastSourceData): CashAction[] {
  const actions: CashAction[] = [];
  const threshold = n(base.assumptions.minimumCashThreshold);
  const lowest = n(base.lowestCash);

  if (!(sources.accounts ?? []).length) {
    actions.push({ kind: "SETUP_ACCOUNT", severity: "warning", items: [], href: "/reconciliation/import" });
  }

  const overdueInvoices = base.lineItems.filter((l) => l.sourceType === "INVOICE" && n((l.metadataJson as { overdueDays?: number } | undefined)?.overdueDays) > 0);
  const supplierLines = base.lineItems.filter((l) => l.direction === "OUTFLOW" && (l.sourceType === "EXPENSE" || l.sourceType === "PURCHASE_ORDER") && l.classification !== "ACTUAL");

  if (base.crunchDate) {
    const shortfall = Math.max(0, threshold - lowest);
    actions.push({ kind: "SHORTFALL", severity: lowest < 0 ? "critical" : "warning", amount: shortfall, date: (base.lowestCashDate ?? base.crunchDate).toISOString(), items: [], href: "/cash-flow", params: { first: base.crunchDate.toISOString() } });
    if (overdueInvoices.length) actions.push({ kind: "CHASE_RECEIVABLES", severity: "warning", amount: overdueInvoices.reduce((s, l) => s + n(l.amount), 0), items: top(overdueInvoices), href: "/ar-collections" });
    // Payments due before the low point are the ones that can still be moved to help it.
    const before = supplierLines.filter((l) => new Date(l.expectedDate) <= (base.lowestCashDate ?? base.crunchDate!));
    if (before.length) actions.push({ kind: "DEFER_PAYMENTS", severity: "info", amount: before.reduce((s, l) => s + n(l.amount), 0), items: top(before), href: "/expenses" });
  } else if (overdueInvoices.length) {
    actions.push({ kind: "CHASE_RECEIVABLES", severity: "info", amount: overdueInvoices.reduce((s, l) => s + n(l.amount), 0), items: top(overdueInvoices), href: "/ar-collections" });
  }

  const overdueBills = (sources.payables ?? []).filter((p) => p.overdue);
  if (overdueBills.length) {
    actions.push({
      kind: "OVERDUE_BILLS", severity: "warning", amount: overdueBills.reduce((s, p) => s + n(p.amount), 0), href: "/expenses",
      items: overdueBills.sort((a, b) => n(b.amount) - n(a.amount)).slice(0, 5).map((p) => ({ title: p.vendor, amount: n(p.amount), date: p.dueDate.toISOString(), sourceType: "EXPENSE", sourceId: p.id, note: p.msme ? "MSME" : undefined })),
    });
  }

  if (!base.crunchDate && worst.crunchDate) {
    actions.push({ kind: "WORST_CASE", severity: "warning", amount: Math.max(0, threshold - n(worst.lowestCash)), date: (worst.lowestCashDate ?? worst.crunchDate).toISOString(), items: [], href: "/cash-flow", params: { first: worst.crunchDate.toISOString() } });
  }

  // One customer behind most of the expected money is a risk of its own.
  const byClient = new Map<string, { name: string; amount: number }>();
  let totalIn = 0;
  for (const l of base.lineItems) {
    if (l.direction !== "INFLOW" || l.classification === "ACTUAL" || (l.sourceType !== "INVOICE" && l.sourceType !== "RETAINER")) continue;
    const meta = (l.metadataJson ?? {}) as { clientName?: string };
    const name = meta.clientName ?? l.title.split("·")[1]?.trim() ?? l.title;
    const cur = byClient.get(name) ?? { name, amount: 0 };
    cur.amount += n(l.amount); byClient.set(name, cur); totalIn += n(l.amount);
  }
  const biggest = [...byClient.values()].sort((a, b) => b.amount - a.amount)[0];
  if (biggest && byClient.size >= 2 && totalIn > 0 && biggest.amount / totalIn >= 0.5) {
    actions.push({ kind: "CONCENTRATION", severity: "info", amount: biggest.amount, items: [{ title: biggest.name, amount: biggest.amount, date: null, sourceType: "INVOICE", sourceId: null }], href: "/clients", params: { share: Math.round((biggest.amount / totalIn) * 100) } });
  }

  const rank = { critical: 0, warning: 1, info: 2 } as const;
  return actions.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export type Kpis = {
  cashNow: number; lowestCash: number; lowestCashDate: string | null; closingCash: number; threshold: number;
  /** Days from today until cash first falls under the cushion; null when it stays above through the horizon. */
  runwayDays: number | null;
  /** What can be spent today without the balance dipping under the cushion at any point in the horizon. */
  safeToSpend: number;
  expectedIn: number; expectedOut: number; net: number;
  overdueReceivables: number; overdueBills: number;
  /** Share of expected inflow that is backed by an invoice already issued. */
  coveredByInvoicesPct: number | null;
  confidence: number | null;
};

export function buildKpis(base: ForecastSnapshotResult, sources: ForecastSourceData, now: Date): Kpis {
  const threshold = n(base.assumptions.minimumCashThreshold);
  const lowest = n(base.lowestCash);
  const overdueInvoices = base.lineItems.filter((l) => l.sourceType === "INVOICE" && n((l.metadataJson as { overdueDays?: number } | undefined)?.overdueDays) > 0);
  const inflowLines = base.lineItems.filter((l) => l.direction === "INFLOW" && l.classification !== "ACTUAL");
  const invoiceIn = inflowLines.filter((l) => l.sourceType === "INVOICE").reduce((s, l) => s + n(l.amount), 0);
  const allIn = inflowLines.reduce((s, l) => s + n(l.amount), 0);
  return {
    cashNow: n(base.openingCash), lowestCash: lowest, lowestCashDate: base.lowestCashDate?.toISOString() ?? null, closingCash: n(base.closingCash), threshold,
    runwayDays: base.crunchDate ? Math.max(0, Math.round((base.crunchDate.getTime() - now.getTime()) / 86_400_000)) : null,
    safeToSpend: Math.max(0, Math.min(n(base.openingCash), lowest) - threshold),
    expectedIn: n(base.totalProjectedInflows), expectedOut: n(base.totalProjectedOutflows), net: n(base.totalProjectedInflows) - n(base.totalProjectedOutflows),
    overdueReceivables: overdueInvoices.reduce((s, l) => s + n(l.amount), 0),
    overdueBills: (sources.payables ?? []).filter((p) => p.overdue).reduce((s, p) => s + n(p.amount), 0),
    coveredByInvoicesPct: allIn > 0 ? Math.round((invoiceIn / allIn) * 100) : null,
    confidence: base.confidenceScore == null ? null : Math.round(base.confidenceScore * 100),
  };
}
