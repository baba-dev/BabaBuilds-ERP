import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_KEYS,
  hasPermission,
} from '@/lib/permissions';
import {
  OPEN_FILE_FLOW_PERMISSIONS,
  OPEN_FILE_IMPORT_FLOWS,
  isOpenFileImportFlow,
} from '@/lib/imports/open-file-policy';

describe('open-file import RBAC policy', () => {
  it('enforces canonical RBAC before file processing or writes', () => {
    const source = fs.readFileSync('app/api/open-file/route.ts', 'utf8');
    const enforcementIndex = source.indexOf(
      'for (const permission of OPEN_FILE_FLOW_PERMISSIONS[flow])',
    );

    expect(source).toContain('await requirePermission(actor.userId, workspaceId, permission)');
    expect(source).not.toContain('checkPermissionSilent');
    expect(enforcementIndex).toBeGreaterThan(-1);

    for (const operation of [
      'file.arrayBuffer()',
      'scanBuffer(buffer)',
      "writeFile(filepath, buffer",
      'prisma.expense.create',
    ]) {
      expect(enforcementIndex).toBeLessThan(source.indexOf(operation));
    }
  });

  it('protects direct reconciliation upload entry points', () => {
    for (const routePath of [
      'app/api/reconcile/upload/route.ts',
      'app/api/reconcile/upload/parse-mapped/route.ts',
    ]) {
      const source = fs.readFileSync(routePath, 'utf8');
      const enforcementIndex = source.indexOf(
        '"reconciliation.import"',
      );
      const writeIndex = source.indexOf('prisma.bankImportBatch.create');

      expect(source).toContain('withPermission(');
      expect(enforcementIndex).toBeGreaterThan(-1);
      expect(writeIndex).toBeGreaterThan(-1);
      expect(enforcementIndex).toBeLessThan(writeIndex);
    }
  });

  it('rejects unknown or non-string flow selectors', () => {
    expect(isOpenFileImportFlow('expenses')).toBe(true);
    expect(isOpenFileImportFlow('reconciliation')).toBe(true);
    expect(isOpenFileImportFlow('admin')).toBe(false);
    expect(isOpenFileImportFlow(null)).toBe(false);
  });

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
