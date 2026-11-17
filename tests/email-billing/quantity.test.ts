import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => {
  const tx = {
    mailBillingSubscription: { updateMany: vi.fn(), update: vi.fn() },
    retainerItem: { update: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
    retainer: { update: vi.fn() },
    meteredUsage: { create: vi.fn() },
    mailBillingChange: { create: vi.fn() },
  };
  return {
    tx,
    prisma: {
      mailBillingSubscription: { findFirst: vi.fn(), update: vi.fn() },
      mailUsageSnapshot: { findMany: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
    addRetainerEvent: vi.fn(),
    afterRetainerChange: vi.fn(),
    resolve: vi.fn(),
    createReview: vi.fn(),
    logActivity: vi.fn(),
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: m.prisma }));
vi.mock('@/lib/retainers/events', () => ({ addRetainerEvent: m.addRetainerEvent }));
vi.mock('@/lib/retainers/save', () => ({ afterRetainerChange: m.afterRetainerChange }));
vi.mock('@/lib/email-billing/review', () => ({ resolveMailBillingReviewItems: m.resolve, createMailBillingReviewItem: m.createReview }));
vi.mock('@/lib/security/activity-log', () => ({ logActivity: m.logActivity }));

import { applyBillableQuantity, decideQuantity, evaluateSubscriptionQuantity } from '@/lib/email-billing/quantity';

const settings = { autoUpdateRetainerQuantities: false, ignoreAdminMailboxesFromBilling: false, syncFrequencyPreference: 'MANUAL' as const, usageBillingPolicy: 'LATEST' as const, prorateIncreases: true };
const NOW = new Date('2026-11-16T00:00:00.000Z'); // 15 of 30 days left in a cycle ending 2026-12-01

function subscription(over: Record<string, unknown> = {}, retainerOver: Record<string, unknown> | null = {}) {
  return {
    id: 's1', workspaceId: 'w1', domainId: 'd1', clientId: 'c1', billingStatus: 'ACTIVE', billingModeSnapshot: 'PER_MAILBOX', currencySnapshot: 'USD',
    basePriceSnapshot: 4, includedMailboxesSnapshot: 0, extraMailboxPriceSnapshot: 0, billableMailboxCount: 3, autoUpdateQuantity: false, pendingMailboxCount: 5,
    plan: null, domain: { id: 'd1', domain: 'a.com' }, retainerId: 'r1',
    retainer: retainerOver === null ? null : {
      id: 'r1', status: 'ACTIVE', frequency: 'MONTHLY', nextBillingDate: new Date('2026-12-01T00:00:00.000Z'),
      items: [{ id: 'i1', title: 'Email Mailbox Seats - a.com', quantity: 3, unitPrice: 4, taxRate: 0.18 }], ...retainerOver,
    },
    ...over,
  };
}

describe('applyBillableQuantity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.tx.mailBillingSubscription.updateMany.mockResolvedValue({ count: 1 });
    m.tx.meteredUsage.create.mockResolvedValue({ id: 'u1' });
  });

  it('updates the retainer line and queues a prorated charge for an increase mid-cycle', async () => {
    m.prisma.mailBillingSubscription.findFirst.mockResolvedValue(subscription());
    const result = await applyBillableQuantity({ workspaceId: 'w1', subscriptionId: 's1', toCount: 5, source: 'APPROVED', actorUserId: 'u', now: NOW, settings });
    // +2 mailboxes x 4.00 = 8.00 per cycle, half the cycle left -> 4.00
    expect(result).toMatchObject({ changed: true, fromCount: 3, toCount: 5, prorationAmount: 4, retainerUpdated: true });
    expect(m.tx.retainerItem.update).toHaveBeenCalledWith({ where: { id: 'i1' }, data: { quantity: 5, unitPrice: 4 } });
    expect(m.tx.meteredUsage.create).toHaveBeenCalledWith({ data: expect.objectContaining({ retainerId: 'r1', quantity: 1, unitPrice: 4, status: 'PENDING', description: expect.stringContaining('+2 mailboxes on a.com') }) });
    expect(m.tx.mailBillingChange.create).toHaveBeenCalledWith({ data: expect.objectContaining({ source: 'APPROVED', fromCount: 3, toCount: 5, prorationAmount: 4, meteredUsageId: 'u1' }) });
    expect(m.tx.mailBillingSubscription.updateMany).toHaveBeenCalledWith({ where: { id: 's1', workspaceId: 'w1', billableMailboxCount: 3 }, data: expect.objectContaining({ billableMailboxCount: 5, pendingMailboxCount: null }) });
    expect(m.afterRetainerChange).toHaveBeenCalledWith('w1', 'email_hosting_quantity');
    expect(m.resolve).toHaveBeenCalled();
  });

  it('does not charge or credit for a decrease; it applies from the next invoice', async () => {
    m.prisma.mailBillingSubscription.findFirst.mockResolvedValue(subscription());
    const result = await applyBillableQuantity({ workspaceId: 'w1', subscriptionId: 's1', toCount: 1, source: 'AUTO', now: NOW, settings });
    expect(result).toMatchObject({ changed: true, prorationAmount: 0 });
    expect(m.tx.meteredUsage.create).not.toHaveBeenCalled();
    expect(m.tx.retainerItem.update).toHaveBeenCalledWith({ where: { id: 'i1' }, data: { quantity: 1, unitPrice: 4 } });
  });

  it('skips proration when the workspace turned it off, or the next invoice is already due', async () => {
    m.prisma.mailBillingSubscription.findFirst.mockResolvedValue(subscription());
    await applyBillableQuantity({ workspaceId: 'w1', subscriptionId: 's1', toCount: 5, source: 'AUTO', now: NOW, settings: { ...settings, prorateIncreases: false } });
    expect(m.tx.meteredUsage.create).not.toHaveBeenCalled();

    m.prisma.mailBillingSubscription.findFirst.mockResolvedValue(subscription({}, { nextBillingDate: new Date('2026-11-10T00:00:00.000Z') }));
    await applyBillableQuantity({ workspaceId: 'w1', subscriptionId: 's1', toCount: 5, source: 'AUTO', now: NOW, settings });
    expect(m.tx.meteredUsage.create).not.toHaveBeenCalled();
  });

  it('never prorates a FIXED plan: the price does not depend on mailboxes', async () => {
    m.prisma.mailBillingSubscription.findFirst.mockResolvedValue(subscription({ billingModeSnapshot: 'FIXED', basePriceSnapshot: 25 }, { items: [{ id: 'i1', title: 'Professional Email Hosting - a.com', quantity: 1, unitPrice: 25, taxRate: 0 }] }));
    const result = await applyBillableQuantity({ workspaceId: 'w1', subscriptionId: 's1', toCount: 9, source: 'AUTO', now: NOW, settings });
    expect(result).toMatchObject({ changed: true, prorationAmount: 0 });
    expect(m.tx.meteredUsage.create).not.toHaveBeenCalled();
  });

  it('records the change but leaves retainer lines alone when there is no retainer yet', async () => {
    m.prisma.mailBillingSubscription.findFirst.mockResolvedValue(subscription({ retainerId: null }, null));
    const result = await applyBillableQuantity({ workspaceId: 'w1', subscriptionId: 's1', toCount: 5, source: 'MANUAL', now: NOW, settings });
    expect(result).toMatchObject({ changed: true, retainerUpdated: false, prorationAmount: 0 });
    expect(m.tx.retainerItem.update).not.toHaveBeenCalled();
    expect(m.addRetainerEvent).not.toHaveBeenCalled();
    expect(m.afterRetainerChange).not.toHaveBeenCalled();
  });

  it('is a no-op when the count is unchanged, and reports a conflict when another change won the race', async () => {
    m.prisma.mailBillingSubscription.findFirst.mockResolvedValue(subscription());
    expect(await applyBillableQuantity({ workspaceId: 'w1', subscriptionId: 's1', toCount: 3, source: 'AUTO', now: NOW, settings })).toEqual({ changed: false, reason: 'UNCHANGED' });
    m.tx.mailBillingSubscription.updateMany.mockResolvedValue({ count: 0 });
    expect(await applyBillableQuantity({ workspaceId: 'w1', subscriptionId: 's1', toCount: 5, source: 'AUTO', now: NOW, settings })).toEqual({ changed: false, reason: 'CONFLICT' });
    expect(m.tx.mailBillingChange.create).not.toHaveBeenCalled();
    expect(m.tx.meteredUsage.create).not.toHaveBeenCalled();
  });

  it('throws for a subscription in another workspace', async () => {
    m.prisma.mailBillingSubscription.findFirst.mockResolvedValue(null);
    await expect(applyBillableQuantity({ workspaceId: 'w2', subscriptionId: 's1', toCount: 5, source: 'AUTO', settings })).rejects.toThrow('Subscription not found');
    expect(m.prisma.mailBillingSubscription.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 's1', workspaceId: 'w2' } }));
  });
});

