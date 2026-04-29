import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUniqueMock = vi.fn();
const rbacAuditCreateMock = vi.fn();
const logActivityMock = vi.fn();

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspaceUser: { findUnique: findUniqueMock },
    rbacAuditLog: { create: rbacAuditCreateMock },
  },
}));
vi.mock('@/lib/security/activity-log', () => ({
  logActivity: logActivityMock,
}));

describe('rbac silent checks and audited enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('checkPermissionSilent does not emit denial audit writes', async () => {
    findUniqueMock.mockResolvedValue({ role: 'VIEWER', businessRole: 'VIEWER', isActive: true });

    const { checkPermissionSilent } = await import('@/lib/rbac');
    const granted = await checkPermissionSilent('user_1', 'ws_1', 'workspace.manage_settings');

    expect(granted).toBe(false);
    expect(rbacAuditCreateMock).not.toHaveBeenCalled();
    expect(logActivityMock).not.toHaveBeenCalled();
  });

  it('requirePermission denial still emits audit writes', async () => {
    findUniqueMock.mockResolvedValue({ role: 'VIEWER', businessRole: 'VIEWER', isActive: true });
    rbacAuditCreateMock.mockResolvedValue({ id: 'audit_1' });
    logActivityMock.mockResolvedValue({ id: 'activity_1' });

    const { requirePermission, RbacDeniedError } = await import('@/lib/rbac');

    await expect(requirePermission('user_1', 'ws_1', 'workspace.manage_settings'))
      .rejects
      .toBeInstanceOf(RbacDeniedError);

    expect(rbacAuditCreateMock).toHaveBeenCalledTimes(1);
    expect(logActivityMock).toHaveBeenCalledTimes(1);
  });
});
