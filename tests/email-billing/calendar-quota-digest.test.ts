import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const m = vi.hoisted(() => ({
  prisma: {
    mailBillingSubscription: { findMany: vi.fn(), count: vi.fn() },
    mailBillingDomain: { count: vi.fn() },
    mailBillingMailbox: { findMany: vi.fn() },
    mailBillingReviewItem: { findMany: vi.fn() },
    mailBillingSettings: { upsert: vi.fn(), updateMany: vi.fn() },
    invoice: { findMany: vi.fn() },
    workspaceUser: { findMany: vi.fn() },
  },
  createReview: vi.fn(), resolve: vi.fn(), dispatch: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: m.prisma }));
vi.mock('@/lib/email-billing/review', () => ({ createMailBillingReviewItem: m.createReview, resolveMailBillingReviewItems: m.resolve }));
vi.mock('@/lib/notifications/dispatcher', () => ({ dispatchNotification: m.dispatch }));
vi.mock('@/lib/invoice/finalize-draft', () => ({ finalizeInvoiceFromDraft: vi.fn() }));
vi.mock('@/lib/invoice/generation-context', () => ({ InvoiceValidationError: class extends Error {} }));
vi.mock('@/lib/invoices/payments', () => ({ recordInvoicePayment: vi.fn() }));
vi.mock('@/lib/invoices/void', () => ({ voidInvoice: vi.fn() }));

import { buildPaymentDigest, getBillingCalendar } from '@/lib/email-billing/calendar';
import { buildBalanceDigest, sendPaymentDigest } from '@/lib/email-billing/digest';
import { overQuota, quotaPercent, syncQuotaAlerts } from '@/lib/email-billing/quota';
import { normalizeMailbox, parseUsedMb } from '@/lib/email-billing/miab/normalize';

const NOW = new Date('2026-11-18T09:00:00.000Z'); // a Wednesday

describe('quota', () => {
  it('computes the percentage only when there is a limit and a reading', () => {
    expect(quotaPercent(450, 500)).toBe(90);
    expect(quotaPercent(1, 3)).toBe(33.3);
    expect(quotaPercent(10, 0)).toBeNull();
    expect(quotaPercent(10, null)).toBeNull();
    expect(quotaPercent(null, 500)).toBeNull();
  });

  it('lists mailboxes at or above the alert level, worst first, and is off at 0', () => {
    const rows = [{ e: 'a', usedMb: 95, quotaMb: 100 }, { e: 'b', usedMb: 50, quotaMb: 100 }, { e: 'c', usedMb: 120, quotaMb: 100 }, { e: 'd', usedMb: 90, quotaMb: 100 }, { e: 'e', usedMb: null, quotaMb: 100 }, { e: 'f', usedMb: 900, quotaMb: 0 }];
    expect(overQuota(rows, 90).map((r) => r.e)).toEqual(['c', 'a', 'd']);
    expect(overQuota(rows, 0)).toEqual([]);
  });

  it('reads used space in megabytes or bytes and treats "not reported" as unknown, not zero', () => {
    expect(parseUsedMb({ usedMb: 250 })).toBe(250);
    expect(parseUsedMb({ used_mb: '12' })).toBe(12);
    expect(parseUsedMb({ box_size: 5 * 1024 * 1024 })).toBe(5);
    expect(parseUsedMb({})).toBeNull();
    expect(parseUsedMb({ usedMb: -4 })).toBeNull();
    expect(parseUsedMb({ usedMb: 'lots' })).toBeNull();
    expect(normalizeMailbox({ email: 'a@x.com', usedMb: 40, quota: '1G' })).toMatchObject({ usedMb: 40, quotaMb: 1024 });
    expect(normalizeMailbox({ email: 'a@x.com' })?.usedMb).toBeNull();
  });

  describe('syncQuotaAlerts', () => {
    const box = (email: string, domainId: string, usedMb: number, quotaMb = 100) => ({ email, domainId, usedMb, quotaMb, domain: { domain: `${domainId}.com`, serverId: 's1' } });
    beforeEach(() => { vi.clearAllMocks(); m.prisma.mailBillingReviewItem.findMany.mockResolvedValue([]); });

    it('raises one item per domain listing its fullest mailboxes, critical once any is full', async () => {
      m.prisma.mailBillingMailbox.findMany.mockResolvedValue([box('a@d1.com', 'd1', 95), box('b@d1.com', 'd1', 92), box('c@d2.com', 'd2', 101), box('ok@d3.com', 'd3', 10)]);
      expect(await syncQuotaAlerts('w1', 90)).toBe(2);
      expect(m.createReview).toHaveBeenCalledTimes(2);
      expect(m.createReview).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'w1', domainId: 'd1', type: 'MAILBOX_QUOTA_HIGH', severity: 'WARNING', title: '2 mailboxes on d1.com are almost full' }));
      expect(m.createReview).toHaveBeenCalledWith(expect.objectContaining({ domainId: 'd2', severity: 'CRITICAL', title: '1 mailbox on d2.com is almost full' }));
      expect(m.prisma.mailBillingMailbox.findMany.mock.calls[0][0].where).toMatchObject({ workspaceId: 'w1', status: 'ACTIVE' });
    });

    it('clears the alert for a domain that is no longer over the level, and for all when the alert is turned off', async () => {
      m.prisma.mailBillingMailbox.findMany.mockResolvedValue([box('a@d1.com', 'd1', 95)]);
      m.prisma.mailBillingReviewItem.findMany.mockResolvedValue([{ domainId: 'd1' }, { domainId: 'd9' }]);
      await syncQuotaAlerts('w1', 90);
      expect(m.resolve).toHaveBeenCalledTimes(1);
      expect(m.resolve).toHaveBeenCalledWith('w1', { domainId: 'd9', types: ['MAILBOX_QUOTA_HIGH'] });

      m.resolve.mockClear();
      expect(await syncQuotaAlerts('w1', 0)).toBe(0);
      expect(m.createReview).toHaveBeenCalledTimes(1); // only the earlier call
      expect(m.resolve).toHaveBeenCalledTimes(2);
    });
  });
});

