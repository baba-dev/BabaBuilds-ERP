import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const m = vi.hoisted(() => ({
  guard: vi.fn(), request: vi.fn(), rate: vi.fn(), cancel: vi.fn(), process: vi.fn(),
  prisma: { mailOperation: { findMany: vi.fn() }, mailBillingServer: { findFirst: vi.fn(), update: vi.fn() } },
  version: vi.fn(), log: vi.fn(),
}));

vi.mock('@/app/api/email-billing/_lib/auth', () => ({ requireEmailBilling: m.guard }));
vi.mock('@/lib/route-rate-limit', () => ({ enforceRouteRateLimit: m.rate }));
vi.mock('@/lib/prisma', () => ({ prisma: m.prisma }));
vi.mock('@/lib/encryption', () => ({ encrypt: (v: string) => `enc:${v}`, decrypt: (v: string) => v.replace(/^enc:/, '') }));
vi.mock('@/lib/security/activity-log', () => ({ logActivity: m.log }));
vi.mock('@/lib/email-billing/miab/writes', () => ({ miabReadVersion: m.version, MiabApiError: class extends Error { constructor(msg: string, readonly status: number) { super(msg); } } }));
vi.mock('@/lib/email-billing/ops/service', async (orig) => ({ ...(await orig<typeof import('@/lib/email-billing/ops/service')>()), requestOperation: m.request, cancelOperation: m.cancel, processDueOperations: m.process }));

import { GET, POST } from '@/app/api/email-billing/operations/route';
import { POST as CANCEL } from '@/app/api/email-billing/operations/[id]/cancel/route';
import { PATCH as PATCH_SERVER } from '@/app/api/email-billing/servers/[id]/route';
import { GET as CRON } from '@/app/api/cron/email-hosting-operations/route';
import { OperationError } from '@/lib/email-billing/ops/service';

