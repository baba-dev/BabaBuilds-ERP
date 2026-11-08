import type { RetainerDisplayStatus, RetainerStatus } from "@/lib/retainers/status";

export type RetainerListItemDto = {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  status: RetainerStatus;
  displayStatus: RetainerDisplayStatus;
  frequency: string;
  currency: string;
  subtotal: string;
  taxAmount: string;
  total: string;
  /** Per-cycle total converted to a monthly figure, in the retainer's currency. */
  monthlyTotal: string;
  nextBillingDate: string;
  daysToNext: number;
  endDate: string | null;
  maxCycles: number | null;
  cyclesBilled: number;
  lastBilledAt: string | null;
  lastError: string | null;
  itemCount: number;
  pendingUsageCount: number;
  emailInvoice: boolean;
  autoAppendMonth: boolean;
  sourceProposal: { id: string; proposalNo: string } | null;
};

export type RetainerInvoiceDto = {
  id: string;
  /** Automatic payment reminders already sent, and when the next one goes out (null = none left / not applicable). */
  remindersSent: number;
  nextReminderAt: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  status: string;
  currency: string;
  total: string;
  balance: string;
  overdue: boolean;
};

export type RetainerDetailDto = RetainerListItemDto & {
  notes: string | null;
  clientEmail: string | null;
  exchangeRate: string;
  paymentTermsDays: number;
  items: Array<{ id: string; serviceTemplateId: string | null; title: string; quantity: number; unitPrice: string; taxRatePercent: number; total: string }>;
  upcoming: Array<{ date: string; total: string }>;
  usage: Array<{ id: string; description: string; quantity: string; unitPrice: string; total: string; taxRatePercent: number | null; status: string; createdAt: string }>;
  remindersEnabled: boolean;
  autoRenew: boolean;
  renewCycles: number | null;
  priceChanges: Array<{ id: string; effectiveDate: string; percent: number; note: string | null; appliedAt: string | null }>;
  invoices: RetainerInvoiceDto[];
  invoiceTotals: { billed: string; outstanding: string; count: number };
  timeline: Array<{ id: string; type: string; message: string | null; createdAt: string }>;
};

export type RetainerListResponse = {
  data: RetainerListItemDto[];
  meta: { page: number; limit: number; totalRecords: number; totalPages: number; statusCounts: Record<RetainerDisplayStatus, number>; focusFound?: boolean };
};

export type RetainerSummaryDto = {
  baseCurrency: string;
  mrr: string;
  arr: string;
  activeCount: number;
  dueCount: number;
  next30Value: string;
  next30Count: number;
  pausedCount: number;
  issueCount: number;
  outstandingValue: string;
  outstandingCount: number;
  overdueCount: number;
  risk: RetainerRiskDto;
};

export type RetainerRiskItem = {
  id: string;
  name: string;
  clientName: string;
  reason: "PAUSED" | "FAILED" | "OVERDUE" | "ENDING" | "RENEWS";
  /** Monthly recurring revenue involved, base currency. */
  mrr: string;
  /** Overdue amount (OVERDUE) or end date (ENDING/RENEWS), when relevant. */
  amount: string | null;
  date: string | null;
};

export type RetainerRiskDto = { atRiskMrr: string; counts: { paused: number; failed: number; overdue: number; ending: number }; items: RetainerRiskItem[] };

export type RetainerPreviewDto = {
  subtotal: string;
  taxAmount: string;
  total: string;
  taxLabel: string;
  lineTotals: string[];
  rates: number[];
  upcoming: string[];
};
