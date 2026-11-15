import { NextResponse } from 'next/server';
import { movementQuerySchema } from '@/lib/inventory/schemas';
import { prisma } from '@/lib/prisma';
import { inventoryErrorResponse, requireInventory } from '../_guard';

/** Stock ledger, newest first, with filters and cursor paging. */
export async function GET(req: Request) {
  try {
    const gate = await requireInventory('view');
    if ('response' in gate) return gate.response;
    const { workspaceId } = gate.access;
    const q = movementQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
    const rows = await prisma.inventoryMovement.findMany({
      where: {
        workspaceId,
        ...(q.productId ? { productId: q.productId } : {}),
        ...(q.type ? { type: q.type } : {}),
        ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(`${q.from}T00:00:00.000Z`) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59.999Z`) } : {}) } } : {}),
      },
      include: { product: { select: { name: true, sku: true, unit: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > q.limit;
    const items = hasMore ? rows.slice(0, q.limit) : rows;
    return NextResponse.json({ items, nextCursor: hasMore ? items[items.length - 1].id : null });
  } catch (e) {
    return inventoryErrorResponse(e, 'movements');
  }
}
