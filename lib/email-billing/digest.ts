import 'server-only';
import { prisma } from '@/lib/prisma';
import { dispatchNotification } from '@/lib/notifications/dispatcher';
import { hasPermission, isValidBusinessRole, legacyRoleToBusinessRole } from '@/lib/permissions';
import { buildPaymentDigest, getBillingCalendar } from './calendar';
import type { EffectiveMailBillingSettings } from './settings';
import { utcDay } from './usage-math';

/** People who may see what customers owe: everyone whose role carries the Email Hosting billing permission. */
async function digestRecipients(workspaceId: string): Promise<string[]> {
  const members = await prisma.workspaceUser.findMany({ where: { workspaceId, isActive: true }, select: { userId: true, role: true, businessRole: true } });
  return members
    .filter((m) => hasPermission(isValidBusinessRole(m.businessRole) ? m.businessRole : legacyRoleToBusinessRole(m.role), 'email_hosting.billing'))
    .map((m) => m.userId);
}

/**
 * Tells the owner what is due: billing dates and unpaid invoices from the next 7 days, plus anything overdue. Sent at most
 * once per day (Mondays only on the weekly setting), and only when there is something to collect.
 */
export async function sendPaymentDigest(workspaceId: string, settings: Pick<EffectiveMailBillingSettings, 'paymentDigest'>, now: Date): Promise<'SENT' | 'SKIPPED'> {
  if (settings.paymentDigest === 'OFF') return 'SKIPPED';
  if (settings.paymentDigest === 'WEEKLY' && now.getUTCDay() !== 1) return 'SKIPPED';
  const today = utcDay(now);

  const digest = buildPaymentDigest(await getBillingCalendar(workspaceId, now, 7));
  if (!digest) return 'SKIPPED';
  const userIds = await digestRecipients(workspaceId);
  if (userIds.length === 0) return 'SKIPPED';

  // Settings are created lazily, so make sure the row exists, then claim today's send so overlapping runs cannot both notify.
  await prisma.mailBillingSettings.upsert({ where: { workspaceId }, create: { workspaceId }, update: {} });
  const claimed = await prisma.mailBillingSettings.updateMany({
    where: { workspaceId, OR: [{ lastDigestOn: null }, { lastDigestOn: { lt: today } }] },
    data: { lastDigestOn: today },
  });
  if (claimed.count === 0) return 'SKIPPED';
  await dispatchNotification({ event: 'EMAIL_HOSTING_DIGEST', workspaceId, userIds, data: { title: digest.title, body: digest.body, lines: digest.lines } });
  return 'SENT';
}