describe('billing calendar', () => {
  const sub = (over: Row = {}) => ({
    id: 's1', domainId: 'd1', clientId: 'c1', billingStatus: 'ACTIVE', trialEndsAt: null, currencySnapshot: 'INR', domain: { domain: 'acme.com' }, client: { name: 'Acme Ltd' },
    retainer: { id: 'r1', status: 'ACTIVE', frequency: 'ANNUALLY', nextBillingDate: new Date('2026-11-25T00:00:00Z'), currency: 'INR', emailInvoice: true, lastError: null, items: [{ quantity: 3, unitPrice: 100, taxRate: 0.18 }] }, ...over,
  });
  beforeEach(() => {
    vi.clearAllMocks();
    m.prisma.mailBillingSubscription.findMany.mockResolvedValue([]);
    m.prisma.invoice.findMany.mockResolvedValue([]);
    m.prisma.mailBillingDomain.count.mockResolvedValue(0);
    m.prisma.mailBillingSubscription.count.mockResolvedValue(0);
  });

  it('lists upcoming billing dates in order with the amount including tax and days remaining', async () => {
    m.prisma.mailBillingSubscription.findMany.mockResolvedValue([
      sub({ id: 's2', domain: { domain: 'zed.com' }, retainer: { ...sub().retainer, nextBillingDate: new Date('2026-11-20T00:00:00Z') } }),
      sub(),
      sub({ id: 's3', domain: { domain: 'late.com' }, retainer: { ...sub().retainer, nextBillingDate: new Date('2026-11-15T00:00:00Z'), lastError: 'TAX_RATE_REQUIRED' } }),
    ]);
    const cal = await getBillingCalendar('w1', NOW, 60);
    expect(cal.due.map((e) => [e.domain, e.dueOn, e.daysUntil])).toEqual([['late.com', '2026-11-15', -3], ['zed.com', '2026-11-20', 2], ['acme.com', '2026-11-25', 7]]);
    expect(cal.due[2]).toMatchObject({ amount: 354, currency: 'INR', kind: 'RENEWAL', frequency: 'ANNUALLY', clientName: 'Acme Ltd', emailsInvoice: true });
    expect(cal.due[0].lastError).toBe('TAX_RATE_REQUIRED');
  });

  it('shows a trial by its end date, even before any retainer exists', async () => {
    m.prisma.mailBillingSubscription.findMany.mockResolvedValue([sub({ billingStatus: 'TRIALING', trialEndsAt: new Date('2026-11-21T00:00:00Z'), retainer: null })]);
    const cal = await getBillingCalendar('w1', NOW);
    expect(cal.due[0]).toMatchObject({ kind: 'TRIAL_END', dueOn: '2026-11-21', daysUntil: 3, amount: null, retainerId: null });
  });

  it('lists unpaid invoices of mail retainers with how late they are, and counts what is not set up', async () => {
    m.prisma.invoice.findMany.mockResolvedValue([
      { id: 'i1', invoiceNumber: 'INV-1', status: 'PENDING', grandTotal: '1180.00', currency: 'INR', dueDate: new Date('2026-11-10T00:00:00Z'), client: { name: 'Acme Ltd' }, retainer: { mailBillingSubscriptions: [{ domain: { domain: 'acme.com' } }] } },
      { id: 'i2', invoiceNumber: 'INV-2', status: 'PARTIALLY_PAID', grandTotal: 500, currency: 'INR', dueDate: new Date('2026-11-20T00:00:00Z'), client: null, retainer: { mailBillingSubscriptions: [] } },
    ]);
    m.prisma.mailBillingDomain.count.mockResolvedValue(41);
    m.prisma.mailBillingSubscription.count.mockResolvedValue(3);
    const cal = await getBillingCalendar('w1', NOW);
    expect(cal.unpaidInvoices).toEqual([
      expect.objectContaining({ invoiceNumber: 'INV-1', domain: 'acme.com', amount: 1180, daysOverdue: 8, status: 'PENDING' }),
      expect.objectContaining({ invoiceNumber: 'INV-2', domain: null, clientName: '', daysOverdue: -2 }),
    ]);
    expect(cal.needsSetup).toEqual({ domainsWithoutBilling: 41, subscriptionsWithoutRetainer: 3 });
  });

  it('only reads this workspace\'s mail billing and only within the horizon', async () => {
    await getBillingCalendar('w9', NOW, 30);
    const subWhere = m.prisma.mailBillingSubscription.findMany.mock.calls[0][0].where;
    expect(subWhere.workspaceId).toBe('w9');
    expect(subWhere.OR[0].retainer.nextBillingDate.lte).toEqual(new Date('2026-12-18T23:59:59.999Z'));
    const invWhere = m.prisma.invoice.findMany.mock.calls[0][0].where;
    expect(invWhere).toMatchObject({ workspaceId: 'w9', status: { in: ['PENDING', 'PARTIALLY_PAID'] }, retainer: { mailBillingSubscriptions: { some: { workspaceId: 'w9' } } } });
  });
});

