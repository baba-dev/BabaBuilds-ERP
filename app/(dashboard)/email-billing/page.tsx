import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { DashboardPageShell } from '@/components/layout/DashboardPageShell';
import { Button } from '@/components/ui/button';
import { prisma } from '@/lib/prisma';
import { computeEmailHostingMetrics } from '@/lib/email-billing/metrics';
import { loadMailBillingSettings } from '@/lib/email-billing/settings';
import { listBalances } from '@/lib/email-billing/collections';
import { formatDay, formatMoney } from '@/lib/email-billing/format';
import { requireEmailBillingPage } from './_data';
import { EmailBillingActions, EmailBillingEmptyState, EmailBillingPanel, EmailBillingStatCard, EmailBillingStatusBadge } from '@/components/email-billing/ui';

export default async function EmailBillingPage() {
  const t = await getTranslations('EmailBilling');
  const workspaceId = await requireEmailBillingPage();
  const [domains, mailboxes, subs, review, syncRuns, servers, metrics, settings] = await Promise.all([
    prisma.mailBillingDomain.findMany({ where: { workspaceId }, include: { client: true, subscriptions: { include: { plan: true } } } }),
    prisma.mailBillingMailbox.count({ where: { workspaceId, status: 'ACTIVE' } }),
    prisma.mailBillingSubscription.findMany({ where: { workspaceId }, include: { plan: true, domain: true } }),
    prisma.mailBillingReviewItem.findMany({ where: { workspaceId, status: 'OPEN' }, include: { domain: true, server: true }, orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }], take: 8 }),
    prisma.mailBillingSyncRun.findMany({ where: { workspaceId }, orderBy: { startedAt: 'desc' }, take: 5 }),
    prisma.mailBillingServer.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 1 }),
    computeEmailHostingMetrics(workspaceId),
    loadMailBillingSettings(workspaceId),
  ]);
  const accrual = settings.billingModel === 'ACCRUAL';
  // With accrual billing the number that matters is what is owed right now, not scheduled revenue.
  const balances = accrual ? await listBalances(workspaceId, new Date()) : null;
  const owedNow = balances?.totals.find((tot) => tot.currency === metrics.baseCurrency)?.owed ?? 0;
  if (accrual && balances) {
    const [unfinished, usage] = await Promise.all([
      prisma.mailCollection.count({ where: { workspaceId, status: 'INVOICING' } }),
      prisma.mailBillingMailbox.findMany({ where: { workspaceId, status: 'ACTIVE', usedMb: { not: null }, quotaMb: { gt: 0 } }, select: { usedMb: true, quotaMb: true } }),
    ]);
    const nearFull = usage.filter((m) => (m.usedMb ?? 0) / (m.quotaMb ?? 1) >= 0.9).length;
    const unbilled = domains.filter((d) => d.status !== 'IGNORED' && !subs.some((s) => s.domainId === d.id)).length;
    const unpaidCount = balances.rows.reduce((n, r) => n + r.openInvoices, 0);
    const unpaidAmount = balances.rows.filter((r) => r.currency === metrics.baseCurrency).reduce((n, r) => n + r.openInvoiceAmount, 0);
    const owing = balances.rows.filter((r) => r.owed > 0);
    const lastSync = syncRuns[0];
    const attention: Array<{ key: string; text: string; action: string; href: string; tone: 'bad' | 'warn' }> = [];
    if (servers.length > 0 && !lastSync) attention.push({ key: 'never', text: t('dashboard.neverSynced'), action: t('dashboard.neverSyncedAction'), href: '/email-billing/servers', tone: 'warn' });
    if (lastSync && lastSync.status === 'FAILED') attention.push({ key: 'sync', text: t('dashboard.syncFailed'), action: t('dashboard.syncFailedAction'), href: '/email-billing/servers', tone: 'bad' });
    if (unfinished > 0) attention.push({ key: 'unfinished', text: t('dashboard.interrupted', { count: unfinished }), action: t('dashboard.interruptedAction'), href: '/email-billing/balances', tone: 'bad' });
    if (unbilled > 0) attention.push({ key: 'unbilled', text: t('dashboard.unbilled', { count: unbilled }), action: t('dashboard.unbilledAction'), href: '/email-billing/domains?filter=missingBilling', tone: 'warn' });
    if (nearFull > 0) attention.push({ key: 'full', text: t('dashboard.nearFull', { count: nearFull }), action: t('dashboard.nearFullAction'), href: '/email-billing/mailboxes?filter=almostFull', tone: 'warn' });
    if (unpaidCount > 0) attention.push({ key: 'unpaid', text: `${t('dashboard.unpaidInvoices', { count: unpaidCount })} · ${formatMoney(unpaidAmount, metrics.baseCurrency)}`, action: t('dashboard.unpaidAction'), href: '/email-billing/balances', tone: 'warn' });
    const top = owing.slice(0, 5);
    const actions = [{ href: '/email-billing/mailboxes', label: t('directory.title') }, { href: '/email-billing/domains', label: t('nav.domains') }, ...(settings.allowMailboxManagement ? [{ href: '/email-billing/operations', label: t('ops.title') }] : []), { href: '/email-billing/servers', label: t('nav.servers') }];
    return (
      <DashboardPageShell title={t('pages.dashboardTitle')} description={t('pages.dashboardSubtitle')} icon={<RefreshCw className="size-5" />} primaryAction={<Button asChild variant="primary-action"><Link href="/email-billing/balances">{t('balances.title')}</Link></Button>} secondaryActions={<EmailBillingActions items={actions} />}>
        {servers.length === 0 ? (
          <EmailBillingPanel title={t('dashboard.stepsTitle')}>
            <ol className="list-decimal space-y-1 pl-5 text-sm">{(['step1', 'step2', 'step3', 'step4'] as const).map((k) => <li key={k}>{t(`dashboard.${k}`)}</li>)}</ol>
            <div className="mt-4"><Button asChild size="sm"><Link href="/email-billing/servers">{t('actions.addServer')}</Link></Button></div>
          </EmailBillingPanel>
        ) : null}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('pages.dashboardTitle')}>
          <EmailBillingStatCard label={t('dashboard.readyToCollect')} value={formatMoney(owedNow, metrics.baseCurrency)} helper={t('dashboard.readyHelper', { clients: owing.length, addresses: owing.reduce((n, r) => n + r.addresses, 0) })} />
          <EmailBillingStatCard label={t('dashboard.awaitingPayment')} value={formatMoney(unpaidAmount, metrics.baseCurrency)} helper={t('dashboard.awaitingHelper', { count: unpaidCount })} />
          <EmailBillingStatCard label={t('dashboard.runRate')} value={formatMoney(metrics.mrr, metrics.baseCurrency)} helper={t('dashboard.runRateHelper', { count: mailboxes })} />
          <EmailBillingStatCard label={t('dashboard.hosting')} value={mailboxes} helper={t('dashboard.hostingHelper', { domains: domains.length })} />
        </section>
        <section className="grid gap-4 lg:grid-cols-2">
          <EmailBillingPanel title={t('dashboard.attentionTitle')} icon="alert">
            {attention.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 aria-hidden className="size-4 text-emerald-600" />{t('dashboard.allClear')}</p>
            ) : (
              <ul className="space-y-2">
                {attention.map((a) => (
                  <li key={a.key} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-3 text-sm">
                    <span className="flex items-start gap-2"><AlertTriangle aria-hidden className={`mt-0.5 size-4 shrink-0 ${a.tone === 'bad' ? 'text-destructive' : 'text-amber-600'}`} />{a.text}</span>
                    <Button asChild size="sm" variant="outline"><Link href={a.href}>{a.action}</Link></Button>
                  </li>
                ))}
              </ul>
            )}
            {lastSync ? <p className="mt-4 text-xs text-muted-foreground">{t('dashboard.recentSync')}: {formatDay(lastSync.startedAt)} · {t('dashboard.recentSyncLine', { domains: lastSync.domainsSeen, mailboxes: lastSync.mailboxesSeen })}</p> : null}
          </EmailBillingPanel>
          <EmailBillingPanel title={t('dashboard.topBalances')} description={t('dashboard.topBalancesHelp')}>
            {top.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('dashboard.noBalances')}</p>
            ) : (
              <ul className="divide-y divide-border/70">
                {top.map((r) => (
                  <li key={`${r.clientId}-${r.currency}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <Link href={`/email-billing/balances/${r.clientId}`} className="block truncate font-medium underline-offset-2 hover:underline">{r.clientName}</Link>
                      <span className="text-xs text-muted-foreground">{t('dashboard.owedSince', { count: r.addresses, date: formatDay(r.oldestUnchargedDay) })}</span>
                    </div>
                    <div className="flex items-center gap-3"><strong className="whitespace-nowrap">{formatMoney(r.owed, r.currency)}</strong><Button asChild size="sm"><Link href={`/email-billing/balances/${r.clientId}`}>{t('dashboard.collectNow')}</Link></Button></div>
                  </li>
                ))}
              </ul>
            )}
            {owing.length > top.length ? <div className="mt-3"><Button asChild size="sm" variant="outline"><Link href="/email-billing/balances">{t('dashboard.viewAll')}</Link></Button></div> : null}
          </EmailBillingPanel>
        </section>
      </DashboardPageShell>
    );
  }
  const activeSubs = subs.filter((s) => s.billingStatus === 'ACTIVE');
  const money = (n: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: metrics.baseCurrency, maximumFractionDigits: 2 }).format(n);
  const signed = (n: number | null) => (n === null ? t('labels.notAvailable') : `${n > 0 ? '+' : ''}${n}`);
  const statCards = [
    [t('cards.totalDomains'), domains.length], [t('cards.activeMailboxes'), mailboxes], [t('cards.mappedClients'), domains.filter((d) => d.clientId).length],
    [t('cards.unmappedDomains'), domains.filter((d) => !d.clientId).length], [t('cards.activeSubscriptions'), activeSubs.length], [t('cards.domainsMissingBilling'), domains.filter((d) => !subs.some((s) => s.domainId === d.id)).length],
    [accrual ? t('cards.monthlyRunRate') : t('cards.monthlyRecurringRevenue'), money(metrics.mrr)],
    ...(accrual ? [[t('balances.statToCollect'), money(owedNow)], [t('balances.statClients'), balances?.rows.filter((r) => r.owed > 0).length ?? 0]] : [[t('cards.pipelineRevenue'), money(metrics.pipelineMrr)], [t('cards.trialingSubscriptions'), metrics.subscriptions.trialing]]),
    [t('cards.churn30d'), metrics.churn.ratePercent === null ? t('labels.notAvailable') : `${metrics.churn.ratePercent}%`], [t('cards.mailboxChange30d'), signed(metrics.mailboxes.change)], [t('cards.newSubscriptions30d'), metrics.newSubscriptions],
    [t('cards.openReviewItems'), review.length], [t('cards.lastSyncStatus'), syncRuns[0]?.status ?? t('labels.never')],
  ];
  return <DashboardPageShell title={t('pages.dashboardTitle')} description={t('pages.dashboardSubtitle')} icon={<RefreshCw className="size-5" />} primaryAction={<Button asChild variant="primary-action"><Link href="/email-billing/servers">{t('actions.syncNow')}</Link></Button>} secondaryActions={<EmailBillingActions items={[{ href: '/email-billing/servers', label: t('actions.addServer') }, { href: '/email-billing/plans', label: t('actions.managePlans') }, settings.billingModel === 'ACCRUAL' ? { href: '/email-billing/balances', label: t('balances.title') } : { href: '/email-billing/calendar', label: t('calendar.title') }, { href: '/email-billing/mailboxes', label: t('directory.title') }, { href: '/email-billing/review', label: t('actions.reviewQueue') }, ...(settings.allowMailboxManagement ? [{ href: '/email-billing/operations', label: t('ops.title') }] : [])]} />}>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={t('pages.dashboardTitle')}>{statCards.map(([label, value]) => <EmailBillingStatCard key={label} label={String(label)} value={String(value)} />)}</section>
    {servers.length === 0 ? <EmailBillingEmptyState title={t('empty.noServersTitle')} description={t('empty.noServersDescription')} action={{ href: '/email-billing/servers', label: t('actions.addServer') }} /> : null}
    {domains.length === 0 && servers.length > 0 ? <EmailBillingEmptyState title={t('empty.noDomainsTitle')} description={t('empty.noDomainsDescription')} action={{ href: '/email-billing/servers', label: t('actions.syncNow') }} /> : null}
    <section className="grid gap-4 lg:grid-cols-2">
      <EmailBillingPanel title={t('cards.needsAttention')} icon="alert">{review.length === 0 ? <EmailBillingEmptyState title={t('empty.noReviewsTitle')} description={t('empty.noReviewsDescription')} /> : <div className="space-y-3">{review.map((i) => <article key={i.id} className="rounded-lg border border-border/70 bg-muted/20 p-3"><div className="flex flex-wrap items-center gap-2"><EmailBillingStatusBadge value={i.severity} /><h3 className="font-medium">{i.title}</h3></div><p className="mt-1 text-sm text-muted-foreground">{i.domain?.domain ?? i.server?.name ?? t('labels.notAvailable')}</p><p className="mt-2 text-sm">{i.suggestedAction}</p></article>)}</div>}</EmailBillingPanel>
      <EmailBillingPanel title={t('cards.revenueSummary')}><div className="space-y-2 text-sm"><p>{t('cards.monthlyRecurringRevenue')}: <strong>{money(metrics.mrr)}</strong></p><p>{t('cards.activeShort')}: {activeSubs.length} · {t('cards.pausedShort')}: {subs.filter((s) => s.billingStatus === 'PAUSED').length} · {t('cards.reviewShort')}: {subs.filter((s) => s.billingStatus === 'REVIEW_REQUIRED').length}</p><h3 className="pt-3 font-medium">{t('cards.recentSyncActivity')}</h3>{syncRuns.length === 0 ? <p className="text-muted-foreground">{t('empty.noSyncDescription')}</p> : syncRuns.map((r) => <p key={r.id} className="flex flex-wrap items-center gap-2"><EmailBillingStatusBadge value={r.status} /> domains {r.domainsSeen} · mailboxes {r.mailboxesSeen} · reviews {r.reviewItemsCreated}</p>)}</div></EmailBillingPanel>
    </section>
  </DashboardPageShell>;
}
