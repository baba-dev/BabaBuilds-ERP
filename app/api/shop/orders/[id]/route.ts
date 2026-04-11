import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { logActivity } from '@/lib/activity-log';
import { invalidateDashboardCacheForWorkspace } from '@/lib/dashboard-cache';
import { SHOP_ORDER_STATUSES } from '@/lib/reporting/definitions';

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

    if (!SHOP_ORDER_STATUSES.includes(status)) return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });

    const existing = await prisma.serviceOrder.findFirst({ where: { id, workspaceId } });
    if (!existing) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

    await prisma.serviceOrder.update({ where: { id }, data: { status } });

    logActivity({
      action: 'shop.order.update_status',
      outcome: 'success',
      entityType: 'serviceOrder',
      entityId: id,
      workspaceId,
      actorId: sessionCtx.user?.id ?? null,
      actorEmail: sessionCtx.user?.email ?? null,
      metadata: { oldStatus: existing.status, newStatus: status },
    });

    if (existing.status !== status) {
      invalidateDashboardCacheForWorkspace(workspaceId);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update order.' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    const sessionCtx = session as SessionContext | null;
    if (!sessionCtx || !sessionCtx.workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const workspaceId = sessionCtx.workspaceId;
    const { id } = await context.params;

    const existing = await prisma.serviceOrder.findFirst({ where: { id, workspaceId } });
    if (!existing) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

    await prisma.serviceOrder.delete({ where: { id } });

    logActivity({
      action: 'shop.order.delete',
      outcome: 'success',
      entityType: 'serviceOrder',
      entityId: id,
      workspaceId,
      actorId: sessionCtx.user?.id ?? null,
      actorEmail: sessionCtx.user?.email ?? null,
      metadata: { status: existing.status, amount: existing.amount.toString() },
    });

    invalidateDashboardCacheForWorkspace(workspaceId);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete order.' }, { status: 500 });
  }
}