describe('payment digest', () => {
  const entry = (over: Row = {}) => ({ subscriptionId: 's', domainId: 'd', domain: 'acme.com', clientId: 'c', clientName: 'Acme', retainerId: 'r', kind: 'RENEWAL' as const, dueOn: '2026-11-20', daysUntil: 2, frequency: 'ANNUALLY', amount: 1180, currency: 'INR', emailsInvoice: true, lastError: null, ...over });
  const inv = (over: Row = {}) => ({ invoiceId: 'i', invoiceNumber: 'INV-1', domain: 'acme.com', clientName: 'Acme', amount: 500, currency: 'INR', status: 'PENDING', dueDate: '2026-11-10', daysOverdue: 8, ...over });
  const cal = (over: Row = {}) => ({ generatedOn: '2026-11-18', horizonDays: 7, due: [], unpaidInvoices: [], needsSetup: { domainsWithoutBilling: 0, subscriptionsWithoutRetainer: 0 }, ...over });

  it('says nothing when nothing is due this week, overdue or unpaid', () => {
    expect(buildPaymentDigest(cal())).toBeNull();
    expect(buildPaymentDigest(cal({ due: [entry({ daysUntil: 30 })], unpaidInvoices: [inv({ daysOverdue: -20 })] }))).toBeNull();
  });

  it('lists overdue invoices first, then invoices due this week, then billing dates, with a summary title', () => {
    const digest = buildPaymentDigest(cal({ due: [entry(), entry({ domain: 'trial.com', kind: 'TRIAL_END', daysUntil: 0, amount: null })], unpaidInvoices: [inv(), inv({ invoiceNumber: 'INV-2', daysOverdue: -3 })] }))!;
    expect(digest.title).toBe('Email hosting payments: 1 overdue invoice, 1 invoice due this week, 2 domains to bill this week');
    expect(digest.lines[0]).toMatch(/^OVERDUE INV-1 · acme\.com · Acme · .*500\.00 · 8 days late$/);
    expect(digest.lines[1]).toMatch(/^Invoice INV-2 due in 3 days/);
    expect(digest.lines[2]).toMatch(/^Billing in 2 days · acme\.com · Acme · .*1,180\.00$/);
    expect(digest.lines[3]).toBe('Trial ends today · trial.com · Acme');
  });

  it('caps the list and says how many more there are', () => {
    const many = Array.from({ length: 20 }, (_, i) => entry({ domain: `d${i}.com` }));
    const digest = buildPaymentDigest(cal({ due: many }))!;
    expect(digest.lines).toHaveLength(13);
    expect(digest.lines.at(-1)).toBe('…and 8 more');
  });

  describe('sendPaymentDigest', () => {
    const busy = () => { m.prisma.mailBillingSubscription.findMany.mockResolvedValue([{ id: 's1', domainId: 'd1', clientId: 'c1', billingStatus: 'ACTIVE', trialEndsAt: null, currencySnapshot: 'INR', domain: { domain: 'acme.com' }, client: { name: 'Acme' }, retainer: { id: 'r1', status: 'ACTIVE', frequency: 'MONTHLY', nextBillingDate: new Date('2026-11-19T00:00:00Z'), currency: 'INR', emailInvoice: true, lastError: null, items: [{ quantity: 1, unitPrice: 100, taxRate: 0 }] } }]); };
    beforeEach(() => {
      vi.clearAllMocks();
      m.prisma.mailBillingSubscription.findMany.mockResolvedValue([]);
      m.prisma.invoice.findMany.mockResolvedValue([]);
      m.prisma.mailBillingDomain.count.mockResolvedValue(0);
      m.prisma.mailBillingSubscription.count.mockResolvedValue(0);
      m.prisma.mailBillingSettings.upsert.mockResolvedValue({});
      m.prisma.mailBillingSettings.updateMany.mockResolvedValue({ count: 1 });
      m.prisma.workspaceUser.findMany.mockResolvedValue([
        { userId: 'owner', role: 'OWNER', businessRole: 'OWNER' }, { userId: 'fin', role: 'MEMBER', businessRole: 'FINANCE_MANAGER' },
        { userId: 'viewer', role: 'VIEWER', businessRole: 'VIEWER' }, { userId: 'staff', role: 'MEMBER', businessRole: null },
      ]);
    });

    it('does nothing when off, and on the weekly setting outside Monday', async () => {
      busy();
      expect(await sendPaymentDigest('w1', { paymentDigest: 'OFF' }, NOW)).toBe('SKIPPED');
      expect(await sendPaymentDigest('w1', { paymentDigest: 'WEEKLY' }, NOW)).toBe('SKIPPED'); // Wednesday
      expect(await sendPaymentDigest('w1', { paymentDigest: 'WEEKLY' }, new Date('2026-11-16T09:00:00Z'))).toBe('SENT'); // Monday
      expect(m.dispatch).toHaveBeenCalledTimes(1);
    });

    it('sends nothing, and does not use up the day, when there is nothing to collect', async () => {
      expect(await sendPaymentDigest('w1', { paymentDigest: 'DAILY' }, NOW)).toBe('SKIPPED');
      expect(m.prisma.mailBillingSettings.updateMany).not.toHaveBeenCalled();
      expect(m.dispatch).not.toHaveBeenCalled();
    });

    it('notifies only people allowed to see billing, once per day', async () => {
      busy();
      expect(await sendPaymentDigest('w1', { paymentDigest: 'DAILY' }, NOW)).toBe('SENT');
      expect(m.dispatch).toHaveBeenCalledWith(expect.objectContaining({ event: 'EMAIL_HOSTING_DIGEST', workspaceId: 'w1', userIds: ['owner', 'fin'] }));
      expect(m.prisma.mailBillingSettings.upsert).toHaveBeenCalledWith({ where: { workspaceId: 'w1' }, create: { workspaceId: 'w1' }, update: {} });
      expect(m.prisma.mailBillingSettings.updateMany).toHaveBeenCalledWith({ where: { workspaceId: 'w1', OR: [{ lastDigestOn: null }, { lastDigestOn: { lt: new Date('2026-11-18T00:00:00.000Z') } }] }, data: { lastDigestOn: new Date('2026-11-18T00:00:00.000Z') } });

      m.dispatch.mockClear();
      m.prisma.mailBillingSettings.updateMany.mockResolvedValue({ count: 0 }); // already sent today
      expect(await sendPaymentDigest('w1', { paymentDigest: 'DAILY' }, NOW)).toBe('SKIPPED');
      expect(m.dispatch).not.toHaveBeenCalled();
    });
  });
});

