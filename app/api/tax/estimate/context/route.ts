import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireGstAccess, gstError } from '@/lib/gst/access';
import { fyBounds, fyStartYear, parseFyLabel } from '@/lib/gst/calendar';
import { num, r2 } from '@/lib/gst/money';

/**
 * Figures the income-tax planner starts from, for one financial year: receipts and expenses with GST taken out
 * (GST collected is not income; GST claimed back as credit is not cost) plus investments logged in the year.
 */
export async function GET(request: Request) {
  const auth = await requireGstAccess('tax.view');
  if (!auth.ok) return auth.response;
  const { workspaceId } = auth.access;
  const fyParam = new URL(request.url).searchParams.get('fy');
  const fy = fyParam ? parseFyLabel(fyParam) : fyStartYear(new Date());
  if (fy === null) return gstError(400, 'INVALID_FY', 'Use a financial year like 2026-27.');
  const { start, end } = fyBounds(fy);
  try {
    const [invoices, notes, expenses, investments] = await Promise.all([
      prisma.invoice.findMany({ where: { workspaceId, status: { not: 'VOID' }, invoiceDate: { gte: start, lte: end } }, select: { subtotal: true, grandTotal: true, totalAmount: true, taxAmount: true, exchangeRate: true } }),
      prisma.creditNote.findMany({ where: { workspaceId, issuedAt: { gte: start, lte: end }, invoice: { invoiceDate: { lt: start } } }, select: { amount: true, taxAmount: true, invoice: { select: { exchangeRate: true } } } }),
      prisma.expense.findMany({ where: { workspaceId, date: { gte: start, lte: end } }, select: { amount: true, itcStatus: true, igstAmount: true, cgstAmount: true, sgstAmount: true, cessAmount: true } }),
      prisma.investment.aggregate({ where: { workspaceId, date: { gte: start, lte: end } }, _sum: { amount: true } }),
    ]);
    let receipts = 0;
    for (const i of invoices) {
      const xr = num(i.exchangeRate) || 1;
      const total = num(i.grandTotal) > 0 ? num(i.grandTotal) : num(i.totalAmount);
      const taxable = num(i.subtotal) > 0 ? num(i.subtotal) : Math.max(0, total - num(i.taxAmount));
      receipts += taxable * xr;
    }
    for (const n of notes) receipts -= Math.max(0, num(n.amount) - num(n.taxAmount)) * (num(n.invoice.exchangeRate) || 1);
    let cost = 0;
    for (const e of expenses) {
      const tax = num(e.igstAmount) + num(e.cgstAmount) + num(e.sgstAmount) + num(e.cessAmount);
      // Credit that is claimed back is not a cost; blocked or unclaimed GST stays in the cost.
      cost += e.itcStatus === 'ELIGIBLE' ? Math.max(0, num(e.amount) - tax) : num(e.amount);
    }
    return NextResponse.json({ fy: `${fy}-${String((fy + 1) % 100).padStart(2, '0')}`, receipts: r2(Math.max(0, receipts)), expenses: r2(cost), invoiceCount: invoices.length, investments: r2(num(investments._sum.amount)) });
  } catch (error) {
    console.error('Tax estimate context error:', error);
    return gstError(500, 'CONTEXT_FAILED', 'Failed to load figures for the estimate.');
  }
}
