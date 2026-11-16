import { NextResponse } from 'next/server';
import { customerBalance } from '@/lib/pos/closeout';
import { prisma } from '@/lib/prisma';
import { posErrorResponse, requirePos } from '../../_guard';

/** What a customer already owes, so the cashier sees it before taking more on credit. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requirePos('view');
    if ('response' in gate) return gate.response;
    const { workspaceId } = gate.access;
    const { id } = await ctx.params;
    const client = await prisma.client.findFirst({ where: { id, workspaceId }, select: { id: true, email: true } });
    if (!client) return NextResponse.json({ code: 'NOT_FOUND', error: 'Customer not found.' }, { status: 404 });
    const rows = await prisma.invoice.findMany({
      where: { workspaceId, clientId: id, status: { in: ['PENDING', 'PARTIALLY_PAID'] } },
      select: { grandTotal: true, totalAmount: true, amountReceived: true, dueDate: true, status: true },
      take: 500,
    });
    const b = customerBalance(rows.map((r) => ({ total: Number(r.grandTotal) > 0 ? Number(r.grandTotal) : Number(r.totalAmount), received: Number(r.amountReceived ?? 0), dueDate: r.dueDate, status: r.status })));
    return NextResponse.json({ ...b, email: client.email });
  } catch (e) {
    return posErrorResponse(e, 'customer');
  }
}
