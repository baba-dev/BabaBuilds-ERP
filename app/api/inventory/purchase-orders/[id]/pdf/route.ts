import { NextResponse } from 'next/server';
import { InventoryError } from '@/lib/inventory/service';
import { buildPoPdf } from '@/lib/inventory/po-pdf';
import { prisma } from '@/lib/prisma';
import { inventoryErrorResponse, requireInventory } from '../../../_guard';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireInventory('view');
    if ('response' in gate) return gate.response;
    const { workspaceId } = gate.access;
    const { id } = await ctx.params;
    const [po, profile] = await Promise.all([
      prisma.purchaseOrder.findFirst({ where: { id, workspaceId }, include: { items: { include: { product: { select: { name: true, sku: true, unit: true } } } } } }),
      prisma.businessProfile.findUnique({ where: { workspaceId }, select: { companyName: true, address: true, gstin: true } }),
    ]);
    if (!po) throw new InventoryError('NOT_FOUND', 'Purchase order not found.');
    const bytes = await buildPoPdf({
      company: { name: profile?.companyName ?? 'Purchase order', address: profile?.address, gstin: profile?.gstin },
      po: { poNumber: po.poNumber, status: po.status, supplier: po.supplier, supplierGstin: po.supplierGstin, createdAt: po.createdAt, expectedDate: po.expectedDate, paymentTermsDays: po.paymentTermsDays, notes: po.notes },
      lines: po.items.map((i) => ({ name: i.product.name, sku: i.product.sku, unit: i.product.unit, quantity: i.quantity, received: i.receivedQuantity, unitPrice: Number(i.unitPrice), gstRate: i.gstRate })),
    });
    return new NextResponse(Buffer.from(bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${po.poNumber}.pdf"`, 'Cache-Control': 'no-store' } });
  } catch (e) {
    return inventoryErrorResponse(e, 'po.pdf');
  }
}
