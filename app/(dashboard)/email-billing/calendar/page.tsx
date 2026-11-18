import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { CalendarClock } from 'lucide-react';
import { DashboardPageShell } from '@/components/layout/DashboardPageShell';
import { Button } from '@/components/ui/button';
import { EmailBillingEmptyState, EmailBillingPanel, EmailBillingStatCard, EmailBillingTable, TruncatedText } from '@/components/email-billing/ui';
import { getBillingCalendar, type CalendarEntry } from '@/lib/email-billing/calendar';
import { requireEmailBillingPage } from '../_data';

const money = (amount: number | null, currency: string) => (amount === null ? '—' : new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount));

export default async function CalendarPage() {
  const t = await getTranslations('EmailBilling');
  const workspaceId = await requireEmailBillingPage();
  const calendar = await getBillingCalendar(workspaceId, new Date(), 60);

  const late = calendar.due.filter((e) => e.daysUntil < 0);
  const thisWeek = calendar.due.filter((e) => e.daysUntil >= 0 && e.daysUntil <= 7);
  const later = calendar.due.filter((e) => e.daysUntil > 7);
  const overdueInvoices = calendar.unpaidInvoices.filter((i) => (i.daysOverdue ?? -1) > 0);
  const { domainsWithoutBilling, subscriptionsWithoutRetainer } = calendar.needsSetup;
  const when = (days: number) => (days < 0 ? t('calendar.daysLate', { count: -days }) : days === 0 ? t('calendar.today') : t('calendar.inDays', { count: days }));

  const renewalTable = (rows: CalendarEntry[], caption: string) => (
    <EmailBillingTable headers={[t('calendar.date'), t('calendar.when'), t('tables.domain'), t('tables.client'), t('calendar.amount'), t('calendar.kind'), t('calendar.invoiceEmail')]} caption={caption}>
      {rows.map((e) => (
        <tr key={e.subscriptionId} className="border-b hover:bg-muted/50">
          <td className="p-2 whitespace-nowrap">{new Date(e.dueOn).toLocaleDateString()}</td>
          <td className="p-2 whitespace-nowrap">{when(e.daysUntil)}</td>
          <td className="p-2"><Link href={`/email-billing/domains/${e.domainId}`} className="underline-offset-2 hover:underline"><TruncatedText>{e.domain}</TruncatedText></Link></td>
          <td className="p-2"><TruncatedText>{e.clientName}</TruncatedText></td>
          <td className="p-2 whitespace-nowrap">{money(e.amount, e.currency)}</td>
          <td className="p-2">{e.kind === 'TRIAL_END' ? t('calendar.trialEnds') : t(`calendar.freq.${e.frequency}`)}{e.lastError ? <span className="ml-2 text-xs text-destructive" title={e.lastError}>{t('calendar.failed')}</span> : null}</td>
          <td className="p-2">{e.emailsInvoice ? t('calendar.emailed') : t('calendar.notEmailed')}</td>
        </tr>
      ))}
    </EmailBillingTable>
  );

  return (
    <DashboardPageShell title={t('calendar.title')} description={t('calendar.subtitle')} icon={<CalendarClock className="size-5" />}>
      {domainsWithoutBilling + subscriptionsWithoutRetainer > 0 ? (
        <EmailBillingPanel title={t('calendar.needsSetupTitle')} icon="alert">
          <p className="text-sm">{t('calendar.needsSetupBody', { domains: domainsWithoutBilling, subscriptions: subscriptionsWithoutRetainer })}</p>
          <div className="mt-3"><Button asChild size="sm"><Link href="/email-billing/domains?filter=missingBilling">{t('calendar.fixNow')}</Link></Button></div>
        </EmailBillingPanel>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('calendar.title')}>
        <EmailBillingStatCard label={t('calendar.statOverdueInvoices')} value={overdueInvoices.length} />
        <EmailBillingStatCard label={t('calendar.statLate')} value={late.length} />
        <EmailBillingStatCard label={t('calendar.statThisWeek')} value={thisWeek.length} />
        <EmailBillingStatCard label={t('calendar.statLater')} value={later.length} />
      </section>

      {calendar.unpaidInvoices.length > 0 ? (
        <EmailBillingPanel title={t('calendar.unpaidTitle')} description={t('calendar.unpaidHelp')}>
          <EmailBillingTable headers={[t('calendar.invoice'), t('tables.domain'), t('tables.client'), t('calendar.amount'), t('calendar.dueDate'), t('tables.status')]} caption={t('calendar.unpaidTitle')}>
            {calendar.unpaidInvoices.map((i) => (
              <tr key={i.invoiceId} className="border-b hover:bg-muted/50">
                <td className="p-2 whitespace-nowrap"><Link href="/income" className="underline-offset-2 hover:underline">{i.invoiceNumber}</Link></td>
                <td className="p-2"><TruncatedText>{i.domain ?? '—'}</TruncatedText></td>
                <td className="p-2"><TruncatedText>{i.clientName}</TruncatedText></td>
                <td className="p-2 whitespace-nowrap">{money(i.amount, i.currency)}</td>
                <td className="p-2 whitespace-nowrap">{i.dueDate ? new Date(i.dueDate).toLocaleDateString() : '—'}</td>
                <td className="p-2">{i.daysOverdue !== null && i.daysOverdue > 0 ? <span className="text-destructive">{t('calendar.daysLate', { count: i.daysOverdue })}</span> : t('calendar.notDue')}</td>
              </tr>
            ))}
          </EmailBillingTable>
        </EmailBillingPanel>
      ) : null}

      {late.length > 0 ? <EmailBillingPanel title={t('calendar.lateTitle')} description={t('calendar.lateHelp')} icon="alert">{renewalTable(late, t('calendar.lateTitle'))}</EmailBillingPanel> : null}
      <EmailBillingPanel title={t('calendar.thisWeekTitle')}>
        {thisWeek.length === 0 ? <EmailBillingEmptyState title={t('calendar.nothingThisWeekTitle')} description={t('calendar.nothingThisWeekBody')} /> : renewalTable(thisWeek, t('calendar.thisWeekTitle'))}
      </EmailBillingPanel>
      <EmailBillingPanel title={t('calendar.laterTitle', { days: calendar.horizonDays })}>
        {later.length === 0 ? <p className="text-sm text-muted-foreground">{t('calendar.nothingLater')}</p> : renewalTable(later, t('calendar.laterTitle', { days: calendar.horizonDays }))}
      </EmailBillingPanel>
      <p className="text-sm text-muted-foreground">{t('calendar.footnote')}</p>
    </DashboardPageShell>
  );
}