describe('balance digest (accrual billing)', () => {
  const row = (over: Row = {}) => ({ clientId: 'c1', clientName: 'Acme Ltd', currency: 'INR', owed: 1500, addresses: 5, domains: 2, oldestUnchargedDay: '2026-01-10', lastCollectedOn: null, openInvoices: 0, openInvoiceAmount: 0, ...over });

  it('says nothing when nobody owes anything and there is nothing unpaid', () => {
    expect(buildBalanceDigest({ asOf: '2026-11-18', rows: [], totals: [] })).toBeNull();
    expect(buildBalanceDigest({ asOf: '2026-11-18', rows: [row({ owed: 0 })], totals: [{ currency: 'INR', owed: 0 }] })).toBeNull();
  });

  it('lists who has the most built up, with the total, and any unpaid collection invoices', () => {
    const digest = buildBalanceDigest({ asOf: '2026-11-18', rows: [row(), row({ clientId: 'c2', clientName: 'Zed Co', owed: 0, addresses: 0, openInvoices: 2, openInvoiceAmount: 400 })], totals: [{ currency: 'INR', owed: 1500 }] })!;
    const inr = (n: number) => new Intl.NumberFormat('en', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);
    expect(digest.title).toBe(`Email hosting: ${inr(1500)} to collect from 1 client · unpaid collection invoices`);
    expect(digest.lines[0]).toMatch(/^Acme Ltd · .*1,500\.00 built up \(5 addresses, since 2026-01-10\)$/);
    expect(digest.lines[1]).toMatch(/^Zed Co · 2 unpaid collection invoices \(.*400\.00\)$/);
  });

  it('is what is sent when the workspace uses accrual billing', async () => {
    vi.clearAllMocks();
    m.prisma.mailBillingDomain.findMany = vi.fn().mockResolvedValue([]);
    m.prisma.mailCollection = { groupBy: vi.fn().mockResolvedValue([]) } as never;
    m.prisma.mailBillingSettings.upsert.mockResolvedValue({});
    m.prisma.mailBillingSettings.updateMany.mockResolvedValue({ count: 1 });
    // Nobody owes anything, so even in accrual mode nothing is sent and the day is not used up.
    expect(await sendPaymentDigest('w1', { paymentDigest: 'DAILY', billingModel: 'ACCRUAL' }, NOW)).toBe('SKIPPED');
    expect(m.prisma.mailBillingSettings.updateMany).not.toHaveBeenCalled();
    expect(m.prisma.mailBillingDomain.findMany).toHaveBeenCalled();
  });
});
