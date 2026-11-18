import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const m = vi.hoisted(() => ({
  prisma: {
    mailBillingDomain: { findMany: vi.fn() },
    mailBillingSyncRun: { findFirst: vi.fn() },
    workspace: { findUnique: vi.fn() },
  },
  settings: vi.fn(), setup: vi.fn(), ensureClient: vi.fn(), createReview: vi.fn(), resolve: vi.fn(), freeTier: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: m.prisma }));
vi.mock('@/lib/email-billing/settings', () => ({ loadMailBillingSettings: m.settings }));
vi.mock('@/lib/email-billing/review', () => ({ createMailBillingReviewItem: m.createReview, resolveMailBillingReviewItems: m.resolve }));
vi.mock('@/lib/email-billing/bulk-setup', () => ({ ensureClientForDomain: m.ensureClient }));
vi.mock('@/lib/entitlements', () => ({ FREE_TIER_CLIENT_LIMIT: 5, shouldApplyFreeTierLimits: m.freeTier }));
vi.mock('@/lib/email-billing/setup', async (orig) => ({ ...(await orig<typeof import('@/lib/email-billing/setup')>()), setupDomainBilling: m.setup }));

import { AUTO_ONBOARD_MAX_PER_RUN, autoOnboardNewDomains } from '@/lib/email-billing/auto-onboard';
import { SetupBillingError } from '@/lib/email-billing/setup';

const NOW = new Date('2026-11-20T06:50:00.000Z');
const SINCE = new Date('2026-11-19T00:00:00.000Z');
const BASELINE = new Date('2026-11-19T01:00:00.000Z'); // the server's first successful sync finished
const on = (over: Row = {}) => ({ autoOnboardNewDomains: true, autoOnboardSince: SINCE, defaultPlanId: 'p1', autoOnboardEmailInvoices: false, autoOnboardTrialDays: 0, ...over });
const dom = (n: number, over: Row = {}) => ({ id: `d${n}`, domain: `new${n}.com`, clientId: null, serverId: 's1', discoveredAt: new Date('2026-11-19T12:00:00.000Z'), ...over });

beforeEach(() => {
  vi.clearAllMocks();
  m.setup.mockReset();
  m.createReview.mockReset();
  m.createReview.mockResolvedValue({ created: true });
  m.settings.mockResolvedValue(on());
  m.prisma.mailBillingDomain.findMany.mockResolvedValue([dom(1)]);
  m.prisma.mailBillingSyncRun.findFirst.mockResolvedValue({ finishedAt: BASELINE });
  m.prisma.workspace.findUnique.mockResolvedValue({ countryCode: 'IN', _count: { clients: 0 } });
  m.ensureClient.mockResolvedValue('cnew');
  m.setup.mockResolvedValue({ subscriptionId: 'sub1', retainerId: 'r1', firstBillingDate: new Date('2026-11-19T00:00:00Z') });
  m.freeTier.mockReturnValue(false);
});

