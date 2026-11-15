import { NextResponse } from 'next/server';
import { loadInsights } from '@/lib/inventory/service';
import { inventoryErrorResponse, requireInventory } from '../_guard';

/** Valuation, low/out-of-stock counts, reorder suggestions and dead stock for the overview. */
export async function GET() {
  try {
    const gate = await requireInventory('view');
    if ('response' in gate) return gate.response;
    const { summary, reorder, dead } = await loadInsights(gate.access.workspaceId);
    return NextResponse.json({ summary, reorder: reorder.slice(0, 50), dead: { ...dead, items: dead.items.slice(0, 50) } });
  } catch (e) {
    return inventoryErrorResponse(e, 'insights');
  }
}
