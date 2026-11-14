import type { Lineage } from '@/lib/reporting/types';

/** Rule codes are translated in the app; sources are the record types the numbers come from. */
export const LINEAGE: Record<string, Lineage> = {
  pnl: { sources: ['Invoice', 'Expense'], rules: ['voidExcluded', 'revenueExTax', 'baseCurrency', 'approvedOnly', 'itcNotCost'] },
  revenue_by_client: { sources: ['Invoice', 'ClientPaymentBehavior'], rules: ['voidExcluded', 'revenueExTax', 'baseCurrency', 'openBalances'] },
  revenue_by_service: { sources: ['InvoiceItem'], rules: ['voidExcluded', 'revenueExTax', 'baseCurrency'] },
  client_profitability: { sources: ['Invoice', 'Expense'], rules: ['voidExcluded', 'revenueExTax', 'approvedOnly', 'itcNotCost', 'clientTagged'] },
  expense_by_category: { sources: ['Expense'], rules: ['approvedOnly', 'itcNotCost'] },
  expense_by_vendor: { sources: ['Expense'], rules: ['approvedOnly', 'itcNotCost'] },
  ar_aging: { sources: ['Invoice', 'InvoicePayment', 'ClientPaymentBehavior'], rules: ['openBalances', 'baseCurrency', 'dueFromTerms'] },
  ap_aging: { sources: ['Expense', 'Vendor'], rules: ['approvedOnly', 'dueFromBill', 'msmeLimit'] },
  cash_forecast: { sources: ['BankTransaction', 'Invoice', 'Expense', 'Payroll', 'GST'], rules: ['forecastAssumptions', 'baseCurrency'] },
  mrr: { sources: ['Retainer', 'RetainerEvent'], rules: ['activeOnly', 'baseCurrency'] },
  tax_position: { sources: ['Invoice', 'Expense'], rules: ['voidExcluded', 'approvedOnly', 'eligibleItc'] },
  bank_reconciliation: { sources: ['BankTransaction'], rules: ['transfersExcluded'] },
  invoice_register: { sources: ['Invoice'], rules: ['voidExcluded', 'baseCurrency'] },
  expense_register: { sources: ['Expense'], rules: ['approvedOnly'] },
  income_statement: { sources: ['Invoice', 'Expense', 'PayrollRun'], rules: ['voidExcluded', 'revenueExTax', 'approvedOnly', 'itcNotCost', 'payrollPosted'] },
  financial_position: { sources: ['BankAccount', 'Invoice', 'Product', 'Expense', 'GST'], rules: ['openBalances', 'costValuation', 'derivedNotLedger'] },
  cash_flow_statement: { sources: ['BankTransaction', 'BankAccount'], rules: ['bankBasis', 'transfersExcluded'] },
  ledger_postings: { sources: ['AccountingEntry'], rules: ['postedOnly', 'ledgerScope'] },
  budget_vs_actual: { sources: ['ExpenseBudget', 'Expense'], rules: ['approvedOnly', 'monthlyCapScaled'] },
  gst_summary: { sources: ['Invoice', 'Expense'], rules: ['voidExcluded', 'approvedOnly', 'eligibleItc'] },
  msme_payables: { sources: ['Expense', 'Vendor'], rules: ['approvedOnly', 'msmeLimit'] },
  payroll_cost: { sources: ['PayrollRun', 'PayrollPeriod'], rules: ['payrollPosted'] },
  inventory_valuation: { sources: ['Product'], rules: ['costValuation'] },
  shop_sales: { sources: ['ShopOrder'], rules: ['paidOrders'] },
  proposal_pipeline: { sources: ['Proposal'], rules: ['baseCurrency', 'winRateRule'] },
  collections_effectiveness: { sources: ['InvoiceEvent', 'InvoicePayment'], rules: ['baseCurrency'] },
  client_ltv: { sources: ['Invoice'], rules: ['voidExcluded', 'revenueExTax', 'baseCurrency'] },
  retainer_cohorts: { sources: ['Retainer'], rules: ['activeOnly'] },
  forecast_accuracy: { sources: ['CashForecastSnapshot', 'BankTransaction'], rules: ['transfersExcluded'] },
  group_revenue: { sources: ['Invoice', 'CompanyGroup'], rules: ['groupAccess'] },
  custom: { sources: ['Invoice', 'Expense'], rules: ['voidExcluded', 'approvedOnly', 'baseCurrency'] },
};

/** Which data-quality checks matter for each report. */
export const QUALITY_CHECKS: Record<string, Array<'pendingExpenses' | 'noDueDate' | 'noClient' | 'unreconciledBank' | 'noBankAccount'>> = {
  pnl: ['pendingExpenses', 'noClient'], income_statement: ['pendingExpenses'], expense_by_category: ['pendingExpenses'], expense_by_vendor: ['pendingExpenses'], expense_register: ['pendingExpenses'], budget_vs_actual: ['pendingExpenses'],
  client_profitability: ['pendingExpenses', 'noClient'], revenue_by_client: ['noClient'], ar_aging: ['noDueDate', 'noClient'], ap_aging: ['pendingExpenses'], tax_position: ['pendingExpenses'], gst_summary: ['pendingExpenses'],
  cash_forecast: ['noBankAccount', 'unreconciledBank'], cash_flow_statement: ['noBankAccount', 'unreconciledBank'], financial_position: ['noBankAccount', 'unreconciledBank', 'pendingExpenses'],
};
