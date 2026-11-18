import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { getTranslations } from 'next-intl/server';
import { Globe2 } from 'lucide-react';
import type { Prisma } from '@prisma/client';
import { DashboardPageShell } from '@/components/layout/DashboardPageShell';
import { Button } from '@/components/ui/button';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { containsInsensitive } from '@/lib/prisma-filters';
import { checkPermissionsSilent } from '@/lib/rbac';
import { EmailBillingEmptyState, EmailBillingStatusBadge, EmailBillingTable, TruncatedText } from '@/components/email-billing/ui';
import { DomainFilters, DomainRowActions } from '@/components/email-billing/client-actions';
import { BulkSetupDialog } from '@/components/email-billing/billing-setup';
import { AddDomainDialog } from '@/components/email-billing/mailbox-manager';
import { loadMailBillingSettings } from '@/lib/email-billing/settings';
import { requireEmailBillingPage } from '../_data';

const PAGE_SIZE = 50;

function filterWhere(filter: string): Prisma.MailBillingDomainWhereInput {
  switch (filter) {
    case 'unmapped': return { clientId: null };
    case 'missingBilling': return { subscriptions: { none: { retainerId: { not: null } } } };
    case 'reviewRequired': return { OR: [{ clientId: null }, { subscriptions: { none: {} } }, { subscriptions: { some: { billingStatus: 'REVIEW_REQUIRED' } } }] };
    case 'active': return { status: 'ACTIVE' };
    case 'removed': return { status: 'REMOVED' };
    case 'ignored': return { status: 'IGNORED' };
    default: return {};
  }
}

export default async function DomainsPage({ searchParams }: { searchParams?: Promise<{ filter?: string; q?: string; page?: string }> }) {
  const t = await getTranslations('EmailBilling');
  const workspaceId = await requireEmailBillingPage();
  const sp = (await searchParams) ?? {};
  const filter = sp.filter ?? 'all';
  const q = (sp.q ?? '').trim().slice(0, 100);
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);

  const session = await getServerSession(authOptions);
  const perms = session?.user?.id ? await checkPermissionsSilent(session.user.id, workspaceId, ['email_hosting.billing', 'invoices.create', 'clients.manage', 'email_hosting.admin_server', 'workspace.manage_settings'] as const) : null;
  const canBill = Boolean(perms && (perms['email_hosting.billing'] || perms['invoices.create']));
  const { allowMailboxManagement } = await loadMailBillingSettings(workspaceId);
  // Adding a domain is a server-admin action and, like every write, hidden while mailbox management is off.
  const canAddDomain = allowMailboxManagement && Boolean(perms && (perms['email_hosting.admin_server'] || perms['workspace.manage_settings']));
  const writableServers = canAddDomain ? await prisma.mailBillingServer.findMany({ where: { workspaceId, accessMode: 'MANAGED_API', writesEnabled: true, status: { not: 'DISABLED' } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }) : [];

  const where: Prisma.MailBillingDomainWhereInput = {
    workspaceId, ...filterWhere(filter),
    ...(q ? { AND: [{ OR: [{ domain: containsInsensitive(q) }, { client: { name: containsInsensitive(q) } }] }] } : {}),
  };
  const [total, domains, plans, settingsRow] = await Promise.all([
    prisma.mailBillingDomain.count({ where }),
    prisma.mailBillingDomain.findMany({ where, include: { server: true, client: true, subscriptions: { include: { plan: true, retainer: true } } }, orderBy: { domain: 'asc' }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    canBill ? prisma.mailBillingPlan.findMany({ where: { workspaceId, isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true, frequency: true, currency: true } }) : Promise.resolve([]),
    prisma.mailBillingSettings.findUnique({ where: { workspaceId }, select: { defaultPlanId: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (nextPage: number) => {
    const params = new URLSearchParams();
    if (filter !== 'all') params.set('filter', filter);
    if (q) params.set('q', q);
    if (nextPage > 1) params.set('page', String(nextPage));
    const query = params.toString();
    return `/email-billing/domains${query ? `?${query}` : ''}`;
  };

  const headers = ['domain', 'server', 'client', 'mailboxes', 'plan', 'subscriptionStatus', 'retainer', 'nextBillingDate', 'lastSeen', 'billingHealth', 'actions'].map((k) => t(`tables.${k}`));
  return (
    <DashboardPageShell
      title={t('pages.domainsTitle')} description={t('pages.domainsSubtitle')} icon={<Globe2 className="size-5" />}
      primaryAction={<Button asChild variant="primary-action"><Link href="/email-billing/servers">{t('actions.syncNow')}</Link></Button>}
      secondaryActions={canBill || canAddDomain ? (
        <div className="flex flex-wrap gap-2">
          {canBill ? <BulkSetupDialog plans={plans} defaultPlanId={settingsRow?.defaultPlanId ?? null} canCreateClients={Boolean(perms?.['clients.manage'])} /> : null}
          {canAddDomain ? <AddDomainDialog servers={writableServers} /> : null}
        </div>
      ) : undefined}
    >
      <form action="/email-billing/domains" className="flex flex-wrap items-center gap-2" role="search">
        <input type="search" name="q" defaultValue={q} placeholder={t('domainsPage.searchPlaceholder')} aria-label={t('domainsPage.searchPlaceholder')} className="h-9 w-full max-w-sm rounded-lg border border-input bg-background px-3 text-sm" />
        {filter !== 'all' ? <input type="hidden" name="filter" value={filter} /> : null}
        <Button type="submit" size="sm">{t('directory.search')}</Button>
      </form>
      <DomainFilters />
      {domains.length === 0 ? <EmailBillingEmptyState title={t('empty.noSearchResultsTitle')} description={t('empty.noSearchResultsDescription')} action={{ href: '/email-billing/servers', label: t('actions.syncNow') }} /> : (
        <EmailBillingTable headers={headers} caption={t('pages.domainsTitle')}>
          {domains.map((domain) => {
            const subscription = domain.subscriptions[0];
            return (
              <tr key={domain.id} className="border-b hover:bg-muted/50">
                <td className="p-2"><Link href={`/email-billing/domains/${domain.id}`} className="underline-offset-2 hover:underline"><TruncatedText>{domain.domain}</TruncatedText></Link></td>
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
      <nav className="flex items-center justify-between text-sm" aria-label={t('directory.pagination')}>
        <span className="text-muted-foreground">{t('directory.count', { total, page, pages })}</span>
        <div className="flex gap-2">
          {page > 1 ? <Button asChild size="sm" variant="outline"><Link href={link(page - 1)}>{t('directory.previous')}</Link></Button> : null}
          {page < pages ? <Button asChild size="sm" variant="outline"><Link href={link(page + 1)}>{t('directory.next')}</Link></Button> : null}
        </div>
      </nav>
    </DashboardPageShell>
  );
}
