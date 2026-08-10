/**
 * lib/permissions.ts
 *
 * Single authoritative source of truth for BabaBuilds ERP RBAC.
 *
 * Architecture decisions:
 * - Roles and permission templates are CODE-DEFINED (not DB tables).
 *   This makes the permission model auditable in git, easy to diff, and
 *   avoids half-normalised DB role/permission tables that are harder to
 *   reason about than a well-structured TypeScript file.
 *
 * - DB stores the `businessRole` string (validated against BusinessRole union).
 *   The ORM-level Prisma enum (`BusinessRoleEnum`) enforces type safety.
 *
 * - Default templates are CONSERVATIVE: start restrictive, expand deliberately.
 *   Sensitive surfaces (accounting.post, tax.manage, tax.edit, tax.approve, tax.file, billing.manage,
 *   reports.export, cash_flow.manage_assumptions) require explicit permission.
 *
 * - Seat semantics are explicit (see PLAN_SEAT_LIMITS and SEAT_SEMANTICS):
 *   · Pending invites DO reserve seats
 *   · Deactivated users DO free seats
 *   · Owners DO count toward seats
 */

// ─────────────────────────────────────────────────────────────────────────────
// BUSINESS ROLES
// ─────────────────────────────────────────────────────────────────────────────

export const BUSINESS_ROLES = [
  'OWNER',
  'ADMIN',
  'FINANCE_MANAGER',
  'ACCOUNTANT',
  'SALES_MANAGER',
  'OPERATIONS_MANAGER',
  'INVENTORY_MANAGER',
  'STAFF',
  'VIEWER',
] as const;

export type BusinessRole = (typeof BUSINESS_ROLES)[number];

export function isValidBusinessRole(role: unknown): role is BusinessRole {
  return typeof role === 'string' && (BUSINESS_ROLES as readonly string[]).includes(role);
}

export const ROLE_LABELS: Record<BusinessRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  FINANCE_MANAGER: 'Finance Manager',
  ACCOUNTANT: 'Accountant / CA',
  SALES_MANAGER: 'Sales Manager',
  OPERATIONS_MANAGER: 'Operations Manager',
  INVENTORY_MANAGER: 'Inventory Manager',
  STAFF: 'Team Member',
  VIEWER: 'Viewer / Auditor',
};

export const ROLE_DESCRIPTIONS: Record<BusinessRole, string> = {
  OWNER: 'Full control over all workspace data, settings, billing, and team.',
  ADMIN: 'Manage workspace settings, team members, and all operational data. Cannot access billing.',
  FINANCE_MANAGER: 'Manage invoices, expenses, retainers, cash flow, and financial reports. Cannot post accounting entries or change tax config.',
  ACCOUNTANT: 'Read-only access to all financial records for audit and review. Can view but not post accounting entries.',
  SALES_MANAGER: 'Manage proposals, clients, and view invoices. Cannot access financial internals.',
  OPERATIONS_MANAGER: 'Manage service orders, purchase orders, and operational expenses. Limited financial visibility.',
  INVENTORY_MANAGER: 'Manage inventory, products, and purchase orders. No financial access.',
  STAFF: 'View clients and invoices, create expenses. No admin or financial management access.',
  VIEWER: 'Read-only access to dashboard and reports. Strictly no write access anywhere.',
};

/** Roles that require phishing-resistant authentication. */
export const HIGH_RISK_BUSINESS_ROLES = new Set<BusinessRole>(['OWNER', 'ADMIN', 'FINANCE_MANAGER']);

/**
 * Visual badge styling tokens per role.
 * Values are Tailwind-compatible class fragments for use in cn().
 */
