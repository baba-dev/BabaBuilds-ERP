import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseProductGst } from '@/lib/gst/source';
import { productFieldsSchema } from '@/lib/inventory/schemas';
import { parseProductForm } from '@/lib/inventory/product-form';
import { applyStockChange, InventoryError } from '@/lib/inventory/service';
import { removeProductImage, storeProductImage } from '@/lib/inventory/product-image';
import { stockStatus } from '@/lib/inventory/stock';
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from '@/lib/dashboard-cache';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/security/activity-log';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { inventoryErrorResponse, requireInventory } from '../_guard';

const listQuery = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK']).optional(),
  category: z.string().max(80).optional(),
  archived: z.enum(['true', 'false']).default('false'),
  sort: z.enum(['stock', 'name', 'value', 'updated']).default('stock'),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.string().max(40).optional(),
});

export async function GET(req: Request) {
  try {
    const gate = await requireInventory('view');
    if ('response' in gate) return gate.response;
    const { workspaceId } = gate.access;
    const q = listQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
    const rows = await prisma.product.findMany({
      where: {
        workspaceId,
        archivedAt: q.archived === 'true' ? { not: null } : null,
        ...(q.status ? { status: q.status } : {}),
        ...(q.category ? { category: q.category } : {}),
        ...(q.q ? { OR: [{ name: { contains: q.q } }, { sku: { contains: q.q } }, { barcode: { contains: q.q } }] } : {}),
      },
      orderBy: q.sort === 'name' ? [{ name: 'asc' }, { id: 'asc' }] : q.sort === 'updated' ? [{ updatedAt: 'desc' }, { id: 'asc' }] : [{ currentStock: 'asc' }, { id: 'asc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > q.limit;
    const items = hasMore ? rows.slice(0, q.limit) : rows;
    const categories = (await prisma.product.findMany({ where: { workspaceId, archivedAt: null, category: { not: null } }, select: { category: true }, distinct: ['category'], take: 200 })).map((c) => c.category as string).sort();
    return NextResponse.json({ items, nextCursor: hasMore ? items[items.length - 1].id : null, categories });
  } catch (e) {
    return inventoryErrorResponse(e, 'products.list');
  }
}

export async function POST(req: Request) {
  let imageUrl: string | null = null;
  let workspaceForCleanup = '';
  try {
    const gate = await requireInventory('edit');
    if ('response' in gate) return gate.response;
    const { workspaceId, userId, email } = gate.access;
    workspaceForCleanup = workspaceId;
    const limit = enforceRouteRateLimit({ request: req, route: '/api/inventory/products', scope: workspaceId, max: 120, windowMs: 60_000 });
    if (!limit.ok) return limit.response;

    const fd = await req.formData();
    const d = productFieldsSchema.parse(parseProductForm(fd));
    const openingStock = Math.max(0, Math.floor(Number(fd.get('currentStock')) || 0));
    const gst = parseProductGst(fd.get('hsnCode'), fd.get('gstRate'));
    if (!gst.ok) return NextResponse.json({ error: gst.message, code: gst.code }, { status: 422 });
    const file = fd.get('image') as File | null;
    if (file && file.size > 0) imageUrl = await storeProductImage(workspaceId, file);

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: { workspaceId, ...d, hsnCode: gst.hsnCode, gstRate: gst.gstRate, currentStock: 0, status: stockStatus(0, d.safetyStock), imageUrl },
      });
      if (openingStock > 0) await applyStockChange(tx, { workspaceId, productId: created.id, delta: openingStock, type: 'IN', reason: 'Opening stock', unitCost: d.costPrice, userId });
      return tx.product.findFirstOrThrow({ where: { id: created.id } });
    });
    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch (error) {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'inventory_product', action: 'write', error: String(error) });
    }
    void logActivity({ workspaceId, action: 'inventory.product_created', status: 'SUCCESS', actor: { userId, email }, entity: { type: 'product', id: product.id }, metadata: { sku: product.sku, openingStock } });
    return NextResponse.json({ success: true, product }, { status: 201 });
  } catch (e) {
    if (imageUrl && workspaceForCleanup) await removeProductImage(workspaceForCleanup, imageUrl);
    if (e && typeof e === 'object' && (e as { code?: string }).code === 'P2002') return inventoryErrorResponse(new InventoryError('DUPLICATE_SKU', 'A product with this SKU already exists.'), 'products.create');
    return inventoryErrorResponse(e, 'products.create');
  }
}
