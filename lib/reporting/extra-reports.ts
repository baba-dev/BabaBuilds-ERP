import 'server-only';
import { prisma } from '@/lib/prisma';
import { openPayables } from '@/lib/expenses/payables-data';
import { forecastAccuracy } from '@/lib/cash-flow/accuracy';
import { retainerMrr } from '@/lib/retainers/mrr';
import { getConsolidatedInvoiceReport } from '@/lib/company-groups/reports';
import { claimable, DAY, dateWhere, expensesIn, gross, invoicesIn, iso, month, netRev, num, r2, rate, sumRow } from '@/lib/reporting/helpers';
import type { Ctx, ReportDef, Row } from '@/lib/reporting/types';

const dayDiff = (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / DAY);

export const EXTRA_REPORTS: Array<Omit<ReportDef, 'lineage'>> = [
  {
    id: 'budget_vs_actual', category: 'Finance', title: 'Budget vs actual', description: 'Spending against your monthly caps by category for the period.', period: 'range', comparable: false,
    async build(ctx: Ctx) {
      const [budgets, exp] = await Promise.all([prisma.expenseBudget.findMany({ where: { workspaceId: ctx.workspaceId }, select: { category: true, monthlyAmount: true } }), expensesIn(ctx)]);
      const from = ctx.range.from ?? new Date(Date.UTC(ctx.now.getUTCFullYear(), 0, 1)), to = ctx.range.to ?? new Date(Date.UTC(ctx.now.getUTCFullYear() + 1, 0, 1));
      const months = Math.max(1, Math.round((to.getTime() - from.getTime()) / (30.44 * DAY)));
      const spend = new Map<string, number>(); let total = 0;
      for (const e of exp) { spend.set(e.category, (spend.get(e.category) ?? 0) + num(e.amount)); total += num(e.amount); }
      const rows: Row[] = budgets.map((b) => {
        const actual = b.category === '*' ? total : (spend.get(b.category) ?? 0), budget = num(b.monthlyAmount) * months;
        return { category: b.category === '*' ? null : b.category, budget: r2(budget), actual: r2(actual), variance: r2(budget - actual), used: budget > 0 ? r2((actual / budget) * 100) : null, _href: b.category === '*' ? '/expenses' : `/expenses?category=${encodeURIComponent(b.category)}` };
      }).sort((a, b) => num(b.used) - num(a.used));
      const overall = rows.find((r) => r.category === null);
      return { columns: [{ key: 'category', format: 'text' }, { key: 'budget', format: 'currency' }, { key: 'actual', format: 'currency' }, { key: 'variance', format: 'currency' }, { key: 'used', format: 'percent' }], rows, totals: null, kpis: [{ key: 'budget', value: overall ? num(overall.budget) : r2(rows.reduce((s, r) => s + num(r.budget), 0)), format: 'currency' }, { key: 'actual', value: r2(total), format: 'currency', upGood: false }, { key: 'overBudget', value: rows.filter((r) => num(r.used) > 100 && r.category !== null).length, format: 'number', upGood: false }], chart: { type: 'bars', labelKey: 'category', series: ['budget', 'actual'] }, notes: ['budgetMonths'], truncated: exp.length >= 20_000 };
    },
  },
  {
    id: 'gst_summary', category: 'Tax', title: 'GST summary', description: 'Tax collected by rate and input credit on bills, eligible and blocked.', period: 'range', comparable: true, requires: 'tax.view',
    async build(ctx: Ctx) {
      const [inv, exp] = await Promise.all([invoicesIn(ctx), expensesIn(ctx)]);
      const by = new Map<string, Row>();
      const put = (side: string, r: number, taxable: number, tax: number) => { const k = `${side}:${r}`; const row = by.get(k) ?? { side, rate: r, count: 0, taxable: 0, tax: 0 }; row.count = num(row.count) + 1; row.taxable = num(row.taxable) + taxable; row.tax = num(row.tax) + tax; by.set(k, row); };
      for (const i of inv) put('output', Math.round(num(i.taxRate)), netRev(i), num(i.taxAmount) * rate(i));
      let eligible = 0, blocked = 0;
      for (const e of exp) { const tax = num(e.igstAmount) + num(e.cgstAmount) + num(e.sgstAmount) + num(e.cessAmount); if (tax <= 0) continue; const c = claimable(e); eligible += c; blocked += tax - c; put(c > 0 ? 'inputEligible' : 'inputBlocked', 0, num(e.amount) - tax, tax); }
      const rows: Row[] = [...by.values()].map((r): Row => ({ ...r, taxable: r2(num(r.taxable)), tax: r2(num(r.tax)), _href: '/tax' })).sort((a, b) => String(a.side).localeCompare(String(b.side)));
      const output = rows.filter((r) => r.side === 'output').reduce((s, r) => s + num(r.tax), 0);
      return { columns: [{ key: 'side', format: 'text' }, { key: 'count', format: 'number' }, { key: 'taxable', format: 'currency' }, { key: 'tax', format: 'currency' }], rows, totals: null, kpis: [{ key: 'output', value: r2(output), format: 'currency' }, { key: 'inputEligible', value: r2(eligible), format: 'currency', upGood: true }, { key: 'inputBlocked', value: r2(blocked), format: 'currency', upGood: false }, { key: 'netTax', value: r2(output - eligible), format: 'currency', upGood: false }], chart: null, notes: ['taxEstimate'], truncated: false };
    },
  },
  {
    id: 'msme_payables', category: 'Tax', title: 'MSME payables', description: 'Open bills owed to micro and small suppliers and how close each is to the 45-day payment rule.', period: 'asof', comparable: false, requires: 'tax.view',
    async build(ctx: Ctx) {
      const bills = (await openPayables(ctx.workspaceId, ctx.now)).filter((b) => b.msme);
      const rows: Row[] = bills.map((b) => ({ vendor: b.vendor, invoiceNo: b.invoiceNo, billDate: iso(b.date), dueDate: iso(b.dueDate), daysOverdue: Math.max(0, dayDiff(ctx.now, b.dueDate)), daysOpen: Math.max(0, dayDiff(ctx.now, b.date)), amount: r2(b.amount), _href: '/expenses' })).sort((a, b) => num(b.daysOpen) - num(a.daysOpen));
      const over45 = rows.filter((r) => num(r.daysOpen) > 45);
      return { columns: [{ key: 'vendor', format: 'text' }, { key: 'invoiceNo', format: 'text' }, { key: 'billDate', format: 'date' }, { key: 'dueDate', format: 'date' }, { key: 'daysOpen', format: 'number' }, { key: 'daysOverdue', format: 'number' }, { key: 'amount', format: 'currency' }], rows, totals: { vendor: null, invoiceNo: null, billDate: null, dueDate: null, daysOpen: null, daysOverdue: null, amount: r2(rows.reduce((s, r) => s + num(r.amount), 0)) }, kpis: [{ key: 'owed', value: r2(rows.reduce((s, r) => s + num(r.amount), 0)), format: 'currency' }, { key: 'over45', value: r2(over45.reduce((s, r) => s + num(r.amount), 0)), format: 'currency', upGood: false }, { key: 'bills', value: rows.length, format: 'number' }], chart: null, notes: ['msme43bh'], truncated: false };
    },
  },
  {
    id: 'payroll_cost', category: 'Operations', title: 'Payroll cost', description: 'What each posted payroll run cost: earnings, deductions, employer costs and net pay.', period: 'range', comparable: true, requires: 'payroll.view',
    async build(ctx: Ctx) {
      const runs = await prisma.payrollRun.findMany({ where: { workspaceId: ctx.workspaceId, status: 'POSTED', period: dateWhere('startDate', ctx.range) }, select: { totalEarnings: true, totalDeductions: true, totalEmployerCosts: true, totalNetPay: true, period: { select: { startDate: true } } }, orderBy: { period: { startDate: 'asc' } }, take: 500 });
      const rows: Row[] = runs.map((r) => ({ month: month(r.period.startDate), earnings: r2(num(r.totalEarnings)), employer: r2(num(r.totalEmployerCosts)), deductions: r2(num(r.totalDeductions)), netPay: r2(num(r.totalNetPay)), cost: r2(num(r.totalEarnings) + num(r.totalEmployerCosts)), _href: '/payroll' }));
      const t = sumRow(rows, ['earnings', 'employer', 'deductions', 'netPay', 'cost']);
      return { columns: [{ key: 'month', format: 'text' }, { key: 'earnings', format: 'currency' }, { key: 'employer', format: 'currency' }, { key: 'deductions', format: 'currency' }, { key: 'netPay', format: 'currency' }, { key: 'cost', format: 'currency' }], rows, totals: { month: null, ...t }, kpis: [{ key: 'cost', value: num(t.cost), format: 'currency', upGood: false }, { key: 'netPay', value: num(t.netPay), format: 'currency' }, { key: 'runs', value: rows.length, format: 'number' }], chart: { type: 'bars', labelKey: 'month', series: ['earnings', 'employer'] }, notes: ['payrollPostedOnly'], truncated: false };
    },
  },
  {
    id: 'inventory_valuation', category: 'Operations', title: 'Inventory valuation', description: 'Stock on hand at cost, with items at or below their safety level.', period: 'asof', comparable: false, requires: 'inventory.view',
    async build(ctx: Ctx) {
      const items = await prisma.product.findMany({ where: { workspaceId: ctx.workspaceId }, select: { name: true, sku: true, currentStock: true, safetyStock: true, costPrice: true }, take: 5000 });
      const rows: Row[] = items.map((p) => ({ item: p.name, sku: p.sku, stock: p.currentStock, safety: p.safetyStock, cost: r2(num(p.costPrice)), value: r2(Math.max(0, p.currentStock) * num(p.costPrice)), status: p.currentStock <= 0 ? 'OUT_OF_STOCK' : p.currentStock <= p.safetyStock ? 'LOW_STOCK' : 'IN_STOCK', _href: '/inventory' })).sort((a, b) => num(b.value) - num(a.value));
      return { columns: [{ key: 'item', format: 'text' }, { key: 'sku', format: 'text' }, { key: 'stock', format: 'number' }, { key: 'cost', format: 'currency' }, { key: 'value', format: 'currency' }, { key: 'status', format: 'text' }], rows, totals: { item: null, sku: null, stock: rows.reduce((s, r) => s + num(r.stock), 0), cost: null, value: r2(rows.reduce((s, r) => s + num(r.value), 0)), status: null }, kpis: [{ key: 'valuation', value: r2(rows.reduce((s, r) => s + num(r.value), 0)), format: 'currency' }, { key: 'lowStock', value: rows.filter((r) => r.status === 'LOW_STOCK').length, format: 'number', upGood: false }, { key: 'outOfStock', value: rows.filter((r) => r.status === 'OUT_OF_STOCK').length, format: 'number', upGood: false }], chart: null, notes: ['costBasis'], truncated: items.length >= 5000 };
    },
  },
  {
    id: 'shop_sales', category: 'Sales', title: 'Shop sales', description: 'Paid online shop orders by month, with tax and refunds.', period: 'range', comparable: true,
    async build(ctx: Ctx) {
      const orders = await prisma.shopOrder.findMany({ where: { workspaceId: ctx.workspaceId, status: { in: ['PAID', 'REFUNDED'] }, ...dateWhere('createdAt', ctx.range) }, select: { createdAt: true, subtotal: true, taxTotal: true, amount: true, status: true }, take: 30_000 });
      const by = new Map<string, Row>();
      for (const o of orders) { const k = month(o.createdAt); const r = by.get(k) ?? { month: k, orders: 0, sales: 0, tax: 0, refunds: 0 }; if (o.status === 'REFUNDED') r.refunds = num(r.refunds) + num(o.amount); else { r.orders = num(r.orders) + 1; r.sales = num(r.sales) + num(o.subtotal); r.tax = num(r.tax) + num(o.taxTotal); } by.set(k, r); }
      const rows: Row[] = [...by.values()].sort((a, b) => String(a.month).localeCompare(String(b.month))).map((r) => ({ ...r, sales: r2(num(r.sales)), tax: r2(num(r.tax)), refunds: r2(num(r.refunds)), _href: '/shop' }));
      const t = sumRow(rows, ['orders', 'sales', 'tax', 'refunds']);
      return { columns: [{ key: 'month', format: 'text' }, { key: 'orders', format: 'number' }, { key: 'sales', format: 'currency' }, { key: 'tax', format: 'currency' }, { key: 'refunds', format: 'currency' }], rows, totals: { month: null, ...t }, kpis: [{ key: 'sales', value: num(t.sales), format: 'currency', upGood: true }, { key: 'orders', value: num(t.orders), format: 'number', upGood: true }, { key: 'aov', value: num(t.orders) > 0 ? r2(num(t.sales) / num(t.orders)) : 0, format: 'currency', upGood: true }, { key: 'refunds', value: num(t.refunds), format: 'currency', upGood: false }], chart: { type: 'bars', labelKey: 'month', series: ['sales', 'tax'] }, notes: ['shopCurrency'], truncated: orders.length >= 30_000 };
    },
  },
  {
    id: 'proposal_pipeline', category: 'Sales', title: 'Proposal pipeline', description: 'Proposals by stage, their value, win rate and how long customers take to say yes.', period: 'range', comparable: true, requires: 'proposals.view',
    async build(ctx: Ctx) {
      const ps = await prisma.proposal.findMany({ where: { workspaceId: ctx.workspaceId, ...dateWhere('dateCreated', ctx.range) }, select: { status: true, totalAmount: true, exchangeRate: true, sentAt: true, acceptedAt: true }, take: 20_000 });
      const stages = ['DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'INVOICED', 'DECLINED'];
      const rows: Row[] = stages.map((s) => { const l = ps.filter((p) => p.status === s); return { stage: s, count: l.length, value: r2(l.reduce((x, p) => x + num(p.totalAmount) * (num(p.exchangeRate) || 1), 0)), _href: '/proposals' }; });
      const won = ps.filter((p) => p.status === 'ACCEPTED' || p.status === 'INVOICED').length, lost = ps.filter((p) => p.status === 'DECLINED').length;
      const days = ps.filter((p) => p.acceptedAt && p.sentAt).map((p) => dayDiff(p.acceptedAt!, p.sentAt!));
      const open = rows.filter((r) => ['SENT', 'VIEWED'].includes(String(r.stage))).reduce((s, r) => s + num(r.value), 0);
      return { columns: [{ key: 'stage', format: 'text' }, { key: 'count', format: 'number' }, { key: 'value', format: 'currency' }], rows, totals: null, kpis: [{ key: 'winRate', value: won + lost > 0 ? r2((won / (won + lost)) * 100) : 0, format: 'percent', upGood: true }, { key: 'openValue', value: r2(open), format: 'currency', upGood: true }, { key: 'daysToWin', value: days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : 0, format: 'number', upGood: false }], chart: { type: 'bars', labelKey: 'stage', series: ['value'] }, notes: ['winRate'], truncated: ps.length >= 20_000 };
    },
  },
  {
    id: 'collections_effectiveness', category: 'Cash', title: 'Collections effectiveness', description: 'Reminders sent, promises kept and broken, and cash collected, month by month.', period: 'range', comparable: true,
    async build(ctx: Ctx) {
      const [events, pays] = await Promise.all([
        prisma.invoiceEvent.findMany({ where: { workspaceId: ctx.workspaceId, type: { in: ['REMINDER_SENT', 'PROMISE_TO_PAY', 'PROMISE_BROKEN'] }, ...dateWhere('createdAt', ctx.range) }, select: { type: true, createdAt: true }, take: 50_000 }),
        prisma.invoicePayment.findMany({ where: { workspaceId: ctx.workspaceId, reversedAt: null, ...dateWhere('receivedAt', ctx.range) }, select: { amount: true, receivedAt: true, invoice: { select: { exchangeRate: true } } }, take: 50_000 }),
      ]);
      const by = new Map<string, Row>(); const row = (m: string) => { if (!by.has(m)) by.set(m, { month: m, reminders: 0, promises: 0, broken: 0, collected: 0 }); return by.get(m)!; };
      for (const e of events) { const r = row(month(e.createdAt)); if (e.type === 'REMINDER_SENT') r.reminders = num(r.reminders) + 1; else if (e.type === 'PROMISE_TO_PAY') r.promises = num(r.promises) + 1; else r.broken = num(r.broken) + 1; }
      for (const p of pays) { const r = row(month(p.receivedAt)); r.collected = num(r.collected) + num(p.amount) * (num(p.invoice.exchangeRate) || 1); }
      const rows: Row[] = [...by.values()].sort((a, b) => String(a.month).localeCompare(String(b.month))).map((r) => ({ ...r, collected: r2(num(r.collected)), _href: '/ar-collections' }));
      const t = sumRow(rows, ['reminders', 'promises', 'broken', 'collected']);
      return { columns: [{ key: 'month', format: 'text' }, { key: 'reminders', format: 'number' }, { key: 'promises', format: 'number' }, { key: 'broken', format: 'number' }, { key: 'collected', format: 'currency' }], rows, totals: { month: null, ...t }, kpis: [{ key: 'collected', value: num(t.collected), format: 'currency', upGood: true }, { key: 'reminders', value: num(t.reminders), format: 'number' }, { key: 'promiseKeptRate', value: num(t.promises) > 0 ? r2((1 - num(t.broken) / num(t.promises)) * 100) : 0, format: 'percent', upGood: true }], chart: { type: 'bars', labelKey: 'month', series: ['collected'] }, notes: ['promiseEvents'], truncated: events.length >= 50_000 };
    },
  },
  {
    id: 'client_ltv', category: 'Sales', title: 'Customer lifetime value', description: 'Revenue per customer over their whole history, how long they have been with you and what they pay per month.', period: 'asof', comparable: false,
    async build(ctx: Ctx) {
      const inv = await prisma.invoice.findMany({ where: { workspaceId: ctx.workspaceId, status: { not: 'VOID' }, voidedAt: null, clientId: { not: null } }, select: { clientId: true, clientName: true, invoiceDate: true, totalAmount: true, grandTotal: true, taxAmount: true, exchangeRate: true }, take: 50_000 });
      const by = new Map<string, Row & { first: Date }>();
      for (const i of inv) { const k = i.clientId!; const r = (by.get(k) ?? { client: i.clientName, invoices: 0, ltv: 0, since: iso(i.invoiceDate), months: 0, perMonth: 0, first: i.invoiceDate, _href: `/clients/${k}` }) as Row & { first: Date }; r.invoices = num(r.invoices) + 1; r.ltv = num(r.ltv) + netRev(i); if (i.invoiceDate < r.first) { r.first = i.invoiceDate; r.since = iso(i.invoiceDate); } by.set(k, r); }
      const rows: Row[] = [...by.values()].map(({ first, ...r }) => { const months = Math.max(1, Math.round((ctx.now.getTime() - first.getTime()) / (30.44 * DAY))); return { ...r, ltv: r2(num(r.ltv)), months, perMonth: r2(num(r.ltv) / months) }; }).sort((a, b) => num(b.ltv) - num(a.ltv)).slice(0, 200);
      const total = rows.reduce((s, r) => s + num(r.ltv), 0), top10 = rows.slice(0, 10).reduce((s, r) => s + num(r.ltv), 0);
      return { columns: [{ key: 'client', format: 'text' }, { key: 'invoices', format: 'number' }, { key: 'since', format: 'date' }, { key: 'months', format: 'number' }, { key: 'ltv', format: 'currency' }, { key: 'perMonth', format: 'currency' }], rows, totals: null, kpis: [{ key: 'avgLtv', value: rows.length ? r2(total / rows.length) : 0, format: 'currency', upGood: true }, { key: 'customers', value: rows.length, format: 'number' }, { key: 'top10Share', value: total > 0 ? r2((top10 / total) * 100) : 0, format: 'percent', upGood: false }], chart: { type: 'bars', labelKey: 'client', series: ['ltv'] }, notes: ['revenueExTax'], truncated: inv.length >= 50_000 };
    },
  },
  {
    id: 'retainer_cohorts', category: 'Sales', title: 'Retainer cohorts', description: 'How many retainers started each month are still active, and what they bring in now.', period: 'asof', comparable: false,
    async build(ctx: Ctx) {
      const rs = await prisma.retainer.findMany({ where: { workspaceId: ctx.workspaceId }, select: { createdAt: true, status: true, frequency: true, exchangeRate: true, items: { select: { quantity: true, unitPrice: true, taxRate: true } } }, take: 10_000 });
      const by = new Map<string, Row>();
      for (const r of rs) { const k = month(r.createdAt); const row = by.get(k) ?? { cohort: k, started: 0, active: 0, retention: 0, mrr: 0 }; row.started = num(row.started) + 1; if (r.status === 'ACTIVE') row.active = num(row.active) + 1; row.mrr = num(row.mrr) + retainerMrr({ status: r.status === 'PAUSED' ? 'ACTIVE' : r.status, frequency: r.frequency, exchangeRate: r.exchangeRate, items: r.items }); by.set(k, row); }
      const rows: Row[] = [...by.values()].sort((a, b) => String(a.cohort).localeCompare(String(b.cohort))).map((r) => ({ ...r, retention: num(r.started) > 0 ? r2((num(r.active) / num(r.started)) * 100) : 0, mrr: r2(num(r.mrr)), _href: '/retainers' }));
      const t = sumRow(rows, ['started', 'active', 'mrr']);
      return { columns: [{ key: 'cohort', format: 'text' }, { key: 'started', format: 'number' }, { key: 'active', format: 'number' }, { key: 'retention', format: 'percent' }, { key: 'mrr', format: 'currency' }], rows, totals: { cohort: null, ...t, retention: num(t.started) > 0 ? r2((num(t.active) / num(t.started)) * 100) : 0 }, kpis: [{ key: 'retention', value: num(t.started) > 0 ? r2((num(t.active) / num(t.started)) * 100) : 0, format: 'percent', upGood: true }, { key: 'active', value: num(t.active), format: 'number', upGood: true }, { key: 'mrr', value: num(t.mrr), format: 'currency', upGood: true }], chart: { type: 'bars', labelKey: 'cohort', series: ['started', 'active'] }, notes: ['logoRetention'], truncated: false };
    },
  },
  {
    id: 'forecast_accuracy', category: 'Cash', title: 'Forecast accuracy', description: 'How close an older cash forecast came to what the bank actually did.', period: 'asof', comparable: false,
    async build(ctx: Ctx) {
      const a = await forecastAccuracy(ctx.workspaceId, ctx.now);
      const rows: Row[] = a.periods.map((p) => ({ week: p.start.slice(0, 10), forecastNet: r2(p.forecastNet), actualNet: r2(p.actualNet), error: r2(p.error), _href: '/cash-flow?tab=accuracy' }));
      return { columns: [{ key: 'week', format: 'date' }, { key: 'forecastNet', format: 'currency' }, { key: 'actualNet', format: 'currency' }, { key: 'error', format: 'currency' }], rows, totals: null, kpis: [{ key: 'accuracy', value: a.score ?? 0, format: 'percent', upGood: true }, { key: 'bias', value: r2(a.bias ?? 0), format: 'currency', upGood: false }], chart: rows.length ? { type: 'bars', labelKey: 'week', series: ['forecastNet', 'actualNet'] } : null, notes: ['accuracyHistory'], truncated: false };
    },
  },
  {
    id: 'group_revenue', category: 'Finance', title: 'Group revenue by company', description: 'Billed revenue and open balances for each company in your group. Each company stays in its own currency.', period: 'range', comparable: false,
    async build(ctx: Ctx) {
      const link = await prisma.companyGroupWorkspace.findFirst({ where: { workspaceId: ctx.workspaceId, isActive: true }, select: { companyGroupId: true } });
      if (!link) return { columns: [{ key: 'company', format: 'text' }], rows: [], totals: null, kpis: [], chart: null, notes: ['notInGroup'], truncated: false };
      const rowsIn = await getConsolidatedInvoiceReport(ctx.userId, link.companyGroupId, { from: ctx.range.from ?? undefined, to: ctx.range.to ?? undefined, statuses: ['PENDING', 'PARTIALLY_PAID', 'PAID'] }).catch(() => []);
      const by = new Map<string, Row>();
      for (const r of rowsIn) { const k = r.workspaceId; const row = by.get(k) ?? { company: r.companyName, currency: r.currency, invoices: 0, billed: 0, outstanding: 0 }; row.invoices = num(row.invoices) + 1; row.billed = num(row.billed) + num((r as unknown as { totalAmount?: number }).totalAmount ?? 0); row.outstanding = num(row.outstanding) + num((r as unknown as { outstandingAmount?: number }).outstandingAmount ?? 0); by.set(k, row); }
      const rows: Row[] = [...by.values()].map((r) => ({ ...r, billed: r2(num(r.billed)), outstanding: r2(num(r.outstanding)) })).sort((a, b) => num(b.billed) - num(a.billed));
      return { columns: [{ key: 'company', format: 'text' }, { key: 'currency', format: 'text' }, { key: 'invoices', format: 'number' }, { key: 'billed', format: 'number' }, { key: 'outstanding', format: 'number' }], rows, totals: null, kpis: [{ key: 'companies', value: rows.length, format: 'number' }, { key: 'invoices', value: rows.reduce((s, r) => s + num(r.invoices), 0), format: 'number' }], chart: null, notes: ['groupCurrencies'], truncated: false };
    },
  },
];
