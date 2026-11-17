import { NextResponse } from 'next/server';
import { receiveSchema } from '@/lib/inventory/schemas';
import { receivePurchaseOrder } from '@/lib/inventory/service';
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from '@/lib/dashboard-cache';
import { logActivity } from '@/lib/security/activity-log';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { inventoryErrorResponse, readJson, requireInventory } from '../../../_guard';

/** Receives goods in full or in part; stock, cost, status and the purchase bill move together. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireInventory('edit');
    if ('response' in gate) return gate.response;
    const { workspaceId, userId, email } = gate.access;
    const limit = await enforceRouteRateLimit({ request: req, route: '/api/inventory/purchase-orders/receive', scope: workspaceId, max: 60, windowMs: 60_000 });
    if (!limit.ok) return limit.response;
    const { id } = await ctx.params;
    const input = receiveSchema.parse((await readJson(req)) ?? {});
    const out = await receivePurchaseOrder({ workspaceId, userId, poId: id, input });
    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch (error) {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'inventory_receipt', action: 'write', error: String(error) });
    }
    void logActivity({ workspaceId, action: 'inventory.po_received', status: 'SUCCESS', actor: { userId, email }, entity: { type: 'purchase_order', id }, metadata: { ...out } });
    return NextResponse.json({ success: true, ...out });
  } catch (e) {
    return inventoryErrorResponse(e, 'po.receive');
  }
}
