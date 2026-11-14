import 'server-only';
import { prisma } from '@/lib/prisma';
import { resolvePeriod, previousRange, type PeriodKey, type PeriodRange } from '@/lib/expenses/period';
import { openPayables, ageing } from '@/lib/expenses/payables-data';
import { getArCollectionsSnapshot } from '@/lib/ar-collections';
import { computeAllScenarios } from '@/lib/cash-flow/forecast-engine';
import { buildKpis } from '@/lib/cash-flow/insights';
import { getMrrMovement } from '@/lib/retainers/movement';
import { reconciliationSummary } from '@/lib/reconciliation/workspace';

const num = (v: unknown) => { const n = Number(v?.toString?.() ?? v ?? 0); return Number.isFinite(n) ? n : 0; };
const r2 = (v: number) => Math.round(v * 100) / 100;
const month = (d: Date) => d.toISOString().slice(0, 7);
const DAY = 86_400_000;

export type Format = 'currency' | 'number' | 'percent' | 'date' | 'text';
export type Cell = string | number | null;
export type Row = Record<string, Cell>;
export type Col = { key: string; format?: Format };
export type Kpi = { key: string; value: number; format: Format; /** true when a higher value is the good direction */ upGood?: boolean };
export type ChartSpec = { type: 'bars' | 'line' | 'donut'; labelKey: string; series: string[]; lineSeries?: string[] };
export type ReportResult = {
  columns: Col[]; rows: Row[]; totals: Row | null; kpis: Kpi[]; chart: ChartSpec | null; notes: string[]; truncated: boolean; currency: string;
  generatedAt: string; range: { key: PeriodKey; from: string | null; to: string | null } | null;
  /** Same key figures for the period before, when comparison was asked for. */
  previous?: Kpi[];
};

export type Ctx = { workspaceId: string; range: PeriodRange; now: Date; currency: string; countryCode: string };
export type ReportDef = {
  id: string; category: 'Finance' | 'Sales' | 'Cash' | 'Tax' | 'Operations'; title: string; description: string;
  /** "range" reports follow the period filter; "asof" reports describe today. */
  period: 'range' | 'asof'; comparable: boolean;
  build: (ctx: Ctx) => Promise<Omit<ReportResult, 'currency' | 'generatedAt' | 'range' | 'previous'>>;
};

const dateWhere = (field: string, range: PeriodRange) => (range.from || range.to ? { [field]: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lt: range.to } : {}) } } : {});
const empty = { totals: null, chart: null, notes: [] as string[], truncated: false };
const sumRow = (rows: Row[], keys: string[], extra: Row = {}): Row => ({ ...Object.fromEntries(keys.map((k) => [k, r2(rows.reduce((s, r) => s + num(r[k]), 0))])), ...extra });

async function invoicesIn(ctx: Ctx) {
  return prisma.invoice.findMany({
    where: { workspaceId: ctx.workspaceId, status: { not: 'VOID' }, voidedAt: null, ...dateWhere('invoiceDate', ctx.range) },
    select: { id: true, invoiceNumber: true, invoiceDate: true, dueDate: true, clientId: true, clientName: true, subtotal: true, taxAmount: true, grandTotal: true, totalAmount: true, exchangeRate: true, status: true, amountReceived: true, currency: true },
    orderBy: { invoiceDate: 'desc' }, take: 20_000,
  });
}
/** Net of GST the business can claim back, so a rupee of recoverable tax is not counted as a cost. */
async function expensesIn(ctx: Ctx, extraWhere: Record<string, unknown> = {}) {
  return prisma.expense.findMany({
    where: { workspaceId: ctx.workspaceId, approvalStatus: 'APPROVED', ...dateWhere('date', ctx.range), ...extraWhere },
    select: { id: true, date: true, vendor: true, category: true, amount: true, paymentStatus: true, clientId: true, billable: true, itcStatus: true, itcHeld: true, igstAmount: true, cgstAmount: true, sgstAmount: true, cessAmount: true, description: true },
    orderBy: { date: 'desc' }, take: 20_000,
  });
}
const claimable = (e: { itcStatus: string; itcHeld: boolean; igstAmount: unknown; cgstAmount: unknown; sgstAmount: unknown; cessAmount: unknown }) =>
  e.itcStatus === 'ELIGIBLE' && !e.itcHeld ? num(e.igstAmount) + num(e.cgstAmount) + num(e.sgstAmount) + num(e.cessAmount) : 0;
