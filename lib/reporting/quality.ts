import 'server-only';
import { prisma } from '@/lib/prisma';
import { reconciliationSummary } from '@/lib/reconciliation/workspace';
import { dateWhere, num, r2 } from '@/lib/reporting/helpers';
import { QUALITY_CHECKS } from '@/lib/reporting/lineage';
import type { Ctx, QualityIssue } from '@/lib/reporting/types';

/** Things in the data that make this report less complete than it looks, each with the screen where it gets fixed. Only issues that exist are returned. */
export async function qualityFor(reportId: string, ctx: Ctx): Promise<QualityIssue[]> {
  const checks = QUALITY_CHECKS[reportId] ?? [];
  const out: QualityIssue[] = [];
  const w = ctx.workspaceId;
  await Promise.all(checks.map(async (c) => {
    if (c === 'pendingExpenses') {
      const a = await prisma.expense.aggregate({ where: { workspaceId: w, approvalStatus: { in: ['PENDING', 'DRAFT'] }, ...dateWhere('date', ctx.range) }, _sum: { amount: true }, _count: { _all: true } });
      if (a._count._all) out.push({ code: 'pendingExpenses', count: a._count._all, amount: r2(num(a._sum.amount)), href: '/expenses' });
    } else if (c === 'noDueDate') {
      const n = await prisma.invoice.count({ where: { workspaceId: w, status: { in: ['PENDING', 'PARTIALLY_PAID'] }, voidedAt: null, dueDate: null, paymentTermsDays: null } });
      if (n) out.push({ code: 'noDueDate', count: n, href: '/income' });
    } else if (c === 'noClient') {
      const n = await prisma.invoice.count({ where: { workspaceId: w, status: { not: 'VOID' }, voidedAt: null, clientId: null, ...dateWhere('invoiceDate', ctx.range) } });
      if (n) out.push({ code: 'noClient', count: n, href: '/income' });
    } else if (c === 'noBankAccount') {
      if ((await prisma.bankAccount.count({ where: { workspaceId: w } })) === 0) out.push({ code: 'noBankAccount', count: 1, href: '/cash-flow?tab=plan' });
    } else if (c === 'unreconciledBank') {
      const s = await reconciliationSummary(w).catch(() => null);
      if (s && s.waiting > 0) out.push({ code: 'unreconciledBank', count: s.waiting, href: '/reconciliation' });
    }
  }));
  return out.sort((a, b) => a.code.localeCompare(b.code));
}
