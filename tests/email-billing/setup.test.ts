import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const m = vi.hoisted(() => {
  const tx = {
    mailBillingSubscription: { create: vi.fn(), update: vi.fn() },
    mailBillingDomain: { update: vi.fn() },
    retainer: { create: vi.fn() },
  };
  return {
    tx,
    prisma: {
      mailBillingDomain: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
      mailBillingPlan: { findFirst: vi.fn() },
      client: { findFirst: vi.fn(), create: vi.fn() },
      workspace: { findUnique: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
    settings: vi.fn(), addRetainerEvent: vi.fn(), afterRetainerChange: vi.fn(), resolve: vi.fn(), log: vi.fn(), freeTier: vi.fn(),
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: m.prisma }));
vi.mock('@/lib/email-billing/settings', () => ({ loadMailBillingSettings: m.settings }));
vi.mock('@/lib/retainers/events', () => ({ addRetainerEvent: m.addRetainerEvent }));
vi.mock('@/lib/retainers/save', () => ({ afterRetainerChange: m.afterRetainerChange }));
vi.mock('@/lib/email-billing/review', () => ({ resolveMailBillingReviewItems: m.resolve, createMailBillingReviewItem: vi.fn() }));
vi.mock('@/lib/security/activity-log', () => ({ logActivity: m.log }));
vi.mock('@/lib/entitlements', () => ({ FREE_TIER_CLIENT_LIMIT: 5, shouldApplyFreeTierLimits: m.freeTier }));

import { runBulkSetup, previewBulkSetup } from '@/lib/email-billing/bulk-setup';
import { setupDomainBilling, SetupBillingError } from '@/lib/email-billing/setup';

const NOW = new Date('2026-11-18T09:00:00.000Z');
const plan = (over: Row = {}) => ({ id: 'p1', workspaceId: 'w1', name: 'Yearly', billingMode: 'PER_MAILBOX', currency: 'INR', basePrice: 100, includedMailboxes: 0, extraMailboxPrice: 0, frequency: 'ANNUALLY', isActive: true, ...over });
const domain = (over: Row = {}) => ({
  id: 'd1', workspaceId: 'w1', domain: 'acme.com', status: 'ACTIVE', discoveredAt: new Date('2025-03-10T08:15:00.000Z'), mailboxCount: 3, subscriptions: [],
  mailboxes: [{ status: 'ACTIVE', isAdmin: false }, { status: 'ACTIVE', isAdmin: false }, { status: 'ACTIVE', isAdmin: true }], ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.settings.mockResolvedValue({ ignoreAdminMailboxesFromBilling: false });
  m.prisma.mailBillingDomain.findFirst.mockResolvedValue(domain());
  m.prisma.mailBillingPlan.findFirst.mockResolvedValue(plan());
  m.prisma.client.findFirst.mockResolvedValue({ id: 'c1' });
  m.tx.mailBillingSubscription.create.mockResolvedValue({ id: 's1' });
  m.tx.mailBillingSubscription.update.mockResolvedValue({ id: 's1' });
  m.tx.retainer.create.mockResolvedValue({ id: 'r1', items: [] });
  m.freeTier.mockReturnValue(false);
});

const base = { workspaceId: 'w1', userId: 'u1', domainId: 'd1', planId: 'p1', clientId: 'c1', now: NOW };

describe('setupDomainBilling', () => {
  it('bills on the anniversary of the day the domain was issued, not on the day it is set up', async () => {
    const result = await setupDomainBilling(base);
    // Issued 2025-03-10 (the day it was first seen), billed yearly, today is 2026-11-18 -> next 2027-03-10.
    expect(result).toMatchObject({ status: 'ACTIVE', retainerId: 'r1', firstBillingDate: new Date('2027-03-10T00:00:00.000Z') });
    expect(m.tx.retainer.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ workspaceId: 'w1', clientId: 'c1', frequency: 'ANNUALLY', nextBillingDate: new Date('2027-03-10T00:00:00.000Z'), amount: 300 }) }));
    expect(m.tx.mailBillingSubscription.create).toHaveBeenCalledWith({ data: expect.objectContaining({ domainId: 'd1', clientId: 'c1', planId: 'p1', startedAt: new Date('2025-03-10T00:00:00.000Z'), billableMailboxCount: 3, currencySnapshot: 'INR' }) });
    expect(m.tx.mailBillingDomain.update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: expect.objectContaining({ clientId: 'c1', retainerId: 'r1' }) });
    expect(m.afterRetainerChange).toHaveBeenCalled();
    expect(m.resolve).toHaveBeenCalled();
  });

  it('uses an explicit issue date and an explicit first billing date when given', async () => {
    await setupDomainBilling({ ...base, startDate: new Date('2026-09-02'), firstBillingDate: new Date('2026-11-20') });
    expect(m.tx.mailBillingSubscription.create).toHaveBeenCalledWith({ data: expect.objectContaining({ startedAt: new Date('2026-09-02T00:00:00.000Z') }) });
    expect(m.tx.retainer.create.mock.calls[0][0].data.nextBillingDate).toEqual(new Date('2026-11-20T00:00:00.000Z'));
  });

  it('bills today for a domain issued today', async () => {
    await setupDomainBilling({ ...base, startDate: NOW, now: NOW });
    expect(m.tx.retainer.create.mock.calls[0][0].data.nextBillingDate).toEqual(new Date('2026-11-18T00:00:00.000Z'));
  });

  it('starts a trial and begins billing when it ends', async () => {
    const result = await setupDomainBilling({ ...base, trialDays: 14 });
    expect(result.status).toBe('TRIALING');
    const end = new Date(NOW.getTime() + 14 * 86_400_000);
    expect(m.tx.mailBillingSubscription.create).toHaveBeenCalledWith({ data: expect.objectContaining({ billingStatus: 'TRIALING', trialEndsAt: end }) });
    expect(m.tx.retainer.create.mock.calls[0][0].data.nextBillingDate).toEqual(end);
  });

  it('passes the invoice-email choice through, and leaves it to the retainer default otherwise', async () => {
    await setupDomainBilling({ ...base, emailInvoices: false });
    expect(m.tx.retainer.create.mock.calls[0][0].data.emailInvoice).toBe(false);
    await setupDomainBilling(base);
    expect(m.tx.retainer.create.mock.calls[1][0].data).not.toHaveProperty('emailInvoice');
  });

  it('counts mailboxes the way billing does, optionally excluding admins', async () => {
    m.settings.mockResolvedValue({ ignoreAdminMailboxesFromBilling: true });
    await setupDomainBilling(base);
    expect(m.tx.mailBillingSubscription.create).toHaveBeenCalledWith({ data: expect.objectContaining({ billableMailboxCount: 2 }) });
    expect(m.tx.retainer.create.mock.calls[0][0].data.amount).toBe(200);
  });

  it('creates the subscription for a manually priced plan but no retainer, and says it needs review', async () => {
    m.prisma.mailBillingPlan.findFirst.mockResolvedValue(plan({ billingMode: 'MANUAL' }));
    const result = await setupDomainBilling(base);
    expect(result).toMatchObject({ status: 'REVIEW_REQUIRED', retainerId: null, firstBillingDate: null });
    expect(m.tx.retainer.create).not.toHaveBeenCalled();
  });

  it('reuses an existing unbilled subscription instead of creating a second', async () => {
    m.prisma.mailBillingDomain.findFirst.mockResolvedValue(domain({ subscriptions: [{ id: 's9', retainerId: null }] }));
    m.tx.mailBillingSubscription.update.mockResolvedValue({ id: 's9' });
    const result = await setupDomainBilling(base);
    expect(result.subscriptionId).toBe('s9');
    expect(m.tx.mailBillingSubscription.create).not.toHaveBeenCalled();
  });

  it.each([
    ['already billed', () => m.prisma.mailBillingDomain.findFirst.mockResolvedValue(domain({ subscriptions: [{ id: 's9', retainerId: 'r9' }] })), 409],
    ['a removed domain', () => m.prisma.mailBillingDomain.findFirst.mockResolvedValue(domain({ status: 'REMOVED' })), 409],
    ['an ignored domain', () => m.prisma.mailBillingDomain.findFirst.mockResolvedValue(domain({ status: 'IGNORED' })), 409],
    ['an unknown domain', () => m.prisma.mailBillingDomain.findFirst.mockResolvedValue(null), 404],
    ['an unknown plan', () => m.prisma.mailBillingPlan.findFirst.mockResolvedValue(null), 404],
    ['another workspace\'s client', () => m.prisma.client.findFirst.mockResolvedValue(null), 404],
  ])('refuses %s without writing anything', async (_name, arrange, status) => {
    arrange();
    await expect(setupDomainBilling(base)).rejects.toMatchObject({ status });
    expect(m.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('looks everything up inside the caller\'s workspace', async () => {
    await setupDomainBilling({ ...base, workspaceId: 'w7' });
    expect(m.prisma.mailBillingDomain.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'd1', workspaceId: 'w7' } }));
    expect(m.prisma.mailBillingPlan.findFirst).toHaveBeenCalledWith({ where: { id: 'p1', workspaceId: 'w7', isActive: true } });
    expect(m.prisma.client.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'c1', workspaceId: 'w7' }) }));
  });

  it('rejects an absurd start date far in the future', async () => {
    await expect(setupDomainBilling({ ...base, startDate: new Date('2030-01-01') })).rejects.toBeInstanceOf(SetupBillingError);
  });
});

