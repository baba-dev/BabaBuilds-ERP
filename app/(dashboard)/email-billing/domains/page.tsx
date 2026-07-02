import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Globe2 } from 'lucide-react';
import { DashboardPageShell } from '@/components/layout/DashboardPageShell';
import { Button } from '@/components/ui/button';
import { prisma } from '@/lib/prisma';
import { EmailBillingEmptyState, EmailBillingStatusBadge, EmailBillingTable, TruncatedText } from '@/components/email-billing/ui';
import { DomainFilters, DomainRowActions } from '@/components/email-billing/client-actions';
import { requireEmailBillingPage } from '../_data';

export default async function DomainsPage({ searchParams }: { searchParams?: Promise<{ filter?: string }> }) {
  const t = await getTranslations('EmailBilling');
  const workspaceId = await requireEmailBillingPage();
  const filter = (await searchParams)?.filter ?? 'all';
  const domains = await prisma.mailBillingDomain.findMany({ where: { workspaceId }, include: { server: true, client: true, subscriptions: { include: { plan: true, retainer: true } } }, orderBy: { domain: 'asc' } });
  const filtered = domains.filter((domain) => {
    const subscription = domain.subscriptions[0];
    if (filter === 'unmapped') return !domain.clientId;
    if (filter === 'missingBilling') return !subscription || !subscription.retainerId;
    if (filter === 'reviewRequired') return subscription?.billingStatus === 'REVIEW_REQUIRED' || !domain.clientId || !subscription;
    if (filter === 'active') return domain.status === 'ACTIVE';
    if (filter === 'removed') return domain.status === 'REMOVED';
    if (filter === 'ignored') return domain.status === 'IGNORED';
    return true;
  });
  const headers = ['domain', 'server', 'client', 'mailboxes', 'plan', 'subscriptionStatus', 'retainer', 'nextBillingDate', 'lastSeen', 'billingHealth', 'actions'].map((k) => t(`tables.${k}`));
  return (
    <DashboardPageShell title={t('pages.domainsTitle')} description={t('pages.domainsSubtitle')} icon={<Globe2 className="size-5" />} primaryAction={<Button asChild variant="primary-action"><Link href="/email-billing/servers">{t('actions.syncNow')}</Link></Button>}>
      <DomainFilters />
      {filtered.length === 0 ? <EmailBillingEmptyState title={t('empty.noSearchResultsTitle')} description={t('empty.noSearchResultsDescription')} action={{ href: '/email-billing/servers', label: t('actions.syncNow') }} /> : (
        <EmailBillingTable headers={headers} caption={t('pages.domainsTitle')}>
          {filtered.map((domain) => {
            const subscription = domain.subscriptions[0];
            return (
              <tr key={domain.id} className="border-b hover:bg-muted/50">
                <td className="p-2"><TruncatedText>{domain.domain}</TruncatedText></td>
                <td className="p-2"><TruncatedText>{domain.server.name}</TruncatedText></td>
                <td className="p-2"><TruncatedText>{domain.client?.name ?? t('labels.unmapped')}</TruncatedText></td>
                <td className="p-2">{domain.mailboxCount}</td>
                <td className="p-2"><TruncatedText>{subscription?.plan?.name ?? t('labels.notAvailable')}</TruncatedText></td>
                <td className="p-2"><EmailBillingStatusBadge value={subscription?.billingStatus ?? 'REVIEW_REQUIRED'} label={subscription?.billingStatus ?? t('labels.missing')} /></td>
                <td className="p-2"><TruncatedText>{subscription?.retainer?.serviceName ?? t('labels.notLinked')}</TruncatedText></td>
                <td className="p-2 whitespace-nowrap">{subscription?.retainer?.nextBillingDate?.toLocaleDateString?.() ?? t('labels.notAvailable')}</td>
                <td className="p-2 whitespace-nowrap">{domain.lastSeenAt.toLocaleDateString()}</td>
                <td className="p-2"><EmailBillingStatusBadge value={!domain.clientId || !subscription ? 'REVIEW_REQUIRED' : subscription.billingStatus} /></td>
                <td className="p-2"><DomainRowActions domainId={domain.id} /></td>
              </tr>
            );
          })}
        </EmailBillingTable>
      )}
    </DashboardPageShell>
  );
}
