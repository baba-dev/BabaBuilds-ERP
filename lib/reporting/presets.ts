import 'server-only';
import { z } from 'zod';

export const reportingFilterSchema = z.object({
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  status: z.string().optional(),
  limit: z.number().int().min(1).max(5000).optional(),
});

export type ReportingFilters = z.infer<typeof reportingFilterSchema>;

export type ReportPreset = {
  id: string;
  title: string;
  description: string;
  category: 'Finance' | 'Cash' | 'Tax' | 'Operations';
  columns: Array<{ key: string; label: string; format?: 'currency' | 'date' | 'percent' | 'number' | 'text' }>;
  requiredFilters: Array<keyof ReportingFilters>;
  sql: string;
};

const PRESETS: ReportPreset[] = [
  {
    id: 'pnl_summary',
    title: 'Profit & Loss Summary',
    description: 'Revenue, expense, and net position by month.',
    category: 'Finance',
    requiredFilters: ['fromDate', 'toDate'],
    columns: [
      { key: 'period', label: 'Period' },
      { key: 'revenue', label: 'Revenue', format: 'currency' },
      { key: 'expenses', label: 'Expenses', format: 'currency' },
      { key: 'net_profit', label: 'Net Profit', format: 'currency' },
    ],
    sql: `SELECT strftime('%Y-%m', i.invoiceDate) AS period,
              ROUND(SUM(COALESCE(i.grandTotal, i.totalAmount)), 2) AS revenue,
              ROUND((SELECT COALESCE(SUM(e.amount), 0) FROM Expense e WHERE e.workspaceId = :workspaceId AND e.date BETWEEN :fromDate AND :toDate AND strftime('%Y-%m', e.date) = strftime('%Y-%m', i.invoiceDate)), 2) AS expenses,
              ROUND(SUM(COALESCE(i.grandTotal, i.totalAmount)) - (SELECT COALESCE(SUM(e.amount), 0) FROM Expense e WHERE e.workspaceId = :workspaceId AND e.date BETWEEN :fromDate AND :toDate AND strftime('%Y-%m', e.date) = strftime('%Y-%m', i.invoiceDate)), 2) AS net_profit
           FROM Invoice i
          WHERE i.workspaceId = :workspaceId
            AND i.invoiceDate BETWEEN :fromDate AND :toDate
          GROUP BY strftime('%Y-%m', i.invoiceDate)
          ORDER BY period ASC`,
  },
  {
    id: 'ar_aging',
    title: 'Accounts Receivable Aging',
    description: 'Outstanding receivables by age bucket.',
    category: 'Cash',
    requiredFilters: [],
    columns: [
      { key: 'clientName', label: 'Client' },
      { key: 'current_bucket', label: 'Current', format: 'currency' },
      { key: 'bucket_30', label: '1-30 Days', format: 'currency' },
      { key: 'bucket_60', label: '31-60 Days', format: 'currency' },
      { key: 'bucket_90', label: '61-90 Days', format: 'currency' },
      { key: 'bucket_90_plus', label: '90+ Days', format: 'currency' },
    ],
    sql: `SELECT i.clientName,
             SUM(CASE WHEN julianday('now') - julianday(COALESCE(i.dueDate, i.invoiceDate)) <= 0 THEN COALESCE(i.grandTotal, i.totalAmount) ELSE 0 END) AS current_bucket,
             SUM(CASE WHEN julianday('now') - julianday(COALESCE(i.dueDate, i.invoiceDate)) BETWEEN 1 AND 30 THEN COALESCE(i.grandTotal, i.totalAmount) ELSE 0 END) AS bucket_30,
             SUM(CASE WHEN julianday('now') - julianday(COALESCE(i.dueDate, i.invoiceDate)) BETWEEN 31 AND 60 THEN COALESCE(i.grandTotal, i.totalAmount) ELSE 0 END) AS bucket_60,
             SUM(CASE WHEN julianday('now') - julianday(COALESCE(i.dueDate, i.invoiceDate)) BETWEEN 61 AND 90 THEN COALESCE(i.grandTotal, i.totalAmount) ELSE 0 END) AS bucket_90,
             SUM(CASE WHEN julianday('now') - julianday(COALESCE(i.dueDate, i.invoiceDate)) > 90 THEN COALESCE(i.grandTotal, i.totalAmount) ELSE 0 END) AS bucket_90_plus
        FROM Invoice i
       WHERE i.workspaceId = :workspaceId
         AND i.status != 'PAID'
       GROUP BY i.clientName
       ORDER BY i.clientName ASC`,
  },
  {
    id: 'expense_register',
    title: 'Expense Register',
    description: 'Detailed expense entries for the selected period.',
    category: 'Operations',
    requiredFilters: ['fromDate', 'toDate'],
    columns: [
      { key: 'date', label: 'Date', format: 'date' },
      { key: 'vendor', label: 'Vendor' },
      { key: 'category', label: 'Category' },
      { key: 'amount', label: 'Amount', format: 'currency' },
      { key: 'description', label: 'Description' },
    ],
    sql: `SELECT e.date, e.vendor, e.category, ROUND(e.amount, 2) AS amount, COALESCE(e.description, '') AS description
            FROM Expense e
           WHERE e.workspaceId = :workspaceId
             AND e.date BETWEEN :fromDate AND :toDate
           ORDER BY e.date DESC`,
  },
  {
    id: 'invoice_register',
    title: 'Invoice Register',
    description: 'Invoice-level ledger for the selected period.',
    category: 'Finance',
    requiredFilters: ['fromDate', 'toDate'],
    columns: [
      { key: 'invoiceNumber', label: 'Invoice #' },
      { key: 'invoiceDate', label: 'Invoice Date', format: 'date' },
      { key: 'clientName', label: 'Client' },
      { key: 'status', label: 'Status' },
      { key: 'total', label: 'Amount', format: 'currency' },
    ],
    sql: `SELECT i.invoiceNumber, i.invoiceDate, i.clientName, i.status, ROUND(COALESCE(i.grandTotal, i.totalAmount), 2) AS total
            FROM Invoice i
           WHERE i.workspaceId = :workspaceId
             AND i.invoiceDate BETWEEN :fromDate AND :toDate
           ORDER BY i.invoiceDate DESC`,
  },
];

export const REPORT_PRESETS = PRESETS;

export function getReportPreset(id: string): ReportPreset | null {
  return REPORT_PRESETS.find((preset) => preset.id === id) ?? null;
}

export function validatePresetFilters(preset: ReportPreset, input: unknown): ReportingFilters {
  const parsed = reportingFilterSchema.parse(input ?? {});
  for (const required of preset.requiredFilters) {
    if (!parsed[required]) {
      throw new Error(`FILTER_REQUIRED:${required}`);
    }
  }
  return parsed;
}
