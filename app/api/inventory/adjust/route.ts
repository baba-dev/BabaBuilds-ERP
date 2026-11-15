import { NextResponse } from 'next/server';
import { adjustSchema, bulkCountSchema } from '@/lib/inventory/schemas';
import { applyStockChange, applyStockCount } from '@/lib/inventory/service';
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from '@/lib/dashboard-cache';
import { logActivity } from '@/lib/security/activity-log';
import { prisma } from '@/lib/prisma';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { inventoryErrorResponse, readJson, requireInventory } from '../_guard';

/** Adds, removes or counts stock for one product. A plain signed `quantity` is still accepted for older clients. */
export async function POST(req: Request) {
  try {
    const gate = await requireInventory('edit');
    if ('response' in gate) return gate.response;
    const { workspaceId, userId, email } = gate.access;
    const limit = enforceRouteRateLimit({ request: req, route: '/api/inventory/adjust', scope: workspaceId, max: 120, windowMs: 60_000 });
    if (!limit.ok) return limit.response;

    const raw = (await readJson(req)) as Record<string, unknown> | null;
    const legacy = raw && raw.mode === undefined && typeof raw.quantity === 'number' ? { ...raw, mode: raw.quantity < 0 ? 'REMOVE' : 'ADD', quantity: Math.abs(raw.quantity) } : raw;
    const d = adjustSchema.parse(legacy);
    if (d.mode !== 'COUNT' && d.quantity === 0) return NextResponse.json({ code: 'INVALID_INPUT', error: 'Enter a quantity above zero.' }, { status: 422 });

    const result = await prisma.$transaction(async (tx) => {
      if (d.mode === 'COUNT') return applyStockCount(tx, { workspaceId, productId: d.productId, counted: d.quantity, reason: d.reason ?? 'Stock count', userId });
      const delta = d.mode === 'ADD' ? d.quantity : -d.quantity;
      return applyStockChange(tx, { workspaceId, productId: d.productId, delta, type: 'ADJ', reason: d.reason ?? (delta > 0 ? 'Manual stock in' : 'Manual stock out'), userId });
    });
    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch (error) {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'inventory_stock', action: 'write', error: String(error) });
    }
    void logActivity({ workspaceId, action: 'inventory.stock_adjusted', status: 'SUCCESS', actor: { userId, email }, entity: { type: 'product', id: d.productId }, metadata: { mode: d.mode, quantity: d.quantity, balance: result.balance } });
    return NextResponse.json({ success: true, balance: result.balance });
  } catch (e) {
    return inventoryErrorResponse(e, 'adjust');
  }
}

/** Records a physical count for many products at once. */
export async function PUT(req: Request) {
  try {
    const gate = await requireInventory('edit');
    if ('response' in gate) return gate.response;
    const { workspaceId, userId, email } = gate.access;
    const d = bulkCountSchema.parse(await readJson(req));
    const out = await prisma.$transaction(async (tx) => {
      let changed = 0;
      for (const c of d.counts) {
        const r = await applyStockCount(tx, { workspaceId, productId: c.productId, counted: c.counted, reason: d.reason ?? 'Stock count', userId });
        if (r.delta !== 0) changed += 1;
      }
      return { changed, total: d.counts.length };
    }, { timeout: 60_000 });
    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch (error) {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'inventory_stock', action: 'write', error: String(error) });
    }
    void logActivity({ workspaceId, action: 'inventory.stock_counted', status: 'SUCCESS', actor: { userId, email }, entity: { type: 'inventory', id: workspaceId }, metadata: out });
    return NextResponse.json({ success: true, ...out });
  } catch (e) {
    return inventoryErrorResponse(e, 'count');
  }
}
