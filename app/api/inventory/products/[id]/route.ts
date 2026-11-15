import { NextResponse } from 'next/server';
import { parseProductGst } from '@/lib/gst/source';
import { productFieldsSchema } from '@/lib/inventory/schemas';
import { InventoryError } from '@/lib/inventory/service';
import { removeProductImage, storeProductImage } from '@/lib/inventory/product-image';
import { stockStatus } from '@/lib/inventory/stock';
import { assertFreeTierPublishedShopListingsAllowed } from '@/lib/entitlements';
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from '@/lib/dashboard-cache';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/security/activity-log';
import { inventoryErrorResponse, requireInventory } from '../../_guard';
import { parseProductForm } from '@/lib/inventory/product-form';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const gate = await requireInventory('view');
    if ('response' in gate) return gate.response;
    const { id } = await ctx.params;
    const product = await prisma.product.findFirst({ where: { id, workspaceId: gate.access.workspaceId }, include: { movements: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 30 } } });
    if (!product) throw new InventoryError('NOT_FOUND', 'Product not found.');
    const onOrder = await prisma.purchaseOrderItem.findMany({ where: { productId: id, purchaseOrder: { workspaceId: gate.access.workspaceId, status: { in: ['SENT', 'PARTIAL'] } } }, select: { quantity: true, receivedQuantity: true, purchaseOrder: { select: { id: true, poNumber: true, expectedDate: true } } } });
    return NextResponse.json({ ...product, onOrder: onOrder.map((o) => ({ poId: o.purchaseOrder.id, poNumber: o.purchaseOrder.poNumber, expectedDate: o.purchaseOrder.expectedDate, outstanding: o.quantity - o.receivedQuantity })).filter((o) => o.outstanding > 0) });
  } catch (e) {
    return inventoryErrorResponse(e, 'product.get');
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  let newImage: string | null = null;
  let ws = '';
  try {
    const gate = await requireInventory('edit');
    if ('response' in gate) return gate.response;
    const { workspaceId, userId, email } = gate.access;
    ws = workspaceId;
    const { id } = await ctx.params;
    const existing = await prisma.product.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new InventoryError('NOT_FOUND', 'Product not found.');

    const fd = await req.formData();
    // Fill anything the form did not send from the stored product so partial edits stay valid.
    const parsed = parseProductForm(fd);
    const d = productFieldsSchema.parse({
      sku: parsed.sku ?? existing.sku, name: parsed.name ?? existing.name, description: parsed.description ?? existing.description, category: parsed.category ?? existing.category,
      unit: parsed.unit ?? existing.unit, baselinePrice: parsed.baselinePrice ?? Number(existing.baselinePrice), costPrice: parsed.costPrice ?? Number(existing.costPrice),
      safetyStock: parsed.safetyStock ?? existing.safetyStock, reorderQuantity: fd.has('reorderQuantity') ? parsed.reorderQuantity ?? null : existing.reorderQuantity,
      leadTimeDays: fd.has('leadTimeDays') ? parsed.leadTimeDays ?? null : existing.leadTimeDays, preferredVendorId: fd.has('preferredVendorId') ? parsed.preferredVendorId ?? null : existing.preferredVendorId,
      barcode: parsed.barcode ?? existing.barcode, location: parsed.location ?? existing.location,
    });

    const data: Record<string, unknown> = { ...d, status: stockStatus(existing.currentStock, d.safetyStock) };
    if (fd.has('hsnCode') || fd.has('gstRate')) {
      const gst = parseProductGst(fd.get('hsnCode'), fd.get('gstRate'));
      if (!gst.ok) return NextResponse.json({ error: gst.message, code: gst.code }, { status: 422 });
      data.hsnCode = gst.hsnCode;
      data.gstRate = gst.gstRate;
    }
    const showRaw = fd.get('showInShop');
    if (showRaw !== null) {
      const enable = showRaw === 'true' || showRaw === '1';
      if (enable && !existing.showInShop) {
        const denied = await assertFreeTierPublishedShopListingsAllowed(workspaceId);
        if (denied) return NextResponse.json({ error: denied.message, code: denied.code, requiresUpgrade: true }, { status: 403 });
      }
      data.showInShop = enable;
    }
    const file = fd.get('image') as File | null;
    if (file && file.size > 0) {
      newImage = await storeProductImage(workspaceId, file);
      data.imageUrl = newImage;
    }

    const updated = await prisma.product.update({ where: { id }, data });
    if (newImage) await removeProductImage(workspaceId, existing.imageUrl);
    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch (error) {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'inventory_product', action: 'write', error: String(error) });
    }
    void logActivity({ workspaceId, action: 'inventory.product_updated', status: 'SUCCESS', actor: { userId, email }, entity: { type: 'product', id }, metadata: { sku: updated.sku } });
    return NextResponse.json({ success: true, product: updated });
  } catch (e) {
    if (newImage && ws) await removeProductImage(ws, newImage);
    if (e && typeof e === 'object' && (e as { code?: string }).code === 'P2002') return inventoryErrorResponse(new InventoryError('DUPLICATE_SKU', 'A product with this SKU already exists.'), 'product.put');
    return inventoryErrorResponse(e, 'product.put');
  }
}

/** Deletes an unused product. One that has history (sales, orders, movements) is archived so records stay intact. `?restore=1` brings it back. */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const gate = await requireInventory('edit');
    if ('response' in gate) return gate.response;
    const { workspaceId, userId, email } = gate.access;
    const { id } = await ctx.params;
    const existing = await prisma.product.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new InventoryError('NOT_FOUND', 'Product not found.');

    if (new URL(req.url).searchParams.get('restore')) {
      await prisma.product.update({ where: { id }, data: { archivedAt: null } });
      void logActivity({ workspaceId, action: 'inventory.product_restored', status: 'SUCCESS', actor: { userId, email }, entity: { type: 'product', id } });
      return NextResponse.json({ success: true, restored: true });
    }

    const [poLines, movements] = await Promise.all([prisma.purchaseOrderItem.count({ where: { productId: id } }), prisma.inventoryMovement.count({ where: { productId: id, NOT: { reason: 'Opening stock' } } })]);
    let archived = poLines > 0 || movements > 0 || existing.currentStock > 0;
    if (!archived) {
      try {
        await prisma.$transaction([prisma.inventoryMovement.deleteMany({ where: { productId: id } }), prisma.product.delete({ where: { id } })]);
        await removeProductImage(workspaceId, existing.imageUrl);
      } catch {
        archived = true; // referenced by an invoice or order line
      }
    }
    if (archived) await prisma.product.update({ where: { id }, data: { archivedAt: new Date(), showInShop: false } });
    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch (error) {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'inventory_product', action: 'write', error: String(error) });
    }
    void logActivity({ workspaceId, action: archived ? 'inventory.product_archived' : 'inventory.product_deleted', status: 'SUCCESS', actor: { userId, email }, entity: { type: 'product', id }, metadata: { sku: existing.sku } });
    return NextResponse.json({ success: true, archived });
  } catch (e) {
    return inventoryErrorResponse(e, 'product.delete');
  }
}
