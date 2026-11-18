import 'server-only';
import { prisma } from '@/lib/prisma';
import { decimalToNumber } from '@/lib/money';
import { amountsOfItems } from '@/lib/retainers/pricing-amounts';
import { utcDay } from './usage-math';

const DAY_MS = 86_400_000;
export const CALENDAR_DEFAULT_DAYS = 60;
const MAX_ROWS = 500;

export type CalendarEntry = {
  subscriptionId: string;
  domainId: string;
  domain: string;
  clientId: string;
  clientName: string;
  retainerId: string | null;
  /** RENEWAL: the retainer job raises an invoice on this day. TRIAL_END: the trial converts to billing on this day. */
  kind: 'RENEWAL' | 'TRIAL_END';
  dueOn: string;
  /** Negative when the date has passed and nothing has been invoiced yet. */
  daysUntil: number;
  frequency: string;
  amount: number | null;
  currency: string;
  emailsInvoice: boolean;
  /** The last billing error the retainer job recorded, if it tried and failed. */
  lastError: string | null;
};

export type UnpaidInvoiceEntry = {
  invoiceId: string;
  invoiceNumber: string;
  domain: string | null;
  clientName: string;
  amount: number;
  currency: string;
  status: string;
  dueDate: string | null;
  /** Positive when overdue, negative when not yet due. */
  daysOverdue: number | null;
};

export type BillingCalendar = {
  generatedOn: string;
  horizonDays: number;
  due: CalendarEntry[];
  unpaidInvoices: UnpaidInvoiceEntry[];
  needsSetup: { domainsWithoutBilling: number; subscriptionsWithoutRetainer: number };
};

const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const daysBetween = (from: Date, to: Date) => Math.round((utcDay(to).getTime() - utcDay(from).getTime()) / DAY_MS);

/**
 * Everything the owner has to collect, in one list: which domains renew when (anchored on the day each was issued), which
 * invoices are unpaid or overdue, and what is not set up for billing at all (the ones that would otherwise be forgotten).
 */
export async function getBillingCalendar(workspaceId: string, now = new Date(), horizonDays = CALENDAR_DEFAULT_DAYS): Promise<BillingCalendar> {
  const today = utcDay(now);
  const horizonEnd = new Date(today.getTime() + (horizonDays + 1) * DAY_MS - 1);

  const [subs, invoices, domainsWithoutBilling, subscriptionsWithoutRetainer] = await Promise.all([
    prisma.mailBillingSubscription.findMany({
      where: {
        workspaceId, billingStatus: { in: ['ACTIVE', 'TRIALING', 'REVIEW_REQUIRED'] },
        OR: [
          { retainer: { status: 'ACTIVE', nextBillingDate: { lte: horizonEnd } } },
          { billingStatus: 'TRIALING', trialEndsAt: { lte: horizonEnd } },
        ],
      },
      select: {
        id: true, domainId: true, clientId: true, billingStatus: true, trialEndsAt: true, currencySnapshot: true,
        domain: { select: { domain: true } }, client: { select: { name: true } },
        retainer: { select: { id: true, status: true, frequency: true, nextBillingDate: true, currency: true, emailInvoice: true, lastError: true, items: { select: { quantity: true, unitPrice: true, taxRate: true } } } },
      },
      take: MAX_ROWS,
    }),
    prisma.invoice.findMany({
      where: {
        workspaceId, status: { in: ['PENDING', 'PARTIALLY_PAID'] }, dueDate: { not: null, lte: horizonEnd },
        retainer: { mailBillingSubscriptions: { some: { workspaceId } } },
      },
      select: {
        id: true, invoiceNumber: true, status: true, grandTotal: true, currency: true, dueDate: true, client: { select: { name: true } },
        retainer: { select: { mailBillingSubscriptions: { select: { domain: { select: { domain: true } } }, take: 1 } } },
      },
      orderBy: { dueDate: 'asc' },
      take: MAX_ROWS,
    }),
    prisma.mailBillingDomain.count({ where: { workspaceId, status: 'ACTIVE', subscriptions: { none: { retainerId: { not: null } } } } }),
    prisma.mailBillingSubscription.count({ where: { workspaceId, retainerId: null, billingStatus: { in: ['ACTIVE', 'REVIEW_REQUIRED'] }, domain: { status: 'ACTIVE' } } }),
  ]);

  const due: CalendarEntry[] = subs.flatMap((s): CalendarEntry[] => {
    const trialLive = s.billingStatus === 'TRIALING' && s.trialEndsAt;
    const retainerLive = s.retainer && s.retainer.status === 'ACTIVE';
    // A trial with a pre-created retainer is billed from the trial end, so the trial end is the date to show.
    const dueOn = trialLive ? s.trialEndsAt! : retainerLive ? s.retainer!.nextBillingDate : null;
    if (!dueOn) return [];
    const amount = s.retainer ? decimalToNumber(amountsOfItems(s.retainer.items).total) : null;
    return [{
      subscriptionId: s.id, domainId: s.domainId, domain: s.domain.domain, clientId: s.clientId, clientName: s.client.name,
      retainerId: s.retainer?.id ?? null, kind: trialLive ? 'TRIAL_END' : 'RENEWAL', dueOn: isoDay(dueOn), daysUntil: daysBetween(today, dueOn),
      frequency: s.retainer?.frequency ?? 'MONTHLY', amount, currency: s.retainer?.currency ?? s.currencySnapshot,
      emailsInvoice: s.retainer?.emailInvoice ?? false, lastError: s.retainer?.lastError ?? null,
    }];
  }).sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.domain.localeCompare(b.domain));

  const unpaidInvoices: UnpaidInvoiceEntry[] = invoices.map((inv) => ({
    invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, domain: inv.retainer?.mailBillingSubscriptions[0]?.domain.domain ?? null, clientName: inv.client?.name ?? '',
    amount: decimalToNumber(inv.grandTotal), currency: inv.currency, status: inv.status, dueDate: inv.dueDate ? isoDay(inv.dueDate) : null,
    daysOverdue: inv.dueDate ? daysBetween(inv.dueDate, today) : null,
  }));

  return { generatedOn: isoDay(today), horizonDays, due, unpaidInvoices, needsSetup: { domainsWithoutBilling, subscriptionsWithoutRetainer } };
}

