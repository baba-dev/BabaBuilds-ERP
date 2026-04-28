export type RecentInvoiceRow = {
  id: string;
  invoiceDate: string | Date;
  invoiceNumber: string;
  clientName: string;
  billingMonth?: string | null;
  status: string;
  totalAmount: number;
  amountReceived?: number | null;
  pdfPath: string;
  updatedAt?: string | Date | null;
};

export type IntegrationStatus = "healthy" | "partial" | "missing";

export type DashboardData = {
  permissions: {
    canViewAccounting: boolean;
    canViewOperations: boolean;
    canViewSales: boolean;
    canViewCharts: boolean;
    canViewRecentLedger: boolean;
    canViewTrust: boolean;
    canRunIntegrityScan: boolean;
    canManageBilling: boolean;
  };
  optionalModules: Array<{
    moduleKey: string;
    label: string;
    description: string;
    href: string;
  }>;
  health: {
    setupCompletion: number;
    onboardingProgress: number;
    setupComplete: boolean;
    subscriptionState: string;
    trialEndsAt: string | null;
    planTier: string;
    integrationReadiness: {
      summary: Record<IntegrationStatus, number>;
      integrations: Record<"groq" | "payment" | "smtp" | "shop", { configured: boolean; status: IntegrationStatus }>;
    };
    complianceWarnings: Array<{ label: string; severity: "info" | "warning" | "critical" }>;
  };
  attention: {
    totalUrgent: number;
    overdueInvoices: number;
    pendingInvoices: number;
    overdueReceivables?: number;
    outstandingReceivables?: number;
    unreconciledTransactions: number;
    retainersDueSoon: number;
    acceptedUninvoicedProposals: number;
    urgentTasks: number;
    criticalNotifications: number;
    complianceIssues: number;
    failedImports: number;
    cards: Array<{ id: string; title: string; value: number; tone: "critical" | "warning" | "info"; href?: string; helper: string }>;
  };
  financialPulse: {
    billedRevenue: number;
    receivables: number;
    expenses: number;
    estimatedTax: number;
    liquidAssets: number;
    recurringRevenue: number;
    arr: number;
    reconciliationProgress: number;
  };
  salesAndShop: {
    proposalFunnel: { draft: number; sent: number; viewed: number; accepted: number; invoiced: number; declined: number };
    acceptedAwaitingInvoicing: number;
    shopEnabled: boolean;
    publicShopOrders: { total: number; paid: number; pending: number; failed: number };
    shopOrderConversion: number;
    shopRevenueThisMonth: number;
    shopRevenuePreviousMonth: number;
    revenueChangeVsPriorMonthPct: number | null;
    ordersLast30Days: number;
    ordersPrior30Days: number;
    orderChangeVsPrior30DaysPct: number | null;
    publishedProducts: number;
    topProducts: Array<{ productName: string; orderCount: number; revenue: number }>;
    kpiPeriods: Record<
      "proposalFunnel" | "acceptedAwaitingInvoicing" | "publicShopOrders" | "shopOrderConversion" | "topProducts" | "shopRevenueThisMonth" | "ordersLast30Days",
      { type: "FY" | "ROLLING_30D" | "ALL_TIME"; period: string; start: string | null; endExclusive: string | null }
    >;
    recentShopOrders: Array<{ id: string; itemSummary: string; buyerName: string; amount: number; status: string; createdAt: string | Date }>;
  };
  operations: {
    hasOperationalData: boolean;
    lowStockCount: number;
    openPurchaseOrders: number;
    recentInventoryMovements: Array<{ id: string; productName: string; quantity: number; type: string; createdAt: string | Date }>;
    openTasks: number;
    blockedTasks: number;
  };
  trust: {
    integrityStatus: string;
    lastIntegrityRunAt: string | Date | null;
    violationCount: number;
    criticalViolations: number;
    taxOverrideCount: number;
    recentTaxAudits: Array<{ id: string; source: string; createdAt: string | Date }>;
  };
  activity: Array<{ id: string; action: string; status: string; createdAt: string | Date; actor: string | null }>;
  charts: {
    bucketTimeZone: string;
    revenueVsExpense: Array<{ name: string; revenue: number; expenses: number }>;
    recurringRevenue: Array<{ name: string; mrr: number }>;
    receivablesAging: Array<{ bucket: string; value: number }>;
    reconciliation: Array<{ name: string; reconciled: number; unreconciled: number }>;
    proposalFunnel: Array<{ stage: string; value: number }>;
    shopOrderHealth: Array<{ status: string; value: number }>;
  };
  recentInvoices: RecentInvoiceRow[];
  countryCode: string;
};
