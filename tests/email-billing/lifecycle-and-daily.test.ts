import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => {
  const tx = {
    mailBillingSubscription: { updateMany: vi.fn(), update: vi.fn() },
    mailBillingDomain: { update: vi.fn() },
    retainer: { create: vi.fn() },
  };
  return {
    tx,
    prisma: {
      mailBillingSubscription: { findMany: vi.fn() },
      mailBillingMailbox: { findMany: vi.fn() },
      mailBillingServer: { findMany: vi.fn() },
      mailBillingSettings: { findUnique: vi.fn() },
      mailUsageSnapshot: { upsert: vi.fn() },
      workspaceModule: { findMany: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
    addRetainerEvent: vi.fn(), afterRetainerChange: vi.fn(), resolve: vi.fn(), createReview: vi.fn(), logActivity: vi.fn(),
    sync: vi.fn(), evaluate: vi.fn(),
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: m.prisma }));
vi.mock('@/lib/retainers/events', () => ({ addRetainerEvent: m.addRetainerEvent }));
vi.mock('@/lib/retainers/save', () => ({ afterRetainerChange: m.afterRetainerChange }));
vi.mock('@/lib/email-billing/review', () => ({ resolveMailBillingReviewItems: m.resolve, createMailBillingReviewItem: m.createReview }));
vi.mock('@/lib/security/activity-log', () => ({ logActivity: m.logActivity }));
vi.mock('@/lib/email-billing/sync', () => ({ syncMailBillingServer: m.sync }));

import { convertEndedTrials } from '@/lib/email-billing/lifecycle';
import { captureUsageSnapshots } from '@/lib/email-billing/usage';

const NOW = new Date('2026-11-17T06:50:00.000Z');
const TRIAL_END = new Date('2026-11-16T00:00:00.000Z');

const trialSub = (over: Record<string, unknown> = {}) => ({
  id: 's1', workspaceId: 'w1', domainId: 'd1', clientId: 'c1', billingStatus: 'TRIALING', trialEndsAt: TRIAL_END, planId: 'p1',
  billingModeSnapshot: 'PER_MAILBOX', currencySnapshot: 'USD', basePriceSnapshot: 4, includedMailboxesSnapshot: 0, extraMailboxPriceSnapshot: 0, billableMailboxCount: 3,
  plan: { frequency: 'MONTHLY', billingMode: 'PER_MAILBOX', currency: 'USD', basePrice: 4 }, domain: { id: 'd1', domain: 'a.com', mailboxCount: 3 }, retainer: null, ...over,
});

describe('convertEndedTrials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.tx.mailBillingSubscription.updateMany.mockResolvedValue({ count: 1 });
    m.tx.retainer.create.mockResolvedValue({ id: 'r1', items: [] });
  });

  it('only looks at trials that have ended', async () => {
    m.prisma.mailBillingSubscription.findMany.mockResolvedValue([]);
    await convertEndedTrials({ workspaceId: 'w1', now: NOW });
    expect(m.prisma.mailBillingSubscription.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { billingStatus: 'TRIALING', trialEndsAt: { lte: NOW }, workspaceId: 'w1' } }));
  });

  it('creates a retainer that starts billing on the trial end date and activates the subscription', async () => {
    m.prisma.mailBillingSubscription.findMany.mockResolvedValue([trialSub()]);
    const stats = await convertEndedTrials({ now: NOW });
    expect(stats).toEqual({ converted: 1, needsReview: 0, skipped: 0, failed: 0 });
    expect(m.tx.retainer.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ workspaceId: 'w1', clientId: 'c1', nextBillingDate: TRIAL_END, amount: 12, currency: 'USD' }) }));
    expect(m.tx.mailBillingSubscription.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: expect.objectContaining({ retainerId: 'r1', billingStatus: 'ACTIVE' }) });
    expect(m.tx.mailBillingDomain.update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: expect.objectContaining({ retainerId: 'r1' }) });
    expect(m.afterRetainerChange).toHaveBeenCalled();
  });

  it('keeps an already linked active retainer instead of creating a second one', async () => {
    m.prisma.mailBillingSubscription.findMany.mockResolvedValue([trialSub({ retainer: { id: 'r9', status: 'ACTIVE' } })]);
    const stats = await convertEndedTrials({ now: NOW });
    expect(stats.converted).toBe(1);
    expect(m.tx.retainer.create).not.toHaveBeenCalled();
    expect(m.tx.mailBillingSubscription.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { billingStatus: 'ACTIVE' } });
  });

  it('sends manual-priced subscriptions and inactive retainers to the review queue', async () => {
    m.prisma.mailBillingSubscription.findMany.mockResolvedValue([trialSub({ billingModeSnapshot: 'MANUAL' }), trialSub({ id: 's2', retainer: { id: 'r8', status: 'PAUSED' } })]);
    const stats = await convertEndedTrials({ now: NOW });
    expect(stats).toEqual({ converted: 0, needsReview: 2, skipped: 0, failed: 0 });
    expect(m.createReview).toHaveBeenCalledTimes(2);
    expect(m.createReview).toHaveBeenCalledWith(expect.objectContaining({ type: 'TRIAL_ENDED_NEEDS_RETAINER' }));
    expect(m.tx.retainer.create).not.toHaveBeenCalled();
  });

  it('is idempotent: a trial another run already claimed is skipped', async () => {
    m.tx.mailBillingSubscription.updateMany.mockResolvedValue({ count: 0 });
    m.prisma.mailBillingSubscription.findMany.mockResolvedValue([trialSub()]);
    const stats = await convertEndedTrials({ now: NOW });
    expect(stats).toEqual({ converted: 0, needsReview: 0, skipped: 1, failed: 0 });
    expect(m.tx.retainer.create).not.toHaveBeenCalled();
  });

  it('counts a failure, keeps going, and leaves the trial to be retried', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    m.tx.retainer.create.mockRejectedValueOnce(new Error('db down'));
    m.prisma.mailBillingSubscription.findMany.mockResolvedValue([trialSub(), trialSub({ id: 's2' })]);
    const stats = await convertEndedTrials({ now: NOW });
    expect(stats).toMatchObject({ converted: 1, failed: 1 });
    spy.mockRestore();
  });
});