export const ROLE_BADGE_COLORS: Record<BusinessRole, { bg: string; text: string; border: string }> = {
  OWNER:              { bg: 'bg-violet-100 dark:bg-violet-950/40',   text: 'text-violet-700 dark:text-violet-300',   border: 'border-violet-200 dark:border-violet-800/50' },
  ADMIN:              { bg: 'bg-rose-100 dark:bg-rose-950/40',        text: 'text-rose-700 dark:text-rose-300',        border: 'border-rose-200 dark:border-rose-800/50' },
  FINANCE_MANAGER:    { bg: 'bg-amber-100 dark:bg-amber-950/40',      text: 'text-amber-700 dark:text-amber-300',      border: 'border-amber-200 dark:border-amber-800/50' },
  ACCOUNTANT:         { bg: 'bg-sky-100 dark:bg-sky-950/40',          text: 'text-sky-700 dark:text-sky-300',          border: 'border-sky-200 dark:border-sky-800/50' },
  SALES_MANAGER:      { bg: 'bg-emerald-100 dark:bg-emerald-950/40',  text: 'text-emerald-700 dark:text-emerald-300',  border: 'border-emerald-200 dark:border-emerald-800/50' },
  OPERATIONS_MANAGER: { bg: 'bg-teal-100 dark:bg-teal-950/40',        text: 'text-teal-700 dark:text-teal-300',        border: 'border-teal-200 dark:border-teal-800/50' },
  INVENTORY_MANAGER:  { bg: 'bg-orange-100 dark:bg-orange-950/40',    text: 'text-orange-700 dark:text-orange-300',    border: 'border-orange-200 dark:border-orange-800/50' },
  STAFF:              { bg: 'bg-zinc-100 dark:bg-zinc-800/60',         text: 'text-zinc-700 dark:text-zinc-300',        border: 'border-zinc-200 dark:border-zinc-700/50' },
  VIEWER:             { bg: 'bg-slate-100 dark:bg-slate-800/60',       text: 'text-slate-600 dark:text-slate-400',      border: 'border-slate-200 dark:border-slate-700/50' },
};

// ─────────────────────────────────────────────────────────────────────────────
// PERMISSION KEYS (module.action)
// ─────────────────────────────────────────────────────────────────────────────

export const PERMISSION_KEYS = [
  // Dashboard
  'dashboard.view',

  // Proposals
  'proposals.view',
  'proposals.create',
  'proposals.edit',
  'proposals.send',
  'proposals.convert',
  'proposals.delete',

  // Invoices
  'invoices.view',
  'invoices.create',
  'invoices.edit',
  'invoices.send',
  'invoices.export',     // separate from view — controls PDF/CSV download
  'invoices.delete',

  // Retainers
  'retainers.view',
  'retainers.manage',

  // Expenses
  'expenses.view',
  'expenses.create',
  'expenses.delete',
  'expenses.approve',    // future: expense approval workflow

  // Purchase Orders
  'purchase_orders.view',
  'purchase_orders.create',
  'purchase_orders.approve',

  // Inventory / IMS
  'inventory.view',
  'inventory.edit',

  // Service Orders
  'service_orders.view',
  'service_orders.manage',

  // Cash Flow
  'cash_flow.view',
  'cash_flow.manage_assumptions', // High-risk: changes forecasting model

  // Accounting (Double-Entry)
  'accounting.view',
  'accounting.post',       // High-risk: posts journal entries

  // Bank Reconciliation
  'reconciliation.import', // Import bank data into the reconciliation workspace
  'reconciliation.commit', // Commit reviewed matches to invoices and expenses

  // Tax
  'tax.view',
  'tax.manage',            // High-risk: workspace tax setup, imports, document links
  'tax.edit',              // High-risk: maker-side tax overrides / configuration changes
  'tax.approve',           // High-risk: maker-checker approvals for tax actions
  'tax.file',              // High-risk: tax filing / submission actions
  'tax.readiness.view',    // read tax return readiness summaries
  'tax.readiness.run',     // run tax return readiness / prefill pipelines
  'tax.withholding.record', // record withholding on payments/expenses (creates WithholdingEvent)
  'tax.withholding.ingest', // ingest withholding certificates / post tax credits from uploads
  
  // Reports
  'reports.view',
  'reports.export',        // separate from view — controls bulk export surfaces
  
  // Reporting Center (optional module; curated presets — server-side execution only)
  'reporting_center.view',
  'reporting_center.query.run',
  'reporting_center.export',

  // Clients
  'clients.view',
  'clients.manage',

  // Workspace Admin
  'workspace.manage_members', // invite/remove/deactivate members
  'workspace.manage_roles',   // change member roles
  'workspace.manage_settings',// change workspace settings/profile

  // Billing
  'billing.manage',        // High-risk: owner-only payment/subscription management

  // Workforce (only surfaced when Workforce module is enabled)
  'workforce.view',                  // Access the Workforce module overview
  'workforce.people.view',           // View employee directory & profiles
  'workforce.people.manage',         // Create/edit/deactivate employees
  'workforce.attendance.view',       // View attendance records
  'workforce.attendance.manage',     // Mark/edit attendance (HR/manager)
  'workforce.leave.view',            // View leave requests & calendar
  'workforce.leave.manage',          // Manage leave types, balances, policies
  'workforce.leave.approve',         // Approve or reject leave requests
  'workforce.reports.view',          // View workforce analytics & reports
  'workforce.settings.manage',       // Manage departments, designations, holidays

  // Payroll (only surfaced when Payroll module is enabled)
  'payroll.view',                    // View payroll runs, ledger postings, and summaries
  'payroll.prepare',                 // Prepare payroll runs and draft calculations
  'payroll.approve',                 // Approve prepared payroll runs (maker-checker)
  'payroll.post',                    // Post approved payroll to accounting
  'payroll.settings.manage',         // Manage payroll config, calendars, and policies

  // Documents (only surfaced when Documents module is enabled)
  'documents.view',
  'documents.upload',
  'documents.manage',
  'documents.archive',
  'documents.restore',
  'documents.delete',
  'documents.link',
  'documents.ocr.review',
  'documents.compliance.view',
  'documents.compliance.manage',
  'documents.personal.view',
  'documents.personal.manage',
  'documents.settings.manage',

  // POS / Checkout
  'pos.view',                // Access the POS register and catalog
  'pos.checkout',            // Complete POS checkout actions
  'pos.discount',            // Apply discounts during POS checkout
  'pos.custom_item',         // Add ad-hoc line items during POS checkout

  // Shop / Public Storefront (only surfaced when Shop module is enabled)
  'shop.view',                // Access the Shop dashboard / Command Center
  'shop.orders.view',         // View incoming buyer orders (read-only)
  'shop.orders.manage',       // Update status, mark paid/refunded/fulfilled, delete
  'shop.content.manage',      // Edit storefront content (About, social, FAQ, announcement, AI Assist)
  'shop.settings.manage',     // Toggle shop on/off, change slug, branding, gateways
] as const;

