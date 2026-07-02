import 'server-only';

import { prisma } from '@/lib/prisma';
import { calculateMailBilling } from '@/lib/email-billing/billing-calculator';

export async function getEmailBillingSummaryForAi(workspaceId: string) {
  const [servers, domains, mailboxes, subscriptions, openReviewItems] = await Promise.all([
    prisma.mailBillingServer.count({ where: { workspaceId } }),
    prisma.mailBillingDomain.count({ where: { workspaceId } }),
    prisma.mailBillingMailbox.count({ where: { workspaceId, status: 'ACTIVE' } }),
    prisma.mailBillingSubscription.findMany({
      where: { workspaceId },
      include: { plan: true, domain: true },
      take: 200,
    }),
    prisma.mailBillingReviewItem.count({ where: { workspaceId, status: 'OPEN' } }),
  ]);

  const estimatedMrr = subscriptions
    .filter((subscription) => subscription.billingStatus === 'ACTIVE')
    .reduce((total, subscription) => {
      const calculation = calculateMailBilling({
        plan: subscription.plan ?? {
          billingMode: subscription.billingModeSnapshot,
          currency: subscription.currencySnapshot,
          basePrice: subscription.basePriceSnapshot,
          includedMailboxes: subscription.includedMailboxesSnapshot,
          extraMailboxPrice: subscription.extraMailboxPriceSnapshot,
        },
        subscription,
        syncedMailboxCount: subscription.lastSyncedMailboxCount,
        domain: subscription.domain?.domain,
      });
      return total + calculation.totalRecurringAmount;
    }, 0);

  return JSON.stringify({
    totalServers: servers,
    totalDomains: domains,
    activeMailboxes: mailboxes,
    activeSubscriptions: subscriptions.filter((sub) => sub.billingStatus === 'ACTIVE').length,
    reviewRequiredSubscriptions: subscriptions.filter((sub) => sub.billingStatus === 'REVIEW_REQUIRED').length,
    openReviewItems,
    estimatedMonthlyRecurringRevenue: estimatedMrr,
    currency: subscriptions[0]?.currencySnapshot ?? 'USD',
    note: 'Read-only summary. Mail-in-a-Box operational actions are not available from the AI assistant.',
  });
}

export async function listEmailBillingReviewItemsForAi(workspaceId: string) {
  const items = await prisma.mailBillingReviewItem.findMany({
    where: { workspaceId, status: 'OPEN' },
    orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
    take: 10,
    include: { domain: { select: { domain: true, status: true } }, server: { select: { name: true } } },
  });

  return JSON.stringify({
    items: items.map((item) => ({
      id: item.id,
      type: item.type,
      severity: item.severity,
      title: item.title,
      description: item.description,
      suggestedAction: item.suggestedAction,
      domain: item.domain?.domain ?? null,
      domainStatus: item.domain?.status ?? null,
      server: item.server?.name ?? null,
      createdAt: item.createdAt,
    })),
  });
}

export async function listUnmappedEmailDomainsForAi(workspaceId: string) {
  const domains = await prisma.mailBillingDomain.findMany({
    where: { workspaceId, clientId: null, status: { not: 'IGNORED' } },
    orderBy: [{ status: 'asc' }, { lastSeenAt: 'desc' }],
    take: 10,
    include: { server: { select: { name: true } }, subscriptions: { select: { billingStatus: true }, take: 1 } },
  });

  return JSON.stringify({
    domains: domains.map((domain) => ({
      id: domain.id,
      domain: domain.domain,
      server: domain.server.name,
      status: domain.status,
      mailboxCount: domain.mailboxCount,
      lastSeenAt: domain.lastSeenAt,
      hasSubscription: domain.subscriptions.length > 0,
    })),
  });
}
