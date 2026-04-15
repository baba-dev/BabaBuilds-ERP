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
};

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
    status: "PENDING" | "PARTIALLY_PAID" | "PAID";
    totalAmount: Decimal;
    amountReceived: number | null;
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
  workspaceDefaults: {
    invoicePaymentTermsDays: number;
    minimumCashThreshold: number;
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

