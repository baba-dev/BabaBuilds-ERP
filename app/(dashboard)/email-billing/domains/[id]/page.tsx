import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { getTranslations } from 'next-intl/server';
import { Globe2 } from 'lucide-react';
import { DashboardPageShell } from '@/components/layout/DashboardPageShell';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkPermissionsSilent } from '@/lib/rbac';
import { calculateMailBilling } from '@/lib/email-billing/billing-calculator';
import { quotaPercent } from '@/lib/email-billing/quota';
import { loadMailBillingSettings } from '@/lib/email-billing/settings';
import { EmailBillingEmptyState, EmailBillingPanel, EmailBillingStatusBadge, EmailBillingTable, TruncatedText } from '@/components/email-billing/ui';
import { AddAliasDialog, CreateMailboxDialog, MailboxActions } from '@/components/email-billing/mailbox-manager';
import { SetupBillingDialog } from '@/components/email-billing/billing-setup';
import { requireEmailBillingPage } from '../../_data';

export default async function DomainDetail({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('EmailBilling');
  const workspaceId = await requireEmailBillingPage();
  const { allowMailboxManagement } = await loadMailBillingSettings(workspaceId);
  const session = await getServerSession(authOptions);
  const perms = session?.user?.id
    ? await checkPermissionsSilent(session.user.id, workspaceId, ['email_hosting.operate', 'email_hosting.admin_server', 'email_hosting.billing', 'invoices.create', 'clients.manage', 'workspace.manage_settings'] as const)
    : null;
  // Writes are hidden entirely, not just disabled, while mailbox management is switched off in the module settings.
  const canOperate = allowMailboxManagement && Boolean(perms && (perms['email_hosting.operate'] || perms['workspace.manage_settings']));
  const canDelete = Boolean(perms && (perms['email_hosting.admin_server'] || perms['workspace.manage_settings']));
  const canBill = Boolean(perms && (perms['email_hosting.billing'] || perms['invoices.create']));
  const canCreateClients = Boolean(perms?.['clients.manage']);

  const { id } = await params;
  const [d, plans, settingsRow] = await Promise.all([
    prisma.mailBillingDomain.findFirst({
      where: { id, workspaceId },
      include: {
        server: true, client: { select: { id: true, name: true, email: true } }, mailboxes: { orderBy: { email: 'asc' } },
        subscriptions: { include: { plan: true, retainer: { include: { items: true } }, reviewItems: true } },
        reviewItems: { orderBy: { createdAt: 'desc' } },
      },
    }),
    prisma.mailBillingPlan.findMany({ where: { workspaceId, isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true, frequency: true, currency: true } }),
    prisma.mailBillingSettings.findUnique({ where: { workspaceId }, select: { defaultPlanId: true } }),
  ]);
  if (!d) notFound();

  const s = d.subscriptions[0];
  const writesOn = d.server.accessMode === 'MANAGED_API' && d.server.writesEnabled;
  const calc = s ? calculateMailBilling({ plan: s.plan, subscription: s, syncedMailboxCount: d.mailboxCount, domain: d.domain }) : null;
  const issuedOn = (s?.startedAt ?? d.discoveredAt).toISOString().slice(0, 10);
  const nextInvoice = s?.retainer?.status === 'ACTIVE' ? s.retainer.nextBillingDate.toLocaleDateString() : null;

  return (
    <DashboardPageShell title={d.domain} description={t('pages.domainDetailSubtitle')} icon={<Globe2 className="size-5" />}>
      <EmailBillingPanel title={t('sections.overview')}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <p>{t('tables.server')}: {d.server.name}</p>
          <p>{t('tables.status')}: <EmailBillingStatusBadge value={d.status} /></p>
          <p>{t('tables.client')}: {d.client?.name ?? t('labels.unmapped')}</p>
          <p>{t('tables.mailboxes')}: {d.mailboxCount}</p>
          <p>{t('domainDetail.aliases')}: {d.aliasCount}</p>
          <p>{t('tables.lastSeen')}: {d.lastSeenAt.toLocaleString()}</p>
          <p>{t('domainDetail.issuedOn')}: {new Date(issuedOn).toLocaleDateString()}</p>
          <p>{t('domainDetail.nextInvoice')}: {nextInvoice ?? t('labels.notAvailable')}</p>
        </div>
      </EmailBillingPanel>

      <EmailBillingPanel title={t('sections.mailboxes')}>
        {canOperate ? (
          <div className="mb-3 flex flex-wrap gap-2">
            <CreateMailboxDialog domain={d.domain} enabled={writesOn} />
            <AddAliasDialog domainId={d.id} domain={d.domain} enabled={writesOn} />
          </div>
        ) : null}
        {d.mailboxes.length === 0 ? (
          <EmailBillingEmptyState title={t('empty.noMailboxesTitle')} description={t('empty.noMailboxesDescription')} />
        ) : (
          <EmailBillingTable headers={[t('tables.email'), t('tables.quota'), t('directory.used'), t('tables.admin'), t('tables.status'), t('tables.lastSeen'), ...(canOperate ? [t('tables.actions')] : [])]}>
            {d.mailboxes.map((m) => {
              const percent = quotaPercent(m.usedMb, m.quotaMb);
              return (
                <tr key={m.id} className="border-b hover:bg-muted/50">
                  <td className="p-2"><TruncatedText>{m.email}</TruncatedText></td>
                  <td className="p-2">{m.quotaMb === null ? t('labels.notAvailable') : m.quotaMb === 0 ? t('directory.unlimited') : `${m.quotaMb} MB`}</td>
                  <td className="p-2">{m.usedMb === null ? t('directory.notReported') : `${m.usedMb} MB${percent === null ? '' : ` (${percent}%)`}`}</td>
                  <td className="p-2">{m.isAdmin ? t('tables.admin') : t('labels.notAvailable')}</td>
                  <td className="p-2"><EmailBillingStatusBadge value={m.status} />{m.suspendedAt ? <span className="ml-2 text-xs text-muted-foreground">{t('ops.suspended')}</span> : null}</td>
                  <td className="p-2">{m.lastSeenAt.toLocaleString()}</td>
                  {canOperate ? (
                    <td className="p-2">
                      {m.status === 'ACTIVE' ? <MailboxActions mailbox={{ id: m.id, email: m.email, isAdmin: m.isAdmin, suspendedAt: m.suspendedAt?.toISOString() ?? null, deleteScheduledFor: m.deleteScheduledFor?.toISOString() ?? null }} enabled={writesOn} canDelete={canDelete} /> : null}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </EmailBillingTable>
        )}
        <p className="mt-3 text-sm text-muted-foreground">{t('labels.securityBoundary')}</p>
      </EmailBillingPanel>

      <div id="billing">
        <EmailBillingPanel title={t('sections.billing')}>
          {calc ? (
            <p className="text-sm">{t('tables.billingMode')}: {calc.billingMode} · {t('domainDetail.billable')}: {calc.billableMailboxCount} · {t('domainDetail.synced')}: {d.mailboxCount} · {t('domainDetail.preview')}: {calc.currency} {calc.totalRecurringAmount}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{t('domainDetail.notBilled')}</p>
          )}
          {s?.retainer?.items.map((i) => <p key={i.id} className="text-sm text-muted-foreground">{i.title} × {i.quantity}</p>)}
          {!s?.retainerId && canBill && d.status === 'ACTIVE' ? (
            <div className="mt-3">
              <SetupBillingDialog
                domainId={d.id} domain={d.domain} plans={plans} defaultPlanId={settingsRow?.defaultPlanId ?? null} issuedOn={issuedOn}
                currentClient={d.client} canCreateClients={canCreateClients}
              />
            </div>
          ) : null}
        </EmailBillingPanel>
      </div>

      <EmailBillingPanel title={t('sections.reviewItems')}>
        {d.reviewItems.length === 0 ? (
          <EmailBillingEmptyState title={t('empty.noReviewsTitle')} description={t('empty.noReviewsDescription')} />
        ) : (
          d.reviewItems.map((i) => <p key={i.id} className="mb-2 flex flex-wrap items-center gap-2"><EmailBillingStatusBadge value={i.status} /><EmailBillingStatusBadge value={i.severity} />{i.title}</p>)
        )}
      </EmailBillingPanel>
      <EmailBillingPanel title={t('sections.syncHistoryNotes')}><p className="text-sm text-muted-foreground">{d.billingNotes ?? t('labels.none')}</p></EmailBillingPanel>
    </DashboardPageShell>
  );
}
