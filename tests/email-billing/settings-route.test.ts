import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => ({
  guard: vi.fn(), audit: vi.fn(),
  prisma: { mailBillingSettings: { findUnique: vi.fn(), upsert: vi.fn() }, mailBillingPlan: { findFirst: vi.fn() } },
}));
vi.mock('@/app/api/email-billing/_lib/auth', () => ({ requireEmailBilling: m.guard }));
vi.mock('@/app/api/email-billing/_lib/audit', () => ({ auditEmailBilling: m.audit }));
vi.mock('@/lib/prisma', () => ({ prisma: m.prisma }));

import { PATCH } from '@/app/api/email-billing/settings/route';

const patch = (body: Record<string, unknown>) => PATCH(new NextRequest('http://x/api/email-billing/settings', { method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
const upsertArgs = () => m.prisma.mailBillingSettings.upsert.mock.calls.at(-1)![0];

beforeEach(() => {
  vi.clearAllMocks();
  m.guard.mockResolvedValue({ userId: 'u1', workspaceId: 'w1' });
  m.prisma.mailBillingPlan.findFirst.mockResolvedValue({ id: 'p1' });
  m.prisma.mailBillingSettings.findUnique.mockResolvedValue({ allowMailboxManagement: false, autoOnboardNewDomains: false });
  m.prisma.mailBillingSettings.upsert.mockImplementation(async ({ update }: { update: Record<string, unknown> }) => ({ id: 'set1', ...update }));
});

describe('PATCH /settings: write gate and automatic onboarding', () => {
  it('needs the server-admin permission', async () => {
    await patch({ defaultPlanId: 'p1' });
    expect(m.guard).toHaveBeenCalledWith('admin');
  });

  it('records when automatic onboarding was switched on, and refuses without a default plan', async () => {
    expect((await patch({ autoOnboardNewDomains: true })).status).toBe(400);
    expect(m.prisma.mailBillingSettings.upsert).not.toHaveBeenCalled();

    const res = await patch({ autoOnboardNewDomains: true, defaultPlanId: 'p1' });
    expect(res.status).toBe(200);
    expect(upsertArgs().update.autoOnboardSince).toBeInstanceOf(Date);
    expect(upsertArgs().create.autoOnboardSince).toBeInstanceOf(Date);
    expect(m.audit).toHaveBeenCalledWith(expect.anything(), 'auto_onboard_enabled', expect.anything(), {}, expect.anything());
  });

  it('keeps the original cut-off when it is already on, so saving other settings never widens it', async () => {
    m.prisma.mailBillingSettings.findUnique.mockResolvedValue({ allowMailboxManagement: false, autoOnboardNewDomains: true });
    await patch({ autoOnboardNewDomains: true, defaultPlanId: 'p1', paymentDigest: 'WEEKLY' });
    expect(upsertArgs().update).not.toHaveProperty('autoOnboardSince');
    expect(m.audit).not.toHaveBeenCalledWith(expect.anything(), 'auto_onboard_enabled', expect.anything(), expect.anything(), expect.anything());
  });

  it('starts a fresh cut-off if it is turned off and on again, and audits turning it off', async () => {
    m.prisma.mailBillingSettings.findUnique.mockResolvedValue({ allowMailboxManagement: false, autoOnboardNewDomains: true });
    await patch({ autoOnboardNewDomains: false, defaultPlanId: 'p1' });
    expect(m.audit).toHaveBeenCalledWith(expect.anything(), 'auto_onboard_disabled', expect.anything(), {}, expect.anything());
    m.prisma.mailBillingSettings.findUnique.mockResolvedValue({ allowMailboxManagement: false, autoOnboardNewDomains: false });
    await patch({ autoOnboardNewDomains: true, defaultPlanId: 'p1' });
    expect(upsertArgs().update.autoOnboardSince).toBeInstanceOf(Date);
  });

  it('audits turning mailbox management on and off, and only on a real change', async () => {
    await patch({ allowMailboxManagement: true, defaultPlanId: 'p1' });
    expect(m.audit).toHaveBeenCalledWith(expect.anything(), 'mailbox_management_enabled', expect.anything(), {}, expect.anything());
    m.audit.mockClear();
    await patch({ allowMailboxManagement: false, defaultPlanId: 'p1' });
    expect(m.audit).not.toHaveBeenCalledWith(expect.anything(), 'mailbox_management_disabled', expect.anything(), expect.anything(), expect.anything());
  });

  it('validates the new fields', async () => {
    expect((await patch({ defaultPlanId: 'p1', autoOnboardTrialDays: 999 })).status).toBe(400);
    expect((await patch({ defaultPlanId: 'p1', autoOnboardNewDomains: 'yes' })).status).toBe(400);
    expect((await patch({ defaultPlanId: 'p1', quotaAlertPercent: 150 })).status).toBe(400);
    expect((await patch({ defaultPlanId: 'p1', paymentDigest: 'HOURLY' })).status).toBe(400);
  });
});
