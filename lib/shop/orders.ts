import 'server-only';
import { reverseInvoicePayment } from '@/lib/invoices/payments';
import { voidInvoice } from '@/lib/invoices/void';
import { prisma } from '@/lib/prisma';
import { invalidateDashboardCacheForWorkspace } from '@/lib/dashboard-cache';
import { dispatchNotification } from '@/lib/notifications/dispatcher';
import { emailBuyer } from './buyer-email';
import { canMove, type ShopStatus } from './status';

export class ShopOrderError extends Error {
  constructor(readonly code: 'NOT_FOUND' | 'INVALID_MOVE' | 'REFUND_FAILED', message: string, readonly status = 409) { super(message); }
}

async function load(workspaceId: string, id: string) {
  const o = await prisma.shopOrder.findFirst({ where: { id, workspaceId }, include: { items: true } });
  if (!o) throw new ShopOrderError('NOT_FOUND', 'Order not found.', 404);
  return o;
}

async function announce(o: { id: string; workspaceId: string; buyerName: string; buyerEmail: string; currency: string; amount: { toString(): string } }, from: string, to: ShopStatus) {
  try { await invalidateDashboardCacheForWorkspace(o.workspaceId); } catch { /* stale cache is harmless */ }
  void dispatchNotification({ event: 'SHOP_ORDER_STATUS_CHANGED', workspaceId: o.workspaceId, data: { orderId: o.id, buyerName: o.buyerName, buyerEmail: o.buyerEmail, oldStatus: from, newStatus: to, amount: `${o.currency} ${o.amount.toString()}` } }).catch(() => null);
}

/** Marks a paid order as shipped, with the courier and tracking number, and tells the buyer. */
export async function shipOrder(workspaceId: string, id: string, input: { courier?: string | null; trackingRef?: string | null }) {
  const o = await load(workspaceId, id);
  if (!canMove(o.status, 'SHIPPED')) throw new ShopOrderError('INVALID_MOVE', `An order that is ${o.status.toLowerCase().replace('_', ' ')} cannot be marked as shipped.`);
  const u = await prisma.shopOrder.update({ where: { id }, data: { status: 'SHIPPED', shippedAt: new Date(), courier: input.courier || null, trackingRef: input.trackingRef || null } });
  await announce(u, o.status, 'SHIPPED');
  const emailed = await emailBuyer(id, 'SHIPPED');
  return { status: 'SHIPPED' as const, emailed };
}

export async function deliverOrder(workspaceId: string, id: string) {
  const o = await load(workspaceId, id);
  if (!canMove(o.status, 'FULFILLED')) throw new ShopOrderError('INVALID_MOVE', `An order that is ${o.status.toLowerCase().replace('_', ' ')} cannot be marked as delivered.`);
  const u = await prisma.shopOrder.update({ where: { id }, data: { status: 'FULFILLED', fulfilledAt: new Date(), ...(o.shippedAt ? {} : { shippedAt: new Date() }) } });
  await announce(u, o.status, 'FULFILLED');
  return { status: 'FULFILLED' as const };
}

/**
 * Refunds an order in the books: the payment is reversed and the invoice voided with a credit note (stock goes back on the
 * shelf), and the buyer is told. The money itself is returned from the payment gateway's dashboard.
 */
export async function refundOrder(workspaceId: string, userId: string, id: string, reason: string) {
  const o = await load(workspaceId, id);
  if (!canMove(o.status, 'REFUNDED')) throw new ShopOrderError('INVALID_MOVE', `An order that is ${o.status.toLowerCase().replace('_', ' ')} cannot be refunded.`);
  let creditNote: string | null = null;
  if (o.linkedInvoiceId) {
    const inv = await prisma.invoice.findFirst({ where: { id: o.linkedInvoiceId, workspaceId }, select: { id: true, status: true, payments: { where: { reversedAt: null }, select: { id: true } } } });
    if (inv && inv.status !== 'VOID') {
      for (const p of inv.payments) {
        const r = await reverseInvoicePayment({ workspaceId, userId, invoiceId: inv.id, paymentId: p.id, reason: `Shop refund: ${reason}` });
        if (!r.ok) throw new ShopOrderError('REFUND_FAILED', r.message, r.status);
      }
      const v = await voidInvoice({ workspaceId, userId, invoiceId: inv.id, reason });
      if (!v.ok) throw new ShopOrderError('REFUND_FAILED', v.message, v.status);
      creditNote = v.creditNoteNumber;
    }
  }
  const u = await prisma.shopOrder.update({ where: { id }, data: { status: 'REFUNDED', refundedAt: new Date(), internalNote: [o.internalNote, `Refunded: ${reason}`].filter(Boolean).join('\n') } });
  await announce(u, o.status, 'REFUNDED');
  const emailed = await emailBuyer(id, 'REFUNDED');
  return { status: 'REFUNDED' as const, creditNote, emailed, gateway: o.gateway };
}