describe('decideQuantity', () => {
  const base = { billingStatus: 'ACTIVE', billingMode: 'PER_MAILBOX', current: 3, autoUpdateQuantity: false, latest: 5, cycleCounts: [] as number[], settings };
  it('queues a review by default and applies automatically when either switch is on', () => {
    expect(decideQuantity(base)).toEqual({ action: 'REVIEW', toCount: 5 });
    expect(decideQuantity({ ...base, autoUpdateQuantity: true })).toEqual({ action: 'APPLY', toCount: 5 });
    expect(decideQuantity({ ...base, settings: { ...settings, autoUpdateRetainerQuantities: true } })).toEqual({ action: 'APPLY', toCount: 5 });
  });
  it('does nothing when unchanged, cancelled or manually priced', () => {
    expect(decideQuantity({ ...base, latest: 3 })).toEqual({ action: 'NONE' });
    expect(decideQuantity({ ...base, billingStatus: 'CANCELLED' })).toEqual({ action: 'NONE' });
    expect(decideQuantity({ ...base, billingMode: 'MANUAL' })).toEqual({ action: 'NONE' });
  });
  it('uses the cycle peak under HIGH_WATER_MARK', () => {
    expect(decideQuantity({ ...base, latest: 2, cycleCounts: [2, 7, 4], settings: { ...settings, usageBillingPolicy: 'HIGH_WATER_MARK' } })).toEqual({ action: 'REVIEW', toCount: 7 });
  });
});

