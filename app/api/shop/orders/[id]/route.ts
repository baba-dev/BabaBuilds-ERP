import { NextResponse } from 'next/server';
import { z } from 'zod';
import { dispatchNotification } from '@/lib/notifications/dispatcher';
import { commitShopOrderPayment } from '@/lib/shop/commit-shop-order-payment';
import { deliverOrder, refundOrder, ShopOrderError, shipOrder } from '@/lib/shop/orders';
import { canDelete } from '@/lib/shop/status';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/security/activity-log';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { readJson, requireShop, shopErrorResponse } from '../../_guard';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const gate = await requireShop('shop.orders.view');
    if ('response' in gate) return gate.response;
    const { id } = await ctx.params;
    const order = await prisma.shopOrder.findFirst({ where: { id, workspaceId: gate.access.workspaceId }, include: { items: true, linkedInvoice: { select: { id: true, invoiceNumber: true, status: true } } } });
    if (!order) return NextResponse.json({ code: 'NOT_FOUND', error: 'Order not found.' }, { status: 404 });
    return NextResponse.json(order);
  } catch (e) {
    return shopErrorResponse(e, 'order.get');
  }
}

const action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('SHIP'), courier: z.string().trim().max(60).optional().nullable(), trackingRef: z.string().trim().max(80).optional().nullable() }),
  z.object({ action: z.literal('DELIVER') }),
  z.object({ action: z.literal('MARK_PAID') }),
  z.object({ action: z.literal('REFUND'), reason: z.string().trim().min(3, 'Please give a reason.').max(200) }),
  z.object({ action: z.literal('NOTE'), note: z.string().trim().max(500) }),
]);

/** Moves an order along its life: ship, deliver, mark paid (bank transfer), refund, or save an internal note. */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const gate = await requireShop('shop.orders.manage');
    if ('response' in gate) return gate.response;
    const { workspaceId, userId, email } = gate.access;
    const limit = await enforceRouteRateLimit({ request: req, route: '/api/shop/orders/action', scope: workspaceId, max: 120, windowMs: 60_000 });
    if (!limit.ok) return limit.response;
    const { id } = await ctx.params;
    const a = action.parse(await readJson(req));
    let result: Record<string, unknown> = {};

    if (a.action === 'SHIP') result = await shipOrder(workspaceId, id, a);
    else if (a.action === 'DELIVER') result = await deliverOrder(workspaceId, id);
    else if (a.action === 'REFUND') result = await refundOrder(workspaceId, userId, id, a.reason);
    else if (a.action === 'NOTE') {
      const r = await prisma.shopOrder.updateMany({ where: { id, workspaceId }, data: { internalNote: a.note || null } });
      if (r.count === 0) throw new ShopOrderError('NOT_FOUND', 'Order not found.', 404);
    } else {
      const c = await commitShopOrderPayment({ shopOrderId: id, workspaceId, source: 'ADMIN' });
      if (!c.ok) return NextResponse.json({ code: c.code, error: c.message }, { status: c.code === 'ORDER_NOT_FOUND' ? 404 : 409 });
      result = { status: 'PAID', invoiceId: c.linkedInvoiceId };
    }

    void logActivity({ action: `shop_order_${a.action.toLowerCase()}`, status: 'SUCCESS', workspaceId, actor: { userId, email }, entity: { type: 'shop_order', id }, metadata: { action: a.action }, request: req });
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    if (e instanceof ShopOrderError) return NextResponse.json({ code: e.code, error: e.message }, { status: e.status });
    return shopErrorResponse(e, 'order.patch');
  }
}

/** Only an order that never took money can be removed; a paid one is refunded instead so the books keep the trail. */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const gate = await requireShop('shop.orders.manage');
    if ('response' in gate) return gate.response;
    const { workspaceId, userId, email } = gate.access;
    const { id } = await ctx.params;
    const existing = await prisma.shopOrder.findFirst({ where: { id, workspaceId } });
    if (!existing) return NextResponse.json({ code: 'NOT_FOUND', error: 'Order not found.' }, { status: 404 });
    if (!canDelete(existing.status)) return NextResponse.json({ code: 'NOT_DELETABLE', error: 'A paid order cannot be deleted. Refund it instead so your records stay complete.' }, { status: 409 });
    await prisma.shopOrder.delete({ where: { id } });
    void dispatchNotification({ event: 'SHOP_ORDER_DELETED', workspaceId, data: { orderId: existing.id, buyerName: existing.buyerName, buyerEmail: existing.buyerEmail, status: existing.status, amount: `${existing.currency} ${existing.amount.toString()}` } }).catch(() => null);
    void logActivity({ action: 'shop_order_delete', status: 'SUCCESS', workspaceId, actor: { userId, email }, entity: { type: 'shop_order', id }, metadata: { status: existing.status, amount: existing.amount.toString() }, request: req });
    return NextResponse.json({ success: true });
  } catch (e) {
    return shopErrorResponse(e, 'order.delete');
  }
}