export type PaymentDigest = { title: string; body: string; lines: string[] };

const money = (amount: number | null, currency: string) => (amount === null ? '' : ` · ${new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)}`);
const when = (days: number) => (days < 0 ? `${-days} day${days === -1 ? '' : 's'} late` : days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`);
const DIGEST_WINDOW_DAYS = 7;
const DIGEST_LINES = 12;

/** The short list worth interrupting the owner for: billing dates this week, unpaid invoices overdue or due this week. Null when there is none. */
export function buildPaymentDigest(calendar: BillingCalendar): PaymentDigest | null {
  const renewals = calendar.due.filter((e) => e.daysUntil <= DIGEST_WINDOW_DAYS);
  const overdue = calendar.unpaidInvoices.filter((i) => (i.daysOverdue ?? -999) > 0);
  const dueSoon = calendar.unpaidInvoices.filter((i) => i.daysOverdue !== null && i.daysOverdue <= 0 && i.daysOverdue >= -DIGEST_WINDOW_DAYS);
  if (!renewals.length && !overdue.length && !dueSoon.length) return null;

  const lines = [
    ...overdue.map((i) => `OVERDUE ${i.invoiceNumber} · ${i.domain ?? i.clientName} · ${i.clientName}${money(i.amount, i.currency)} · ${i.daysOverdue} day${i.daysOverdue === 1 ? '' : 's'} late`),
    ...dueSoon.map((i) => `Invoice ${i.invoiceNumber} due ${when(-(i.daysOverdue ?? 0))} · ${i.domain ?? i.clientName} · ${i.clientName}${money(i.amount, i.currency)}`),
    ...renewals.map((e) => `${e.kind === 'TRIAL_END' ? 'Trial ends' : 'Billing'} ${when(e.daysUntil)} · ${e.domain} · ${e.clientName}${money(e.amount, e.currency)}`),
  ];
  const parts = [
    overdue.length ? `${overdue.length} overdue invoice${overdue.length === 1 ? '' : 's'}` : '',
    dueSoon.length ? `${dueSoon.length} invoice${dueSoon.length === 1 ? '' : 's'} due this week` : '',
    renewals.length ? `${renewals.length} domain${renewals.length === 1 ? '' : 's'} to bill this week` : '',
  ].filter(Boolean);
  const shown = lines.slice(0, DIGEST_LINES);
  if (lines.length > shown.length) shown.push(`…and ${lines.length - shown.length} more`);
  return { title: `Email hosting payments: ${parts.join(', ')}`, body: parts.join(' · '), lines: shown };
}
