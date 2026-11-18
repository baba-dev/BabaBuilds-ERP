import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { getTranslations } from 'next-intl/server';
import { Mailbox } from 'lucide-react';
import type { Prisma } from '@prisma/client';
import { DashboardPageShell } from '@/components/layout/DashboardPageShell';
import { Button } from '@/components/ui/button';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { containsInsensitive } from '@/lib/prisma-filters';
import { checkPermissionsSilent } from '@/lib/rbac';
import { overQuota, quotaPercent } from '@/lib/email-billing/quota';
import { loadMailBillingSettings } from '@/lib/email-billing/settings';
import { EmailBillingEmptyState, EmailBillingStatusBadge, EmailBillingTable, TruncatedText } from '@/components/email-billing/ui';
import { MailboxActions } from '@/components/email-billing/mailbox-manager';
import { requireEmailBillingPage } from '../_data';

const PAGE_SIZE = 50;
const FILTERS = ['all', 'overQuota', 'suspended', 'admins', 'noUsage'] as const;
type Filter = (typeof FILTERS)[number];

export default async function MailboxDirectoryPage({ searchParams }: { searchParams?: Promise<{ q?: string; filter?: string; page?: string }> }) {
  const t = await getTranslations('EmailBilling');
  const workspaceId = await requireEmailBillingPage();
  const sp = (await searchParams) ?? {};
  const q = (sp.q ?? '').trim().slice(0, 100);
  const filter: Filter = (FILTERS as readonly string[]).includes(sp.filter ?? '') ? (sp.filter as Filter) : 'all';
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);

  const settings = await loadMailBillingSettings(workspaceId);
  const session = await getServerSession(authOptions);
  const perms = session?.user?.id ? await checkPermissionsSilent(session.user.id, workspaceId, ['email_hosting.operate', 'email_hosting.admin_server', 'workspace.manage_settings'] as const) : null;
  const canOperate = settings.allowMailboxManagement && Boolean(perms && (perms['email_hosting.operate'] || perms['workspace.manage_settings']));
  const canDelete = Boolean(perms && (perms['email_hosting.admin_server'] || perms['workspace.manage_settings']));

  const where: Prisma.MailBillingMailboxWhereInput = {
    workspaceId, status: 'ACTIVE',
    ...(q ? { OR: [{ email: containsInsensitive(q) }, { domain: { client: { name: containsInsensitive(q) } } }] } : {}),
    ...(filter === 'suspended' ? { suspendedAt: { not: null } } : {}),
    ...(filter === 'admins' ? { isAdmin: true } : {}),
    ...(filter === 'noUsage' ? { usedMb: null } : {}),
  };
  const include = { domain: { select: { id: true, domain: true, client: { select: { name: true } } } }, server: { select: { accessMode: true, writesEnabled: true } } } satisfies Prisma.MailBillingMailboxInclude;

  // "Almost full" compares two columns, so it is filtered here (on mailboxes that report usage) and then paged.
  let rows;
  let total: number;
  if (filter === 'overQuota') {
    const candidates = await prisma.mailBillingMailbox.findMany({ where: { ...where, usedMb: { not: null }, quotaMb: { gt: 0 } }, include, take: 5000 });
    const flagged = overQuota(candidates, settings.quotaAlertPercent || 90);
    total = flagged.length;
    rows = flagged.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  } else {
    [total, rows] = await Promise.all([
      prisma.mailBillingMailbox.count({ where }),
      prisma.mailBillingMailbox.findMany({ where, include, orderBy: [{ domain: { domain: 'asc' } }, { email: 'asc' }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    ]);
  }
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (next: Partial<{ q: string; filter: string; page: number }>) => {
    const params = new URLSearchParams();
    const nq = next.q ?? q; const nf = next.filter ?? filter;
    if (nq) params.set('q', nq);
    if (nf !== 'all') params.set('filter', nf);
    if ((next.page ?? 1) > 1) params.set('page', String(next.page));
    const query = params.toString();
    return `/email-billing/mailboxes${query ? `?${query}` : ''}`;
  };

  return (
    <DashboardPageShell title={t('directory.title')} description={t('directory.subtitle')} icon={<Mailbox className="size-5" />}>
      <form action="/email-billing/mailboxes" className="flex flex-wrap items-center gap-2" role="search">
        <input type="search" name="q" defaultValue={q} placeholder={t('directory.searchPlaceholder')} aria-label={t('directory.searchPlaceholder')} className="h-9 w-full max-w-sm rounded-lg border border-input bg-background px-3 text-sm" />
        {filter !== 'all' ? <input type="hidden" name="filter" value={filter} /> : null}
        <Button type="submit" size="sm">{t('directory.search')}</Button>
      </form>
      <div className="flex flex-wrap gap-2" aria-label={t('labels.filters')}>
        {FILTERS.map((f) => <Button key={f} asChild size="sm" variant={filter === f ? 'primary-action' : 'outline'}><Link href={link({ filter: f, page: 1 })}>{t(`directory.filters.${f}`)}</Link></Button>)}
      </div>

      {rows.length === 0 ? (
        <EmailBillingEmptyState title={t('empty.noSearchResultsTitle')} description={t('empty.noSearchResultsDescription')} />
      ) : (
        <EmailBillingTable headers={[t('tables.email'), t('tables.domain'), t('tables.client'), t('tables.quota'), t('directory.used'), t('tables.status'), ...(canOperate ? [t('tables.actions')] : [])]} caption={t('directory.title')}>
          {rows.map((m) => {
            const percent = quotaPercent(m.usedMb, m.quotaMb);
            const writesOn = m.server.accessMode === 'MANAGED_API' && m.server.writesEnabled;
            return (
              <tr key={m.id} className="border-b hover:bg-muted/50">
                <td className="p-2"><TruncatedText>{m.email}</TruncatedText></td>
                <td className="p-2"><Link href={`/email-billing/domains/${m.domain.id}`} className="underline-offset-2 hover:underline"><TruncatedText>{m.domain.domain}</TruncatedText></Link></td>
                <td className="p-2"><TruncatedText>{m.domain.client?.name ?? t('labels.unmapped')}</TruncatedText></td>
                <td className="p-2 whitespace-nowrap">{m.quotaMb === null ? t('labels.notAvailable') : m.quotaMb === 0 ? t('directory.unlimited') : `${m.quotaMb} MB`}</td>
                <td className="p-2 whitespace-nowrap">
                  {m.usedMb === null ? <span className="text-muted-foreground">{t('directory.notReported')}</span> : (
                    <span className={percent !== null && percent >= (settings.quotaAlertPercent || 90) ? 'font-medium text-destructive' : undefined}>{m.usedMb} MB{percent === null ? '' : ` (${percent}%)`}</span>
                  )}
                </td>
                <td className="p-2"><EmailBillingStatusBadge value={m.isAdmin ? 'INFO' : m.suspendedAt ? 'PAUSED' : 'ACTIVE'} label={m.isAdmin ? t('tables.admin') : m.suspendedAt ? t('ops.suspended') : undefined} /></td>
                {canOperate ? <td className="p-2"><MailboxActions mailbox={{ id: m.id, email: m.email, isAdmin: m.isAdmin, suspendedAt: m.suspendedAt?.toISOString() ?? null, deleteScheduledFor: m.deleteScheduledFor?.toISOString() ?? null }} enabled={writesOn} canDelete={canDelete} /></td> : null}
              </tr>
            );
          })}
        </EmailBillingTable>
      )}

      <nav className="flex items-center justify-between text-sm" aria-label={t('directory.pagination')}>
        <span className="text-muted-foreground">{t('directory.count', { total, page, pages })}</span>
        <div className="flex gap-2">
          {page > 1 ? <Button asChild size="sm" variant="outline"><Link href={link({ page: page - 1 })}>{t('directory.previous')}</Link></Button> : null}
          {page < pages ? <Button asChild size="sm" variant="outline"><Link href={link({ page: page + 1 })}>{t('directory.next')}</Link></Button> : null}
        </div>
      </nav>
    </DashboardPageShell>
  );
}
