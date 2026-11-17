import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { containsInsensitive } from '@/lib/prisma-filters';
import { inventoryErrorResponse, requireInventory } from '../_guard';

/** Supplier suggestions for the purchase order form: a few fields only, so it needs inventory access, not expenses access. */
export async function GET(req: Request) {
  try {
    const gate = await requireInventory('view');
    if ('response' in gate) return gate.response;
    const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 60);
    const rows = await prisma.vendor.findMany({
      where: { workspaceId: gate.access.workspaceId, archivedAt: null, ...(q ? { name: containsInsensitive(q) } : {}) },
      select: { id: true, name: true, gstin: true, stateCode: true, paymentTermsDays: true },
      orderBy: { name: 'asc' },
      take: 8,
    });
    return NextResponse.json({ items: rows });
  } catch (e) {
    return inventoryErrorResponse(e, 'vendors');
  }
}
