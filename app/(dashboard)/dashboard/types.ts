export type RecentInvoiceRow = {
  id: string;
  invoiceDate: string;
  dueDate: string | null;
  invoiceNumber: string;
  clientName: string;
  clientId: string | null;
  status: string;
  /** Invoice currency; amounts on a row are in this currency, not the workspace base currency. */
  currency: string;
  totalAmount: number;
  amountReceived: number;
  pdfPath: string;
};

export type IntegrationStatus = "healthy" | "partial" | "missing";

export type SetupStepId = "profile" | "client" | "invoice" | "payments" | "email";

export type AgingBucket = "not_due" | "1_30" | "31_60" | "61_plus";

export type UpcomingKind = "invoice_due" | "retainer_billing" | "tax_return";

export type MonthPoint = { monthId: string; name: string; revenue: number; expenses: number };

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
  workspace: { name: string; baseCurrency: string };
  optionalModules: Array<{ moduleKey: string; label: string; description: string; href: string }>;
  health: {
    setupCompletion: number;
    setupComplete: boolean;
    setupSteps: Array<{ id: SetupStepId; done: boolean }>;
    subscriptionState: string;
    trialEndsAt: string | null;
    planTier: string;
    integrationReadiness: {
      summary: Record<IntegrationStatus, number>;
      integrations: Record<"groq" | "payment" | "smtp" | "shop", { configured: boolean; status: IntegrationStatus }>;
    };
  };
  attention: {
    totalUrgent: number;
    overdueReceivables: number;
    outstandingReceivables: number;
    dueSoonReceivables: number;
    unreconciledTransactions: number;
    retainersDueSoon: number;
    acceptedUninvoicedProposals: number;
    urgentTasks: number;
    criticalNotifications: number;
    criticalViolations: number;
    complianceIssues: number;
    failedImports: number;
    lowStock: number;
  };
  receivables: {
    outstandingAmount: number;
    overdueAmount: number;
    aging: Array<{ bucket: AgingBucket; value: number }>;
    watchlist: Array<{
      id: string;
      invoiceNumber: string;
      clientName: string;
      outstanding: number;
      dueDate: string;
      daysOverdue: number;
    }>;
  };
  financialPulse: {
    billedRevenue: number;
    collected: number;
    receivables: number;
    expenses: number;
    netIncome: number;
    estimatedTax: number;
    liquidAssets: number;
    recurringRevenue: number;
    arr: number;
    reconciliationProgress: number;
    /** Bank lines imported so far; 0 means there is nothing to reconcile yet. */
    bankTransactions: number;
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
    recentShopOrders: Array<{ id: string; itemSummary: string; buyerName: string; amount: number; status: string; createdAt: string }>;
  };
  operations: {
    hasOperationalData: boolean;
    lowStockCount: number;
    openPurchaseOrders: number;
    recentInventoryMovements: Array<{ id: string; productName: string; quantity: number; type: string; createdAt: string }>;
    openTasks: number;
    blockedTasks: number;
  };
  trust: {
    /** `RESTRICTED` when the member may not see accounting data. */
    integrityStatus: string;
    lastIntegrityRunAt: string | null;
    violationCount: number;
    criticalViolations: number;
    taxOverrideCount: number;
    taxOpenBlockers: number;
    taxCriticalBlockers: number;
  };
  upcoming: Array<{
    kind: UpcomingKind;
    id: string;
    title: string;
    reference: string;
    date: string;
    amount: number | null;
    href: string;
  }>;
  activity: Array<{ id: string; action: string; entityType: string | null; status: string; createdAt: string; actor: string | null }>;
  charts: {
    bucketTimeZone: string;
    /** `YYYY-MM` of the month "now" falls in, in the bucket time zone. */
    currentMonthId: string;
    revenueVsExpense: MonthPoint[];
    recurringRevenue: Array<{ monthId: string; name: string; mrr: number }>;
    proposalFunnel: Array<{ stage: string; value: number }>;
    shopOrderHealth: Array<{ status: string; value: number }>;
  };
  recentInvoices: RecentInvoiceRow[];
  countryCode: string;
};
