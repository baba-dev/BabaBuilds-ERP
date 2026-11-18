import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { HandCoins } from 'lucide-react';
import { DashboardPageShell } from '@/components/layout/DashboardPageShell';
import { Button } from '@/components/ui/button';
import { listBalances } from '@/lib/email-billing/collections';
import { EmailBillingEmptyState, EmailBillingStatCard, EmailBillingTable, TruncatedText } from '@/components/email-billing/ui';
import { requireEmailBillingPage } from '../_data';

const PAGE_SIZE = 50;
const money = (amount: number, currency: string) => new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);

export default async function BalancesPage({ searchParams }: { searchParams?: Promise<{ asOf?: string; q?: string; page?: string; all?: string }> }) {
  const t = await getTranslations('EmailBilling');
  const workspaceId = await requireEmailBillingPage();
  const sp = (await searchParams) ?? {};
  const today = new Date().toISOString().slice(0, 10);
  const parsed = sp.asOf ? new Date(sp.asOf) : new Date();
  const asOf = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const asOfDay = asOf.toISOString().slice(0, 10);
  const q = (sp.q ?? '').trim().toLowerCase().slice(0, 100);
  const showAll = sp.all === '1';
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);

  const balances = await listBalances(workspaceId, asOf);
  const filtered = balances.rows.filter((r) => (showAll || r.owed > 0 || r.openInvoices > 0) && (!q || r.clientName.toLowerCase().includes(q)));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const owingClients = balances.rows.filter((r) => r.owed > 0).length;
  const unpaid = balances.rows.reduce((n, r) => n + r.openInvoices, 0);
  const link = (nextPage: number) => {
    const params = new URLSearchParams();
    if (asOfDay !== today) params.set('asOf', asOfDay);
    if (q) params.set('q', q);
    if (showAll) params.set('all', '1');
    if (nextPage > 1) params.set('page', String(nextPage));
    const query = params.toString();
    return `/email-billing/balances${query ? `?${query}` : ''}`;
  };

  return (
    <DashboardPageShell title={t('balances.title')} description={t('balances.subtitle')} icon={<HandCoins className="size-5" />}>
      <form action="/email-billing/balances" className="flex flex-wrap items-end gap-3" role="search">
        <label className="space-y-1 text-sm"><span className="block font-medium">{t('balances.asOf')}</span><input type="date" name="asOf" defaultValue={asOfDay} className="h-9 rounded-lg border border-input bg-background px-3 text-sm" /></label>
        <label className="space-y-1 text-sm"><span className="block font-medium">{t('balances.client')}</span><input type="search" name="q" defaultValue={q} placeholder={t('balances.searchPlaceholder')} className="h-9 rounded-lg border border-input bg-background px-3 text-sm" /></label>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="all" value="1" defaultChecked={showAll} />{t('balances.showAll')}</label>
        <Button type="submit" size="sm">{t('balances.show')}</Button>
      </form>
      {asOfDay > today ? <p className="rounded-lg border border-border/70 bg-muted p-3 text-sm">{t('balances.futureNote')}</p> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={t('balances.title')}>
        {balances.totals.length === 0 ? <EmailBillingStatCard label={t('balances.statToCollect')} value="—" /> : balances.totals.map((total) => <EmailBillingStatCard key={total.currency} label={`${t('balances.statToCollect')} (${total.currency})`} value={money(total.owed, total.currency)} />)}
        <EmailBillingStatCard label={t('balances.statClients')} value={owingClients} />
        <EmailBillingStatCard label={t('balances.statUnpaid')} value={unpaid} />
      </section>

      {rows.length === 0 ? (
        <EmailBillingEmptyState title={t('balances.emptyTitle')} description={t('balances.emptyBody')} action={{ href: '/email-billing/domains?filter=missingBilling', label: t('calendar.fixNow') }} />
      ) : (
        <EmailBillingTable headers={[t('balances.client'), t('balances.owed'), t('balances.addresses'), t('balances.domains'), t('balances.since'), t('balances.lastCollected'), t('balances.unpaidInvoices'), '']} caption={t('balances.title')}>
          {rows.map((r) => (
            <tr key={`${r.clientId}-${r.currency}`} className="border-b hover:bg-muted/50">
              <td className="p-2 font-medium"><Link href={`/email-billing/balances/${r.clientId}${asOfDay !== today ? `?asOf=${asOfDay}` : ''}`} className="underline-offset-2 hover:underline"><TruncatedText>{r.clientName}</TruncatedText></Link></td>
              <td className="p-2 whitespace-nowrap font-medium">{money(r.owed, r.currency)}</td>
              <td className="p-2">{r.addresses}</td>
              <td className="p-2">{r.domains}</td>
              <td className="p-2 whitespace-nowrap">{r.owed > 0 ? new Date(r.oldestUnchargedDay).toLocaleDateString() : '—'}</td>
              <td className="p-2 whitespace-nowrap">{r.lastCollectedOn ? new Date(r.lastCollectedOn).toLocaleDateString() : t('labels.never')}</td>
              <td className="p-2 whitespace-nowrap">{r.openInvoices > 0 ? `${r.openInvoices} · ${money(r.openInvoiceAmount, r.currency)}` : '—'}</td>
              <td className="p-2"><Button asChild size="sm" variant="outline"><Link href={`/email-billing/balances/${r.clientId}${asOfDay !== today ? `?asOf=${asOfDay}` : ''}`}>{t('balances.open')}</Link></Button></td>
            </tr>
          ))}
        </EmailBillingTable>
      )}

      <nav className="flex items-center justify-between text-sm" aria-label={t('directory.pagination')}>
        <span className="text-muted-foreground">{t('directory.count', { total: filtered.length, page, pages })}</span>
        <div className="flex gap-2">
          {page > 1 ? <Button asChild size="sm" variant="outline"><Link href={link(page - 1)}>{t('directory.previous')}</Link></Button> : null}
          {page < pages ? <Button asChild size="sm" variant="outline"><Link href={link(page + 1)}>{t('directory.next')}</Link></Button> : null}
        </div>
      </nav>
      <p className="text-sm text-muted-foreground">{t('balances.footnote')}</p>
    </DashboardPageShell>
  );
}