export type Permission = (typeof PERMISSION_KEYS)[number];

export function isValidPermission(key: unknown): key is Permission {
  return typeof key === 'string' && (PERMISSION_KEYS as readonly string[]).includes(key);
}

/** Module groups for UI rendering (Roles & Permissions matrix). */
export const PERMISSION_MODULE_GROUPS: { module: string; label: string; keys: Permission[] }[] = [
  { module: 'dashboard',       label: 'Dashboard',        keys: ['dashboard.view'] },
  { module: 'proposals',       label: 'Proposals',        keys: ['proposals.view', 'proposals.create', 'proposals.edit', 'proposals.send', 'proposals.convert', 'proposals.delete'] },
  { module: 'invoices',        label: 'Invoices',         keys: ['invoices.view', 'invoices.create', 'invoices.edit', 'invoices.send', 'invoices.export', 'invoices.delete'] },
  { module: 'retainers',       label: 'Retainers',        keys: ['retainers.view', 'retainers.manage'] },
  { module: 'expenses',        label: 'Expenses',         keys: ['expenses.view', 'expenses.create', 'expenses.delete', 'expenses.approve'] },
  { module: 'purchase_orders', label: 'Purchase Orders',  keys: ['purchase_orders.view', 'purchase_orders.create', 'purchase_orders.approve'] },
  { module: 'inventory',       label: 'Inventory',        keys: ['inventory.view', 'inventory.edit'] },
  { module: 'service_orders',  label: 'Service Orders',   keys: ['service_orders.view', 'service_orders.manage'] },
  { module: 'cash_flow',       label: 'Cash Flow',        keys: ['cash_flow.view', 'cash_flow.manage_assumptions'] },
  { module: 'accounting',      label: 'Accounting',       keys: ['accounting.view', 'accounting.post'] },
  { module: 'reconciliation',  label: 'Reconciliation',   keys: ['reconciliation.import', 'reconciliation.commit'] },
  {
    module: 'tax',
    label: 'Tax',
    keys: [
      'tax.view',
      'tax.manage',
      'tax.edit',
      'tax.approve',
      'tax.file',
      'tax.readiness.view',
      'tax.readiness.run',
      'tax.withholding.record',
      'tax.withholding.ingest',
    ],
  },
  { module: 'reports',         label: 'Reports',          keys: ['reports.view', 'reports.export'] },
  {
    module: 'reporting_center',
    label: 'Reporting Center',
    keys: ['reporting_center.view', 'reporting_center.query.run', 'reporting_center.export'],
  },
  { module: 'clients',         label: 'Clients',          keys: ['clients.view', 'clients.manage'] },
  { module: 'pos',             label: 'Point of Sale',    keys: ['pos.view', 'pos.checkout', 'pos.discount', 'pos.custom_item'] },
  { module: 'workspace',       label: 'Workspace Admin',  keys: ['workspace.manage_members', 'workspace.manage_roles', 'workspace.manage_settings'] },
  { module: 'billing',         label: 'Billing',          keys: ['billing.manage'] },
  {
    module: 'workforce',
    label: 'Workforce',
    keys: [
      'workforce.view',
      'workforce.people.view',
      'workforce.people.manage',
      'workforce.attendance.view',
      'workforce.attendance.manage',
      'workforce.leave.view',
      'workforce.leave.manage',
      'workforce.leave.approve',
      'workforce.reports.view',
      'workforce.settings.manage',
    ],
  },
  {
    module: 'payroll',
    label: 'Payroll',
    keys: [
      'payroll.view',
      'payroll.prepare',
      'payroll.approve',
      'payroll.post',
      'payroll.settings.manage',
    ],
  },
  {
    module: 'documents',
    label: 'Documents',
    keys: [
      'documents.view',
      'documents.upload',
      'documents.manage',
      'documents.link',
      'documents.ocr.review',
      'documents.archive',
      'documents.restore',
      'documents.delete',
      'documents.compliance.view',
      'documents.compliance.manage',
      'documents.personal.view',
      'documents.personal.manage',
      'documents.settings.manage',
    ],
  },
  {
    module: 'shop',
    label: 'Shop / Storefront',
    keys: [
      'shop.view',
      'shop.orders.view',
      'shop.orders.manage',
      'shop.content.manage',
      'shop.settings.manage',
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT ROLE PERMISSION TEMPLATES (conservative)
// ─────────────────────────────────────────────────────────────────────────────

type PermissionSet = ReadonlyArray<Permission>;

/**
 * DEFAULT_ROLE_PERMISSIONS is the authoritative permission template for each
 * built-in role. These are code-defined and auditable in git.
 *
 * Design principle: grant the MINIMUM permissions needed for the role's job.
 * Sensitive permissions (accounting.post, tax.manage, tax.edit, tax.approve, tax.file, billing.manage,
 * reports.export, cash_flow.manage_assumptions) are granted sparingly.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<BusinessRole, PermissionSet> = {
  OWNER: [
    // Full access to everything
    'dashboard.view',
    'proposals.view', 'proposals.create', 'proposals.edit', 'proposals.send', 'proposals.convert', 'proposals.delete',
    'invoices.view', 'invoices.create', 'invoices.edit', 'invoices.send', 'invoices.export', 'invoices.delete',
    'retainers.view', 'retainers.manage',
    'expenses.view', 'expenses.create', 'expenses.delete', 'expenses.approve',
    'purchase_orders.view', 'purchase_orders.create', 'purchase_orders.approve',
    'inventory.view', 'inventory.edit',
    'service_orders.view', 'service_orders.manage',
    'cash_flow.view', 'cash_flow.manage_assumptions',
    'accounting.view', 'accounting.post',
    'reconciliation.import', 'reconciliation.commit',
    'tax.view',
    'tax.manage',
    'tax.edit',
    'tax.approve',
    'tax.file',
    'tax.readiness.view',
    'tax.readiness.run',
    'tax.withholding.record',
    'tax.withholding.ingest',
    'reports.view', 'reports.export',
    'reporting_center.view',
    'reporting_center.query.run',
    'reporting_center.export',
    'clients.view', 'clients.manage',
    'pos.view', 'pos.checkout', 'pos.discount', 'pos.custom_item',
    'workspace.manage_members', 'workspace.manage_roles', 'workspace.manage_settings',
    'billing.manage',
    // Workforce — full access
    'workforce.view', 'workforce.people.view', 'workforce.people.manage',
    'workforce.attendance.view', 'workforce.attendance.manage',
    'workforce.leave.view', 'workforce.leave.manage', 'workforce.leave.approve',
    'workforce.reports.view', 'workforce.settings.manage',
    // Payroll — full access
    'payroll.view', 'payroll.prepare', 'payroll.approve', 'payroll.post', 'payroll.settings.manage',

    // Documents — full access
    'documents.view',
    'documents.upload',
    'documents.manage',
    'documents.link',
    'documents.ocr.review',
    'documents.archive',
    'documents.restore',
    'documents.delete',
    'documents.compliance.view',
    'documents.compliance.manage',
    'documents.personal.view',
    'documents.personal.manage',
    'documents.settings.manage',

    // Shop — full control
    'shop.view',
    'shop.orders.view', 'shop.orders.manage',
    'shop.content.manage',
    'shop.settings.manage',
  ],

  ADMIN: [
    // Full operational access — cannot manage billing
    'dashboard.view',
    'proposals.view', 'proposals.create', 'proposals.edit', 'proposals.send', 'proposals.convert', 'proposals.delete',
    'invoices.view', 'invoices.create', 'invoices.edit', 'invoices.send', 'invoices.export', 'invoices.delete',
    'retainers.view', 'retainers.manage',
    'expenses.view', 'expenses.create', 'expenses.delete', 'expenses.approve',
    'purchase_orders.view', 'purchase_orders.create', 'purchase_orders.approve',
    'inventory.view', 'inventory.edit',
    'service_orders.view', 'service_orders.manage',
    'cash_flow.view', 'cash_flow.manage_assumptions',
    'accounting.view', 'accounting.post',
    'reconciliation.import', 'reconciliation.commit',
    'tax.view',
    'tax.manage',
    'tax.edit',
    'tax.approve',
    'tax.file',
    'tax.readiness.view',
    'tax.readiness.run',
    'tax.withholding.record',
    'tax.withholding.ingest',
    'reports.view', 'reports.export',
    'reporting_center.view',
    'reporting_center.query.run',
    'reporting_center.export',
    'clients.view', 'clients.manage',
    'pos.view', 'pos.checkout', 'pos.discount', 'pos.custom_item',
    'workspace.manage_members', 'workspace.manage_roles', 'workspace.manage_settings',
    // NOT: billing.manage
    // Workforce — full access
    'workforce.view', 'workforce.people.view', 'workforce.people.manage',
    'workforce.attendance.view', 'workforce.attendance.manage',
    'workforce.leave.view', 'workforce.leave.manage', 'workforce.leave.approve',
    'workforce.reports.view', 'workforce.settings.manage',
    // Payroll — visibility + settings (runs still gated by prepare/approve/post)
    'payroll.view',
    'payroll.settings.manage',

    // Documents — admin operations
    'documents.view',
    'documents.upload',
    'documents.manage',
    'documents.link',
    'documents.ocr.review',
    'documents.archive',
    'documents.restore',
    'documents.delete',
    'documents.compliance.view',
    'documents.compliance.manage',
    'documents.personal.view',
    'documents.personal.manage',
    'documents.settings.manage',

    // Shop — full operational control
    'shop.view',
    'shop.orders.view', 'shop.orders.manage',
    'shop.content.manage',
    'shop.settings.manage',
  ],

  FINANCE_MANAGER: [
    // Financial operations but no accounting posting, no tax config, no billing
    'dashboard.view',
    'invoices.view', 'invoices.create', 'invoices.edit', 'invoices.send', 'invoices.export',
    'retainers.view', 'retainers.manage',
    'expenses.view', 'expenses.create', 'expenses.delete',
    'purchase_orders.view', 'purchase_orders.create',
    'service_orders.view',
    'cash_flow.view', 'cash_flow.manage_assumptions',
    'accounting.view',    // can view but NOT post
    'reconciliation.import', 'reconciliation.commit',
    'tax.view',
    'tax.edit',
    'tax.file',
    'tax.readiness.view',
    'tax.readiness.run',
    'tax.withholding.record',
    'tax.withholding.ingest',
    'reports.view', 'reports.export',
    'reporting_center.view',
    'reporting_center.query.run',
    'reporting_center.export',
    'clients.view',
    'pos.view',
    // NOT: accounting.post, tax.approve, billing.manage, workspace.manage_*
    // Workforce — view-only (payroll cost oversight)
    'workforce.view', 'workforce.people.view',
    'workforce.attendance.view', 'workforce.leave.view', 'workforce.reports.view',
    // Payroll — maker/checker on runs, no posting or settings
    'payroll.view', 'payroll.prepare', 'payroll.approve',

    // Documents — finance intake + review + linking
    'documents.view',
    'documents.upload',
    'documents.manage',
    'documents.link',
    'documents.ocr.review',
    'documents.archive',
    'documents.restore',
    'documents.compliance.view',

    // Shop — visibility into orders for revenue/AR tracking; no content/settings
    'shop.view',
    'shop.orders.view',
  ],

  ACCOUNTANT: [
    // Read-only audit access to all financial records
    'dashboard.view',
    'invoices.view',           // view only, no export (sensitive bulk extraction)
    'retainers.view',
    'expenses.view',
    'purchase_orders.view',
    'service_orders.view',
    'cash_flow.view',
    'accounting.view',         // view only, NOT post
    'tax.view',
    'tax.file',
    'tax.readiness.view',
    'reports.view',            // view reports but NOT bulk export
    'reporting_center.view',
    'reporting_center.query.run',
    'clients.view',
    'pos.view',
    // NOT: any write, any export, any admin (no reporting_center.export — bulk extract)
    // Workforce — view-only
    'workforce.view', 'workforce.people.view', 'workforce.attendance.view',
    'workforce.leave.view', 'workforce.reports.view',
    // Payroll — posting role (after approval)
    'payroll.view', 'payroll.post',

    // Documents — view (audit evidence)
    'documents.view',
    'documents.compliance.view',

    // Shop — read-only for audit
    'shop.view',
    'shop.orders.view',
  ],

  SALES_MANAGER: [
    'dashboard.view',
    'proposals.view', 'proposals.create', 'proposals.edit', 'proposals.send', 'proposals.convert',
    'invoices.view', 'invoices.create',
    'tax.withholding.record',
    'retainers.view',
    'service_orders.view',
    'reports.view',
    'reporting_center.view', 'reporting_center.query.run', 'reporting_center.export',
    'clients.view', 'clients.manage',
    'pos.view', 'pos.checkout', 'pos.discount', 'pos.custom_item',
    // NOT: expenses admin, purchase_orders, inventory, accounting, tax, financial exports

    // Shop — sales side: read storefront, manage orders + content; no settings
    'shop.view',
    'shop.orders.view', 'shop.orders.manage',
    'shop.content.manage',
  ],

  OPERATIONS_MANAGER: [
    'dashboard.view',
    'service_orders.view', 'service_orders.manage',
    'purchase_orders.view', 'purchase_orders.create',
    'expenses.view', 'expenses.create',
    'tax.withholding.record',
    'tax.withholding.ingest',
    'inventory.view',
    'clients.view',
    'pos.view', 'pos.checkout', 'pos.custom_item',
    'reports.view',
    // NOT: invoices admin, proposals, accounting, tax, cash flow assumptions
    // Workforce — team management + approvals
    'workforce.view', 'workforce.people.view',
    'workforce.attendance.view', 'workforce.attendance.manage',
    'workforce.leave.view', 'workforce.leave.approve',
    'workforce.reports.view',

    // Documents — operational intake + linking
    'documents.view',
    'documents.upload',
    'documents.manage',
    'documents.link',
    'documents.archive',
    'documents.restore',

    // Shop — operations: orders + content; no settings
    'shop.view',
    'shop.orders.view', 'shop.orders.manage',
    'shop.content.manage',
  ],

  INVENTORY_MANAGER: [
    'dashboard.view',
    'inventory.view', 'inventory.edit',
    'purchase_orders.view', 'purchase_orders.create',
    'service_orders.view',
    'clients.view',
    'pos.view',
    // NOT: financial data, reports, accounting, tax

    // Shop — order visibility (stock impact) + content manage; no settings
    'shop.view',
    'shop.orders.view',
    'shop.content.manage',
  ],

  STAFF: [
    'dashboard.view',
    'clients.view',
    'invoices.view',
    'expenses.view', 'expenses.create',
    'tax.withholding.record',
    'service_orders.view',
    'pos.view', 'pos.checkout',
    // NOT: any admin, any financial management, any sensitive data
    // Workforce — self-service only
    'workforce.view', 'workforce.people.view',
    'workforce.attendance.view',
    'workforce.leave.view',

    // Documents — upload + view + link (no delete/settings)
    'documents.view',
    'documents.upload',
    'documents.link',

    // Shop — read-only for general staff
    'shop.view',
    'shop.orders.view',
  ],

  VIEWER: [
    // Strictly read-only — the audit/external reviewer role
    'dashboard.view',
    'tax.readiness.view',
    'reports.view',
    'reporting_center.view',
    'invoices.view',
    'expenses.view',
    'clients.view',
    'pos.view',
    // NOT: any write, any export, any admin

    // Documents — view-only for audits (no personal docs)
    'documents.view',
    'documents.compliance.view',

    // Shop — strictly read-only
    'shop.view',
    'shop.orders.view',
  ],
};

/**
 * Returns the full permission set for a given role.
 * Uses the DEFAULT_ROLE_PERMISSIONS template (no DB lookup).
 */
export function getPermissionsForRole(role: BusinessRole): ReadonlySet<Permission> {
  return new Set(DEFAULT_ROLE_PERMISSIONS[role]);
}

/**
 * Checks if a given role has a specific permission.
 * This is the template-based check (no DB lookup).
 * For authoritative enforcement, use requirePermission() from lib/rbac.ts.
 */
export function hasPermission(role: BusinessRole, permission: Permission): boolean {
  return (DEFAULT_ROLE_PERMISSIONS[role] as readonly string[]).includes(permission);
}

// ─────────────────────────────────────────────────────────────────────────────
// SEAT MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Seat semantics (explicit, no ambiguity):
 *
 * - PENDING INVITES reserve a seat. An invite that has not yet been accepted
 *   still reduces the available seat count. This prevents over-inviting.
 *
 * - DEACTIVATED USERS free their seat. A deactivated WorkspaceUser (isActive=false)
 *   does not count toward the used seat total. They retain their record for
 *   audit trail purposes but cannot access the workspace.
 *
 * - OWNERS count toward seats. There is no special carve-out for owners.
 *   Every active member (regardless of role) occupies a seat.
 *
 * - The seat count formula is:
 *     used = activeMembers + pendingInvites
 *     available = limit - used
 *     canInvite = available > 0 (or unlimited for special cases — none in current tiers)
 */
export const SEAT_SEMANTICS = {
  PENDING_INVITES_RESERVE_SEATS: true,
  DEACTIVATED_USERS_FREE_SEATS: true,
  OWNERS_COUNT_TOWARD_SEATS: true,
} as const;

export const PLAN_SEAT_LIMITS: Record<string, number> = {
  FREE:       1,
  PRO:        3,
  TEAM:       15,
  /** Legacy tier: treat as Team seat cap (Enterprise product removed). */
  ENTERPRISE: 15,
  TRIALING:   5,          // Trial workspaces get team-tier seat access
};

/** Returns the seat limit for a plan tier. */
export function getSeatLimit(planTier: string): number {
  const tier = (planTier ?? 'FREE').toUpperCase();
  return PLAN_SEAT_LIMITS[tier] ?? PLAN_SEAT_LIMITS.FREE;
}

/** Returns a UI-friendly seat limit label. */
export function formatSeatLimit(planTier: string): string {
  const limit = getSeatLimit(planTier);
  return limit === Infinity ? 'Unlimited' : String(limit);
}

// ─────────────────────────────────────────────────────────────────────────────
// OWNERSHIP RULES (explicit)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ownership rules (explicit, no ambiguity):
 *
 * 1. A workspace MUST always have at least one OWNER.
 *    Removing or demoting the last owner is blocked at the API level.
 *
 * 2. Self-demotion is BLOCKED. You cannot change your own role.
 *    An owner must designate another user as owner first.
 *
 * 3. Only OWNER can assign or revoke the OWNER role.
 *    ADMIN cannot promote a user to OWNER.
 *
 * 4. ADMIN can manage roles for STAFF, VIEWER, SALES_MANAGER,
 *    OPERATIONS_MANAGER, INVENTORY_MANAGER.
 *    ADMIN cannot manage roles for OWNER, ADMIN, FINANCE_MANAGER, or ACCOUNTANT.
 *    (Prevents privilege escalation via ADMIN acting on peers.)
 *
 * 5. Assigning any OWNER role triggers an elevated privilege alert.
 */

/** Roles that only OWNER can assign/revoke. */
export const OWNER_ONLY_ASSIGNABLE_ROLES = new Set<BusinessRole>(['OWNER', 'ADMIN', 'FINANCE_MANAGER', 'ACCOUNTANT']);

/** Roles that ADMIN can assign (lower-privilege roles). */
export const ADMIN_ASSIGNABLE_ROLES = new Set<BusinessRole>(['SALES_MANAGER', 'OPERATIONS_MANAGER', 'INVENTORY_MANAGER', 'STAFF', 'VIEWER']);

/**
 * Returns whether `actorRole` can assign `targetRole` to another user.
 * Does not check self-demotion or last-owner rules (those are checked separately).
 */
export function canAssignRole(actorRole: BusinessRole, targetRole: BusinessRole): boolean {
  if (actorRole === 'OWNER') return true;
  if (actorRole === 'ADMIN') return ADMIN_ASSIGNABLE_ROLES.has(targetRole);
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY COMPATIBILITY (for existing session/invite code)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Legacy role type kept for JWT/session compatibility.
 * The session still carries `role` as a plain string.
 * Server-side enforcement uses `businessRole` from a fresh DB lookup.
 */
export type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

/**
 * Maps a legacy role string to the nearest BusinessRole.
 * Used during migration for users who have `role` but no `businessRole` yet.
 */
export function legacyRoleToBusinessRole(role: string): BusinessRole {
  switch (role.toUpperCase()) {
    case 'OWNER':  return 'OWNER';
    case 'ADMIN':  return 'ADMIN';
    case 'MEMBER': return 'STAFF';
    case 'VIEWER': return 'VIEWER';
    default:       return 'VIEWER'; // safest fallback
  }
}

/** @deprecated Use requirePermission() from lib/rbac.ts for server-side enforcement */
export function canInviteMembers(role: string): boolean {
  const br = legacyRoleToBusinessRole(role);
  return hasPermission(br, 'workspace.manage_members');
}

/** @deprecated Use requirePermission() from lib/rbac.ts for server-side enforcement */
export function canManageBilling(role: string): boolean {
  const br = legacyRoleToBusinessRole(role);
  return hasPermission(br, 'billing.manage');
}

/** @deprecated Use getPermissionsForRole() with BusinessRole */
export const PERMISSIONS = {
  MANAGE_BILLING:              ['OWNER'] as string[],
  INVITE_MEMBERS:              ['OWNER', 'ADMIN'] as string[],
  MANAGE_WORKSPACE_SETTINGS:   ['OWNER', 'ADMIN'] as string[],
  CREATE_INVOICE:              ['OWNER', 'ADMIN', 'FINANCE_MANAGER', 'ACCOUNTANT'] as string[],
  EDIT_INVOICE:                ['OWNER', 'ADMIN', 'FINANCE_MANAGER'] as string[],
  DELETE_INVOICE:              ['OWNER', 'ADMIN'] as string[],
  CREATE_EXPENSE:              ['OWNER', 'ADMIN', 'FINANCE_MANAGER', 'OPERATIONS_MANAGER', 'STAFF'] as string[],
  EDIT_EXPENSE:                ['OWNER', 'ADMIN', 'FINANCE_MANAGER'] as string[],
  DELETE_EXPENSE:              ['OWNER', 'ADMIN', 'FINANCE_MANAGER'] as string[],
  VIEW_FINANCES:               ['OWNER', 'ADMIN', 'FINANCE_MANAGER', 'ACCOUNTANT', 'VIEWER'] as string[],
  MANAGE_CLIENTS:              ['OWNER', 'ADMIN', 'SALES_MANAGER'] as string[],
} as const;

/** @deprecated Use getSeatLimit() */
export function getMaxUsersForPlan(planTier: string): number {
  return getSeatLimit(planTier);
}
