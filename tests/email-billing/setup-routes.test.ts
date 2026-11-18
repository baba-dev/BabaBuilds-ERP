import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const m = vi.hoisted(() => ({
  guard: vi.fn(), perms: vi.fn(), rate: vi.fn(), setup: vi.fn(), preview: vi.fn(), apply: vi.fn(), createClient: vi.fn(),
  prisma: { workspace: { findUnique: vi.fn() } },
}));

vi.mock('@/app/api/email-billing/_lib/auth', () => ({ requireEmailBilling: m.guard }));
vi.mock('@/lib/rbac', () => ({ checkPermissionsSilent: m.perms }));
vi.mock('@/lib/route-rate-limit', () => ({ enforceRouteRateLimit: m.rate }));
vi.mock('@/lib/prisma', () => ({ prisma: m.prisma }));
vi.mock('@/lib/clients/service', () => ({ createClient: m.createClient }));
vi.mock('@/lib/email-billing/setup', async (orig) => ({ ...(await orig<typeof import('@/lib/email-billing/setup')>()), setupDomainBilling: m.setup }));
vi.mock('@/lib/email-billing/bulk-setup', () => ({ previewBulkSetup: m.preview, runBulkSetup: m.apply }));

import { POST as SETUP } from '@/app/api/email-billing/domains/[id]/setup-billing/route';
import { POST as BULK } from '@/app/api/email-billing/billing/bulk-setup/route';
import { SetupBillingError } from '@/lib/email-billing/setup';

const ok = { userId: 'u1', workspaceId: 'w1', session: { user: { email: 'o@x.com', name: 'Owner' } } };
const post = (url: string, body: unknown) => new NextRequest(url, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const setup = (body: unknown) => SETUP(post('http://x/api/email-billing/domains/d1/setup-billing', body), { params: Promise.resolve({ id: 'd1' }) });
const bulk = (body: unknown) => BULK(post('http://x/api/email-billing/billing/bulk-setup', body));

beforeEach(() => {
  vi.clearAllMocks();
  m.guard.mockResolvedValue(ok);
  m.perms.mockResolvedValue({ 'clients.manage': true });
  m.rate.mockResolvedValue({ ok: true });
  m.setup.mockResolvedValue({ subscriptionId: 's1', retainerId: 'r1', status: 'ACTIVE' });
  m.prisma.workspace.findUnique.mockResolvedValue({ countryCode: 'IN' });
});

describe('POST /domains/:id/setup-billing', () => {
  it('needs billing permission (or the old invoices.create one)', async () => {
    m.guard.mockResolvedValue({ response: NextResponse.json({ error: 'denied' }, { status: 403 }) });
    expect((await setup({ planId: 'p1', clientId: 'c1' })).status).toBe(403);
    expect(m.guard).toHaveBeenCalledWith('billing', { legacy: 'invoices.create' });
    expect(m.setup).not.toHaveBeenCalled();
  });

  it('needs exactly one of an existing client or a new one, and valid dates', async () => {
    for (const body of [{ planId: 'p1' }, { planId: 'p1', clientId: 'c1', newClient: { name: 'X' } }, { clientId: 'c1' }, { planId: 'p1', clientId: 'c1', startDate: 'soon' }, { planId: 'p1', clientId: 'c1', trialDays: 999 }]) {
      expect((await setup(body)).status).toBe(400);
    }
    expect(m.setup).not.toHaveBeenCalled();
  });

  it('sets up billing for an existing client with the issue date', async () => {
    const res = await setup({ planId: 'p1', clientId: 'c1', startDate: '2025-03-10', emailInvoices: true });
    expect(res.status).toBe(201);
    expect(m.setup).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'w1', domainId: 'd1', planId: 'p1', clientId: 'c1', startDate: new Date('2025-03-10'), emailInvoices: true }));
    expect(m.createClient).not.toHaveBeenCalled();
  });

  it('creates a new client only for people allowed to manage clients, and reports a duplicate instead of making one', async () => {
    m.perms.mockResolvedValue({ 'clients.manage': false });
    expect((await setup({ planId: 'p1', newClient: { name: 'Acme' } })).status).toBe(403);
    expect(m.createClient).not.toHaveBeenCalled();

    m.perms.mockResolvedValue({ 'clients.manage': true });
    m.createClient.mockResolvedValueOnce({ ok: false, status: 409, code: 'CLIENT_DUPLICATE', message: 'Acme looks like the same client.', extra: { existing: [{ id: 'c9', name: 'Acme' }] } });
    const dup = await setup({ planId: 'p1', newClient: { name: 'Acme' } });
    expect(dup.status).toBe(409);
    expect(await dup.json()).toMatchObject({ code: 'CLIENT_DUPLICATE', existing: [{ id: 'c9' }] });
    expect(m.setup).not.toHaveBeenCalled();

    m.createClient.mockResolvedValueOnce({ ok: true, client: { id: 'cnew' } });
    expect((await setup({ planId: 'p1', newClient: { name: 'Acme', email: 'a@acme.com' } })).status).toBe(201);
    expect(m.createClient.mock.calls[1][1]).toMatchObject({ name: 'Acme', email: 'a@acme.com', countryCode: 'IN' });
    expect(m.setup).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'cnew' }));
  });

  it('maps rule errors to their status and hides unexpected ones', async () => {
    m.setup.mockRejectedValueOnce(new SetupBillingError('Billing is already set up for this domain.', 409));
    expect((await setup({ planId: 'p1', clientId: 'c1' })).status).toBe(409);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    m.setup.mockRejectedValueOnce(new Error('connection string postgres://secret'));
    const res = await setup({ planId: 'p1', clientId: 'c1' });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret');
    spy.mockRestore();
  });
});

describe('POST /billing/bulk-setup', () => {
  const body = { mode: 'preview', planId: 'p1', startDateSource: 'DISCOVERED' };

  it('previews without a rate limit and applies with one', async () => {
    m.preview.mockResolvedValue({ eligible: 3 });
    expect(await (await bulk(body)).json()).toEqual({ preview: { eligible: 3 } });
    expect(m.rate).not.toHaveBeenCalled();
    m.apply.mockResolvedValue({ processed: 3 });
    expect(await (await bulk({ ...body, mode: 'apply' })).json()).toEqual({ applied: { processed: 3 } });
    expect(m.rate).toHaveBeenCalledTimes(1);
    m.rate.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'slow' }, { status: 429 }) });
    expect((await bulk({ ...body, mode: 'apply' })).status).toBe(429);
  });

  it('defaults to not creating clients and not emailing invoices', async () => {
    m.preview.mockResolvedValue({});
    await bulk(body);
    expect(m.preview).toHaveBeenCalledWith(expect.objectContaining({ createClients: false, emailInvoices: false }));
  });

  it('validates the start date choice and the plan', async () => {
    expect((await bulk({ ...body, startDateSource: 'DATE' })).status).toBe(400);
    expect((await bulk({ ...body, planId: '' })).status).toBe(400);
    expect((await bulk({ mode: 'delete', planId: 'p1', startDateSource: 'DISCOVERED' })).status).toBe(400);
  });

  it('only lets people who can manage clients create them in bulk', async () => {
    m.perms.mockResolvedValue({ 'clients.manage': false });
    expect((await bulk({ ...body, createClients: true })).status).toBe(403);
    expect(m.preview).not.toHaveBeenCalled();
  });

  it('reports rule errors such as the Free plan client limit', async () => {
    m.apply.mockRejectedValue(new SetupBillingError('over the limit', 403));
    const res = await bulk({ ...body, mode: 'apply' });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'over the limit' });
  });
});
