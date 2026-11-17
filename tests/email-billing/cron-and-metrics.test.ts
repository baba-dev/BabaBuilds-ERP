import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/email-billing/daily-run', () => ({ runEmailHostingDaily: m.run }));

import { GET } from '@/app/api/cron/email-hosting/route';
import { activeAt, churnRatePercent } from '@/lib/email-billing/metrics';

describe('GET /api/cron/email-hosting', () => {
  const OLD = process.env.CRON_SECRET;
  beforeEach(() => { process.env.CRON_SECRET = 'secret'; m.run.mockReset(); });
  afterEach(() => { process.env.CRON_SECRET = OLD; });

  it('rejects callers without the cron secret and does no work', async () => {
    expect((await GET(new Request('http://x/api/cron/email-hosting'))).status).toBe(401);
    expect((await GET(new Request('http://x/api/cron/email-hosting', { headers: { authorization: 'Bearer nope' } }))).status).toBe(401);
    expect(m.run).not.toHaveBeenCalled();
  });

  it('runs the daily job and reports per-workspace results', async () => {
    m.run.mockResolvedValue([{ workspaceId: 'w1' }, { workspaceId: 'w2', error: 'FAILED' }]);
    const res = await GET(new Request('http://x/api/cron/email-hosting', { headers: { authorization: 'Bearer secret' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ workspaces: 2, failed: 1 });
  });

  it('returns 500 without leaking details when the job itself throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    m.run.mockRejectedValue(new Error('secret db detail'));
    const res = await GET(new Request('http://x/api/cron/email-hosting', { headers: { authorization: 'Bearer secret' } }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret db detail');
    spy.mockRestore();
  });
});

describe('metrics helpers', () => {
  const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
  it('computes churn as a percentage of subscriptions active at the start, null when there were none', () => {
    expect(churnRatePercent(40, 2)).toBe(5);
    expect(churnRatePercent(3, 1)).toBe(33.3);
    expect(churnRatePercent(0, 0)).toBeNull();
  });
  it('counts a subscription as active between its start and its cancellation', () => {
    const subs = [
      { billingStatus: 'ACTIVE', startedAt: d('2026-01-01'), cancelledAt: null },
      { billingStatus: 'CANCELLED', startedAt: d('2026-01-01'), cancelledAt: d('2026-10-20') },
      { billingStatus: 'CANCELLED', startedAt: d('2026-01-01'), cancelledAt: d('2026-11-10') },
      { billingStatus: 'ACTIVE', startedAt: d('2026-11-05'), cancelledAt: null },
    ];
    expect(activeAt(subs, d('2026-10-18'))).toBe(3);
    expect(activeAt(subs, d('2026-11-17'))).toBe(2);
  });
});
