import { describe, expect, it, vi, beforeEach } from 'vitest';

const getServerSessionMock = vi.fn();
const requirePermissionMock = vi.fn();

vi.mock('next-auth/next', () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/lib/rbac', async () => {
  const { NextResponse } = await import('next/server');

  class MockRbacDeniedError extends Error {
    public readonly permission: string;
    public readonly resolvedRole: string;

    constructor(permission: string, resolvedRole: string) {
      super(`Permission denied: ${permission}`);
      this.permission = permission;
      this.resolvedRole = resolvedRole;
    }
  }

  return {
    requirePermission: requirePermissionMock,
    RbacDeniedError: MockRbacDeniedError,
    rbacDeniedResponse: (err: MockRbacDeniedError) =>
      NextResponse.json({ code: 'RBAC_PERMISSION_DENIED', permission: err.permission }, { status: 403 }),
  };
});

vi.mock('@/lib/tax/policy', () => ({
  resolveTaxJurisdictionForWorkspace: vi.fn(),
}));

vi.mock('@/lib/tax/engine', () => ({
  estimateTax: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {},
}));

describe('tax estimate route RBAC enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns RBAC 403 when requirePermission denies access', async () => {
    getServerSessionMock.mockResolvedValue({ workspaceId: 'ws_1', user: { id: 'user_1' } });

    const rbacModule = await import('@/lib/rbac');
    requirePermissionMock.mockRejectedValue(new rbacModule.RbacDeniedError('tax.view', 'VIEWER'));

    const { POST } = await import('@/app/api/tax/estimate/route');
    const response = await POST(new Request('http://localhost/api/tax/estimate', {
      method: 'POST',
      body: JSON.stringify({ revenue: 10_000 }),
      headers: { 'Content-Type': 'application/json' },
    }));

    expect(requirePermissionMock).toHaveBeenCalledWith('user_1', 'ws_1', 'tax.view');
    expect(response.status).toBe(403);

    const payload = await response.json();
    expect(payload.code).toBe('RBAC_PERMISSION_DENIED');
  });
});
