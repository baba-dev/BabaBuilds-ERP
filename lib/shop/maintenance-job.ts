import 'server-only';
import { prisma } from '@/lib/prisma';
import { dispatchNotification } from '@/lib/notifications/dispatcher';
import { planShopMaintenance } from './maintenance';

/** Daily job: abandoned checkouts are closed, and the owner is nudged about orders that need them. */
export async function runShopMaintenance(now = new Date()) {
  const workspaces = await prisma.shopOrder.findMany({ where: { status: { in: ['PENDING', 'PAID', 'REFUND_DUE'] } }, distinct: ['workspaceId'], select: { workspaceId: true }, take: 5000 });
  let expired = 0, sent = 0;
  for (const { workspaceId } of workspaces) {
    try {
      const orders = await prisma.shopOrder.findMany({ where: { workspaceId, status: { in: ['PENDING', 'PAID', 'REFUND_DUE'] } }, select: { id: true, status: true, createdAt: true, paidAt: true, shippedAt: true }, take: 2000 });
      const plan = planShopMaintenance(orders, now);
      if (plan.expire.length > 0) {
        const r = await prisma.shopOrder.updateMany({ where: { workspaceId, id: { in: plan.expire }, status: 'PENDING' }, data: { status: 'FAILED', internalNote: 'Checkout was not completed within 24 hours.' } });
        expired += r.count;
      }
      for (const n of plan.nudges) {
        await dispatchNotification({ event: 'DEADLINE_ALERT', workspaceId, data: { title: n.title, deadline: 'soon', description: n.body, actionUrl: n.actionUrl } }).catch(() => undefined);
        sent += 1;
      }
    } catch (error) {
      console.error('[shop-maintenance]', workspaceId, error);
    }
  }
  return { workspaces: workspaces.length, expired, sent };
}
