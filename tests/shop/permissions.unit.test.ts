/**
 * Verifies the new shop.* permission keys exist and are granted to the right
 * role tiers per the conservative template policy.
 */
import { describe, it, expect } from 'vitest';
import {
  PERMISSION_KEYS,
  DEFAULT_ROLE_PERMISSIONS,
  hasPermission,
} from '@/lib/permissions';

const SHOP_KEYS = [
  'shop.view',
  'shop.orders.view',
  'shop.orders.manage',
  'shop.content.manage',
  'shop.settings.manage',
] as const;

describe('shop.* RBAC permissions', () => {
  it('all 5 shop permission keys are registered', () => {
    for (const key of SHOP_KEYS) {
      expect(PERMISSION_KEYS).toContain(key);
    }
  });

  it('OWNER & ADMIN get full shop control', () => {
    for (const role of ['OWNER', 'ADMIN'] as const) {
      for (const key of SHOP_KEYS) {
        expect(hasPermission(role, key)).toBe(true);
      }
    }
  });

  it('FINANCE_MANAGER, ACCOUNTANT, VIEWER, STAFF can view orders but not manage', () => {
    for (const role of ['FINANCE_MANAGER', 'ACCOUNTANT', 'VIEWER', 'STAFF'] as const) {
      expect(hasPermission(role, 'shop.view')).toBe(true);
      expect(hasPermission(role, 'shop.orders.view')).toBe(true);
      expect(hasPermission(role, 'shop.orders.manage')).toBe(false);
      expect(hasPermission(role, 'shop.settings.manage')).toBe(false);
    }
  });

  it('SALES_MANAGER and OPERATIONS_MANAGER manage orders + content but not settings', () => {
    for (const role of ['SALES_MANAGER', 'OPERATIONS_MANAGER'] as const) {
      expect(hasPermission(role, 'shop.view')).toBe(true);
      expect(hasPermission(role, 'shop.orders.manage')).toBe(true);
      expect(hasPermission(role, 'shop.content.manage')).toBe(true);
      expect(hasPermission(role, 'shop.settings.manage')).toBe(false);
    }
  });

  it('INVENTORY_MANAGER cannot manage orders (stock-side read)', () => {
    expect(hasPermission('INVENTORY_MANAGER', 'shop.view')).toBe(true);
    expect(hasPermission('INVENTORY_MANAGER', 'shop.orders.view')).toBe(true);
    expect(hasPermission('INVENTORY_MANAGER', 'shop.orders.manage')).toBe(false);
    expect(hasPermission('INVENTORY_MANAGER', 'shop.content.manage')).toBe(true);
  });

  it('shop.settings.manage is only granted to OWNER and ADMIN', () => {
    for (const role of Object.keys(DEFAULT_ROLE_PERMISSIONS) as Array<
      keyof typeof DEFAULT_ROLE_PERMISSIONS
    >) {
      const granted = hasPermission(role, 'shop.settings.manage');
      expect(granted).toBe(role === 'OWNER' || role === 'ADMIN');
    }
  });
});
