import { NextResponse } from 'next/server';
import { z } from 'zod';
import { planImport } from '@/lib/inventory/import';
import { applyStockChange } from '@/lib/inventory/service';
import { stockStatus } from '@/lib/inventory/stock';
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from '@/lib/dashboard-cache';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/security/activity-log';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { inventoryErrorResponse, readJson, requireInventory } from '../_guard';

const body = z.object({ dryRun: z.boolean().default(true), rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))).min(1).max(1000) });

/** Bulk create/update products from spreadsheet rows. `dryRun` (the default) only reports what would happen. */
export async function POST(req: Request) {
  try {
    const gate = await requireInventory('edit');
    if ('response' in gate) return gate.response;
    const { workspaceId, userId, email } = gate.access;
    const limit = enforceRouteRateLimit({ request: req, route: '/api/inventory/import', scope: workspaceId, max: 20, windowMs: 10 * 60_000 });
    if (!limit.ok) return limit.response;
    const d = body.parse(await readJson(req));

    const existing = await prisma.product.findMany({ where: { workspaceId }, select: { id: true, sku: true } });
    const idBySku = new Map(existing.map((p) => [p.sku, p.id]));
    const plan = planImport(d.rows, new Set(idBySku.keys()));
    const summary = { create: plan.create.length, update: plan.update.length, errors: plan.errors };
    if (d.dryRun || (plan.errors.length > 0 && plan.valid.length === 0)) return NextResponse.json({ dryRun: true, ...summary, preview: plan.create.slice(0, 5) });

    await prisma.$transaction(async (tx) => {
      for (const v of plan.valid) {
        const data = { ...v.fields, hsnCode: v.gst.hsnCode, gstRate: v.gst.gstRate };
        const id = idBySku.get(v.fields.sku);
        if (id) {
          await tx.product.update({ where: { id }, data });
        } else {
          const created = await tx.product.create({ data: { workspaceId, ...data, currentStock: 0, status: stockStatus(0, v.fields.safetyStock) } });
          if (v.openingStock > 0) await applyStockChange(tx, { workspaceId, productId: created.id, delta: v.openingStock, type: 'IN', reason: 'Opening stock (import)', unitCost: v.fields.costPrice, userId });
        }
      }
    }, { timeout: 120_000 });
    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch (error) {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'inventory_import', action: 'write', error: String(error) });
    }
    void logActivity({ workspaceId, action: 'inventory.imported', status: 'SUCCESS', actor: { userId, email }, entity: { type: 'inventory', id: workspaceId }, metadata: { created: summary.create, updated: summary.update, skipped: plan.errors.length } });
    return NextResponse.json({ dryRun: false, ...summary });
  } catch (e) {
    return inventoryErrorResponse(e, 'import');
  }
}
