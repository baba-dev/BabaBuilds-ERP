import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  session: { user: { id: 'u1' }, workspaceId: 'w1' } as unknown,
  granted: {} as Record<string, boolean>,
  withPermission: vi.fn(),
  requireModule: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/workspace-scope', () => ({ getActiveWorkspaceIdForUser: vi.fn(async () => null) }));
vi.mock('@/lib/rbac', () => ({
  checkPermissionsSilent: vi.fn(async (_u: string, _w: string, keys: string[]) => Object.fromEntries(keys.map((k) => [k, Boolean(mocks.granted[k])]))),
  withPermission: mocks.withPermission,
}));
vi.mock('@/lib/modules', () => ({
  ModuleDisabledError: class ModuleDisabledError extends Error {},
  requireModule: mocks.requireModule,
}));

import { requireEmailBilling } from '@/app/api/email-billing/_lib/auth';
import { ModuleDisabledError } from '@/lib/modules';

describe('requireEmailBilling', () => {
  beforeEach(() => {
    mocks.session = { user: { id: 'u1' }, workspaceId: 'w1' };
    mocks.granted = {};
    mocks.withPermission.mockReset();
    mocks.withPermission.mockResolvedValue({ granted: false, response: NextResponse.json({ code: 'RBAC_PERMISSION_DENIED' }, { status: 403 }) });
    mocks.requireModule.mockReset();
    mocks.requireModule.mockResolvedValue(undefined);
  });

  it('rejects unauthenticated callers with 401', async () => {
    mocks.session = null;
    const result = await requireEmailBilling('view');
    expect('response' in result && result.response.status).toBe(401);
  });

  it('allows the new permission', async () => {
    mocks.granted = { 'email_hosting.billing': true };
    const result = await requireEmailBilling('billing');
    expect(result).toMatchObject({ userId: 'u1', workspaceId: 'w1' });
  });

  it('still allows the legacy permission the module was gated on before', async () => {
    mocks.granted = { 'invoices.view': true };
    expect(await requireEmailBilling('view')).toMatchObject({ workspaceId: 'w1' });
    mocks.granted = { 'workspace.manage_settings': true };
    expect(await requireEmailBilling('admin')).toMatchObject({ workspaceId: 'w1' });
  });

  it('honours a route-specific legacy permission and does not widen it', async () => {
    mocks.granted = { 'invoices.edit': true };
    const denied = await requireEmailBilling('billing', { legacy: 'invoices.create' });
    expect('response' in denied && denied.response.status).toBe(403);
    mocks.granted = { 'invoices.create': true };
    expect(await requireEmailBilling('billing', { legacy: 'invoices.create' })).toMatchObject({ workspaceId: 'w1' });
  });

  it('denies, and audits through withPermission, when neither permission is held', async () => {
    const result = await requireEmailBilling('admin');
    expect('response' in result && result.response.status).toBe(403);
    expect(mocks.withPermission).toHaveBeenCalledWith('u1', 'w1', 'email_hosting.admin_server');
    expect(mocks.requireModule).not.toHaveBeenCalled();
  });

  it('returns 403 when the module is disabled', async () => {
    mocks.granted = { 'email_hosting.view': true };
    mocks.requireModule.mockRejectedValue(new ModuleDisabledError('x'));
    const result = await requireEmailBilling('view');
    expect('response' in result && result.response.status).toBe(403);
  });
});
