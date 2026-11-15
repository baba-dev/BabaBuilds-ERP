import { NextResponse } from 'next/server';
import { loadInsights } from '@/lib/inventory/service';
import { checkPermissionSilent } from '@/lib/rbac';
import { inventoryErrorResponse, requireInventory } from '../_guard';

/** Valuation, low/out-of-stock counts, reorder suggestions and dead stock for the overview. */
export async function GET() {
  try {
    const gate = await requireInventory('view');
    if ('response' in gate) return gate.response;
    const { workspaceId, userId } = gate.access;
    const [{ summary, reorder, dead, products }, canEdit] = await Promise.all([loadInsights(workspaceId), checkPermissionSilent(userId, workspaceId, 'inventory.edit')]);
    return NextResponse.json({ perms: { edit: canEdit }, summary: { ...summary, products: products.length }, reorder: reorder.slice(0, 50), dead: { ...dead, items: dead.items.slice(0, 50) } });
  } catch (e) {
    return inventoryErrorResponse(e, 'insights');
  }
}
