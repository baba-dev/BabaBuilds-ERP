import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEmailBilling } from '../_lib/auth';
import { calculateMailBilling } from '@/lib/email-billing/billing-calculator';
import { computeEmailHostingMetrics } from '@/lib/email-billing/metrics';

export async function GET() {
  const auth = await requireEmailBilling('view');
  if ('response' in auth) return auth.response;
  const workspaceId = auth.workspaceId;
  const [servers, domains, mailboxes, subscriptions, openReview, syncRuns, metrics] = await Promise.all([
    prisma.mailBillingServer.findMany({ where: { workspaceId } }),
    prisma.mailBillingDomain.findMany({ where: { workspaceId } }),
    prisma.mailBillingMailbox.count({ where: { workspaceId, status: 'ACTIVE' } }),
    prisma.mailBillingSubscription.findMany({ where: { workspaceId }, include: { plan: true, domain: true } }),
    prisma.mailBillingReviewItem.count({ where: { workspaceId, status: 'OPEN' } }),
    prisma.mailBillingSyncRun.findMany({ where: { workspaceId }, orderBy: { startedAt: 'desc' }, take: 5 }),
    computeEmailHostingMetrics(workspaceId),
  ]);

  const activeSubscriptions = subscriptions.filter((s) => s.billingStatus === 'ACTIVE');
  const estimatedEmailMrr = activeSubscriptions.reduce(
    (sum, s) => sum + calculateMailBilling({ plan: s.plan, subscription: s, syncedMailboxCount: s.domain.mailboxCount, domain: s.domain.domain }).totalRecurringAmount,
    0,
  );
  const mappedDomains = domains.filter((d) => d.clientId).length;
  const lastServer = servers
    .filter((s) => s.lastSyncAt)
    .sort((a, b) => Number(b.lastSyncAt) - Number(a.lastSyncAt))[0];

  return NextResponse.json({
    totalServers: servers.length,
    activeServers: servers.filter((s) => s.status === 'ACTIVE').length,
    totalDomains: domains.length,
    activeDomains: domains.filter((d) => d.status === 'ACTIVE').length,
    totalMailboxes: mailboxes,
    mappedDomains,
    unmappedDomains: domains.length - mappedDomains,
    activeSubscriptions: activeSubscriptions.length,
    linkedRetainers: subscriptions.filter((s) => s.retainerId).length,
    domainsMissingBilling: domains.filter((d) => !subscriptions.some((s) => s.domainId === d.id)).length,
    estimatedEmailMrr,
    metrics,
    openReviewItems: openReview,
    lastSyncAt: lastServer?.lastSyncAt?.toISOString() ?? null,
    lastSyncStatus: lastServer?.lastSyncStatus ?? null,
    recentSyncRuns: syncRuns,
  });
}
