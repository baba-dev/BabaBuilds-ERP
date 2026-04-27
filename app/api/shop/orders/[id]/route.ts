import { Prisma, type Product } from '@prisma/client';
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from '@/lib/prisma';
import { dispatchNotification } from '@/lib/notifications/dispatcher';
import { logActivity } from '@/lib/security/activity-log';

type SessionContext = {
  workspaceId?: string;
  user?: { id?: string | null; email?: string | null };
};

const STOCK_APPLIED_STATUSES = new Set(["PAID", "FULFILLED"]);

const inventoryStatusFor = (stock: number, safetyStock: number) =>
  stock <= 0 ? "OUT_OF_STOCK" : stock <= safetyStock ? "LOW_STOCK" : "IN_STOCK";

const applyInventoryForShopOrder = async ({
  tx,
  workspaceId,
  orderId,
}: {
  tx: Prisma.TransactionClient;
  workspaceId: string;
  orderId: string;
}) => {
  const existingMovementCount = await tx.inventoryMovement.count({
    where: { workspaceId, referenceId: orderId, reason: "Shop order stock commit" },
  });
  if (existingMovementCount > 0) return;

  const orderItems = await tx.shopOrderItem.findMany({
    where: { shopOrderId: orderId },
    select: { productId: true, quantity: true, productName: true },
  });
  if (orderItems.length === 0) return;

  const uniqueProductIds = [...new Set(orderItems.map((item) => item.productId))];
  const products = await tx.product.findMany({
    where: { workspaceId, id: { in: uniqueProductIds } },
    select: { id: true, currentStock: true, safetyStock: true, name: true },
  });
  const productById = new Map<string, Product>(products.map((product) => [product.id, product as Product]));

  for (const item of orderItems) {
    const product = productById.get(item.productId);
    if (!product) continue;
    const newStock = Math.max(0, product.currentStock - item.quantity);
    await tx.product.update({
      where: { id: product.id },
      data: {
        currentStock: newStock,
        status: inventoryStatusFor(newStock, product.safetyStock),
      },
    });
    await tx.inventoryMovement.create({
      data: {
        workspaceId,
        productId: item.productId,
        type: "OUT",
        quantity: -item.quantity,
        reason: "Shop order stock commit",
        referenceId: orderId,
      },
    });
    productById.set(product.id, { ...product, currentStock: newStock } as Product);
  }
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

    const allowed = ['PENDING', 'PAID', 'FAILED', 'REFUNDED', 'FULFILLED'];
    if (!allowed.includes(status)) return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });

    const existing = await prisma.shopOrder.findFirst({ where: { id, workspaceId } });
    if (!existing) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

    const updated = await prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.shopOrder.update({ where: { id }, data: { status } });
      const transitionedToStockCommit =
        STOCK_APPLIED_STATUSES.has(status) && !STOCK_APPLIED_STATUSES.has(String(existing.status));
      if (transitionedToStockCommit) {
        await applyInventoryForShopOrder({ tx, workspaceId, orderId: id });
      }
      return updatedOrder;
    });

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
        type: 'shop_order',
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
        type: 'shop_order',
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

    const existing = await prisma.shopOrder.findFirst({ where: { id, workspaceId } });
    if (!existing) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

    await prisma.shopOrder.delete({ where: { id } });

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
        type: 'shop_order',
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