const netCost = (e: Parameters<typeof claimable>[0] & { amount: unknown }) => num(e.amount) - claimable(e);
const iso = (d: Date) => d.toISOString().slice(0, 10);
type InvAmounts = { grandTotal: unknown; totalAmount: unknown; taxAmount: unknown; exchangeRate: unknown };
const rate = (i: { exchangeRate: unknown }) => num(i.exchangeRate) || 1;
/** What was billed, with tax, as the app records it (older invoices only have the total). */
const gross = (i: InvAmounts) => num(i.totalAmount) || num(i.grandTotal);
/** Revenue before tax, in the workspace currency. */
const netRev = (i: InvAmounts) => Math.max(0, gross(i) - num(i.taxAmount)) * rate(i);

export const REPORTS: ReportDef[] = [
  {
    id: 'pnl', category: 'Finance', title: 'Profit and loss', description: 'Monthly revenue next to expenses, with margin. Revenue excludes tax; expenses exclude GST you can claim back.', period: 'range', comparable: true,
    async build(ctx) {
      const [inv, exp] = await Promise.all([invoicesIn(ctx), expensesIn(ctx)]);
      const by = new Map<string, Row>();
      const row = (m: string) => { if (!by.has(m)) by.set(m, { period: m, revenue: 0, expenses: 0, net: 0, margin: null }); return by.get(m)!; };
      for (const i of inv) { const r = row(month(i.invoiceDate)); r.revenue = num(r.revenue) + netRev(i); }
      for (const e of exp) { const r = row(month(e.date)); r.expenses = num(r.expenses) + netCost(e); }
      const rows = [...by.values()].sort((a, b) => String(a.period).localeCompare(String(b.period))).map((r) => { const net = num(r.revenue) - num(r.expenses); return { period: r.period, revenue: r2(num(r.revenue)), expenses: r2(num(r.expenses)), net: r2(net), margin: num(r.revenue) > 0 ? r2((net / num(r.revenue)) * 100) : null }; });
      const rev = rows.reduce((s, r) => s + num(r.revenue), 0), ex = rows.reduce((s, r) => s + num(r.expenses), 0);
      return {
        columns: [{ key: 'period', format: 'text' }, { key: 'revenue', format: 'currency' }, { key: 'expenses', format: 'currency' }, { key: 'net', format: 'currency' }, { key: 'margin', format: 'percent' }], rows,
        totals: { period: null, revenue: r2(rev), expenses: r2(ex), net: r2(rev - ex), margin: rev > 0 ? r2(((rev - ex) / rev) * 100) : null },
        kpis: [{ key: 'revenue', value: r2(rev), format: 'currency', upGood: true }, { key: 'expenses', value: r2(ex), format: 'currency', upGood: false }, { key: 'net', value: r2(rev - ex), format: 'currency', upGood: true }, { key: 'margin', value: rev > 0 ? r2(((rev - ex) / rev) * 100) : 0, format: 'percent', upGood: true }],
        chart: { type: 'bars', labelKey: 'period', series: ['revenue', 'expenses'], lineSeries: ['net'] }, notes: ['revenueExTax', 'expensesApprovedNetItc'], truncated: inv.length >= 20_000 || exp.length >= 20_000,
      };
    },
  },
  {
    id: 'revenue_by_client', category: 'Sales', title: 'Revenue by customer', description: 'Who the revenue comes from, how concentrated it is, what each customer still owes and how fast they pay.', period: 'range', comparable: true,
    async build(ctx) {
      const [inv, behavior] = await Promise.all([invoicesIn(ctx), prisma.clientPaymentBehavior.findMany({ where: { workspaceId: ctx.workspaceId }, select: { clientId: true, avgDaysToPay: true } })]);
      const days = new Map(behavior.map((b) => [b.clientId, b.avgDaysToPay]));
      const by = new Map<string, Row & { clientId: string | null }>();
      for (const i of inv) {
        const k = i.clientId ?? `n:${i.clientName}`; const rate = num(i.exchangeRate) || 1;
        const r = by.get(k) ?? { clientId: i.clientId, client: i.clientName, invoices: 0, revenue: 0, outstanding: 0, share: 0, daysToPay: i.clientId ? (days.get(i.clientId) ?? null) : null, _href: i.clientId ? `/clients/${i.clientId}` : null };
        r.invoices = num(r.invoices) + 1; r.revenue = num(r.revenue) + netRev(i); r.outstanding = num(r.outstanding) + Math.max(0, gross(i) - num(i.amountReceived)) * rate; by.set(k, r);
      }
      const total = [...by.values()].reduce((s, r) => s + num(r.revenue), 0);
      const rows = [...by.values()].map(({ clientId: _c, ...r }) => ({ ...r, revenue: r2(num(r.revenue)), outstanding: r2(num(r.outstanding)), share: total > 0 ? r2((num(r.revenue) / total) * 100) : 0, daysToPay: r.daysToPay == null ? null : Math.round(num(r.daysToPay)) })).sort((a, b) => num(b.revenue) - num(a.revenue));
      const top = rows[0];
      return {
        columns: [{ key: 'client', format: 'text' }, { key: 'invoices', format: 'number' }, { key: 'revenue', format: 'currency' }, { key: 'share', format: 'percent' }, { key: 'outstanding', format: 'currency' }, { key: 'daysToPay', format: 'number' }], rows,
        totals: { client: null, ...sumRow(rows, ['invoices', 'revenue', 'outstanding']), share: 100, daysToPay: null },
        kpis: [{ key: 'revenue', value: r2(total), format: 'currency', upGood: true }, { key: 'customers', value: rows.length, format: 'number', upGood: true }, { key: 'topShare', value: top ? num(top.share) : 0, format: 'percent', upGood: false }],
        chart: { type: 'donut', labelKey: 'client', series: ['revenue'] }, notes: ['revenueExTax'], truncated: inv.length >= 20_000,
      };
    },
  },
  {
    id: 'revenue_by_service', category: 'Sales', title: 'Revenue by service or product', description: 'Which lines of work earn the most, from invoice line items.', period: 'range', comparable: true,
    async build(ctx) {
      const items = await prisma.invoiceItem.findMany({ where: { invoice: { workspaceId: ctx.workspaceId, status: { not: 'VOID' }, voidedAt: null, ...dateWhere('invoiceDate', ctx.range) } }, select: { description: true, quantity: true, totalAmount: true, taxRate: true, invoice: { select: { exchangeRate: true } } }, take: 30_000 });
      const by = new Map<string, Row>();
      for (const it of items) {
        const key = it.description.trim().toLowerCase().slice(0, 80) || '—'; const rate = num(it.invoice.exchangeRate) || 1;
        const base = num(it.totalAmount) / (1 + (it.taxRate ?? 0));
        const r = by.get(key) ?? { item: it.description.trim().slice(0, 80) || '—', quantity: 0, revenue: 0, share: 0 };
        r.quantity = num(r.quantity) + it.quantity; r.revenue = num(r.revenue) + base * rate; by.set(key, r);
      }
      const total = [...by.values()].reduce((s, r) => s + num(r.revenue), 0);
      const rows: Row[] = [...by.values()].map((r) => ({ ...r, revenue: r2(num(r.revenue)), share: total > 0 ? r2((num(r.revenue) / total) * 100) : 0 })).sort((a, b) => num(b.revenue) - num(a.revenue)).slice(0, 200);
      return { columns: [{ key: 'item', format: 'text' }, { key: 'quantity', format: 'number' }, { key: 'revenue', format: 'currency' }, { key: 'share', format: 'percent' }], rows, totals: { item: null, quantity: rows.reduce((s, r) => s + num(r.quantity), 0), revenue: r2(total), share: 100 }, kpis: [{ key: 'revenue', value: r2(total), format: 'currency', upGood: true }, { key: 'lines', value: by.size, format: 'number', upGood: true }], chart: { type: 'bars', labelKey: 'item', series: ['revenue'] }, notes: ['revenueExTax'], truncated: items.length >= 30_000 };
    },
  },
  {
    id: 'client_profitability', category: 'Sales', title: 'Customer profitability', description: 'Revenue less the expenses booked against each customer, to see who is actually worth the work.', period: 'range', comparable: true,
    async build(ctx) {
      const [inv, exp] = await Promise.all([invoicesIn(ctx), expensesIn(ctx, { clientId: { not: null } })]);
      const by = new Map<string, Row>();
      for (const i of inv) { if (!i.clientId) continue; const r = by.get(i.clientId) ?? { client: i.clientName, revenue: 0, costs: 0, profit: 0, margin: null, _href: `/clients/${i.clientId}` }; r.revenue = num(r.revenue) + netRev(i); by.set(i.clientId, r); }
      const names = new Map(inv.filter((i) => i.clientId).map((i) => [i.clientId!, i.clientName]));
      for (const e of exp) { if (!e.clientId) continue; const r = by.get(e.clientId) ?? { client: names.get(e.clientId) ?? '—', revenue: 0, costs: 0, profit: 0, margin: null, _href: `/clients/${e.clientId}` }; r.costs = num(r.costs) + netCost(e); by.set(e.clientId, r); }
      const rows = [...by.values()].map((r) => { const p = num(r.revenue) - num(r.costs); return { ...r, revenue: r2(num(r.revenue)), costs: r2(num(r.costs)), profit: r2(p), margin: num(r.revenue) > 0 ? r2((p / num(r.revenue)) * 100) : null }; }).sort((a, b) => num(b.profit) - num(a.profit));
      const t = sumRow(rows, ['revenue', 'costs', 'profit']);
      return { columns: [{ key: 'client', format: 'text' }, { key: 'revenue', format: 'currency' }, { key: 'costs', format: 'currency' }, { key: 'profit', format: 'currency' }, { key: 'margin', format: 'percent' }], rows, totals: { client: null, ...t, margin: num(t.revenue) > 0 ? r2((num(t.profit) / num(t.revenue)) * 100) : null }, kpis: [{ key: 'revenue', value: num(t.revenue), format: 'currency', upGood: true }, { key: 'costs', value: num(t.costs), format: 'currency', upGood: false }, { key: 'profit', value: num(t.profit), format: 'currency', upGood: true }], chart: { type: 'bars', labelKey: 'client', series: ['revenue', 'costs'] }, notes: ['costsClientTagged'], truncated: false };
    },
  },
  {
    id: 'expense_by_category', category: 'Finance', title: 'Expenses by category', description: 'Where the money goes, with each category\'s share and change from the period before.', period: 'range', comparable: true,
    async build(ctx) {
      const exp = await expensesIn(ctx);
      const by = new Map<string, Row>();
      for (const e of exp) { const r = by.get(e.category) ?? { category: e.category, bills: 0, amount: 0, share: 0 }; r.bills = num(r.bills) + 1; r.amount = num(r.amount) + netCost(e); by.set(e.category, r); }
      const total = [...by.values()].reduce((s, r) => s + num(r.amount), 0);
      const rows = [...by.values()].map((r) => ({ ...r, amount: r2(num(r.amount)), share: total > 0 ? r2((num(r.amount) / total) * 100) : 0 })).sort((a, b) => num(b.amount) - num(a.amount));
      return { columns: [{ key: 'category', format: 'text' }, { key: 'bills', format: 'number' }, { key: 'amount', format: 'currency' }, { key: 'share', format: 'percent' }], rows, totals: { category: null, bills: exp.length, amount: r2(total), share: 100 }, kpis: [{ key: 'expenses', value: r2(total), format: 'currency', upGood: false }, { key: 'bills', value: exp.length, format: 'number' }], chart: { type: 'donut', labelKey: 'category', series: ['amount'] }, notes: ['expensesApprovedNetItc'], truncated: exp.length >= 20_000 };
    },
  },
  {
    id: 'expense_by_vendor', category: 'Finance', title: 'Expenses by vendor', description: 'What you spend with each supplier and what is still unpaid to them.', period: 'range', comparable: true,
    async build(ctx) {
      const exp = await expensesIn(ctx);
      const by = new Map<string, Row>();
      for (const e of exp) { const r = by.get(e.vendor) ?? { vendor: e.vendor, bills: 0, amount: 0, unpaid: 0, share: 0 }; r.bills = num(r.bills) + 1; r.amount = num(r.amount) + netCost(e); if (e.paymentStatus === 'UNPAID') r.unpaid = num(r.unpaid) + num(e.amount); by.set(e.vendor, r); }
      const total = [...by.values()].reduce((s, r) => s + num(r.amount), 0);
      const rows = [...by.values()].map((r) => ({ ...r, amount: r2(num(r.amount)), unpaid: r2(num(r.unpaid)), share: total > 0 ? r2((num(r.amount) / total) * 100) : 0 })).sort((a, b) => num(b.amount) - num(a.amount)).slice(0, 300);
      return { columns: [{ key: 'vendor', format: 'text' }, { key: 'bills', format: 'number' }, { key: 'amount', format: 'currency' }, { key: 'share', format: 'percent' }, { key: 'unpaid', format: 'currency' }], rows, totals: { vendor: null, ...sumRow(rows, ['bills', 'amount', 'unpaid']), share: 100 }, kpis: [{ key: 'expenses', value: r2(total), format: 'currency', upGood: false }, { key: 'vendors', value: by.size, format: 'number' }], chart: { type: 'bars', labelKey: 'vendor', series: ['amount'] }, notes: ['expensesApprovedNetItc'], truncated: exp.length >= 20_000 };
    },
  },
  {
    id: 'ar_aging', category: 'Cash', title: 'Receivables aging', description: 'What customers owe you, by how late it is, with days to get paid and the amount most likely to slip.', period: 'asof', comparable: false,
    async build(ctx) {
      const snap = await getArCollectionsSnapshot(ctx.workspaceId, {});
      const by = new Map<string, Row>();
      for (const r of snap.rows) {
        const k = r.clientId ?? `n:${r.clientName}`; const row = by.get(k) ?? { client: r.clientName, current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0, _href: r.clientId ? `/clients/${r.clientId}` : '/ar-collections' };
        row[r.bucket] = num(row[r.bucket]) + r.outstanding; row.total = num(row.total) + r.outstanding; by.set(k, row);
      }
      const rows = [...by.values()].map((r) => ({ ...r, current: r2(num(r.current)), d1_30: r2(num(r.d1_30)), d31_60: r2(num(r.d31_60)), d61_90: r2(num(r.d61_90)), d90_plus: r2(num(r.d90_plus)), total: r2(num(r.total)) })).sort((a, b) => num(b.total) - num(a.total));
      return {
        columns: [{ key: 'client', format: 'text' }, { key: 'current', format: 'currency' }, { key: 'd1_30', format: 'currency' }, { key: 'd31_60', format: 'currency' }, { key: 'd61_90', format: 'currency' }, { key: 'd90_plus', format: 'currency' }, { key: 'total', format: 'currency' }], rows,
        totals: { client: null, ...sumRow(rows, ['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus', 'total']) },
        kpis: [{ key: 'outstanding', value: r2(snap.totals.totalOutstanding), format: 'currency' }, { key: 'overdue', value: r2(snap.totals.overdueAmount), format: 'currency', upGood: false }, { key: 'dso', value: snap.totals.dso ?? 0, format: 'number', upGood: false }, { key: 'atRisk', value: r2(snap.totals.atRiskAmount), format: 'currency', upGood: false }],
        chart: { type: 'bars', labelKey: 'client', series: ['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'] }, notes: ['balancesBaseCurrency'], truncated: snap.truncated,
      };
    },
  },
  {
    id: 'ap_aging', category: 'Cash', title: 'Payables aging', description: 'What you owe suppliers, by how late each bill is. Due dates follow the bill, MSME limits and vendor terms.', period: 'asof', comparable: false,
    async build(ctx) {
      const bills = await openPayables(ctx.workspaceId, ctx.now);
      const by = new Map<string, Row>();
      for (const b of bills) {
        const row = by.get(b.vendor) ?? { vendor: b.vendor, NOT_DUE: 0, D1_30: 0, D31_60: 0, D61_90: 0, D90_PLUS: 0, total: 0, _href: '/expenses' };
        row[b.bucket] = num(row[b.bucket]) + b.amount; row.total = num(row.total) + b.amount; by.set(b.vendor, row);
      }
      const rows = [...by.values()].map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'number' ? r2(v) : v])) as Row).sort((a, b) => num(b.total) - num(a.total));
      const ag = ageing(bills); const overdue = ag.D1_30.amount + ag.D31_60.amount + ag.D61_90.amount + ag.D90_PLUS.amount;
      return {
        columns: [{ key: 'vendor', format: 'text' }, { key: 'NOT_DUE', format: 'currency' }, { key: 'D1_30', format: 'currency' }, { key: 'D31_60', format: 'currency' }, { key: 'D61_90', format: 'currency' }, { key: 'D90_PLUS', format: 'currency' }, { key: 'total', format: 'currency' }], rows,
        totals: { vendor: null, ...sumRow(rows, ['NOT_DUE', 'D1_30', 'D31_60', 'D61_90', 'D90_PLUS', 'total']) },
        kpis: [{ key: 'owed', value: r2(bills.reduce((s, b) => s + b.amount, 0)), format: 'currency' }, { key: 'overdue', value: r2(overdue), format: 'currency', upGood: false }, { key: 'bills', value: bills.length, format: 'number' }],
        chart: { type: 'bars', labelKey: 'vendor', series: ['NOT_DUE', 'D1_30', 'D31_60', 'D61_90', 'D90_PLUS'] }, notes: ['approvedBillsOnly'], truncated: bills.length >= 2000,
      };
    },
  },
  {
    id: 'cash_forecast', category: 'Cash', title: 'Cash forecast', description: '13-week outlook from your bank balance, invoices, bills, payroll and tax, with the best and worst cases.', period: 'asof', comparable: false,
    async build(ctx) {
      const { results, sources } = await computeAllScenarios({ workspaceId: ctx.workspaceId, horizonType: 'WEEKLY_13', now: ctx.now });
      const base = results.BASE, worst = results.WORST_CASE, best = results.BEST_CASE; const k = buildKpis(base, sources, ctx.now);
      const rows: Row[] = base.periods.map((p, i) => ({ week: iso(p.periodStart), opening: r2(num(p.openingCash)), inflows: r2(num(p.actualInflows) + num(p.projectedInflows)), outflows: r2(num(p.actualOutflows) + num(p.projectedOutflows)), closing: r2(num(p.closingCash)), worst: r2(num(worst.periods[i]?.closingCash)), best: r2(num(best.periods[i]?.closingCash)), _href: '/cash-flow' }));
      return {
        columns: [{ key: 'week', format: 'date' }, { key: 'opening', format: 'currency' }, { key: 'inflows', format: 'currency' }, { key: 'outflows', format: 'currency' }, { key: 'closing', format: 'currency' }, { key: 'worst', format: 'currency' }, { key: 'best', format: 'currency' }], rows, totals: null,
        kpis: [{ key: 'cashNow', value: r2(k.cashNow), format: 'currency', upGood: true }, { key: 'lowest', value: r2(k.lowestCash), format: 'currency', upGood: true }, { key: 'safeToSpend', value: r2(k.safeToSpend), format: 'currency', upGood: true }, { key: 'closing', value: r2(k.closingCash), format: 'currency', upGood: true }],
        chart: { type: 'line', labelKey: 'week', series: ['closing', 'worst', 'best'] }, notes: ['forecastDefinition'], truncated: false,
      };
    },
  },
  {
    id: 'mrr', category: 'Sales', title: 'Recurring revenue (MRR)', description: 'Monthly recurring revenue from retainers: new, expansion, contraction and churn.', period: 'asof', comparable: false,
    async build(ctx) {
      const months = await getMrrMovement(ctx.workspaceId, 12, ctx.now);
      const rows: Row[] = months.map((m) => ({ month: m.month, new: m.new, expansion: m.expansion, contraction: m.contraction, churn: m.churn, net: m.net, endingMrr: m.endingMrr, _href: '/retainers' }));
      const last = months[months.length - 1];
      return {
        columns: [{ key: 'month', format: 'text' }, { key: 'new', format: 'currency' }, { key: 'expansion', format: 'currency' }, { key: 'contraction', format: 'currency' }, { key: 'churn', format: 'currency' }, { key: 'net', format: 'currency' }, { key: 'endingMrr', format: 'currency' }], rows, totals: null,
        kpis: [{ key: 'mrr', value: last?.endingMrr ?? 0, format: 'currency', upGood: true }, { key: 'arr', value: r2((last?.endingMrr ?? 0) * 12), format: 'currency', upGood: true }, { key: 'netNew', value: last?.net ?? 0, format: 'currency', upGood: true }, { key: 'churn', value: last?.churn ?? 0, format: 'currency', upGood: false }],
        chart: { type: 'bars', labelKey: 'month', series: ['new', 'expansion'], lineSeries: ['endingMrr'] }, notes: [], truncated: false,
      };
    },
  },
  {
    id: 'tax_position', category: 'Tax', title: 'Tax collected and claimable', description: 'Output tax on your invoices against input tax credit on approved bills, by month: a quick read of net tax payable.', period: 'range', comparable: true,
    async build(ctx) {
      const [inv, exp] = await Promise.all([invoicesIn(ctx), expensesIn(ctx)]);
      const by = new Map<string, Row>();
      const row = (m: string) => { if (!by.has(m)) by.set(m, { period: m, output: 0, input: 0, net: 0 }); return by.get(m)!; };
      for (const i of inv) { const r = row(month(i.invoiceDate)); r.output = num(r.output) + num(i.taxAmount) * (num(i.exchangeRate) || 1); }
      for (const e of exp) { const c = claimable(e); if (c > 0) { const r = row(month(e.date)); r.input = num(r.input) + c; } }
      const rows = [...by.values()].sort((a, b) => String(a.period).localeCompare(String(b.period))).map((r) => ({ period: r.period, output: r2(num(r.output)), input: r2(num(r.input)), net: r2(num(r.output) - num(r.input)), _href: '/tax' }));
      const t = sumRow(rows, ['output', 'input', 'net']);
      return { columns: [{ key: 'period', format: 'text' }, { key: 'output', format: 'currency' }, { key: 'input', format: 'currency' }, { key: 'net', format: 'currency' }], rows, totals: { period: null, ...t }, kpis: [{ key: 'output', value: num(t.output), format: 'currency' }, { key: 'input', value: num(t.input), format: 'currency', upGood: true }, { key: 'netTax', value: num(t.net), format: 'currency', upGood: false }], chart: { type: 'bars', labelKey: 'period', series: ['output', 'input'], lineSeries: ['net'] }, notes: ['taxEstimate'], truncated: false };
    },
  },
  {
    id: 'bank_reconciliation', category: 'Operations', title: 'Bank reconciliation status', description: 'How much of the bank activity is matched to your books, and what is still waiting.', period: 'asof', comparable: false,
    async build(ctx) {
      const s = await reconciliationSummary(ctx.workspaceId);
      const rows: Row[] = [
        { status: 'reconciled', count: s.reconciled, amount: null, _href: '/reconciliation' }, { status: 'waitingDebit', count: s.waitingDebit.count, amount: s.waitingDebit.amount, _href: '/reconciliation' },
        { status: 'waitingCredit', count: s.waitingCredit.count, amount: s.waitingCredit.amount, _href: '/reconciliation' }, { status: 'ignored', count: s.ignored, amount: null, _href: '/reconciliation' }, { status: 'transfers', count: s.transfers, amount: null, _href: '/reconciliation' },
      ];
      return { columns: [{ key: 'status', format: 'text' }, { key: 'count', format: 'number' }, { key: 'amount', format: 'currency' }], rows, totals: null, kpis: [{ key: 'reconciledPercent', value: s.reconciledPercent, format: 'percent', upGood: true }, { key: 'waiting', value: s.waiting, format: 'number', upGood: false }, { key: 'oldestDays', value: s.oldestWaitingDays ?? 0, format: 'number', upGood: false }], chart: { type: 'donut', labelKey: 'status', series: ['count'] }, notes: [], truncated: false };
    },
  },
  {
    id: 'invoice_register', category: 'Operations', title: 'Invoice register', description: 'Every invoice in the period with its status and balance.', period: 'range', comparable: false,
    async build(ctx) {
      const inv = await invoicesIn(ctx);
      const rows: Row[] = inv.slice(0, 2000).map((i) => ({ number: i.invoiceNumber, date: iso(i.invoiceDate), client: i.clientName, status: i.status, total: r2(gross(i) * rate(i)), tax: r2(num(i.taxAmount) * (num(i.exchangeRate) || 1)), balance: r2(Math.max(0, gross(i) - num(i.amountReceived)) * rate(i)), _href: `/income?q=${encodeURIComponent(i.invoiceNumber)}` }));
      return { columns: [{ key: 'number', format: 'text' }, { key: 'date', format: 'date' }, { key: 'client', format: 'text' }, { key: 'status', format: 'text' }, { key: 'total', format: 'currency' }, { key: 'tax', format: 'currency' }, { key: 'balance', format: 'currency' }], rows, totals: { number: null, date: null, client: null, status: null, ...sumRow(rows, ['total', 'tax', 'balance']) }, kpis: [{ key: 'invoices', value: inv.length, format: 'number' }, { key: 'billed', value: r2(rows.reduce((s, r) => s + num(r.total), 0)), format: 'currency', upGood: true }, { key: 'balance', value: r2(rows.reduce((s, r) => s + num(r.balance), 0)), format: 'currency' }], chart: null, notes: ['voidExcluded'], truncated: inv.length > 2000 };
    },
  },
  {
    id: 'expense_register', category: 'Operations', title: 'Expense register', description: 'Every approved expense in the period with category, vendor and payment status.', period: 'range', comparable: false,
    async build(ctx) {
      const exp = await expensesIn(ctx);
      const rows: Row[] = exp.slice(0, 2000).map((e) => ({ date: iso(e.date), vendor: e.vendor, category: e.category, description: e.description ?? null, paymentStatus: e.paymentStatus, amount: r2(num(e.amount)), claimable: r2(claimable(e)), _href: '/expenses' }));
      return { columns: [{ key: 'date', format: 'date' }, { key: 'vendor', format: 'text' }, { key: 'category', format: 'text' }, { key: 'description', format: 'text' }, { key: 'paymentStatus', format: 'text' }, { key: 'amount', format: 'currency' }, { key: 'claimable', format: 'currency' }], rows, totals: { date: null, vendor: null, category: null, description: null, paymentStatus: null, ...sumRow(rows, ['amount', 'claimable']) }, kpis: [{ key: 'expenses', value: r2(rows.reduce((s, r) => s + num(r.amount), 0)), format: 'currency', upGood: false }, { key: 'bills', value: exp.length, format: 'number' }], chart: null, notes: ['approvedBillsOnly'], truncated: exp.length > 2000 };
    },
  },
];