describe('evaluateSubscriptionQuantity', () => {
  beforeEach(() => vi.clearAllMocks());
  const evalSub = (over: Record<string, unknown> = {}) => ({
    id: 's1', domainId: 'd1', billingStatus: 'ACTIVE', billingModeSnapshot: 'PER_MAILBOX', billableMailboxCount: 3, autoUpdateQuantity: false, pendingMailboxCount: null,
    retainer: { nextBillingDate: new Date('2026-12-01T00:00:00.000Z'), frequency: 'MONTHLY' }, domain: { domain: 'a.com' }, ...over,
  });

  it('records the pending count and a single review item instead of changing the bill', async () => {
    m.prisma.mailBillingSubscription.findFirst.mockResolvedValue(evalSub());
    const decision = await evaluateSubscriptionQuantity({ workspaceId: 'w1', subscriptionId: 's1', latest: 6, now: NOW, settings });
    expect(decision).toEqual({ action: 'REVIEW', toCount: 6 });
    expect(m.prisma.mailBillingSubscription.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { pendingMailboxCount: 6 } });
    expect(m.createReview).toHaveBeenCalledWith(expect.objectContaining({ type: 'MAILBOX_COUNT_CHANGED', subscriptionId: 's1', newValueJson: { mailboxCount: 6 } }));
    expect(m.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('clears a stale pending count when usage returns to the billed quantity', async () => {
    m.prisma.mailBillingSubscription.findFirst.mockResolvedValue(evalSub({ pendingMailboxCount: 6 }));
    const decision = await evaluateSubscriptionQuantity({ workspaceId: 'w1', subscriptionId: 's1', latest: 3, now: NOW, settings });
    expect(decision).toEqual({ action: 'NONE' });
    expect(m.prisma.mailBillingSubscription.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { pendingMailboxCount: null } });
    expect(m.resolve).toHaveBeenCalledWith('w1', { subscriptionId: 's1', types: ['MAILBOX_COUNT_CHANGED'] });
  });

  it('only reads the cycle history under HIGH_WATER_MARK', async () => {
    m.prisma.mailBillingSubscription.findFirst.mockResolvedValue(evalSub());
    await evaluateSubscriptionQuantity({ workspaceId: 'w1', subscriptionId: 's1', latest: 3, now: NOW, settings });
    expect(m.prisma.mailUsageSnapshot.findMany).not.toHaveBeenCalled();
    m.prisma.mailUsageSnapshot.findMany.mockResolvedValue([{ billableMailboxCount: 8 }]);
    const decision = await evaluateSubscriptionQuantity({ workspaceId: 'w1', subscriptionId: 's1', latest: 3, now: NOW, settings: { ...settings, usageBillingPolicy: 'HIGH_WATER_MARK' } });
    expect(decision).toEqual({ action: 'REVIEW', toCount: 8 });
    // The cycle that ends 2026-12-01 started 2026-11-01.
    expect(m.prisma.mailUsageSnapshot.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { subscriptionId: 's1', capturedOn: { gte: new Date('2026-11-01T00:00:00.000Z') } } }));
  });
});
