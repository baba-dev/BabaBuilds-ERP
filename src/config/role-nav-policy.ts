export const NAV_ITEMS = {
  DASHBOARD: { key: 'dashboard', route: '/dashboard' },
  CLIENT_CRM: { key: 'client_crm', route: '/clients' },
  SERVICE_CATALOG: { key: 'service_catalog', route: '/services' },
  QUOTES_AND_PROPOSALS: { key: 'quotes_proposals', route: '/proposals' },
  SHOP: { key: 'shop', route: '/shop' },
  INVENTORY_HUB: { key: 'inventory', route: '/inventory' },
  RETAINERS_HUB: { key: 'retainers_hub', route: '/retainers' },
  EXPENSES_AND_MARGINS: { key: 'expenses_margins', route: '/expenses' },
  AI_RECONCILIATION: { key: 'ai_reconciliation', route: '/reconciliation' },
  INVOICES_AND_EARNINGS: { key: 'invoices_and_earnings', route: '/income' },
  SAVINGS_AND_TAX: { key: 'savings_tax', route: '/tax' },
  CA_COMPLIANCE: { key: 'ca_compliance', route: '/ca-portal' },
} as const;

export type NavModule = keyof typeof NAV_ITEMS;
export type AppRole = 'OWNER' | 'SALES' | 'FINANCE' | 'OPS';

const ALL_MODULES = Object.keys(NAV_ITEMS) as NavModule[];

/**
 * Explicit allow-list by role.
 *
 * Secure defaults:
 * - Missing role -> denied.
 * - Missing module mapping -> denied.
 */
export const ROLE_NAV_ALLOWLIST: Readonly<Record<AppRole, readonly NavModule[]>> = {
  OWNER: ALL_MODULES,
  SALES: [
    'DASHBOARD',
    'CLIENT_CRM',
    'SERVICE_CATALOG',
    'QUOTES_AND_PROPOSALS',
    'SHOP',
    'INVOICES_AND_EARNINGS', // limited invoices view at the nav/routing layer
  ],
  FINANCE: [
    'DASHBOARD',
    'INVOICES_AND_EARNINGS',
    'EXPENSES_AND_MARGINS',
    'AI_RECONCILIATION',
    'SAVINGS_AND_TAX',
    'CA_COMPLIANCE',
  ],
  OPS: [
    'DASHBOARD',
    'INVENTORY_HUB',
    'RETAINERS_HUB',
    'SERVICE_CATALOG',
    'SHOP',
  ],
} as const;

function normalizeRole(role: string): AppRole | null {
  const normalized = role.trim().toUpperCase();
  if (normalized === 'OWNER' || normalized === 'SALES' || normalized === 'FINANCE' || normalized === 'OPS') {
    return normalized;
  }
  return null;
}

export function getAllowedNavModulesForRole(role: string): readonly NavModule[] {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) return [];
  return ROLE_NAV_ALLOWLIST[normalizedRole] ?? [];
}

export function canAccessNavModule(role: string, module: NavModule): boolean {
  const allowlist = getAllowedNavModulesForRole(role);
  return allowlist.includes(module);
}

export function canAccessRoute(role: string, route: string): boolean {
  const moduleFromRoute = (Object.entries(NAV_ITEMS) as Array<[NavModule, (typeof NAV_ITEMS)[NavModule]]>).find(
    ([, navItem]) => navItem.route === route,
  )?.[0];

  if (!moduleFromRoute) return false;
  return canAccessNavModule(role, moduleFromRoute);
}

export function getAllowedNavItemsForRole(role: string): Array<(typeof NAV_ITEMS)[NavModule]> {
  return getAllowedNavModulesForRole(role).map((module) => NAV_ITEMS[module]);
}