export const getReport = (id: string) => REPORTS.find((r) => r.id === id) ?? null;
export const listReports = () => REPORTS.map(({ build: _b, ...r }) => r);

export type RunInput = { reportId: string; period?: PeriodKey; from?: string | null; to?: string | null; compare?: boolean };

export async function runReport(workspaceId: string, input: RunInput, now = new Date()): Promise<ReportResult | null> {
  const def = getReport(input.reportId);
  if (!def) return null;
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { baseCurrency: true, countryCode: true } });
  const countryCode = ws?.countryCode ?? 'IN';
  const range = def.period === 'range' ? resolvePeriod(input.period ?? 'this_fy', countryCode, now, { from: input.from, to: input.to }) : resolvePeriod('all', countryCode, now);
  const ctx: Ctx = { workspaceId, range, now, currency: ws?.baseCurrency ?? 'INR', countryCode };
  const prev = def.comparable && input.compare ? previousRange(range) : null;
  const [cur, before] = await Promise.all([def.build(ctx), prev ? def.build({ ...ctx, range: prev }) : Promise.resolve(null)]);
  return {
    ...cur, currency: ctx.currency, generatedAt: now.toISOString(),
    range: def.period === 'range' ? { key: range.key, from: range.from?.toISOString() ?? null, to: range.to?.toISOString() ?? null } : null,
    ...(before ? { previous: before.kpis } : {}),
  };
}

export async function reportToCsv(def: Pick<ReportDef, 'id' | 'title'>, result: ReportResult, labels: Record<string, string>): Promise<string> {
  const cell = (v: unknown) => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
  const head = result.columns.map((c) => cell(labels[c.key] ?? c.key)).join(',');
  const lines = result.rows.map((r) => result.columns.map((c) => cell(r[c.key])).join(','));
  if (result.totals) lines.push(result.columns.map((c, i) => cell(i === 0 ? (labels.total ?? 'Total') : result.totals![c.key])).join(','));
  return `﻿${[head, ...lines].join('\r\n')}`;
}
