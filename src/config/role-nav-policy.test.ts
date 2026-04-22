import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NAV_ITEMS,
  canAccessNavModule,
  canAccessRoute,
  getAllowedNavModulesForRole,
  type AppRole,
  type NavModule,
} from './role-nav-policy';

const allModules = Object.keys(NAV_ITEMS) as NavModule[];

const expectedAllowlistByRole: Record<AppRole, NavModule[]> = {
  OWNER: allModules,
  SALES: [
    'DASHBOARD',
    'CLIENT_CRM',
    'SERVICE_CATALOG',
    'QUOTES_PROPOSALS',
    'SHOP',
    'INVOICES_AND_EARNINGS',
    'AR_COLLECTIONS',
  ],
  FINANCE: [
    'DASHBOARD',
    'INVOICES_AND_EARNINGS',
    'AR_COLLECTIONS',
    'EXPENSES_MARGINS',
    'CASH_FLOW',
    'PAYROLL',
    'AI_RECONCILIATION',
    'SAVINGS_TAX',
    'CA_COMPLIANCE',
    'REPORTING_CENTER',
  ],
  OPS: ['DASHBOARD', 'INVENTORY_HUB', 'RETAINERS_HUB', 'WORKFORCE', 'DOCUMENTS', 'SERVICE_CATALOG', 'SHOP'],
  ADMIN: allModules,
  MEMBER: allModules,
  VIEWER: allModules,
};

test('each role can only access explicitly allowed nav modules', () => {
  (Object.keys(expectedAllowlistByRole) as AppRole[]).forEach((role) => {
    const expectedSet = new Set(expectedAllowlistByRole[role]);
    const actualSet = new Set(getAllowedNavModulesForRole(role));

    assert.deepEqual(actualSet, expectedSet);

    allModules.forEach((module) => {
      assert.equal(canAccessNavModule(role, module), expectedSet.has(module));
    });
  });
});

test('each role can only access routes for its allowed nav modules', () => {
  const moduleToRoute = Object.entries(NAV_ITEMS) as Array<[NavModule, (typeof NAV_ITEMS)[NavModule]]>;

  (Object.keys(expectedAllowlistByRole) as AppRole[]).forEach((role) => {
    const expectedSet = new Set(expectedAllowlistByRole[role]);

    moduleToRoute.forEach(([module, navItem]) => {
      assert.equal(canAccessRoute(role, navItem.route), expectedSet.has(module));
    });
  });
});

test('invoice route aliases resolve to invoices module authorization', () => {
  assert.equal(canAccessRoute('SALES', '/income'), true);
  assert.equal(canAccessRoute('SALES', '/invoice'), true);
  assert.equal(canAccessRoute('SALES', '/ledger'), true);

  assert.equal(canAccessRoute('OPS', '/invoice'), false);
  assert.equal(canAccessRoute('OPS', '/ledger'), false);
});