const ok = { userId: 'u1', workspaceId: 'w1' };
const json = (body: unknown, url = 'http://x/api/email-billing/operations') => new NextRequest(url, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const denied = () => ({ response: NextResponse.json({ error: 'denied' }, { status: 403 }) });

beforeEach(() => {
  vi.clearAllMocks();
  m.guard.mockResolvedValue(ok);
  m.rate.mockResolvedValue({ ok: true });
  m.request.mockResolvedValue({ operation: { id: 'op1', status: 'SUCCEEDED' } });
});

describe('POST /api/email-billing/operations', () => {
  it('needs the operate permission and does nothing otherwise', async () => {
    m.guard.mockResolvedValue(denied());
    const res = await POST(json({ type: 'QUOTA_SET', mailboxId: 'a', quotaMb: 1 }));
    expect(res.status).toBe(403);
    expect(m.guard).toHaveBeenCalledWith('operate');
    expect(m.request).not.toHaveBeenCalled();
  });

  it('is rate limited per workspace', async () => {
    m.rate.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'slow down' }, { status: 429 }) });
    expect((await POST(json({ type: 'QUOTA_SET', mailboxId: 'a', quotaMb: 1 }))).status).toBe(429);
    expect(m.request).not.toHaveBeenCalled();
  });

  it('rejects unknown types and malformed bodies with 400 before touching anything', async () => {
    for (const body of [{}, { type: 'DROP_ALL' }, { type: 'QUOTA_SET', mailboxId: 'a', quotaMb: -5 }, { type: 'ALIAS_ADD', domainId: 'd', address: 'not-an-email', forwardsTo: [] }, { type: 'MAILBOX_DELETE', mailboxId: 'a' }]) {
      expect((await POST(json(body))).status).toBe(400);
    }
    expect(m.request).not.toHaveBeenCalled();
  });

  it('requires the server-admin permission on top for deletes, and not for other operations', async () => {
    await POST(json({ type: 'QUOTA_SET', mailboxId: 'a', quotaMb: 1 }));
    expect(m.guard.mock.calls.map((c) => c[0])).toEqual(['operate']);

    m.guard.mockReset();
    m.request.mockClear();
    m.guard.mockResolvedValueOnce(ok).mockResolvedValueOnce(denied());
    const res = await POST(json({ type: 'MAILBOX_DELETE', mailboxId: 'a', confirmEmail: 'a@x.com' }));
    expect(res.status).toBe(403);
    expect(m.guard.mock.calls.map((c) => c[0])).toEqual(['operate', 'admin']);
    expect(m.request).not.toHaveBeenCalled();
  });

  it('also requires the server-admin permission to add a new domain, but not to add a mailbox to an existing one', async () => {
    m.guard.mockReset();
    m.guard.mockResolvedValue(ok);
    await POST(json({ type: 'MAILBOX_CREATE', email: 'a@x.com' }));
    expect(m.guard.mock.calls.map((c) => c[0])).toEqual(['operate']);
    m.guard.mockReset();
    m.request.mockClear();
    m.guard.mockResolvedValueOnce(ok).mockResolvedValueOnce(denied());
    const res = await POST(json({ type: 'MAILBOX_CREATE', email: 'a@new.com', newDomain: true, serverId: 'sv1' }));
    expect(res.status).toBe(403);
    expect(m.guard.mock.calls.map((c) => c[0])).toEqual(['operate', 'admin']);
    expect(m.request).not.toHaveBeenCalled();
  });

  it('returns the one-time password with no-store, and applies the schema default delete window', async () => {
    m.request.mockResolvedValue({ operation: { id: 'op1', status: 'SUCCEEDED' }, secret: { password: 'Pw-once' } });
    const res = await POST(json({ type: 'MAILBOX_CREATE', email: 'New@X.com' }));
    expect(res.status).toBe(201);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toMatchObject({ secret: { password: 'Pw-once' } });
    expect(m.request.mock.calls[0][0].input).toMatchObject({ email: 'new@x.com' });

    await POST(json({ type: 'MAILBOX_DELETE', mailboxId: 'a', confirmEmail: 'a@x.com' }));
    expect(m.request.mock.calls[1][0].input.delayDays).toBe(7);
  });

  it('maps rule violations to their status, a failed operation to 422, and hides unexpected errors', async () => {
    m.request.mockRejectedValueOnce(new OperationError('Write operations are not enabled for this server.', 409));
    expect((await POST(json({ type: 'QUOTA_SET', mailboxId: 'a', quotaMb: 1 }))).status).toBe(409);
    m.request.mockResolvedValueOnce({ operation: { id: 'op2', status: 'FAILED', errorMessage: 'invalid quota' } });
    expect((await POST(json({ type: 'QUOTA_SET', mailboxId: 'a', quotaMb: 1 }))).status).toBe(422);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    m.request.mockRejectedValueOnce(new Error('db password=hunter2'));
    const res = await POST(json({ type: 'QUOTA_SET', mailboxId: 'a', quotaMb: 1 }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('hunter2');
    spy.mockRestore();
  });
});

describe('GET /api/email-billing/operations', () => {
  it('lists only this workspace\'s operations', async () => {
    m.prisma.mailOperation.findMany.mockResolvedValue([]);
    await GET(new NextRequest('http://x/api/email-billing/operations?status=FAILED&mailboxId=mb1'));
    expect(m.guard).toHaveBeenCalledWith('view');
    expect(m.prisma.mailOperation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId: 'w1', status: 'FAILED', mailboxId: 'mb1' } }));
  });
});

describe('cancel route', () => {
  it('cancels within the workspace and reports rule errors', async () => {
    m.cancel.mockResolvedValueOnce({ id: 'op1', status: 'CANCELLED' });
    const res = await CANCEL(new Request('http://x'), { params: Promise.resolve({ id: 'op1' }) });
    expect(await res.json()).toEqual({ operation: { id: 'op1', status: 'CANCELLED' } });
    expect(m.cancel).toHaveBeenCalledWith({ workspaceId: 'w1', operationId: 'op1', userId: 'u1' });
    m.cancel.mockRejectedValueOnce(new OperationError('Only a waiting operation can be cancelled.', 409));
    expect((await CANCEL(new Request('http://x'), { params: Promise.resolve({ id: 'op1' }) })).status).toBe(409);
  });
});

