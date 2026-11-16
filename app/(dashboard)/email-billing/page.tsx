import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { RefreshCw } from 'lucide-react';
import { DashboardPageShell } from '@/components/layout/DashboardPageShell';
import { Button } from '@/components/ui/button';
import { prisma } from '@/lib/prisma';
import { calculateMailBilling } from '@/lib/email-billing/billing-calculator';
import { requireEmailBillingPage } from './_data';
import { EmailBillingActions, EmailBillingEmptyState, EmailBillingPanel, EmailBillingStatCard, EmailBillingStatusBadge } from '@/components/email-billing/ui';

export default async function EmailBillingPage() {
  const t = await getTranslations('EmailBilling');
  const workspaceId = await requireEmailBillingPage();
  const [domains, mailboxes, subs, review, syncRuns, servers] = await Promise.all([
    prisma.mailBillingDomain.findMany({ where: { workspaceId }, include: { client: true, subscriptions: { include: { plan: true } } } }),
    prisma.mailBillingMailbox.count({ where: { workspaceId, status: 'ACTIVE' } }),
    prisma.mailBillingSubscription.findMany({ where: { workspaceId }, include: { plan: true, domain: true } }),
    prisma.mailBillingReviewItem.findMany({ where: { workspaceId, status: 'OPEN' }, include: { domain: true, server: true }, orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }], take: 8 }),
    prisma.mailBillingSyncRun.findMany({ where: { workspaceId }, orderBy: { startedAt: 'desc' }, take: 5 }),
    prisma.mailBillingServer.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 1 }),
  ]);
  const activeSubs = subs.filter((s) => s.billingStatus === 'ACTIVE');
  const mrr = activeSubs.reduce((sum, s) => sum + calculateMailBilling({ plan: s.plan, subscription: s, syncedMailboxCount: s.domain.mailboxCount, domain: s.domain.domain }).totalRecurringAmount, 0);
  const statCards = [
    [t('cards.totalDomains'), domains.length], [t('cards.activeMailboxes'), mailboxes], [t('cards.mappedClients'), domains.filter((d) => d.clientId).length],
    [t('cards.unmappedDomains'), domains.filter((d) => !d.clientId).length], [t('cards.activeSubscriptions'), activeSubs.length], [t('cards.domainsMissingBilling'), domains.filter((d) => !subs.some((s) => s.domainId === d.id)).length],
    [t('cards.monthlyRecurringRevenue'), mrr.toLocaleString()], [t('cards.openReviewItems'), review.length], [t('cards.lastSyncStatus'), syncRuns[0]?.status ?? t('labels.never')],
  ];
  return <DashboardPageShell title={t('pages.dashboardTitle')} description={t('pages.dashboardSubtitle')} icon={<RefreshCw className="size-5" />} primaryAction={<Button asChild variant="primary-action"><Link href="/email-billing/servers">{t('actions.syncNow')}</Link></Button>} secondaryActions={<EmailBillingActions items={[{ href: '/email-billing/servers', label: t('actions.addServer') }, { href: '/email-billing/plans', label: t('actions.managePlans') }, { href: '/email-billing/review', label: t('actions.reviewQueue') }]} />}>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={t('pages.dashboardTitle')}>{statCards.map(([label, value]) => <EmailBillingStatCard key={label} label={String(label)} value={String(value)} />)}</section>
    {servers.length === 0 ? <EmailBillingEmptyState title={t('empty.noServersTitle')} description={t('empty.noServersDescription')} action={{ href: '/email-billing/servers', label: t('actions.addServer') }} /> : null}
    {domains.length === 0 && servers.length > 0 ? <EmailBillingEmptyState title={t('empty.noDomainsTitle')} description={t('empty.noDomainsDescription')} action={{ href: '/email-billing/servers', label: t('actions.syncNow') }} /> : null}
    <section className="grid gap-4 lg:grid-cols-2">
      <EmailBillingPanel title={t('cards.needsAttention')} icon="alert">{review.length === 0 ? <EmailBillingEmptyState title={t('empty.noReviewsTitle')} description={t('empty.noReviewsDescription')} /> : <div className="space-y-3">{review.map((i) => <article key={i.id} className="rounded-lg border border-border/70 bg-muted/20 p-3"><div className="flex flex-wrap items-center gap-2"><EmailBillingStatusBadge value={i.severity} /><h3 className="font-medium">{i.title}</h3></div><p className="mt-1 text-sm text-muted-foreground">{i.domain?.domain ?? i.server?.name ?? t('labels.notAvailable')}</p><p className="mt-2 text-sm">{i.suggestedAction}</p></article>)}</div>}</EmailBillingPanel>
      <EmailBillingPanel title={t('cards.revenueSummary')}><div className="space-y-2 text-sm"><p>{t('cards.monthlyRecurringRevenue')}: <strong>{mrr.toLocaleString()}</strong></p><p>{t('cards.activeShort')}: {activeSubs.length} · {t('cards.pausedShort')}: {subs.filter((s) => s.billingStatus === 'PAUSED').length} · {t('cards.reviewShort')}: {subs.filter((s) => s.billingStatus === 'REVIEW_REQUIRED').length}</p><h3 className="pt-3 font-medium">{t('cards.recentSyncActivity')}</h3>{syncRuns.length === 0 ? <p className="text-muted-foreground">{t('empty.noSyncDescription')}</p> : syncRuns.map((r) => <p key={r.id} className="flex flex-wrap items-center gap-2"><EmailBillingStatusBadge value={r.status} /> domains {r.domainsSeen} · mailboxes {r.mailboxesSeen} · reviews {r.reviewItemsCreated}</p>)}</div></EmailBillingPanel>
    </section>
  </DashboardPageShell>;
}
