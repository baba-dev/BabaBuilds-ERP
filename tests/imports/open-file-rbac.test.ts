import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_KEYS,
  hasPermission,
} from '@/lib/permissions';
import {
  OPEN_FILE_FLOW_PERMISSIONS,
  OPEN_FILE_IMPORT_FLOWS,
} from '@/lib/imports/open-file-policy';

describe('open-file import RBAC policy', () => {
  it('maps every supported flow to exact permissions', () => {
    expect(Object.keys(OPEN_FILE_FLOW_PERMISSIONS).sort()).toEqual(
      [...OPEN_FILE_IMPORT_FLOWS].sort(),
    );
    expect(OPEN_FILE_FLOW_PERMISSIONS.expenses).toEqual(['expenses.create']);
    expect(OPEN_FILE_FLOW_PERMISSIONS.invoices).toEqual(['invoices.create']);
    expect(OPEN_FILE_FLOW_PERMISSIONS.reconciliation).toEqual([
      'reconciliation.import',
    ]);
    expect(OPEN_FILE_FLOW_PERMISSIONS.withholding_certificates).toEqual([
      'tax.withholding.ingest',
      'documents.upload',
    ]);
  });

  it('registers every enforced permission in the canonical permission list', () => {
    for (const permissions of Object.values(OPEN_FILE_FLOW_PERMISSIONS)) {
      for (const permission of permissions) {
        expect(PERMISSION_KEYS).toContain(permission);
      }
    }
  });

  it('keeps VIEWER read-only across every import flow', () => {
    for (const permissions of Object.values(OPEN_FILE_FLOW_PERMISSIONS)) {
      expect(permissions.every((permission) => hasPermission('VIEWER', permission))).toBe(false);
    }
  });

  it('grants reconciliation import only to its operational roles', () => {
    const allowed = new Set(['OWNER', 'ADMIN', 'FINANCE_MANAGER']);

    for (const role of Object.keys(DEFAULT_ROLE_PERMISSIONS) as Array<
      keyof typeof DEFAULT_ROLE_PERMISSIONS
    >) {
      expect(hasPermission(role, 'reconciliation.import')).toBe(allowed.has(role));
    }
  });
});
