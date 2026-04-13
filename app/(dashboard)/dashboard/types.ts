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
    serviceOrderConversion: number;
    shopRevenueThisMonth: number;
    ordersLast30Days: number;
    publishedServices: number;
    topServices: Array<{ serviceName: string; orderCount: number; revenue: number }>;
    recentServiceOrders: Array<{ id: string; serviceName: string; buyerName: string; amount: number; status: string; createdAt: string | Date }>;
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
    revenueVsExpense: Array<{ name: string; revenue: number; expenses: number }>;
    recurringRevenue: Array<{ name: string; mrr: number }>;
    receivablesAging: Array<{ bucket: string; value: number }>;
    reconciliation: Array<{ name: string; reconciled: number; unreconciled: number }>;
    proposalFunnel: Array<{ stage: string; value: number }>;
    serviceOrderHealth: Array<{ status: string; value: number }>;
  };
  recentInvoices: RecentInvoiceRow[];
};
