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

export interface CAPortalPayload {
  summary: CAPortalSummary;
  invoices: CAInvoiceRow[];
  expenses: CAExpenseRow[];
}
