import { NextResponse } from 'next/server';
import { z } from 'zod';
import { csvText } from '@/lib/gst/exports';
import { IMPORT_COLUMNS } from '@/lib/inventory/import';
import { prisma } from '@/lib/prisma';
import { inventoryErrorResponse, requireInventory } from '../_guard';

const q = z.object({ type: z.enum(['products', 'movements', 'template']).default('products') });

/** CSV download of products (same columns the importer reads), the stock ledger, or an empty import template. */
export async function GET(req: Request) {
  try {
    const gate = await requireInventory('view');
    if ('response' in gate) return gate.response;
    const { workspaceId } = gate.access;
    const { type } = q.parse(Object.fromEntries(new URL(req.url).searchParams));
    let rows: (string | number | null)[][];
    if (type === 'template') {
      rows = [[...IMPORT_COLUMNS], ['CEM-50', 'Cement bag 50kg', 'Hardware', 'bag', 300, 380, 40, 20, 50, 7, '2523', 28, '', 'Shelf A1', '']];
    } else if (type === 'products') {
      const products = await prisma.product.findMany({ where: { workspaceId, archivedAt: null }, orderBy: { name: 'asc' }, take: 20_000 });
      rows = [[...IMPORT_COLUMNS], ...products.map((p) => [p.sku, p.name, p.category, p.unit, Number(p.costPrice), Number(p.baselinePrice), p.currentStock, p.safetyStock, p.reorderQuantity, p.leadTimeDays, p.hsnCode, p.gstRate, p.barcode, p.location, p.description])];
    } else {
      const moves = await prisma.inventoryMovement.findMany({ where: { workspaceId }, include: { product: { select: { sku: true, name: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50_000 });
      rows = [['Date', 'SKU', 'Product', 'Type', 'Quantity', 'Balance after', 'Unit cost', 'Reason'], ...moves.map((m) => [m.createdAt.toISOString(), m.product.sku, m.product.name, m.type, m.quantity, m.balanceAfter, m.unitCost != null ? Number(m.unitCost) : null, m.reason])];
    }
    return new NextResponse(csvText(rows), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="inventory-${type}.csv"`, 'Cache-Control': 'no-store' } });
  } catch (e) {
    return inventoryErrorResponse(e, 'export');
  }
}
