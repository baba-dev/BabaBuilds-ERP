/**
 * Dashboard read permissions.
 *
 * The dashboard endpoint answers every signed-in member, so what a member is
 * not allowed to see has to be removed on the server. Hiding a card in the
 * browser is not access control: the numbers would still be in the response.
 */

export type DashboardViewFlags = {
  canViewAccounting: boolean;
  canViewSales: boolean;
  canViewOperations: boolean;
};

export type DashboardAttentionCounts = {
  overdueReceivables: number;
  unreconciledTransactions: number;
  acceptedUninvoicedProposals: number;
  urgentTasks: number;
  criticalNotifications: number;
  criticalViolations: number;
  failedImports: number;
  lowStock: number;
};

/**
 * Things that need someone to act, each of which the dashboard lists with a link.
 * Informational counts (open invoices, retainers billing soon) and unread alerts,
 * which the header bell already shows, are not included.
 */
export function countUrgentItems(counts: DashboardAttentionCounts): number {
  return (
    counts.overdueReceivables +
    counts.unreconciledTransactions +
    counts.acceptedUninvoicedProposals +
    counts.urgentTasks +
    counts.criticalViolations +
    counts.failedImports +
    counts.lowStock
  );
}

const NUMERIC_STRING = /^-?\d+(\.\d+)?$/;

/** Same shape, no information: numbers and money strings become zero, lists become empty. */
export function blankValues<T>(value: T): T {
  if (typeof value === "number") return 0 as T;
  if (typeof value === "string") return (NUMERIC_STRING.test(value) ? "0.00" : value) as T;
  if (Array.isArray(value)) return [] as T;
  if (value instanceof Date) return value;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, blankValues(entry)]),
    ) as T;
  }
  return value;
}

type RedactablePayload = {
  attention: DashboardAttentionCounts & {
    totalUrgent: number;
    outstandingReceivables: number;
    dueSoonReceivables: number;
    retainersDueSoon: number;
    complianceIssues: number;
  };
  financialPulse: Record<string, unknown>;
  receivables: Record<string, unknown>;
  salesAndShop: { shopEnabled: boolean; kpiPeriods: unknown } & Record<string, unknown>;
  operations: Record<string, unknown>;
  trust: { integrityStatus: string } & Record<string, unknown>;
  charts: {
    revenueVsExpense: unknown[];
    recurringRevenue: unknown[];
    proposalFunnel: unknown[];
    shopOrderHealth: unknown[];
  } & Record<string, unknown>;
  upcoming: Array<{ kind: string }>;
  activity: unknown[];
  recentInvoices: unknown[];
};

const ACCOUNTING_UPCOMING_KINDS = new Set(["invoice_due", "retainer_billing", "tax_return"]);

export function redactDashboardPayload<T extends RedactablePayload>(payload: T, flags: DashboardViewFlags): T {
  const next: T = { ...payload, attention: { ...payload.attention }, charts: { ...payload.charts } };

  if (!flags.canViewAccounting) {
    next.financialPulse = blankValues(payload.financialPulse);
    next.receivables = blankValues(payload.receivables);
    next.trust = { ...blankValues(payload.trust), integrityStatus: "RESTRICTED", lastIntegrityRunAt: null };
    next.recentInvoices = [];
    next.activity = [];
    next.upcoming = payload.upcoming.filter((item) => !ACCOUNTING_UPCOMING_KINDS.has(item.kind));
    next.charts.revenueVsExpense = [];
    next.charts.recurringRevenue = [];
    next.attention.overdueReceivables = 0;
    next.attention.outstandingReceivables = 0;
    next.attention.dueSoonReceivables = 0;
    next.attention.unreconciledTransactions = 0;
    next.attention.retainersDueSoon = 0;
    next.attention.criticalViolations = 0;
    next.attention.complianceIssues = 0;
    next.attention.failedImports = 0;
  }

  if (!flags.canViewSales) {
    next.salesAndShop = {
      ...blankValues(payload.salesAndShop),
      shopEnabled: payload.salesAndShop.shopEnabled,
      kpiPeriods: payload.salesAndShop.kpiPeriods,
    };
    next.charts.proposalFunnel = [];
    next.charts.shopOrderHealth = [];
    next.attention.acceptedUninvoicedProposals = 0;
  }

  if (!flags.canViewOperations) {
    next.operations = blankValues(payload.operations);
    next.attention.lowStock = 0;
  }

  next.attention.totalUrgent = countUrgentItems(next.attention);
  return next;
}