describe('enabling writes on a server', () => {
  const patch = (body: unknown) => PATCH_SERVER(new NextRequest('http://x', { method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }), { params: Promise.resolve({ id: 'sv1' }) });
  const server = (over: Record<string, unknown> = {}) => ({ id: 'sv1', name: 'Box', provider: 'MIAB', accessMode: 'MANAGED_API', baseUrl: 'https://box.example.com', encryptedToken: 'enc:root@box.example.com:pw', status: 'ACTIVE', writesEnabled: false, miabVersion: null, lastSyncAt: null, lastSyncStatus: null, lastSyncError: null, ...over });

  beforeEach(() => {
    m.prisma.mailBillingServer.findFirst.mockResolvedValue(server());
    m.prisma.mailBillingServer.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => server(data));
  });

  it('requires the server-admin permission', async () => {
    m.guard.mockResolvedValue(denied());
    expect((await patch({ writesEnabled: true })).status).toBe(403);
    expect(m.guard).toHaveBeenCalledWith('admin');
  });

  it('proves the credential on the box first and records the version', async () => {
    m.version.mockResolvedValue('v70');
    const res = await patch({ writesEnabled: true });
    expect(res.status).toBe(200);
    expect(m.version).toHaveBeenCalledWith({ baseUrl: 'https://box.example.com', token: 'root@box.example.com:pw' });
    expect(m.prisma.mailBillingServer.update).toHaveBeenCalledWith({ where: { id: 'sv1' }, data: expect.objectContaining({ writesEnabled: true, miabVersion: 'v70' }) });
    expect(JSON.stringify(await res.json())).not.toContain('pw');
  });

  it('refuses when the box rejects the credential, or the server is not in managed mode, or has no credential', async () => {
    m.version.mockRejectedValueOnce(Object.assign(new Error('Mail server returned 401'), { status: 401 }));
    // Plain Error is reported generically; only the typed API error text is passed through.
    expect((await patch({ writesEnabled: true })).status).toBe(400);
    expect(m.prisma.mailBillingServer.update).not.toHaveBeenCalled();
    m.prisma.mailBillingServer.findFirst.mockResolvedValue(server({ accessMode: 'DIRECT_MIAB_API' }));
    expect((await patch({ writesEnabled: true })).status).toBe(400);
    m.prisma.mailBillingServer.findFirst.mockResolvedValue(server({ encryptedToken: null }));
    expect((await patch({ writesEnabled: true })).status).toBe(400);
    expect(m.version).toHaveBeenCalledTimes(1);
  });

  it('switches writes off whenever the address, mode or credential changes', async () => {
    m.prisma.mailBillingServer.findFirst.mockResolvedValue(server({ writesEnabled: true }));
    await patch({ baseUrl: 'https://other.example.com' });
    expect(m.prisma.mailBillingServer.update).toHaveBeenLastCalledWith({ where: { id: 'sv1' }, data: expect.objectContaining({ writesEnabled: false }) });
    await patch({ token: 'new@box.example.com:pw2' });
    expect(m.prisma.mailBillingServer.update).toHaveBeenLastCalledWith({ where: { id: 'sv1' }, data: expect.objectContaining({ writesEnabled: false }) });
    await patch({ name: 'Renamed' });
    expect(m.prisma.mailBillingServer.update.mock.calls.at(-1)![0].data).not.toHaveProperty('writesEnabled');
  });
});

describe('GET /api/cron/email-hosting-operations', () => {
  it('requires the cron secret', async () => {
    process.env.CRON_SECRET = 's';
    expect((await CRON(new Request('http://x'))).status).toBe(401);
    m.process.mockResolvedValue({ ran: 1 });
    const res = await CRON(new Request('http://x', { headers: { authorization: 'Bearer s' } }));
    expect(await res.json()).toEqual({ ran: 1 });
  });
});
