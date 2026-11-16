import 'server-only';
import { prisma } from '@/lib/prisma';
import { openPayables } from '@/lib/expenses/payables-data';
import { getGstCashOutflows } from '@/lib/gst/insights';
import { dateWhere, gross, num, r2, rate, sumRow } from '@/lib/reporting/helpers';
import { aggregate } from '@/lib/reporting/semantic';
import type { Ctx, ReportDef, Row } from '@/lib/reporting/types';

/** Balance of each bank and cash account at the start of `before` (or now): opening balance plus every movement since. */
async function bankBalance(workspaceId: string, before: Date | null): Promise<number> {
  const accounts = await prisma.bankAccount.findMany({ where: { workspaceId }, select: { id: true, openingBalance: true, openingBalanceDate: true } });
  const sums = await Promise.all(accounts.map((a) => prisma.bankTransaction.aggregate({ where: { workspaceId, accountId: a.id, date: { gte: a.openingBalanceDate, ...(before ? { lt: before } : {}) } }, _sum: { amount: true } })));
  return accounts.reduce((s, a, i) => s + num(a.openingBalance) + num(sums[i]?._sum.amount), 0);
}

export const STATEMENT_REPORTS: Array<Omit<ReportDef, 'lineage'>> = [
  {
    id: 'income_statement', category: 'Finance', title: 'Income statement', description: 'Revenue, then operating expenses by category and payroll, down to net profit.', period: 'range', comparable: true,
    async build(ctx: Ctx) {
      const [inv, exp, payroll] = await Promise.all([
        aggregate(ctx, { dataset: 'invoices', measures: ['revenue'], dimension: null, filters: {}, limit: 1 }),
        aggregate(ctx, { dataset: 'expenses', measures: ['spendNet'], dimension: 'category', filters: {}, limit: 500 }),
        prisma.payrollRun.aggregate({ where: { workspaceId: ctx.workspaceId, status: 'POSTED', period: dateWhere('startDate', ctx.range) }, _sum: { totalEarnings: true, totalEmployerCosts: true } }),
      ]);
      const revenue = num(inv.rows[0]?.revenue);
      const byCat = new Map<string, number>();
      for (const e of exp.rows) byCat.set(String(e.category), num(e.spendNet));
      const payrollCost = num(payroll._sum.totalEarnings) + num(payroll._sum.totalEmployerCosts);
      const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
      const opex = cats.reduce((s, [, v]) => s + v, 0);
      const totalCosts = opex + payrollCost;
      const net = revenue - totalCosts;
      const rows: Row[] = [
        { kind: 'revenue', line: null, amount: r2(revenue), share: 100 },
        ...cats.map(([c, v]): Row => ({ kind: 'expense', line: c, amount: r2(-v), share: revenue > 0 ? r2((v / revenue) * 100) : null })),
        { kind: 'payroll', line: null, amount: r2(-payrollCost), share: revenue > 0 ? r2((payrollCost / revenue) * 100) : null },
        { kind: 'totalCosts', line: null, amount: r2(-totalCosts), share: revenue > 0 ? r2((totalCosts / revenue) * 100) : null },
        { kind: 'netProfit', line: null, amount: r2(net), share: revenue > 0 ? r2((net / revenue) * 100) : null },
      ];
      return {
        columns: [{ key: 'kind', format: 'text' }, { key: 'line', format: 'text' }, { key: 'amount', format: 'currency' }, { key: 'share', format: 'percent' }], rows, totals: null,
        kpis: [{ key: 'revenue', value: r2(revenue), format: 'currency', upGood: true }, { key: 'costs', value: r2(totalCosts), format: 'currency', upGood: false }, { key: 'netProfit', value: r2(net), format: 'currency', upGood: true }, { key: 'margin', value: revenue > 0 ? r2((net / revenue) * 100) : 0, format: 'percent', upGood: true }],
        chart: null, notes: ['revenueExTax', 'expensesApprovedNetItc', 'payrollPostedOnly'], truncated: exp.truncated,
      };
    },
  },
  {
    id: 'financial_position', category: 'Finance', title: 'Statement of financial position', description: 'What the business has and owes today, from your bank, receivables, stock and payables. A management view, not a ledger balance sheet.', period: 'asof', comparable: false,
    async build(ctx: Ctx) {
      const now = ctx.now;
      const [cash, openInv, products, bills, withholding, gst] = await Promise.all([
        bankBalance(ctx.workspaceId, null),
        prisma.invoice.findMany({ where: { workspaceId: ctx.workspaceId, status: { in: ['PENDING', 'PARTIALLY_PAID'] }, voidedAt: null }, select: { totalAmount: true, grandTotal: true, taxAmount: true, exchangeRate: true, amountReceived: true }, take: 20_000 }),
        prisma.product.findMany({ where: { workspaceId: ctx.workspaceId }, select: { currentStock: true, costPrice: true }, take: 20_000 }),
        openPayables(ctx.workspaceId, now),
        prisma.expense.aggregate({ where: { workspaceId: ctx.workspaceId, approvalStatus: 'APPROVED', withholdingDeductedAt: { not: null }, withholdingDepositedAt: null }, _sum: { withholdingAmount: true } }),
        getGstCashOutflows(ctx.workspaceId, now, new Date(now.getTime() + 62 * 86_400_000)).catch(() => []),
      ]);
      const receivables = openInv.reduce((s, i) => s + Math.max(0, gross(i) - num(i.amountReceived)) * rate(i), 0);
      const stock = products.reduce((s, p) => s + Math.max(0, p.currentStock) * num(p.costPrice), 0);
      const payables = bills.reduce((s, b) => s + b.amount, 0);
      const tds = num(withholding._sum.withholdingAmount);
      const gstDue = gst.reduce((s, g) => s + Math.max(0, num(g.amount)), 0);
      const assets = cash + receivables + stock, liabilities = payables + tds + gstDue;
      const rows: Row[] = [
        { section: 'assets', item: 'cash', amount: r2(cash), _href: '/cash-flow?tab=plan' }, { section: 'assets', item: 'receivables', amount: r2(receivables), _href: '/ar-collections' }, { section: 'assets', item: 'inventory', amount: r2(stock), _href: '/inventory' },
        { section: 'assets', item: 'totalAssets', amount: r2(assets) },
        { section: 'liabilities', item: 'payables', amount: r2(payables), _href: '/expenses' }, { section: 'liabilities', item: 'withholding', amount: r2(tds), _href: '/expenses' }, { section: 'liabilities', item: 'gstPayable', amount: r2(gstDue), _href: '/tax' },
        { section: 'liabilities', item: 'totalLiabilities', amount: r2(liabilities) },
        { section: 'position', item: 'netPosition', amount: r2(assets - liabilities) },
      ];
      return {
        columns: [{ key: 'section', format: 'text' }, { key: 'item', format: 'text' }, { key: 'amount', format: 'currency' }], rows, totals: null,
        kpis: [{ key: 'assets', value: r2(assets), format: 'currency', upGood: true }, { key: 'liabilities', value: r2(liabilities), format: 'currency', upGood: false }, { key: 'netPosition', value: r2(assets - liabilities), format: 'currency', upGood: true }, ...(liabilities > 0 ? [{ key: 'coverage', value: r2(assets / liabilities), format: 'number' as const, upGood: true }] : [])],
        chart: null, notes: ['positionDerived', 'gstEstimate'], truncated: false,
      };
    },
  },
  {
    id: 'cash_flow_statement', category: 'Cash', title: 'Cash flow statement', description: 'Where cash actually came from and went in the period, from your bank activity, with opening and closing cash.', period: 'range', comparable: true,
    async build(ctx: Ctx) {
      const [opening, txs] = await Promise.all([
        bankBalance(ctx.workspaceId, ctx.range.from), // `from` null means the start of time: opening balance only
        prisma.bankTransaction.findMany({ where: { workspaceId: ctx.workspaceId, isInternalTransfer: false, ...dateWhere('date', ctx.range) }, select: { amount: true, category: true, matchedInvoiceId: true, matchedExpenseId: true }, take: 50_000 }),
      ]);
      let custIn = 0, otherIn = 0, supOut = 0;
      const otherOut = new Map<string, number>();
      for (const t of txs) {
        const a = num(t.amount);
        if (a >= 0) { if (t.matchedInvoiceId) custIn += a; else otherIn += a; }
        else if (t.matchedExpenseId) supOut += -a;
        else otherOut.set(t.category?.trim() || '', (otherOut.get(t.category?.trim() || '') ?? 0) + -a);
      }
      const outRows = [...otherOut.entries()].sort((a, b) => b[1] - a[1]);
      const other = outRows.reduce((s, [, v]) => s + v, 0);
      const receipts = custIn + otherIn, payments = supOut + other, net = receipts - payments;
      const rows: Row[] = [
        { kind: 'openingCash', line: null, amount: r2(opening) },
        { kind: 'receiptsCustomers', line: null, amount: r2(custIn) }, { kind: 'receiptsOther', line: null, amount: r2(otherIn) },
        { kind: 'paymentsSuppliers', line: null, amount: r2(-supOut) },
        ...outRows.map(([c, v]): Row => ({ kind: 'paymentsOther', line: c || null, amount: r2(-v) })),
        { kind: 'netChange', line: null, amount: r2(net) }, { kind: 'closingCash', line: null, amount: r2(opening + net) },
      ];
      return {
        columns: [{ key: 'kind', format: 'text' }, { key: 'line', format: 'text' }, { key: 'amount', format: 'currency' }], rows, totals: null,
        kpis: [{ key: 'opening', value: r2(opening), format: 'currency' }, { key: 'receipts', value: r2(receipts), format: 'currency', upGood: true }, { key: 'payments', value: r2(payments), format: 'currency', upGood: false }, { key: 'closing', value: r2(opening + net), format: 'currency', upGood: true }],
        chart: null, notes: ['bankBasis', 'internalTransfersExcluded'], truncated: txs.length >= 50_000,
      };
    },
  },
  {
    id: 'ledger_postings', category: 'Operations', title: 'Ledger postings', description: 'Debits and credits posted to the accounting ledger by account, with a check that they balance.', period: 'asof', comparable: false,
    async build(ctx: Ctx) {
      const g = await prisma.accountingEntry.groupBy({ by: ['accountCode', 'side'], where: { workspaceId: ctx.workspaceId, isPosted: true }, _sum: { amount: true }, _count: { _all: true } });
      const by = new Map<string, Row>();
      for (const r of g) { const row = by.get(r.accountCode) ?? { account: r.accountCode, debits: 0, credits: 0, balance: 0, entries: 0 }; if (r.side === 'DEBIT') row.debits = num(row.debits) + num(r._sum.amount); else row.credits = num(row.credits) + num(r._sum.amount); row.entries = num(row.entries) + r._count._all; by.set(r.accountCode, row); }
      const rows: Row[] = [...by.values()].map((r): Row => ({ ...r, debits: r2(num(r.debits)), credits: r2(num(r.credits)), balance: r2(num(r.debits) - num(r.credits)), _href: '/payroll' })).sort((a, b) => String(a.account).localeCompare(String(b.account)));
      const t = sumRow(rows, ['debits', 'credits', 'balance', 'entries']);
      return { columns: [{ key: 'account', format: 'text' }, { key: 'entries', format: 'number' }, { key: 'debits', format: 'currency' }, { key: 'credits', format: 'currency' }, { key: 'balance', format: 'currency' }], rows, totals: { account: null, ...t }, kpis: [{ key: 'debits', value: num(t.debits), format: 'currency' }, { key: 'credits', value: num(t.credits), format: 'currency' }, { key: 'difference', value: r2(num(t.debits) - num(t.credits)), format: 'currency', upGood: false }], chart: null, notes: ['ledgerPayrollOnly'], truncated: false };
    },
  },
];
