import 'server-only';
import { prisma } from '@/lib/prisma';
import { loadMailBillingSettings } from './settings';
import { countBillableMailboxes, utcDay } from './usage-math';

export type UsageReading = { subscriptionId: string; billableMailboxCount: number; mailboxCount: number };

/**
 * Records today's usage for every live subscription whose domain is still hosted. Re-running on the same UTC day
 * refreshes that day's row instead of adding another, so the daily job and manual runs are safe to repeat.
 */
export async function captureUsageSnapshots(args: { workspaceId: string; now: Date; source?: 'CRON' | 'SYNC' | 'MANUAL' }): Promise<UsageReading[]> {
  const { workspaceId, now } = args;
  const settings = await loadMailBillingSettings(workspaceId);
  const subscriptions = await prisma.mailBillingSubscription.findMany({
    where: { workspaceId, billingStatus: { not: 'CANCELLED' }, domain: { status: 'ACTIVE' } },
    select: { id: true, domainId: true, domain: { select: { aliasCount: true } } },
  });
  if (subscriptions.length === 0) return [];

  const mailboxes = await prisma.mailBillingMailbox.findMany({
    where: { workspaceId, status: 'ACTIVE', domainId: { in: subscriptions.map((s) => s.domainId) } },
    select: { domainId: true, isAdmin: true, status: true, quotaMb: true },
  });
  const byDomain = new Map<string, typeof mailboxes>();
  for (const m of mailboxes) byDomain.set(m.domainId, [...(byDomain.get(m.domainId) ?? []), m]);

  const capturedOn = utcDay(now);
  const readings: UsageReading[] = [];
  for (const sub of subscriptions) {
    const boxes = byDomain.get(sub.domainId) ?? [];
    const data = {
      mailboxCount: boxes.length,
      adminMailboxCount: boxes.filter((m) => m.isAdmin).length,
      aliasCount: sub.domain.aliasCount,
      totalQuotaMb: boxes.reduce((sum, m) => sum + (m.quotaMb ?? 0), 0),
      billableMailboxCount: countBillableMailboxes(boxes, { ignoreAdmins: settings.ignoreAdminMailboxesFromBilling }),
      source: args.source ?? 'CRON',
    };
    await prisma.mailUsageSnapshot.upsert({
      where: { subscriptionId_capturedOn: { subscriptionId: sub.id, capturedOn } },
      create: { workspaceId, subscriptionId: sub.id, capturedOn, ...data },
      update: data,
    });
    readings.push({ subscriptionId: sub.id, billableMailboxCount: data.billableMailboxCount, mailboxCount: data.mailboxCount });
  }
  return readings;
}
