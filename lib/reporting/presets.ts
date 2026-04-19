import 'server-only';
import { z } from 'zod';

export const reportingFilterSchema = z.object({
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  status: z.string().optional(),
  limit: z.number().int().min(1).max(5000).optional(),
});

export type ReportingFilters = z.infer<typeof reportingFilterSchema>;

export type ReportingColumnMeta = {
  key: string;
  label: string;
  format?: 'currency' | 'date' | 'percent' | 'number' | 'text';
};

/** Safe shape returned to browsers and AI list tools — never includes SQL. */
export type ReportingPresetPublic = {
  id: string;
  title: string;
  description: string;
  category: 'Finance' | 'Cash' | 'Tax' | 'Operations';
  columns: ReportingColumnMeta[];
  requiredFilters: Array<keyof ReportingFilters>;
  methodology: string;
  accountingPolicyRefs: string[];
  reportDefinitionIds: string[];
};

export type ReportPreset = ReportingPresetPublic & {
  sql: string;
};

const PRESETS: ReportPreset[] = [
  {
    id: 'pnl_summary',
    title: 'Revenue vs expense summary (invoice basis)',
    description:
      'Monthly billed revenue next to expenses in the same calendar months. Not a statutory P&L; use accounting exports for GAAP.',
    category: 'Finance',
    methodology:
      'Revenue uses invoice billed totals (grandTotal ?? totalAmount) grouped by invoice month. Expenses sum Expense rows in that month. Aligns with catalog line chart.revenue.monthly and expense register conventions.',
    accountingPolicyRefs: ['REV-001'],
    reportDefinitionIds: ['chart.revenue.monthly'],
    requiredFilters: ['fromDate', 'toDate'],
    columns: [
      { key: 'period', label: 'Period' },
      { key: 'revenue', label: 'Billed revenue', format: 'currency' },
      { key: 'expenses', label: 'Expenses', format: 'currency' },
      { key: 'net_profit', label: 'Net (billed − expenses)', format: 'currency' },
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
    title: 'Accounts receivable aging (open balance)',
    description: 'Outstanding amount per client by age bucket using billed amount minus recorded payments.',
    category: 'Cash',
    methodology:
      'Outstanding per invoice is max(0, billed − amountReceived). Included for invoices not in PAID status, or with a positive residual. Buckets use days from due date (or invoice date if due missing). Matches deferred revenue style settlement view in report governance tests.',
    accountingPolicyRefs: ['REV-001', 'REV-002'],
    reportDefinitionIds: [],
    requiredFilters: [],
    columns: [
      { key: 'clientName', label: 'Client' },
      { key: 'current_bucket', label: 'Current', format: 'currency' },
      { key: 'bucket_30', label: '1–30 days', format: 'currency' },
      { key: 'bucket_60', label: '31–60 days', format: 'currency' },
      { key: 'bucket_90', label: '61–90 days', format: 'currency' },
      { key: 'bucket_90_plus', label: '90+ days', format: 'currency' },
    ],
    sql: `SELECT i.clientName,
             SUM(CASE WHEN julianday('now') - julianday(COALESCE(i.dueDate, i.invoiceDate)) <= 0
                      THEN IIF(COALESCE(i.grandTotal, i.totalAmount) - COALESCE(i.amountReceived, 0) > 0,
                               COALESCE(i.grandTotal, i.totalAmount) - COALESCE(i.amountReceived, 0), 0)
                      ELSE 0 END) AS current_bucket,
             SUM(CASE WHEN julianday('now') - julianday(COALESCE(i.dueDate, i.invoiceDate)) BETWEEN 1 AND 30
                      THEN IIF(COALESCE(i.grandTotal, i.totalAmount) - COALESCE(i.amountReceived, 0) > 0,
                               COALESCE(i.grandTotal, i.totalAmount) - COALESCE(i.amountReceived, 0), 0)
                      ELSE 0 END) AS bucket_30,
             SUM(CASE WHEN julianday('now') - julianday(COALESCE(i.dueDate, i.invoiceDate)) BETWEEN 31 AND 60
                      THEN IIF(COALESCE(i.grandTotal, i.totalAmount) - COALESCE(i.amountReceived, 0) > 0,
                               COALESCE(i.grandTotal, i.totalAmount) - COALESCE(i.amountReceived, 0), 0)
                      ELSE 0 END) AS bucket_60,
             SUM(CASE WHEN julianday('now') - julianday(COALESCE(i.dueDate, i.invoiceDate)) BETWEEN 61 AND 90
                      THEN IIF(COALESCE(i.grandTotal, i.totalAmount) - COALESCE(i.amountReceived, 0) > 0,
                               COALESCE(i.grandTotal, i.totalAmount) - COALESCE(i.amountReceived, 0), 0)
                      ELSE 0 END) AS bucket_90,
             SUM(CASE WHEN julianday('now') - julianday(COALESCE(i.dueDate, i.invoiceDate)) > 90
                      THEN IIF(COALESCE(i.grandTotal, i.totalAmount) - COALESCE(i.amountReceived, 0) > 0,
                               COALESCE(i.grandTotal, i.totalAmount) - COALESCE(i.amountReceived, 0), 0)
                      ELSE 0 END) AS bucket_90_plus
        FROM Invoice i
       WHERE i.workspaceId = :workspaceId
         AND i.status != 'PAID'
         AND COALESCE(i.grandTotal, i.totalAmount) - COALESCE(i.amountReceived, 0) > 0.005
       GROUP BY i.clientName
       ORDER BY i.clientName ASC`,
  },
  {
    id: 'expense_register',
    title: 'Expense register',
    description: 'Detailed expense entries for the selected period.',
    category: 'Operations',
    methodology: 'Lists Expense rows for the workspace in the date range, ordered by date.',
    accountingPolicyRefs: [],
    reportDefinitionIds: [],
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
    title: 'Invoice register',
    description: 'Invoice-level listing for the selected period.',
    category: 'Finance',
    methodology: 'Invoice billed totals use grandTotal ?? totalAmount (REV-001).',
    accountingPolicyRefs: ['REV-001'],
    reportDefinitionIds: ['kpi.totalRevenue'],
    requiredFilters: ['fromDate', 'toDate'],
    columns: [
      { key: 'invoiceNumber', label: 'Invoice #' },
      { key: 'invoiceDate', label: 'Invoice date', format: 'date' },
      { key: 'clientName', label: 'Client' },
      { key: 'status', label: 'Status' },
      { key: 'total', label: 'Billed amount', format: 'currency' },
    ],
    sql: `SELECT i.invoiceNumber, i.invoiceDate, i.clientName, i.status, ROUND(COALESCE(i.grandTotal, i.totalAmount), 2) AS total
            FROM Invoice i
           WHERE i.workspaceId = :workspaceId
             AND i.invoiceDate BETWEEN :fromDate AND :toDate
           ORDER BY i.invoiceDate DESC`,
  },
];

export const REPORT_PRESETS = PRESETS;

export function toPublicPreset(p: ReportPreset): ReportingPresetPublic {
  const { sql: _s, ...rest } = p;
  return rest;
}

export function listPublicPresets(): ReportingPresetPublic[] {
  return REPORT_PRESETS.map(toPublicPreset);
}

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
