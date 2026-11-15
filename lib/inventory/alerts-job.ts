import 'server-only';

import { prisma } from '@/lib/prisma';
import { dispatchNotification } from '@/lib/notifications/dispatcher';
import { planInventoryAlerts } from './alerts';
import { loadInsights } from './service';

/** Daily job: out-of-stock, low-stock and late-delivery nudges for every workspace that holds stock. */
export async function runInventoryAlerts(now = new Date()) {
  const workspaces = await prisma.product.findMany({ where: { archivedAt: null }, distinct: ['workspaceId'], select: { workspaceId: true }, take: 5000 });
  let sent = 0;
  for (const { workspaceId } of workspaces) {
    try {
      const [{ products, reorder }, overdue] = await Promise.all([
        loadInsights(workspaceId, now),
        prisma.purchaseOrder.findMany({ where: { workspaceId, status: { in: ['SENT', 'PARTIAL'] }, expectedDate: { lt: now } }, select: { poNumber: true, supplier: true, expectedDate: true }, take: 50 }),
      ]);
      const alerts = planInventoryAlerts({
        now,
        outOfStock: products.filter((p) => p.currentStock <= 0).map((p) => p.name),
        lowStock: products.filter((p) => p.currentStock > 0 && p.currentStock <= p.safetyStock).map((p) => p.name),
        urgentReorder: reorder.filter((r) => r.urgency === 'NOW').length,
        overdueOrders: overdue.flatMap((o) => (o.expectedDate ? [{ poNumber: o.poNumber, supplier: o.supplier, expectedDate: o.expectedDate }] : [])),
      });
      for (const a of alerts) {
        await dispatchNotification({ event: 'DEADLINE_ALERT', workspaceId, data: { title: a.title, deadline: 'soon', description: a.body, actionUrl: a.actionUrl } }).catch(() => undefined);
        sent += 1;
      }
    } catch (error) {
      console.error('[inventory-alerts]', workspaceId, error);
    }
  }
  return { workspaces: workspaces.length, sent };
}