describe('bulk setup', () => {
  const bulk = { workspaceId: 'w1', userId: 'u1', planId: 'p1', startDateSource: 'DISCOVERED' as const, createClients: false, now: NOW };
  const cand = (n: number, over: Row = {}) => ({ id: `d${n}`, domain: `site${n}.com`, clientId: `c${n}`, discoveredAt: new Date('2025-06-01T00:00:00Z'), mailboxCount: 2, client: { name: `Client ${n}` }, ...over });

  it('previews without changing anything, and says how many unmapped domains would be skipped', async () => {
    m.prisma.mailBillingDomain.count.mockResolvedValueOnce(2).mockResolvedValueOnce(5);
    m.prisma.mailBillingDomain.findMany.mockResolvedValue([cand(1), cand(2)]);
    const preview = await previewBulkSetup(bulk);
    expect(preview).toMatchObject({ eligible: 2, unmappedSkipped: 5, willProcessNow: 2, emailInvoices: false });
    expect(preview.sample[0]).toMatchObject({ domain: 'site1.com', client: 'Client 1', startDate: '2025-06-01', firstBillingDate: '2027-06-01', amount: 200, currency: 'INR' });
    expect(m.prisma.$transaction).not.toHaveBeenCalled();
    expect(m.prisma.client.create).not.toHaveBeenCalled();
    // Without createClients only mapped domains are eligible.
    expect(m.prisma.mailBillingDomain.findMany.mock.calls[0][0].where).toMatchObject({ workspaceId: 'w1', status: 'ACTIVE', clientId: { not: null }, subscriptions: { none: { retainerId: { not: null } } } });
  });

  it('applies with invoice emails off by default and reports each domain, continuing after a failure', async () => {
    m.prisma.workspace.findUnique.mockResolvedValue({ countryCode: 'IN', _count: { clients: 0 } });
    m.prisma.mailBillingDomain.findMany.mockResolvedValue([cand(1), cand(2), cand(3)]);
    m.prisma.mailBillingDomain.count.mockResolvedValue(1);
    m.prisma.mailBillingDomain.findFirst.mockImplementation(async ({ where }: { where: Row }) => (where.id === 'd2' ? domain({ id: 'd2', subscriptions: [{ id: 'sx', retainerId: 'rx' }] }) : domain({ id: where.id })));
    const out = await runBulkSetup(bulk);
    expect(out).toMatchObject({ processed: 3, succeeded: 2, failed: 1, remaining: 1 });
    expect(out.results.find((r) => !r.ok)).toMatchObject({ domain: 'site2.com', error: 'Billing is already set up for this domain.' });
    expect(m.tx.retainer.create.mock.calls.every((c) => c[0].data.emailInvoice === false)).toBe(true);
    expect(m.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'email_billing.bulk_billing_setup', status: 'FAILURE', metadata: expect.objectContaining({ processed: 3, emailInvoices: false }) }));
  });

  it('creates a client named after the domain only when asked, reusing one that already exists', async () => {
    m.prisma.workspace.findUnique.mockResolvedValue({ countryCode: 'IN', _count: { clients: 0 } });
    m.prisma.mailBillingDomain.findMany.mockResolvedValue([cand(1, { clientId: null, client: null }), cand(2, { clientId: null, client: null })]);
    m.prisma.mailBillingDomain.count.mockResolvedValue(0);
    m.prisma.mailBillingDomain.findFirst.mockImplementation(async ({ where }: { where: Row }) => domain({ id: where.id }));
    m.prisma.client.findFirst.mockImplementation(async ({ where }: { where: Row }) => (where.name === 'site2.com' ? { id: 'existing' } : where.id ? { id: where.id } : null));
    m.prisma.client.create.mockResolvedValue({ id: 'newc' });
    await runBulkSetup({ ...bulk, createClients: true });
    expect(m.prisma.client.create).toHaveBeenCalledTimes(1);
    expect(m.prisma.client.create.mock.calls[0][0].data).toMatchObject({ workspaceId: 'w1', name: 'site1.com', source: 'IMPORT', countryCode: 'IN' });
  });

  it('refuses to create more clients than the Free plan allows', async () => {
    m.freeTier.mockReturnValue(true);
    m.prisma.workspace.findUnique.mockResolvedValue({ countryCode: 'IN', _count: { clients: 4 } });
    m.prisma.mailBillingDomain.findMany.mockResolvedValue([cand(1, { clientId: null, client: null }), cand(2, { clientId: null, client: null })]);
    await expect(runBulkSetup({ ...bulk, createClients: true })).rejects.toMatchObject({ status: 403 });
    expect(m.prisma.client.create).not.toHaveBeenCalled();
  });

  it('can use one start date for every domain', async () => {
    m.prisma.workspace.findUnique.mockResolvedValue({ countryCode: 'IN', _count: { clients: 0 } });
    m.prisma.mailBillingDomain.findMany.mockResolvedValue([cand(1)]);
    m.prisma.mailBillingDomain.count.mockResolvedValue(0);
    m.prisma.mailBillingDomain.findFirst.mockResolvedValue(domain());
    await runBulkSetup({ ...bulk, startDateSource: 'DATE', startDate: new Date('2026-04-01') });
    expect(m.tx.mailBillingSubscription.create).toHaveBeenCalledWith({ data: expect.objectContaining({ startedAt: new Date('2026-04-01T00:00:00.000Z') }) });
    expect(m.tx.retainer.create.mock.calls[0][0].data.nextBillingDate).toEqual(new Date('2027-04-01T00:00:00.000Z'));
  });
});
