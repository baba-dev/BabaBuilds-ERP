import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  admin: vi.fn(), limit: vi.fn(), tx: vi.fn(), find: vi.fn(),
  change: vi.fn(), audit: vi.fn(), handle: vi.fn(),
}));
vi.mock('@/app/api/admin/authz', () => ({
  verifySuperAdmin: m.admin,
  handleAdminApiError: m.handle,
}));
vi.mock('@/lib/route-rate-limit', () => ({ enforceRouteRateLimit: m.limit }));
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: m.tx } }));

import { POST } from '@/app/api/admin/jobs/deliveries/[id]/route';

const id = 'cmdeliveryrecovery0001';
const now = Date.now();
const row = {
  id, workspaceId: 'cmphase5reportinternal001', channel: 'REPORT_EMAIL',
  eventKind: 'scheduled_report_email_v1', status: 'FAILED',
  externalAttemptedAt: null, attempts: 1,
  leaseExpiresAt: new Date(now - 1000),
};
function request(action: string, evidence?: string) {
  return new Request('https://erp.example.invalid/api/admin/jobs/deliveries/' + id, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action, reason: 'Operator verified state with upstream evidence.',
      confirmation: 'CONFIRM_' + action.toUpperCase().replace(/-/g, '_') + '_' + id,
      ...(evidence ? { providerEvidence: evidence } : {}),
    }),
  });
}
const ctx = { params: Promise.resolve({ id }) };

describe('Phase 5 F superadmin audit and strictly pre-send replay', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.admin.mockResolvedValue({ userId: 'cmadminowner000001', email: 'admin@example.invalid' });
    m.limit.mockResolvedValue({ ok: true });
    m.find.mockResolvedValue(row);
    m.change.mockResolvedValue({ count: 1 });
    m.audit.mockResolvedValue({ id: 'auditid00001' });
    m.tx.mockImplementation((fn: (client: unknown) => unknown) => fn({
      erpJobDelivery: { findUnique: m.find, updateMany: m.change },
      appActivityLog: { create: m.audit },
    }));
    m.handle.mockReturnValue(Response.json({ code: 'UNAUTHORIZED' }, { status: 401 }));
  });

  it('permits confirmed pre-send failure only and atomically records audit', async () => {
    const response = await POST(request('retry-pre-send'), ctx);
    expect(response.status).toBe(200);
    expect(m.change.mock.calls[0][0].data.status).toBe('PENDING');
    expect(m.change.mock.calls[0][0].where.externalAttemptedAt).toBeNull();
    expect(m.audit).toHaveBeenCalledOnce();
    const data = m.audit.mock.calls[0][0].data;
    expect(data.action).toBe('erp.job_delivery.retry-pre-send');
    expect(JSON.stringify(data.metadata)).not.toContain('Operator verified state');
  });

  it('never retries an ambiguous external side effect', async () => {
    m.find.mockResolvedValue({ ...row, status: 'UNCERTAIN', externalAttemptedAt: new Date() });
    const response = await POST(request('retry-pre-send'), ctx);
    expect(response.status).toBe(409);
    expect(m.change).not.toHaveBeenCalled();
  });

  it('only adjudicates UNCERTAIN with explicit receipt and confirmation', async () => {
    m.find.mockResolvedValue({ ...row, status: 'UNCERTAIN', externalAttemptedAt: new Date() });
    const response = await POST(request('confirm-accepted', 'provider-verified-id-000123'), ctx);
    expect(response.status).toBe(200);
    expect(m.change.mock.calls[0][0].data.status).toBe('PROVIDER_ACCEPTED');
    const data = m.audit.mock.calls[0][0].data;
    expect(data.metadata.evidenceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(data)).not.toContain('provider-verified-id-000123');
  });

  it('refuses a claimed delivery before lease expiry', async () => {
    m.find.mockResolvedValue({ ...row, status: 'CLAIMED', leaseExpiresAt: new Date(now + 60000) });
    const response = await POST(request('retry-pre-send'), ctx);
    expect(response.status).toBe(409);
  });

  it('never touches the ledger for an unauthenticated user', async () => {
    m.admin.mockRejectedValue(new Error('NO_SESSION'));
    const response = await POST(request('retry-pre-send'), ctx);
    expect(response.status).toBe(401);
    expect(m.tx).not.toHaveBeenCalled();
  });
});
