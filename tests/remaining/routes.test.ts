import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  customerReferralProfile: { findFirst: vi.fn(), update: vi.fn() },
  customerReferralRedemption: { findUnique: vi.fn(), create: vi.fn() },
  customerReferralReward: { create: vi.fn() },
  document: { findFirst: vi.fn(), update: vi.fn() },
  documentAuditEvent: { create: vi.fn() },
  $transaction: vi.fn(),
}));
const session = vi.hoisted(() => ({ value: { workspaceId: 'w1', user: { id: 'u1', email: 'a@b.co' } } as unknown }));
const perms = vi.hoisted(() => ({ granted: new Set<string>(), manageSettings: true }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('next-auth/next', () => ({ getServerSession: async () => session.value }));
vi.mock('next-auth', () => ({ getServerSession: async () => session.value }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/route-rate-limit', () => ({ enforceRouteRateLimit: () => ({ ok: true }) }));
vi.mock('@/lib/security/activity-log', () => ({ logActivity: vi.fn() }));
vi.mock('@/lib/modules', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/modules')>()), requireModule: async () => undefined, enableModule: vi.fn() }));
vi.mock('@/lib/banking/sync-primary-remittance-account', () => ({ syncPrimaryRemittanceBankAccount: vi.fn() }));
vi.mock('@/lib/rbac', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/rbac')>();
  return {
    ...real,
    checkPermissionSilent: async (_u: string, _w: string, p: string) => perms.granted.has(p),
    requirePermission: async () => { if (!perms.manageSettings) throw new real.RbacDeniedError('workspace.manage_settings' as never, 'u1', 'w1'); },
  };
});

import { POST as redeem } from '@/app/api/referrals/redeem/route';
import { POST as setup } from '@/app/api/setup/route';
import { PATCH as patchDocument } from '@/app/api/documents/[id]/route';

const json = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  vi.clearAllMocks();
  session.value = { workspaceId: 'w1', user: { id: 'u1', email: 'a@b.co' } };
  perms.granted = new Set(); perms.manageSettings = true;
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
});

describe('referral redemption', () => {
  it('ignores a caller-chosen reward and discount', async () => {
    db.customerReferralProfile.findFirst.mockResolvedValue({ id: 'p1', workspaceId: 'other', userId: 'referrer' });
    db.customerReferralRedemption.findUnique.mockResolvedValue(null);
    db.customerReferralRedemption.create.mockResolvedValue({ id: 'r1' });
    const res = await redeem(json({ code: 'abcde-12345', rewardType: 'FREE_MONTH', friendDiscountPercent: 100 }));
    expect(res.status).toBe(201);
    expect(db.customerReferralRedemption.create.mock.calls[0]![0].data.friendDiscountPercent).toBe(20);
    expect(db.customerReferralReward.create.mock.calls[0]![0].data).toMatchObject({ rewardType: 'WALLET_CREDIT', walletCreditAmount: 10, freeMonthsCount: null });
  });
  it('refuses your own code, including from another workspace you own', async () => {
    db.customerReferralProfile.findFirst.mockResolvedValue({ id: 'p1', workspaceId: 'other', userId: 'u1' });
    expect((await redeem(json({ code: 'ABCDE-12345' }))).status).toBe(400);
    expect(db.customerReferralRedemption.create).not.toHaveBeenCalled();
  });
  it('rejects a malformed code', async () => {
    expect((await redeem(json({ code: 'x' }))).status).toBe(400);
  });
});

describe('setup', () => {
  it('needs the manage-settings right', async () => {
    perms.manageSettings = false;
    const res = await setup(json({ companyName: 'Acme' }));
    expect(res.status).toBe(403);
  });
});

describe('document update', () => {
  const patch = (body: unknown) => patchDocument(new Request('http://x', { method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }), { params: Promise.resolve({ id: 'd1' }) });
  it('needs the archive right to archive and the manage right to rename', async () => {
    db.document.findFirst.mockResolvedValue({ id: 'd1', isArchived: false });
    db.document.update.mockResolvedValue({ id: 'd1' });
    expect((await patch({ archived: true })).status).toBe(403);
    expect((await patch({ title: 'New' })).status).toBe(403);
    perms.granted = new Set(['documents.archive']);
    expect((await patch({ archived: true })).status).toBe(200);
    expect(db.document.update.mock.calls[0]![0].data).toMatchObject({ isArchived: true, status: 'ARCHIVED' });
  });
  it('is workspace-scoped and validates input', async () => {
    perms.granted = new Set(['documents.manage']);
    db.document.findFirst.mockResolvedValue(null);
    expect((await patch({ title: 'New' })).status).toBe(404);
    expect(db.document.findFirst.mock.calls[0]![0].where).toEqual({ id: 'd1', workspaceId: 'w1' });
    expect((await patch({ category: 'NOPE' })).status).toBe(422);
    expect((await patch({})).status).toBe(422);
  });
});
