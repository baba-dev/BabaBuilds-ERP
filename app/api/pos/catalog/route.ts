import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { containsInsensitive } from '@/lib/prisma-filters';
import { supplierChargesGst } from '@/lib/msme/threshold';
import { posErrorResponse, requirePos } from '../_guard';

const query = z.object({
  type: z.enum(['SERVICES', 'PRODUCTS']).default('PRODUCTS'),
  q: z.string().trim().max(80).optional(),
  category: z.string().trim().max(80).optional(),
  barcode: z.string().trim().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(60).default(40),
  cursor: z.string().max(40).optional(),
});

/** Items to sell, searchable and paged so a big catalogue stays quick. Tax rates are the item's real rate; `chargesGst` says whether this seller may collect it. */
export async function GET(request: Request) {
  try {
    const gate = await requirePos('view');
    if ('response' in gate) return gate.response;
    const { workspaceId } = gate.access;
    const q = query.parse(Object.fromEntries(new URL(request.url).searchParams));

    const [workspace, profile] = await Promise.all([
      prisma.workspace.findUnique({ where: { id: workspaceId }, select: { countryCode: true } }),
      prisma.businessProfile.findUnique({ where: { workspaceId }, select: { gstRegistrationType: true } }),
    ]);
    const chargesGst = supplierChargesGst(profile, workspace?.countryCode || 'IN');

    if (q.type === 'SERVICES') {
      const rows = await prisma.serviceTemplate.findMany({
        where: { workspaceId, ...(q.q ? { name: containsInsensitive(q.q) } : {}) },
        select: { id: true, name: true, defaultPrice: true, description: true, sacCode: { select: { igstRate: true } } },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      });
      const more = rows.length > q.limit;
      const page = more ? rows.slice(0, q.limit) : rows;
      return NextResponse.json({
        chargesGst, categories: [], nextCursor: more ? page[page.length - 1]!.id : null,
        items: page.map((s) => ({ id: s.id, type: 'SERVICE', name: s.name, price: Number(s.defaultPrice), description: s.description, taxRate: s.sacCode?.igstRate ?? 0 })),
      });
    }

    const rows = await prisma.product.findMany({
      where: {
        workspaceId, archivedAt: null,
        ...(q.category ? { category: q.category } : {}),
        ...(q.barcode ? { OR: [{ barcode: q.barcode }, { sku: q.barcode.toUpperCase() }] } : q.q ? { OR: [{ name: containsInsensitive(q.q) }, { sku: containsInsensitive(q.q) }, { barcode: containsInsensitive(q.q) }] } : {}),
      },
      select: { id: true, name: true, sku: true, barcode: true, category: true, baselinePrice: true, description: true, currentStock: true, gstRate: true, unit: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const more = rows.length > q.limit;
    const page = more ? rows.slice(0, q.limit) : rows;
    const categories = q.cursor ? [] : (await prisma.product.findMany({ where: { workspaceId, archivedAt: null, category: { not: null } }, select: { category: true }, distinct: ['category'], take: 50 })).map((c) => c.category as string).sort();
    return NextResponse.json({
      chargesGst, categories, nextCursor: more ? page[page.length - 1]!.id : null,
      items: page.map((p) => ({ id: p.id, type: 'PRODUCT', name: p.name, sku: p.sku, barcode: p.barcode, category: p.category, unit: p.unit, price: Number(p.baselinePrice), description: p.description, stock: p.currentStock, taxRate: p.gstRate ?? 0 })),
    });
  } catch (e) {
    return posErrorResponse(e, 'catalog');
  }
}
