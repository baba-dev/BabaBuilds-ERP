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

/**
 * Business-oriented roles + currently deployed workspace roles.
 */
export type AppRole =
  | 'OWNER'
  | 'SALES'
  | 'FINANCE'
  | 'OPS'
  | 'ADMIN'
  | 'MEMBER'
  | 'VIEWER';

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
    'INVOICES_AND_EARNINGS',
  ],
  FINANCE: [
    'DASHBOARD',
    'INVOICES_AND_EARNINGS',
    'EXPENSES_AND_MARGINS',
    'AI_RECONCILIATION',
    'SAVINGS_AND_TAX',
    'CA_COMPLIANCE',
  ],
  OPS: ['DASHBOARD', 'INVENTORY_HUB', 'RETAINERS_HUB', 'SERVICE_CATALOG', 'SHOP'],

  // Backward-compatibility with currently deployed workspace roles.
  ADMIN: ALL_MODULES,
  MEMBER: ALL_MODULES,
  VIEWER: ALL_MODULES,
} as const;

const ROUTE_ALIASES: Readonly<Partial<Record<NavModule, readonly string[]>>> = {
  INVOICES_AND_EARNINGS: ['/invoice', '/ledger'],
};

function normalizeRole(role: string): AppRole | null {
  const normalized = role.trim().toUpperCase();
  const knownRoles = new Set<AppRole>(['OWNER', 'SALES', 'FINANCE', 'OPS', 'ADMIN', 'MEMBER', 'VIEWER']);
  return knownRoles.has(normalized as AppRole) ? (normalized as AppRole) : null;
}

function normalizeRoutePath(route: string): string {
  const [pathOnly] = route.split(/[?#]/, 1);
  const normalized = pathOnly.trim();

  if (!normalized) return '';
  if (normalized === '/') return '/';
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

function getModuleByRoute(route: string): NavModule | null {
  const normalizedRoute = normalizeRoutePath(route);
  if (!normalizedRoute) return null;

  const entries = Object.entries(NAV_ITEMS) as Array<[NavModule, (typeof NAV_ITEMS)[NavModule]]>;

  for (const [module, navItem] of entries) {
    if (normalizeRoutePath(navItem.route) === normalizedRoute) {
      return module;
    }

    const aliases = ROUTE_ALIASES[module] ?? [];
    if (aliases.some((alias) => normalizeRoutePath(alias) === normalizedRoute)) {
      return module;
    }
  }

  return null;
}

export function getAllowedNavModulesForRole(role: string): readonly NavModule[] {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) return [];
  return ROLE_NAV_ALLOWLIST[normalizedRole] ?? [];
}

export function canAccessNavModule(role: string, module: NavModule): boolean {
  return getAllowedNavModulesForRole(role).includes(module);
}

export function canAccessRoute(role: string, route: string): boolean {
  const moduleFromRoute = getModuleByRoute(route);
  if (!moduleFromRoute) return false;
  return canAccessNavModule(role, moduleFromRoute);
}

export function getAllowedNavItemsForRole(role: string): Array<(typeof NAV_ITEMS)[NavModule]> {
  return getAllowedNavModulesForRole(role).map((module) => NAV_ITEMS[module]);
}
