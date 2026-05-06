import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSessionMock = vi.fn();
const requirePermissionMock = vi.fn();
const verifySuperAdminMock = vi.fn();
const taxAdvancedModuleDisabledResponseMock = vi.fn();

vi.mock('next-auth/next', () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock('@/lib/auth', () => ({ authOptions: {} }));

vi.mock('@/app/api/admin/authz', () => ({
  verifySuperAdmin: verifySuperAdminMock,
  handleAdminApiError: (error: unknown) => {
    throw error;
  },
}));

vi.mock('@/lib/rbac', () => ({
  requirePermission: requirePermissionMock,
  RbacDeniedError: class RbacDeniedError extends Error {},
}));

vi.mock('@/lib/tax/module-gate', () => ({
  taxAdvancedModuleDisabledResponse: taxAdvancedModuleDisabledResponseMock,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    taxRateOverrideAuditLog: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe('GET /api/tax/audit module gate parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns API 403 when TAX_ADVANCED is disabled', async () => {
    verifySuperAdminMock.mockRejectedValue(new Error('not super admin'));
    getServerSessionMock.mockResolvedValue({ workspaceId: 'ws_1', user: { id: 'user_1' } });
    requirePermissionMock.mockResolvedValue(undefined);
    taxAdvancedModuleDisabledResponseMock.mockResolvedValue(
      new Response(JSON.stringify({ code: 'MODULE_DISABLED' }), { status: 403 }),
    );

    const { GET } = await import('@/app/api/tax/audit/route');
    const response = await GET(new Request('http://localhost/api/tax/audit'));

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.code).toBe('MODULE_DISABLED');
  });
});
