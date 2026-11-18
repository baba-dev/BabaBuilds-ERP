import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  prisma: { workspaceModule: { findMany: vi.fn() }, mailBillingServer: { findMany: vi.fn() } },
  settings: vi.fn(), onboard: vi.fn(), quota: vi.fn(), digest: vi.fn(), sync: vi.fn(), snapshots: vi.fn(), trials: vi.fn(), evaluate: vi.fn(), order: [] as string[],
}));

vi.mock('@/lib/prisma', () => ({ prisma: m.prisma }));
vi.mock('@/lib/email-billing/settings', () => ({ loadMailBillingSettings: m.settings }));
vi.mock('@/lib/email-billing/sync', () => ({ syncMailBillingServer: async (a: unknown) => { m.order.push('sync'); return m.sync(a); } }));
vi.mock('@/lib/email-billing/usage', () => ({ captureUsageSnapshots: async (a: unknown) => { m.order.push('snapshots'); return m.snapshots(a); } }));
vi.mock('@/lib/email-billing/lifecycle', () => ({ convertEndedTrials: async (a: unknown) => { m.order.push('trials'); return m.trials(a); } }));
vi.mock('@/lib/email-billing/auto-onboard', () => ({ autoOnboardNewDomains: async (...a: unknown[]) => { m.order.push('onboard'); return m.onboard(...a); } }));
vi.mock('@/lib/email-billing/quota', () => ({ syncQuotaAlerts: async (...a: unknown[]) => { m.order.push('quota'); return m.quota(...a); } }));
vi.mock('@/lib/email-billing/digest', () => ({ sendPaymentDigest: async (...a: unknown[]) => { m.order.push('digest'); return m.digest(...a); } }));
vi.mock('@/lib/email-billing/quantity', () => ({ evaluateSubscriptionQuantity: async (a: unknown) => { m.order.push('quantity'); return m.evaluate(a); } }));

import { runEmailHostingDaily, runEmailHostingDailyForWorkspace } from '@/lib/email-billing/daily-run';

const NOW = new Date('2026-11-17T06:50:00.000Z');
const base = { autoUpdateRetainerQuantities: false, ignoreAdminMailboxesFromBilling: false, usageBillingPolicy: 'LATEST', prorateIncreases: true, quotaAlertPercent: 90, paymentDigest: 'DAILY' };