describe('autoOnboardNewDomains', () => {
  it('does nothing unless switched on, without even looking at domains', async () => {
    m.settings.mockResolvedValue(on({ autoOnboardNewDomains: false }));
    expect(await autoOnboardNewDomains('w1', NOW)).toMatchObject({ status: 'OFF', onboarded: 0 });
    m.settings.mockResolvedValue(on({ autoOnboardSince: null }));
    expect((await autoOnboardNewDomains('w1', NOW)).status).toBe('OFF');
    expect(m.prisma.mailBillingDomain.findMany).not.toHaveBeenCalled();
  });

  it('asks for a default plan instead of guessing one', async () => {
    m.settings.mockResolvedValue(on({ defaultPlanId: null }));
    expect(await autoOnboardNewDomains('w1', NOW)).toMatchObject({ status: 'NEEDS_PLAN' });
    expect(m.createReview).toHaveBeenCalledWith(expect.objectContaining({ type: 'AUTO_ONBOARD_NEEDS_PLAN', workspaceId: 'w1' }));
    expect(m.setup).not.toHaveBeenCalled();
  });

  it('only considers served domains first seen after it was switched on, that nobody has started billing', async () => {
    await autoOnboardNewDomains('w1', NOW);
    expect(m.prisma.mailBillingDomain.findMany.mock.calls[0][0].where).toEqual({ workspaceId: 'w1', status: 'ACTIVE', discoveredAt: { gte: SINCE }, subscriptions: { none: {} } });
  });

  it('creates the customer, then sets billing up from the day the domain appeared, with the owner\'s email and trial choices', async () => {
    m.settings.mockResolvedValue(on({ autoOnboardTrialDays: 14, autoOnboardEmailInvoices: true }));
    const result = await autoOnboardNewDomains('w1', NOW);
    expect(result).toEqual({ status: 'DONE', onboarded: 1, failed: 0, candidates: 1 });
    expect(m.ensureClient).toHaveBeenCalledWith('w1', expect.objectContaining({ domain: 'new1.com' }), { countryCode: 'IN', _count: { clients: 0 }, });
    expect(m.setup).toHaveBeenCalledWith({ workspaceId: 'w1', userId: null, domainId: 'd1', planId: 'p1', clientId: 'cnew', startDate: new Date('2026-11-19T12:00:00.000Z'), trialDays: 14, emailInvoices: true, now: NOW });
    expect(m.createReview).toHaveBeenCalledWith(expect.objectContaining({ type: 'DOMAIN_AUTO_ONBOARDED', severity: 'INFO', domainId: 'd1', subscriptionId: 'sub1' }));
  });

  it('keeps a customer the owner already linked, and does not email invoices unless told to', async () => {
    m.prisma.mailBillingDomain.findMany.mockResolvedValue([dom(1, { clientId: 'cown' })]);
    await autoOnboardNewDomains('w1', NOW);
    expect(m.ensureClient).not.toHaveBeenCalled();
    expect(m.setup).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'cown', emailInvoices: false }));
  });

  it('never bills the existing base: domains from a server\'s first successful sync, or a server with no finished sync, are skipped', async () => {
    m.prisma.mailBillingDomain.findMany.mockResolvedValue([dom(1, { discoveredAt: new Date('2026-11-19T00:59:00.000Z') }), dom(2, { discoveredAt: new Date('2026-11-19T01:00:00.000Z') })]);
    expect(await autoOnboardNewDomains('w1', NOW)).toMatchObject({ onboarded: 0, candidates: 0 });
    m.prisma.mailBillingSyncRun.findFirst.mockResolvedValue(null);
    m.prisma.mailBillingDomain.findMany.mockResolvedValue([dom(3)]);
    expect(await autoOnboardNewDomains('w1', NOW)).toMatchObject({ onboarded: 0, candidates: 0 });
    expect(m.setup).not.toHaveBeenCalled();
  });

  it('checks each server\'s own baseline', async () => {
    m.prisma.mailBillingDomain.findMany.mockResolvedValue([dom(1, { serverId: 's1' }), dom(2, { serverId: 's2' })]);
    m.prisma.mailBillingSyncRun.findFirst.mockImplementation(async ({ where }: { where: Row }) => (where.serverId === 's1' ? { finishedAt: BASELINE } : null));
    const result = await autoOnboardNewDomains('w1', NOW);
    expect(result).toMatchObject({ onboarded: 1, candidates: 1 });
    expect(m.setup).toHaveBeenCalledWith(expect.objectContaining({ domainId: 'd1' }));
  });

  it('treats a sudden flood of domains as a re-import: nothing is set up, and the owner is told', async () => {
    m.prisma.mailBillingDomain.findMany.mockResolvedValue(Array.from({ length: AUTO_ONBOARD_MAX_PER_RUN + 1 }, (_, i) => dom(i)));
    const result = await autoOnboardNewDomains('w1', NOW);
    expect(result).toMatchObject({ status: 'TOO_MANY', onboarded: 0 });
    expect(m.setup).not.toHaveBeenCalled();
    expect(m.ensureClient).not.toHaveBeenCalled();
    expect(m.createReview).toHaveBeenCalledWith(expect.objectContaining({ type: 'AUTO_ONBOARD_TOO_MANY' }));
  });

  it('handles exactly the cap', async () => {
    m.prisma.mailBillingDomain.findMany.mockResolvedValue(Array.from({ length: AUTO_ONBOARD_MAX_PER_RUN }, (_, i) => dom(i)));
    expect(await autoOnboardNewDomains('w1', NOW)).toMatchObject({ status: 'DONE', onboarded: AUTO_ONBOARD_MAX_PER_RUN });
  });

  it('reports a domain it could not set up, carries on with the rest, and does not stop the run', async () => {
    m.prisma.mailBillingDomain.findMany.mockResolvedValue([dom(1), dom(2), dom(3)]);
    m.setup.mockRejectedValueOnce(new SetupBillingError('Billing is already set up for this domain.', 409));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    m.setup.mockRejectedValueOnce(new Error('db exploded'));
    const result = await autoOnboardNewDomains('w1', NOW);
    expect(result).toMatchObject({ onboarded: 1, failed: 2 });
    const failures = m.createReview.mock.calls.filter((c) => c[0].type === 'AUTO_ONBOARD_FAILED');
    expect(failures).toHaveLength(2);
    expect(failures[0][0].description).toBe('Billing is already set up for this domain.');
    expect(JSON.stringify(failures[1][0])).not.toContain('db exploded');
    spy.mockRestore();
  });

  it('respects the Free plan client limit', async () => {
    m.freeTier.mockReturnValue(true);
    m.prisma.workspace.findUnique.mockResolvedValue({ countryCode: 'IN', _count: { clients: 5 } });
    const result = await autoOnboardNewDomains('w1', NOW);
    expect(result).toMatchObject({ onboarded: 0, failed: 1 });
    expect(m.ensureClient).not.toHaveBeenCalled();
  });

  it('clears a stale "needs a default plan" warning once a plan is chosen', async () => {
    await autoOnboardNewDomains('w1', NOW);
    expect(m.resolve).toHaveBeenCalledWith('w1', { types: ['AUTO_ONBOARD_NEEDS_PLAN'] });
  });
});
