import { describe, expect, it, vi } from 'vitest';
import { BUSINESS_ROLES, DEFAULT_ROLE_PERMISSIONS, PERMISSION_KEYS, PERMISSION_MODULE_GROUPS } from '@/lib/permissions';
import { PAID_ONLY_MODULE_KEYS } from '@/lib/modules';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/entitlements', () => ({ hasFullPaidFeatures: vi.fn(), loadWorkspaceBillingSnapshot: vi.fn() }));

const has = (role: (typeof BUSINESS_ROLES)[number], key: string) => (DEFAULT_ROLE_PERMISSIONS[role] as readonly string[]).includes(key);

describe('email_hosting permissions', () => {
  it('registers all four keys and shows them in the roles matrix', () => {
    const keys = ['email_hosting.view', 'email_hosting.billing', 'email_hosting.operate', 'email_hosting.admin_server'];
    for (const key of keys) expect(PERMISSION_KEYS).toContain(key);
    expect(PERMISSION_MODULE_GROUPS.find((g) => g.module === 'email_hosting')?.keys).toEqual(keys);
  });

  it('grants each key to exactly the roles that held the legacy permission it replaces (no access change)', () => {
    for (const role of BUSINESS_ROLES) {
      expect(has(role, 'email_hosting.view'), `${role} view`).toBe(has(role, 'invoices.view'));
      expect(has(role, 'email_hosting.billing'), `${role} billing`).toBe(has(role, 'invoices.edit'));
      expect(has(role, 'email_hosting.admin_server'), `${role} admin_server`).toBe(has(role, 'workspace.manage_settings'));
    }
  });

  it('keeps operate (reserved for mailbox operations) to owner and admin only', () => {
    const holders = BUSINESS_ROLES.filter((role) => has(role, 'email_hosting.operate'));
    expect(holders).toEqual(['OWNER', 'ADMIN']);
  });
});

describe('Email Hosting plan entitlement', () => {
  it('is available on every plan, while other optional modules stay paid-only', () => {
    expect(PAID_ONLY_MODULE_KEYS.has('MIAB_BILLING')).toBe(false);
    expect(PAID_ONLY_MODULE_KEYS.has('SHOP')).toBe(false);
    expect(PAID_ONLY_MODULE_KEYS.has('POS')).toBe(true);
  });
});
