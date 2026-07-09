import { beforeEach, describe, expect, it, vi } from 'vitest';

const workspaceUserFindUniqueMock = vi.fn();
const groupWorkspaceAccessFindFirstMock = vi.fn();
const groupMemberFindFirstMock = vi.fn();
const rbacAuditCreateMock = vi.fn();
const logActivityMock = vi.fn();

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspaceUser: { findUnique: workspaceUserFindUniqueMock },
    companyGroupMemberWorkspaceAccess: { findFirst: groupWorkspaceAccessFindFirstMock },
    companyGroupMember: { findFirst: groupMemberFindFirstMock },
    rbacAuditLog: { create: rbacAuditCreateMock },
  },
}));
vi.mock('@/lib/security/activity-log', () => ({
  logActivity: logActivityMock,
}));

describe('company group RBAC workspace access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceUserFindUniqueMock.mockResolvedValue(null);
    groupWorkspaceAccessFindFirstMock.mockResolvedValue(null);
    groupMemberFindFirstMock.mockResolvedValue(null);
    rbacAuditCreateMock.mockResolvedValue({ id: 'audit_1' });
    logActivityMock.mockResolvedValue({ id: 'activity_1' });
  });

  it('keeps direct workspace membership as the winning role', async () => {
    workspaceUserFindUniqueMock.mockResolvedValue({ role: 'VIEWER', businessRole: 'VIEWER', isActive: true });
    groupWorkspaceAccessFindFirstMock.mockResolvedValue({
      accessRole: 'OWNER',
      companyGroupMember: { groupRole: 'OWNER', role: 'OWNER' },
    });

    const { checkPermissionSilent } = await import('@/lib/rbac');

    await expect(checkPermissionSilent('user_1', 'ws_1', 'billing.manage')).resolves.toBe(false);
    expect(groupWorkspaceAccessFindFirstMock).not.toHaveBeenCalled();
    expect(groupMemberFindFirstMock).not.toHaveBeenCalled();
  });

  it('grants selected company access only for the explicitly assigned workspace', async () => {
    groupWorkspaceAccessFindFirstMock.mockImplementation(({ where }) => {
      if (where.workspaceId === 'ws_allowed') {
        return Promise.resolve({
          accessRole: 'FINANCE_MANAGER',
          companyGroupMember: { groupRole: 'MEMBER', role: 'MEMBER' },
        });
      }
      return Promise.resolve(null);
    });

    const { checkPermissionSilent } = await import('@/lib/rbac');

    await expect(checkPermissionSilent('user_1', 'ws_allowed', 'invoices.create')).resolves.toBe(true);
    await expect(checkPermissionSilent('user_1', 'ws_denied', 'invoices.create')).resolves.toBe(false);
  });

  it('grants all-companies group access for every active workspace in the group', async () => {
    groupMemberFindFirstMock.mockImplementation(({ where }) => {
      if (['ws_1', 'ws_2'].includes(where.companyGroup.workspaces.some.workspaceId)) {
        return Promise.resolve({ groupRole: 'ADMIN', role: 'MEMBER' });
      }
      return Promise.resolve(null);
    });

    const { checkPermissionSilent } = await import('@/lib/rbac');

    await expect(checkPermissionSilent('user_1', 'ws_1', 'workspace.manage_settings')).resolves.toBe(true);
    await expect(checkPermissionSilent('user_1', 'ws_2', 'workspace.manage_settings')).resolves.toBe(true);
    await expect(checkPermissionSilent('user_1', 'ws_outside_group', 'workspace.manage_settings')).resolves.toBe(false);
  });

  it('maps group owners to owner-equivalent permissions in accessible companies', async () => {
    groupMemberFindFirstMock.mockResolvedValue({ groupRole: 'GROUP_OWNER', role: 'MEMBER' });

    const { checkPermissionSilent } = await import('@/lib/rbac');

    await expect(checkPermissionSilent('user_1', 'ws_1', 'billing.manage')).resolves.toBe(true);
  });

  it('maps group admins to admin-equivalent permissions in accessible companies', async () => {
    groupMemberFindFirstMock.mockResolvedValue({ groupRole: 'GROUP_ADMIN', role: 'MEMBER' });

    const { checkPermissionSilent } = await import('@/lib/rbac');

    await expect(checkPermissionSilent('user_1', 'ws_1', 'workspace.manage_settings')).resolves.toBe(true);
    await expect(checkPermissionSilent('user_1', 'ws_1', 'billing.manage')).resolves.toBe(false);
  });

  it('keeps selected-company accessRole narrower than group role', async () => {
    groupWorkspaceAccessFindFirstMock.mockResolvedValue({
      accessRole: 'STAFF',
      companyGroupMember: { groupRole: 'GROUP_OWNER', role: 'MEMBER' },
    });

    const { checkPermissionSilent } = await import('@/lib/rbac');

    await expect(checkPermissionSilent('user_1', 'ws_1', 'billing.manage')).resolves.toBe(false);
    expect(groupMemberFindFirstMock).not.toHaveBeenCalled();
  });

  it('denies access when group links or memberships are inactive', async () => {
    groupWorkspaceAccessFindFirstMock.mockImplementation(({ where }) => {
      expect(where.isActive).toBe(true);
      expect(where.companyGroupMember.isActive).toBe(true);
      expect(where.companyGroupMember.companyGroup.workspaces.some.isActive).toBe(true);
      return Promise.resolve(null);
    });
    groupMemberFindFirstMock.mockImplementation(({ where }) => {
      expect(where.isActive).toBe(true);
      expect(where.companyGroup.workspaces.some.isActive).toBe(true);
      return Promise.resolve(null);
    });

    const { requirePermission, RbacDeniedError } = await import('@/lib/rbac');

    await expect(requirePermission('user_1', 'ws_inactive', 'dashboard.view'))
      .rejects
      .toBeInstanceOf(RbacDeniedError);
    expect(rbacAuditCreateMock).toHaveBeenCalledTimes(1);
    expect(logActivityMock).toHaveBeenCalledTimes(1);
  });
});
