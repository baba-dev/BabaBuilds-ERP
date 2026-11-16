import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  companyGroupMember: { findFirst: vi.fn(), count: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  companyGroupMemberWorkspaceAccess: { updateMany: vi.fn() },
  companyGroupWorkspace: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  companyGroup: { update: vi.fn() },
  workspace: { update: vi.fn() },
  businessProfile: { update: vi.fn() },
  workspaceUser: { upsert: vi.fn() },
  $transaction: vi.fn(),
}));
const ctx = vi.hoisted(() => ({ value: { userId: 'u1', workspaceId: 'w1', companyGroupId: 'g1', groupRole: 'GROUP_OWNER', accessMode: 'ALL_COMPANIES' } }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('@/lib/security/activity-log', () => ({ logActivity: vi.fn() }));
vi.mock('@/lib/route-rate-limit', () => ({ enforceRouteRateLimit: () => ({ ok: true }) }));
vi.mock('@/app/api/companies/_shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/api/companies/_shared')>()),
  requireCompanyGroupContext: async () => ({ context: ctx.value }),
  requireMultiCompanyAccess: async () => null,
}));

import { DELETE, PATCH } from '@/app/api/companies/team/[memberId]/route';
import { PATCH as PATCH_COMPANY } from '@/app/api/companies/[id]/route';

const req = (body: unknown) => new Request('http://x', { method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const params = (memberId: string) => ({ params: Promise.resolve({ memberId }) });

beforeEach(() => {
  vi.clearAllMocks();
  ctx.value = { userId: 'u1', workspaceId: 'w1', companyGroupId: 'g1', groupRole: 'GROUP_OWNER', accessMode: 'ALL_COMPANIES' };
  db.companyGroupWorkspace.findMany.mockResolvedValue([]);
  db.$transaction.mockImplementation(async (arg: unknown) => (typeof arg === 'function' ? (arg as (tx: typeof db) => unknown)(db) : Promise.all(arg as unknown[])));
});

describe('team routes', () => {
  it('refuses to demote or remove the last owner', async () => {
    db.companyGroupMember.findFirst.mockResolvedValue({ id: 'm1', userId: 'u1', groupRole: 'GROUP_OWNER' });
    db.companyGroupMember.count.mockResolvedValue(0); // no other owner
    expect((await PATCH(req({ groupRole: 'MEMBER' }), params('m1'))).status).toBe(409);
    expect((await DELETE(req({}), params('m1'))).status).toBe(409);
  });
  it('lets an owner demote an owner when another owner remains', async () => {
    db.companyGroupMember.findFirst.mockResolvedValue({ id: 'm2', userId: 'u2', groupRole: 'GROUP_OWNER' });
    db.companyGroupMember.count.mockResolvedValue(1);
    expect((await PATCH(req({ groupRole: 'MEMBER' }), params('m2'))).status).toBe(200);
  });
  it('stops an admin from changing an owner or granting admin rights', async () => {
    ctx.value.groupRole = 'GROUP_ADMIN';
    db.companyGroupMember.findFirst.mockResolvedValue({ id: 'm1', userId: 'u1', groupRole: 'GROUP_OWNER' });
    expect((await PATCH(req({ accessMode: 'ALL_COMPANIES' }), params('m1'))).status).toBe(403);
    db.companyGroupMember.findFirst.mockResolvedValue({ id: 'm3', userId: 'u3', groupRole: 'MEMBER' });
    expect((await PATCH(req({ groupRole: 'GROUP_ADMIN' }), params('m3'))).status).toBe(403);
  });
  it('rejects unknown roles', async () => {
    db.companyGroupMember.findFirst.mockResolvedValue({ id: 'm3', userId: 'u3', groupRole: 'MEMBER' });
    expect((await PATCH(req({ groupRole: 'SUPERUSER' }), params('m3'))).status).toBe(422);
  });
});

describe('company update', () => {
  it('never writes plan or subscription fields from the request', async () => {
    db.companyGroupWorkspace.findFirst.mockResolvedValue({ id: 'l1', workspaceId: 'c1' });
    db.companyGroupMember.findMany.mockResolvedValue([]);
    db.companyGroupWorkspace.update.mockResolvedValue({});
    (db as unknown as { companyGroupWorkspace: { findUniqueOrThrow: ReturnType<typeof vi.fn> } }).companyGroupWorkspace.findUniqueOrThrow = vi.fn().mockResolvedValue({ id: 'l1' });
    const res = await PATCH_COMPANY(req({ name: 'New name', planTier: 'PRO', subscriptionStatus: 'PRO' }), { params: Promise.resolve({ id: 'c1' }) });
    expect(res.status).toBe(200);
    expect(db.companyGroup.update).not.toHaveBeenCalled();
    const data = db.workspace.update.mock.calls[0]![0].data as Record<string, unknown>;
    expect(data).toEqual({ name: 'New name' });
  });
  it('rejects someone who is not in the group', async () => {
    db.companyGroupWorkspace.findFirst.mockResolvedValue({ id: 'l1', workspaceId: 'c1' });
    db.companyGroupMember.findMany.mockResolvedValue([]); // nobody is a member
    const res = await PATCH_COMPANY(req({ users: [{ userId: 'stranger', businessRole: 'OWNER' }] }), { params: Promise.resolve({ id: 'c1' }) });
    expect(res.status).toBe(422);
    expect(db.workspaceUser.upsert).not.toHaveBeenCalled();
  });
});