describe('runEmailHostingDailyForWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.order.length = 0;
    m.trials.mockResolvedValue({ converted: 1, needsReview: 0, skipped: 0, failed: 0 });
    m.snapshots.mockResolvedValue([{ subscriptionId: 's1', billableMailboxCount: 4, mailboxCount: 4 }, { subscriptionId: 's2', billableMailboxCount: 1, mailboxCount: 1 }]);
    m.onboard.mockResolvedValue({ status: 'DONE', onboarded: 3, failed: 0, candidates: 3 });
    m.quota.mockResolvedValue(2);
    m.digest.mockResolvedValue('SENT');
    m.evaluate.mockResolvedValueOnce({ action: 'APPLY', toCount: 4 }).mockResolvedValueOnce({ action: 'REVIEW', toCount: 1 });
  });

  it('never syncs on a MANUAL preference, and runs snapshot -> trials -> quantity in order', async () => {
    m.settings.mockResolvedValue({ ...base, syncFrequencyPreference: 'MANUAL' });
    const stats = await runEmailHostingDailyForWorkspace('w1', NOW);
    expect(m.order).toEqual(['onboard', 'snapshots', 'trials', 'quantity', 'quantity', 'quota', 'digest']);
    expect(stats).toMatchObject({ snapshots: 2, quantityApplied: 1, quantityQueuedForReview: 1, serversSynced: 0, quotaAlerts: 2, digest: 'SENT', domainsOnboarded: 3 });
    expect(m.quota).toHaveBeenCalledWith('w1', 90);
  });

  it('syncs first on DAILY, but only servers not synced in the last ~20 hours, and survives a failing sync', async () => {
    m.settings.mockResolvedValue({ ...base, syncFrequencyPreference: 'DAILY' });
    m.prisma.mailBillingServer.findMany.mockResolvedValue([
      { id: 'fresh', lastSyncAt: new Date(NOW.getTime() - 2 * 3_600_000) },
      { id: 'stale', lastSyncAt: new Date(NOW.getTime() - 25 * 3_600_000) },
      { id: 'never', lastSyncAt: null },
    ]);
    m.sync.mockRejectedValueOnce(new Error('unreachable')).mockResolvedValueOnce({});
    const stats = await runEmailHostingDailyForWorkspace('w1', NOW);
    expect(m.sync.mock.calls.map((c) => (c[0] as { serverId: string }).serverId)).toEqual(['stale', 'never']);
    expect(stats).toMatchObject({ serversSynced: 1, serversFailed: 1 });
    expect(m.order.slice(0, 3)).toEqual(['sync', 'sync', 'onboard']);
    expect(m.order[3]).toBe('snapshots');
  });

  it('uses a longer interval for WEEKLY', async () => {
    m.settings.mockResolvedValue({ ...base, syncFrequencyPreference: 'WEEKLY' });
    m.prisma.mailBillingServer.findMany.mockResolvedValue([{ id: 'a', lastSyncAt: new Date(NOW.getTime() - 3 * 86_400_000) }, { id: 'b', lastSyncAt: new Date(NOW.getTime() - 7 * 86_400_000) }]);
    m.sync.mockResolvedValue({});
    await runEmailHostingDailyForWorkspace('w1', NOW);
    expect(m.sync.mock.calls.map((c) => (c[0] as { serverId: string }).serverId)).toEqual(['b']);
  });
});

describe('alerts and digest never undo the billing work', () => {
  it('keeps the billing results when the alert or digest step fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    m.order.length = 0;
    m.settings.mockResolvedValue({ ...base, syncFrequencyPreference: 'MANUAL' });
    m.snapshots.mockResolvedValue([{ subscriptionId: 's1', billableMailboxCount: 4, mailboxCount: 4 }]);
    m.trials.mockResolvedValue({ converted: 2, needsReview: 0, skipped: 0, failed: 0 });
    m.evaluate.mockReset();
    m.evaluate.mockResolvedValue({ action: 'APPLY', toCount: 4 });
    m.onboard.mockRejectedValue(new Error('plan limit'));
    m.quota.mockRejectedValue(new Error('db'));
    m.digest.mockRejectedValue(new Error('smtp'));
    const stats = await runEmailHostingDailyForWorkspace('w1', NOW);
    expect(stats).toMatchObject({ snapshots: 1, quantityApplied: 1, quotaAlerts: 0, digest: 'SKIPPED', domainsOnboarded: 0, trials: { converted: 2 } });
    expect(stats.error).toBeUndefined();
    spy.mockRestore();
  });
});

describe('runEmailHostingDaily', () => {
  beforeEach(() => { vi.clearAllMocks(); m.order.length = 0; });

  it('runs only for workspaces with the module enabled and isolates a failing workspace', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    m.prisma.workspaceModule.findMany.mockResolvedValue([{ workspaceId: 'bad' }, { workspaceId: 'good' }]);
    m.settings.mockRejectedValueOnce(new Error('boom')).mockResolvedValue({ ...base, syncFrequencyPreference: 'MANUAL' });
    m.snapshots.mockResolvedValue([]);
    m.trials.mockResolvedValue({ converted: 0, needsReview: 0, skipped: 0, failed: 0 });
    const results = await runEmailHostingDaily(NOW);
    expect(m.prisma.workspaceModule.findMany).toHaveBeenCalledWith({ where: { moduleKey: 'MIAB_BILLING', isEnabled: true }, select: { workspaceId: true } });
    expect(results.map((r) => [r.workspaceId, r.error ?? null])).toEqual([['bad', 'FAILED'], ['good', null]]);
    spy.mockRestore();
  });
});