describe('captureUsageSnapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.prisma.mailBillingSettings.findUnique.mockResolvedValue({ ignoreAdminMailboxesFromBilling: true });
  });

  it('writes one row per live subscription per UTC day, excluding admins from the billable count when configured', async () => {
    m.prisma.mailBillingSubscription.findMany.mockResolvedValue([{ id: 's1', domainId: 'd1', domain: { aliasCount: 2 } }, { id: 's2', domainId: 'd2', domain: { aliasCount: 0 } }]);
    m.prisma.mailBillingMailbox.findMany.mockResolvedValue([
      { domainId: 'd1', isAdmin: true, status: 'ACTIVE', quotaMb: 1000 },
      { domainId: 'd1', isAdmin: false, status: 'ACTIVE', quotaMb: 500 },
      { domainId: 'd1', isAdmin: false, status: 'ACTIVE', quotaMb: null },
    ]);
    const readings = await captureUsageSnapshots({ workspaceId: 'w1', now: new Date('2026-11-17T23:30:00.000Z') });
    expect(readings).toEqual([
      { subscriptionId: 's1', billableMailboxCount: 2, mailboxCount: 3 },
      { subscriptionId: 's2', billableMailboxCount: 0, mailboxCount: 0 },
    ]);
    const day = new Date('2026-11-17T00:00:00.000Z');
    expect(m.prisma.mailUsageSnapshot.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { subscriptionId_capturedOn: { subscriptionId: 's1', capturedOn: day } },
      create: expect.objectContaining({ workspaceId: 'w1', capturedOn: day, mailboxCount: 3, adminMailboxCount: 1, aliasCount: 2, totalQuotaMb: 1500, billableMailboxCount: 2, source: 'CRON' }),
      update: expect.not.objectContaining({ capturedOn: expect.anything() }),
    }));
  });

  it('only snapshots subscriptions that are not cancelled and whose domain is still hosted', async () => {
    m.prisma.mailBillingSubscription.findMany.mockResolvedValue([]);
    expect(await captureUsageSnapshots({ workspaceId: 'w1', now: NOW })).toEqual([]);
    expect(m.prisma.mailBillingSubscription.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId: 'w1', billingStatus: { not: 'CANCELLED' }, domain: { status: 'ACTIVE' } } }));
    expect(m.prisma.mailBillingMailbox.findMany).not.toHaveBeenCalled();
  });
});
