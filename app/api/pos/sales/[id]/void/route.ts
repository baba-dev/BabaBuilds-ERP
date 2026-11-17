import { NextResponse } from 'next/server';
import { z } from 'zod';
import { reverseInvoicePayment } from '@/lib/invoices/payments';
import { voidInvoice } from '@/lib/invoices/void';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/security/activity-log';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { posErrorResponse, readJson, requirePos } from '../../../_guard';

const body = z.object({ reason: z.string().trim().min(3, 'Please give a reason.').max(200) });

/**
 * Takes back a counter sale: the money is refunded (payment reversed), a credit note is issued, stock goes back on the
 * shelf and the sale drops out of takings and tax. Needs the refund permission, which a cashier does not have by default.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requirePos('refund');
    if ('response' in gate) return gate.response;
    const { workspaceId, userId, email } = gate.access;
    const limit = await enforceRouteRateLimit({ request: req, route: '/api/pos/sales/void', scope: workspaceId, max: 30, windowMs: 10 * 60_000 });
    if (!limit.ok) return limit.response;
    const { id } = await ctx.params;
    const { reason } = body.parse(await readJson(req));

    const sale = await prisma.invoice.findFirst({ where: { id, workspaceId, source: 'POS' }, select: { id: true, invoiceNumber: true, status: true, payments: { where: { reversedAt: null }, select: { id: true, amount: true, method: true } } } });
    if (!sale) return NextResponse.json({ code: 'NOT_FOUND', error: 'Sale not found.' }, { status: 404 });
    if (sale.status === 'VOID') return NextResponse.json({ code: 'ALREADY_VOID', error: 'This sale was already refunded.' }, { status: 409 });

    let refunded = 0;
    const methods = new Set<string>();
    for (const p of sale.payments) {
      const r = await reverseInvoicePayment({ workspaceId, userId, invoiceId: sale.id, paymentId: p.id, reason: `Refund: ${reason}` });
      if (!r.ok) return NextResponse.json({ code: r.code, error: r.message }, { status: r.status });
      refunded += Number(p.amount);
      methods.add(p.method);
    }
    const v = await voidInvoice({ workspaceId, userId, invoiceId: sale.id, reason });
    if (!v.ok) return NextResponse.json({ code: v.code, error: v.message }, { status: v.status });

    void logActivity({ workspaceId, action: 'pos.sale_refunded', status: 'SUCCESS', actor: { userId, email }, entity: { type: 'invoice', id: sale.id }, metadata: { number: sale.invoiceNumber, refunded, methods: [...methods], creditNote: v.creditNoteNumber, reason } });
    return NextResponse.json({ success: true, creditNoteNumber: v.creditNoteNumber, refunded: Math.round(refunded * 100) / 100, methods: [...methods] });
  } catch (e) {
    return posErrorResponse(e, 'sale.void');
  }
}
