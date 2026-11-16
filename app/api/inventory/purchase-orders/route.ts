import { NextResponse } from 'next/server';
import { z } from 'zod';
import { poCreateSchema } from '@/lib/inventory/schemas';
import { createPurchaseOrder } from '@/lib/inventory/service';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/security/activity-log';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { inventoryErrorResponse, readJson, requireInventory } from '../_guard';

const listQuery = z.object({ status: z.enum(['DRAFT', 'SENT', 'PARTIAL', 'DELIVERED', 'CANCELLED']).optional(), limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().max(40).optional() });

export async function GET(req: Request) {
  try {
    const gate = await requireInventory('view');
    if ('response' in gate) return gate.response;
    const q = listQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
    const rows = await prisma.purchaseOrder.findMany({
      where: { workspaceId: gate.access.workspaceId, ...(q.status ? { status: q.status } : {}) },
      include: { items: { include: { product: { select: { id: true, name: true, sku: true, unit: true } } } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > q.limit;
    const items = hasMore ? rows.slice(0, q.limit) : rows;
    return NextResponse.json({ items, nextCursor: hasMore ? items[items.length - 1].id : null });
  } catch (e) {
    return inventoryErrorResponse(e, 'po.list');
  }
}

export async function POST(req: Request) {
  try {
    const gate = await requireInventory('edit');
    if ('response' in gate) return gate.response;
    const { workspaceId, userId, email } = gate.access;
    const limit = enforceRouteRateLimit({ request: req, route: '/api/inventory/purchase-orders', scope: workspaceId, max: 60, windowMs: 60_000 });
    if (!limit.ok) return limit.response;
    const input = poCreateSchema.parse(await readJson(req));
    const po = await createPurchaseOrder({ workspaceId, userId, input });
    void logActivity({ workspaceId, action: 'inventory.po_created', status: 'SUCCESS', actor: { userId, email }, entity: { type: 'purchase_order', id: po.id }, metadata: { poNumber: po.poNumber, lines: po.items.length, total: Number(po.totalAmount), status: po.status } });
    return NextResponse.json({ success: true, purchaseOrder: po }, { status: 201 });
  } catch (e) {
    return inventoryErrorResponse(e, 'po.create');
  }
}
