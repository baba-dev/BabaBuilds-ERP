import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { dispatchNotification } from '@/lib/notifications/dispatcher';
import { logActivity } from '@/lib/security/activity-log';

type SessionContext = {
  workspaceId?: string;
  user?: { id?: string | null; email?: string | null };
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    const sessionCtx = session as SessionContext | null;
    if (!sessionCtx || !sessionCtx.workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const workspaceId = sessionCtx.workspaceId;
    const { id } = await context.params;
    const body = await request.json();
    const { status } = body;

    const allowed = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'];
    if (!allowed.includes(status)) return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });

    const existing = await prisma.serviceOrder.findFirst({ where: { id, workspaceId } });
    if (!existing) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

    const updated = await prisma.serviceOrder.update({ where: { id }, data: { status } });

    dispatchNotification({
      event: 'SHOP_ORDER_UPDATED',
      workspaceId,
      data: {
        orderId: updated.id,
        buyerName: updated.buyerName,
        buyerEmail: updated.buyerEmail,
        oldStatus: existing.status,
        newStatus: status,
      },
    }).catch(() => null);

    dispatchNotification({
      event: 'SHOP_ORDER_STATUS_CHANGED',
      workspaceId,
      data: {
        orderId: updated.id,
        buyerName: updated.buyerName,
        buyerEmail: updated.buyerEmail,
        oldStatus: existing.status,
        newStatus: status,
        amount: `${updated.currency} ${updated.amount.toString()}`,
      },
    }).catch(() => null);

    await logActivity({
      action: 'shop_order_update',
      status: 'SUCCESS',
      workspaceId,
      actor: {
        userId: sessionCtx.user?.id ?? null,
        email: sessionCtx.user?.email ?? null,
      },
      entity: {
        type: 'service_order',
        id,
      },
      metadata: {
        oldStatus: existing.status,
        newStatus: status,
      },
      request,
    });

    await logActivity({
      action: 'shop_order_status_change',
      status: 'SUCCESS',
      workspaceId,
      actor: {
        userId: sessionCtx.user?.id ?? null,
        email: sessionCtx.user?.email ?? null,
      },
      entity: {
        type: 'service_order',
        id,
      },
      metadata: {
        oldStatus: existing.status,
        newStatus: status,
      },
      request,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update order.' }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    const sessionCtx = session as SessionContext | null;
    if (!sessionCtx || !sessionCtx.workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const workspaceId = sessionCtx.workspaceId;
    const { id } = await context.params;

    const existing = await prisma.serviceOrder.findFirst({ where: { id, workspaceId } });
    if (!existing) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

    await prisma.serviceOrder.delete({ where: { id } });

    dispatchNotification({
      event: 'SHOP_ORDER_DELETED',
      workspaceId,
      data: {
        orderId: existing.id,
        buyerName: existing.buyerName,
        buyerEmail: existing.buyerEmail,
        status: existing.status,
        amount: `${existing.currency} ${existing.amount.toString()}`,
      },
    }).catch(() => null);

    await logActivity({
      action: 'shop_order_delete',
      status: 'SUCCESS',
      workspaceId,
      actor: {
        userId: sessionCtx.user?.id ?? null,
        email: sessionCtx.user?.email ?? null,
      },
      entity: {
        type: 'service_order',
        id,
      },
      metadata: {
        status: existing.status,
        amount: existing.amount.toString(),
      },
      request,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete order.' }, { status: 500 });
  }
}
