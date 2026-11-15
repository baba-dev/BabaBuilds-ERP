import { NextResponse } from 'next/server';
import { poUpdateSchema } from '@/lib/inventory/schemas';
import { InventoryError } from '@/lib/inventory/service';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/security/activity-log';
import { inventoryErrorResponse, readJson, requireInventory } from '../../_guard';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const gate = await requireInventory('view');
    if ('response' in gate) return gate.response;
    const { id } = await ctx.params;
    const po = await prisma.purchaseOrder.findFirst({ where: { id, workspaceId: gate.access.workspaceId }, include: { items: { include: { product: { select: { id: true, name: true, sku: true, unit: true } } } } } });
    if (!po) throw new InventoryError('NOT_FOUND', 'Purchase order not found.');
    return NextResponse.json(po);
  } catch (e) {
    return inventoryErrorResponse(e, 'po.get');
  }
}

/** Sends a draft, cancels an order that has nothing received, or reopens a cancelled one as a draft. */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const gate = await requireInventory('edit');
    if ('response' in gate) return gate.response;
    const { workspaceId, userId, email } = gate.access;
    const { id } = await ctx.params;
    const d = poUpdateSchema.parse(await readJson(req));
    const po = await prisma.purchaseOrder.findFirst({ where: { id, workspaceId }, include: { items: { select: { receivedQuantity: true } } } });
    if (!po) throw new InventoryError('NOT_FOUND', 'Purchase order not found.');
    const received = po.items.some((i) => i.receivedQuantity > 0);
    const data: Record<string, unknown> = {};
    if (d.notes !== undefined && d.notes !== null) data.notes = d.notes;
    if (d.expectedDate) data.expectedDate = d.expectedDate;
    let from = po.status;
    if (d.action === 'send') {
      if (po.status !== 'DRAFT') throw new InventoryError('INVALID_STATE', 'Only a draft can be sent.');
      Object.assign(data, { status: 'SENT', sentAt: new Date() });
    } else if (d.action === 'cancel') {
      if (received || po.status === 'DELIVERED' || po.status === 'CANCELLED') throw new InventoryError('INVALID_STATE', 'Goods have already been received on this order, so it cannot be cancelled.');
      data.status = 'CANCELLED';
    } else if (d.action === 'reopen') {
      if (po.status !== 'CANCELLED') throw new InventoryError('INVALID_STATE', 'Only a cancelled order can be reopened.');
      data.status = 'DRAFT';
    }
    const updated = await prisma.purchaseOrder.update({ where: { id }, data });
    void logActivity({ workspaceId, action: `inventory.po_${d.action ?? 'updated'}`, status: 'SUCCESS', actor: { userId, email }, entity: { type: 'purchase_order', id }, metadata: { poNumber: po.poNumber, from, to: updated.status } });
    from = updated.status;
    return NextResponse.json({ success: true, purchaseOrder: updated });
  } catch (e) {
    return inventoryErrorResponse(e, 'po.patch');
  }
}
