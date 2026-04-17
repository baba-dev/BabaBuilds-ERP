export interface CAPortalSummary {
  grossReceipts: number;
  presumptiveIncome: number;
  totalExpenses: number;
  deductions80C: number;
  deductions80D: number;
}

export interface CAInvoiceRow {
  id: string;
  invoiceDate: string;
  invoiceNumber: string;
  clientName: string;
  sacCode: string;
  totalAmount: number;
  amountReceived: number | null;
  status: string;
  pdfPath: string | null;
}

export interface CAExpenseRow {
  id: string;
  date: string;
  category: string;
  vendor: string;
  description: string | null;
  amount: number;
  receiptUrl: string | null;
}

export interface CAReadinessIssue {
  code: string;
  severity: 'warning' | 'blocker';
  message: string;
  periodKey?: string;
  deltaAmount?: number;
}

export interface CAWithholdingReconciliationRow {
  periodKey: string;
  dueDate: string;
  filedAt: string | null;
  withheldAmount: number;
  creditedAmount: number;
  deltaAmount: number;
}

export interface CAPortalPayload {
  summary: CAPortalSummary;
  invoices: CAInvoiceRow[];
  expenses: CAExpenseRow[];
  withholdingReconciliation: CAWithholdingReconciliationRow[];
  readiness: {
    warnings: CAReadinessIssue[];
    blockers: CAReadinessIssue[];
  };
}
