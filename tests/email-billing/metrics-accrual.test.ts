import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  prisma: {
    workspace: { findUnique: vi.fn() },
    mailBillingSubscription: { findMany: vi.fn() },
    mailUsageSnapshot: { findFirst: vi.fn(), aggregate: vi.fn() },
  },
  settings: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: m.prisma }));
vi.mock('@/lib/email-billing/settings', () => ({ loadMailBillingSettings: m.settings }));

import { computeEmailHostingMetrics } from '@/lib/email-billing/metrics';

const sub = (over: Record<string, unknown> = {}) => ({
  billingStatus: 'ACTIVE', startedAt: new Date('2026-01-01'), cancelledAt: null, currencySnapshot: 'INR', basePriceSnapshot: 100,
  plan: { frequency: 'MONTHLY' }, domain: { domain: 'a.com', mailboxCount: 5 }, retainer: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.prisma.workspace.findUnique.mockResolvedValue({ baseCurrency: 'INR' });
  m.prisma.mailUsageSnapshot.findFirst.mockResolvedValue(null);
});

describe('metrics in accrual billing', () => {
  it('reports the monthly run-rate: live addresses times each plan price per month', async () => {
    m.settings.mockResolvedValue({ billingModel: 'ACCRUAL' });
    m.prisma.mailBillingSubscription.findMany.mockResolvedValue([
      sub(), // 5 x 100
      sub({ domain: { domain: 'b.com', mailboxCount: 2 }, basePriceSnapshot: 1200, plan: { frequency: 'ANNUALLY' } }), // 2 x 100 per month
      sub({ billingStatus: 'CANCELLED', domain: { domain: 'c.com', mailboxCount: 9 } }), // cancelled: not counted
      sub({ currencySnapshot: 'USD', basePriceSnapshot: 2, domain: { domain: 'd.com', mailboxCount: 9 } }), // other currency: not summed into INR
    ]);
    const metrics = await computeEmailHostingMetrics('w1', new Date('2026-11-18T00:00:00Z'));
    expect(metrics.billingModel).toBe('ACCRUAL');
    expect(metrics.mrr).toBe(700);
    expect(metrics.pipelineMrr).toBe(0);
    expect(metrics.subscriptions).toMatchObject({ cancelled: 1, trialing: 0 });
  });

  it('keeps the retainer based figure in recurring mode', async () => {
    m.settings.mockResolvedValue({ billingModel: 'RECURRING' });
    m.prisma.mailBillingSubscription.findMany.mockResolvedValue([
      sub({ retainer: { status: 'ACTIVE', frequency: 'MONTHLY', exchangeRate: 1, items: [{ quantity: 3, unitPrice: 100, taxRate: 0 }] } }),
    ]);
    const metrics = await computeEmailHostingMetrics('w1', new Date('2026-11-18T00:00:00Z'));
    expect(metrics.billingModel).toBe('RECURRING');
    expect(metrics.mrr).toBe(300);
  });
});
