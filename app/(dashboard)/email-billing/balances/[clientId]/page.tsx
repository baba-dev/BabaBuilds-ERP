import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { getTranslations } from 'next-intl/server';
import { HandCoins } from 'lucide-react';
import { DashboardPageShell } from '@/components/layout/DashboardPageShell';
import { Button } from '@/components/ui/button';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkPermissionsSilent } from '@/lib/rbac';
import { buildStatement, CollectionError } from '@/lib/email-billing/collections';
import { decimalToNumber } from '@/lib/money';
import { EmailBillingEmptyState, EmailBillingPanel, EmailBillingStatCard, EmailBillingStatusBadge, EmailBillingTable, TruncatedText } from '@/components/email-billing/ui';
import { CollectDialog, CollectionActions, OpeningDatesDialog } from '@/components/email-billing/collections';
import { requireEmailBillingPage } from '../../_data';
import { formatDay } from '@/lib/email-billing/format';

const money = (amount: number, currency: string) => new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);

export default async function ClientStatementPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams?: Promise<{ asOf?: string; currency?: string }> }) {
  const t = await getTranslations('EmailBilling');
  const workspaceId = await requireEmailBillingPage();
  const { clientId } = await params;
  const sp = (await searchParams) ?? {};
  const today = new Date().toISOString().slice(0, 10);
  const parsed = sp.asOf ? new Date(sp.asOf) : new Date();
  const asOf = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const asOfDay = asOf.toISOString().slice(0, 10);

  const statement = await buildStatement(workspaceId, clientId, asOf).catch((error) => { if (error instanceof CollectionError && error.status === 404) notFound(); throw error; });
  const session = await getServerSession(authOptions);
  const perms = session?.user?.id ? await checkPermissionsSilent(session.user.id, workspaceId, ['email_hosting.billing', 'invoices.create', 'invoices.edit', 'invoices.delete'] as const) : null;
  const canBill = Boolean(perms && (perms['email_hosting.billing'] || perms['invoices.create']));
  const canCollect = canBill && Boolean(perms?.['invoices.create']) && asOfDay <= today;
  const canPay = Boolean(perms?.['invoices.edit']);
  const canUndo = Boolean(perms?.['invoices.delete']);

  const collections = await prisma.mailCollection.findMany({
    where: { workspaceId, clientId }, orderBy: { createdAt: 'desc' }, take: 20,
    include: { invoice: { select: { invoiceNumber: true, status: true, grandTotal: true } } },
  });
  const latestId = collections.find((c) => c.status !== 'VOID')?.id;

  const current = statement.currencies.find((c) => c.currency === sp.currency) ?? statement.currencies[0] ?? null;
  const defaultDate = asOfDay;

  return (
    <DashboardPageShell title={statement.clientName} description={t('balances.statementSubtitle', { date: formatDay(asOfDay) })} icon={<HandCoins className="size-5" />}
      primaryAction={canCollect && current ? <CollectDialog clientId={clientId} clientName={statement.clientName} asOf={asOfDay} total={current.total} currency={current.currency} addresses={current.addresses} canRecordPayment={canPay} /> : undefined}
      secondaryActions={canBill ? <OpeningDatesDialog scope={{ clientId }} label={t('balances.openingDates')} defaultDate={defaultDate} /> : undefined}>
      <form action={`/email-billing/balances/${clientId}`} className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm"><span className="block font-medium">{t('balances.asOf')}</span><input type="date" name="asOf" defaultValue={asOfDay} className="h-9 rounded-lg border border-input bg-background px-3 text-sm" /></label>
        {statement.currencies.length > 1 ? <input type="hidden" name="currency" value={current?.currency} /> : null}
        <Button type="submit" size="sm">{t('balances.show')}</Button>
        <Button asChild size="sm" variant="ghost"><Link href="/email-billing/balances">{t('balances.backToList')}</Link></Button>
      </form>
      {asOfDay > today ? <p className="rounded-lg border border-border/70 bg-muted p-3 text-sm">{t('balances.futureNote')}</p> : null}

      {statement.currencies.length > 1 ? (
        <div className="flex flex-wrap gap-2">{statement.currencies.map((c) => <Button key={c.currency} asChild size="sm" variant={c.currency === current?.currency ? 'primary-action' : 'outline'}><Link href={`/email-billing/balances/${clientId}?asOf=${asOfDay}&currency=${c.currency}`}>{c.currency} · {money(c.total, c.currency)}</Link></Button>)}</div>
      ) : null}

      {statement.unrated.length > 0 ? (
        <EmailBillingPanel title={t('balances.unratedTitle')} icon="alert"><p className="text-sm">{t('balances.unratedBody', { domains: statement.unrated.map((u) => u.domain).join(', ') })}</p></EmailBillingPanel>
      ) : null}

      {current ? (
        <>
          <section className="grid gap-3 sm:grid-cols-3" aria-label={t('balances.title')}>
            <EmailBillingStatCard label={t('balances.owed')} value={money(current.total, current.currency)} />
            <EmailBillingStatCard label={t('balances.addresses')} value={current.addresses} />
            <EmailBillingStatCard label={t('balances.domains')} value={current.domains.length} />
          </section>
          {current.domains.map((domain) => (
            <EmailBillingPanel key={domain.domainId} title={`${domain.domain} · ${money(domain.subtotal, current.currency)}`} description={t('balances.domainPeriod', { from: formatDay(domain.firstDay), to: formatDay(domain.lastDay), count: domain.addresses })}>
              <EmailBillingTable headers={[t('tables.email'), t('balances.from'), t('balances.through'), t('balances.months'), t('calendar.amount')]} caption={domain.domain}>
                {domain.lines.map((line) => (
                  <tr key={line.mailboxId} className="border-b hover:bg-muted/50">
                    <td className="p-2"><TruncatedText>{line.email}</TruncatedText></td>
                    <td className="p-2 whitespace-nowrap">{formatDay(line.firstDay)}</td>
                    <td className="p-2 whitespace-nowrap">{formatDay(line.lastDay)}</td>
                    <td className="p-2">{line.months.toFixed(2)}</td>
                    <td className="p-2 whitespace-nowrap">{money(line.amount, current.currency)}</td>
                  </tr>
                ))}
              </EmailBillingTable>
            </EmailBillingPanel>
          ))}
        </>
      ) : (
        <EmailBillingEmptyState title={t('balances.nothingOwedTitle')} description={t('balances.nothingOwedBody')} />
      )}

      {collections.length > 0 ? (
        <EmailBillingPanel title={t('balances.historyTitle')}>
          <EmailBillingTable headers={[t('calendar.date'), t('balances.throughDate'), t('calendar.amount'), t('calendar.invoice'), t('tables.status'), t('tables.actions')]} caption={t('balances.historyTitle')}>
            {collections.map((c) => (
              <tr key={c.id} className="border-b hover:bg-muted/50">
                <td className="p-2 whitespace-nowrap">{formatDay(c.createdAt)}</td>
                <td className="p-2 whitespace-nowrap">{formatDay(c.asOf)}</td>
                <td className="p-2 whitespace-nowrap">{money(decimalToNumber(c.total), c.currency)}</td>
                <td className="p-2 whitespace-nowrap">{c.invoice ? <Link href="/income" className="underline-offset-2 hover:underline">{c.invoice.invoiceNumber}</Link> : '—'}</td>
                <td className="p-2"><EmailBillingStatusBadge value={c.status === 'INVOICING' ? 'WARNING' : c.status === 'VOID' ? 'CANCELLED' : c.invoice?.status === 'PAID' ? 'ACTIVE' : 'OPEN'} label={c.status === 'INVOICING' ? t('balances.unfinished') : c.status === 'VOID' ? t('balances.void') : c.invoice?.status === 'PAID' ? t('balances.paid') : t('balances.unpaid')} /></td>
                <td className="p-2"><CollectionActions collection={{ id: c.id, status: c.status, invoiceStatus: c.invoice?.status ?? null, currency: c.currency }} canPay={canPay} canUndo={canUndo} canFinish={canBill} isLatest={c.id === latestId} /></td>
              </tr>
            ))}
          </EmailBillingTable>
        </EmailBillingPanel>
      ) : null}
    </DashboardPageShell>
  );
}
