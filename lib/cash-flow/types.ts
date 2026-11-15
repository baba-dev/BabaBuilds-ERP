import type {
  CashForecastClassification,
  CashForecastDirection,
  CashForecastHorizonType,
  CashForecastRiskLevel,
  CashForecastScenarioTag,
  CashForecastSourceType,
  Prisma,
} from "@prisma/client";

export type Decimal = Prisma.Decimal;

export type ForecastBucket = {
  periodStart: Date;
  periodEnd: Date; // exclusive upper bound
  bucketLabel: string;
};

export type ForecastLineDraft = {
  direction?: CashForecastDirection;
  sourceType: CashForecastSourceType;
  sourceId?: string | null;
  amount: Decimal;
  expectedDate: Date;
  confidence?: number | null;
  scenarioTag?: CashForecastScenarioTag;
  classification: CashForecastClassification;
  title: string;
  explanation?: string | null;
  metadataJson?: unknown;
};

export type ForecastAssumptions = {
  collectionsDelayDays: number;
  inflowHaircutPercent: number;
  outflowIncreasePercent: number;
  movePOEarlierLaterDays: number;
  minimumCashThreshold: number;
  defaultInvoicePaymentTermsDays: number;
  /** Days after today that a receivable already past due is assumed to be collected. */
  overdueCollectionDays?: number;
  recurringOutflows?: Array<{
    title: string;
    amount: number;
    dayOfMonth: number; // 1-31
    category?: string;
  }>;
};

export async function getForecastAssumptionsForWorkspace(args: {
  workspaceId: string;
  scenarioTag: CashForecastScenarioTag;
}): Promise<ForecastAssumptions> {
  const { loadScenarioAssumptions } = await import("@/lib/cash-flow/assumptions");
  return (await loadScenarioAssumptions(args.workspaceId))[args.scenarioTag];
}

export type ForecastSourceData = {
  openingCash: Decimal;
  bankTransactions: Array<{ id: string; date: Date; description: string; amount: Decimal; accountId: string | null }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    clientName: string;
    invoiceDate: Date;
    dueDate: Date | null;
    expectedPaymentDate: Date | null;
    paymentTermsDays: number | null;
    status: "PENDING" | "PARTIALLY_PAID" | "PAID" | "VOID";
    totalAmount: Decimal;
    amountReceived: number | Decimal | null;
    /** Rate to the workspace currency; amounts above are in the invoice currency. */
    exchangeRate?: number | Decimal | null;
    clientId: string | null;
  }>;
  clientPaymentBehavior: Record<
    string,
    {
      avgDaysToPay: number | null;
      medianDaysToPay: number | null;
      onTimeRate: number | null;
      lateRate: number | null;
      partialPaymentRate: number | null;
    }
  >;
  retainers: Array<{
    id: string;
    clientName: string;
    amount: Decimal;
    frequency: string;
    status: string;
    nextBillingDate: Date;
    serviceName: string;
  }>;
  purchaseOrders: Array<{
    id: string;
    poNumber: string;
    supplier: string;
    status: string;
    expectedDate: Date | null;
    expectedPaymentDate: Date | null;
    totalAmount: Decimal;
  }>;
  manualAdjustments: Array<{
    id: string;
    date: Date;
    amount: Decimal;
    direction: CashForecastDirection;
    reason: string;
    category: string | null;
  }>;
  payrollOutflows: Array<{
    accountingTransactionId: string;
    payrollRunId: string;
    postedAt: Date;
    amount: Decimal;
    currency: string;
    sourceRef: string | null;
  }>;
  /** GST cash due on GSTR-3B (India), from the GST engine; estimated until the period closes. */
  gstPayments?: Array<{ id: string; periodKey: string; dueDate: Date; amount: Decimal; label: string; estimated: boolean }>;
  /** Recurring expense templates that are still running (cash-paid ones leave on their run date, bills on their due date). */
  recurringExpenses?: Array<{ id: string; vendor: string; category: string; amount: Decimal; frequency: string; nextRunDate: Date; endDate: Date | null; dueInDays: number | null; paid: boolean }>;
  /** Statutory payments still due and salaries still to pay on posted payroll runs. */
  payrollCommitments?: Array<{ key: string; kind: string; title: string; amount: Decimal; date: Date; overdue: boolean }>;
  /** Cash paid out by the last few payroll runs, newest first, to project the next ones. */
  payrollHistory?: Array<{ runId: string; postedAt: Date; amount: Decimal }>;
  /** Purchase orders that already have a bill, so the order is not counted a second time. */
  purchaseOrdersWithBills?: string[];
  /** Cash and bank balances at the start of the horizon, per account. */
  accounts?: Array<{ id: string; name: string; balance: Decimal; currency: string }>;
  /** Approved bills not yet paid, each landing on its due date (overdue ones land today). */
  payables?: Array<{ id: string; vendor: string; dueDate: Date; amount: Decimal; overdue: boolean; invoiceNo: string | null; msme: boolean }>;
  workspaceDefaults: {
    invoicePaymentTermsDays: number;
    minimumCashThreshold: number;
  };
  debug?: {
    telemetry: {
      elapsedMs: number;
      openingCashComputationMs: number;
      counts: {
        accounts: number;
        bankTransactions: number;
        invoices: number;
        retainers: number;
        purchaseOrders: number;
        manualAdjustments: number;
        clientPaymentBehaviors: number;
        payrollTransactions: number;
        txUpToStart: number;
      };
    };
  };
};

export type ForecastEngineInput = {
  workspaceId: string;
  horizonType: CashForecastHorizonType;
  scenarioTag: CashForecastScenarioTag;
  startDate: Date;
  now?: Date;
};

export type ForecastPeriodResult = {
  periodStart: Date;
  periodEnd: Date;
  bucketLabel: string;
  openingCash: Decimal;
  actualInflows: Decimal;
  projectedInflows: Decimal;
  actualOutflows: Decimal;
  projectedOutflows: Decimal;
  closingCash: Decimal;
  riskLevel: CashForecastRiskLevel;
  lineItems: ForecastLineDraft[];
};

export type ForecastSnapshotResult = {
  horizonType: CashForecastHorizonType;
  scenarioTag: CashForecastScenarioTag;
  startDate: Date;
  endDate: Date;
  openingCash: Decimal;
  closingCash: Decimal;
  totalProjectedInflows: Decimal;
  totalProjectedOutflows: Decimal;
  confidenceScore: number | null;
  assumptions: ForecastAssumptions;
  periods: ForecastPeriodResult[];
  lineItems: ForecastLineDraft[];
  crunchDate: Date | null;
  drivers: {
    inflows: Array<{ key: string; sourceType: CashForecastSourceType; amount: Decimal }>;
    outflows: Array<{ key: string; sourceType: CashForecastSourceType; amount: Decimal }>;
  };
};

export type {
  CashForecastClassification,
  CashForecastDirection,
  CashForecastHorizonType,
  CashForecastRiskLevel,
  CashForecastScenarioTag,
  CashForecastSourceType,
};
