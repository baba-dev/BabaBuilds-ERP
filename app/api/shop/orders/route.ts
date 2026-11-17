import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { containsInsensitive } from '@/lib/prisma-filters';
import { REVENUE_STATUSES, SHOP_STATUSES } from '@/lib/shop/status';
import { requireShop, shopErrorResponse } from '../_guard';

const query = z.object({
  status: z.enum(['ALL', 'OPEN', ...SHOP_STATUSES]).default('ALL'),
  q: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(40).optional(),
});

/** Orders, newest first, with search, a status filter (OPEN = needs action) and cursor paging, plus the overview figures. */
export async function GET(request: Request) {
  try {
    const gate = await requireShop('shop.orders.view');
    if ('response' in gate) return gate.response;
    const { workspaceId } = gate.access;
    const q = query.parse(Object.fromEntries(new URL(request.url).searchParams));

    const where = {
      workspaceId,
      ...(q.status === 'OPEN' ? { status: { in: ['PAID', 'REFUND_DUE'] } } : q.status !== 'ALL' ? { status: q.status } : {}),
      ...(q.q ? { OR: [{ buyerName: containsInsensitive(q.q) }, { buyerEmail: containsInsensitive(q.q) }, { id: { startsWith: q.q } }, { trackingRef: containsInsensitive(q.q) }, { items: { some: { productName: containsInsensitive(q.q) } } }] } : {}),
    };
    const [rows, groups, revenue] = await Promise.all([
      prisma.shopOrder.findMany({ where, include: { items: { select: { productName: true, quantity: true, unitPrice: true, lineTotal: true } }, linkedInvoice: { select: { id: true, invoiceNumber: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: q.limit + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}) }),
      prisma.shopOrder.groupBy({ by: ['status'], where: { workspaceId }, _count: { _all: true } }),
      prisma.shopOrder.aggregate({ where: { workspaceId, status: { in: REVENUE_STATUSES } }, _sum: { amount: true, taxTotal: true } }),
    ]);
    const more = rows.length > q.limit;
    const items = more ? rows.slice(0, q.limit) : rows;
    const counts: Record<string, number> = Object.fromEntries(SHOP_STATUSES.map((s) => [s, 0]));
    for (const g of groups) counts[g.status] = g._count._all;
    return NextResponse.json({
      orders: items, nextCursor: more ? items[items.length - 1]!.id : null,
      overview: { counts, total: Object.values(counts).reduce((a, b) => a + b, 0), revenue: Number(revenue._sum.amount ?? 0), tax: Number(revenue._sum.taxTotal ?? 0), needsAction: (counts.PAID ?? 0) + (counts.REFUND_DUE ?? 0) },
    });
  } catch (e) {
    return shopErrorResponse(e, 'orders.list');
  }
}
