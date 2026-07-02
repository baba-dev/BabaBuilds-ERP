/**
 * lib/modules.ts
 *
 * Server-only helper for workspace-level optional module management.
 *
 * Architecture:
 * - Modules are stored in WorkspaceModule DB table (one row per workspace+module)
 * - Disabling is NON-DESTRUCTIVE: data is preserved, module is hidden/inactive
 * - Re-enabling restores the module and all prior data
 * - This is the single source of truth for module enablement across:
 *     nav, dashboard, route guards, settings, onboarding
 */

import 'server-only';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import {
  MODULE_KEYS,
  isValidModuleKey,
  isDefaultEnabledModule,
  DEFAULT_ENABLED_MODULE_KEYS,
  type ModuleKey,
} from '@/lib/module-keys';

// ─────────────────────────────────────────────────────────────────────────────
// MODULE REGISTRY
//
// Dependency policy:
// - PAYROLL runs standalone.
// - WORKFORCE enhances PAYROLL input quality.
// ─────────────────────────────────────────────────────────────────────────────

export { MODULE_KEYS, isValidModuleKey };
export type { ModuleKey };

export const MODULE_LABELS: Record<ModuleKey, string> = {
  WORKFORCE: 'Workforce',
  PAYROLL: 'Payroll',
  DOCUMENTS: 'Document Vault',
  REVENUE_PIPELINE: 'Revenue Pipeline',
  CASH_FLOW: 'Cash Flow',
  AR_COLLECTIONS: 'AR Aging + Collections Centre',
  TAX_ADVANCED: 'Tax Advanced',
  REPORTING_CENTER: 'Reporting Center',
  IMPORT_MANAGER: 'Import Manager',
  SHOP: 'Public Shop (E-Store)',
  MIAB_BILLING: 'Email Billing',
};

export const MODULE_DESCRIPTIONS: Record<ModuleKey, string> = {
  WORKFORCE:
    'Employee directory, attendance tracking, leave management, and HR approvals — improves payroll input quality and accuracy.',
  PAYROLL:
    'Payroll runs, posting, liabilities, and compliance exports with onboarding, readiness checks, and staged rollout before go-live.',
  DOCUMENTS:
    'Secure document storage with OCR ingestion, extracted-field review, and ERP-native record linking for accounting and compliance.',
  REVENUE_PIPELINE:
    'Pipeline intelligence for proposals with stage insights, stalled-deal detection, and next-best-action workflows to accelerate conversions.',
  CASH_FLOW:
    'Cash forecast snapshots, scenario planning, variance analysis, and proactive liquidity alerts to anticipate crunch windows early.',
  AR_COLLECTIONS:
    'Aging buckets, overdue work queues, reminder automation, and collector prioritization workflows to improve receivables recovery.',
  TAX_ADVANCED:
    'Advanced tax compliance operations including readiness pipelines, import diagnostics, override tooling, and audit workflows.',
  REPORTING_CENTER:
    'Enterprise-ready reporting workspace with curated finance/compliance presets, governed query execution, and polished exports.',
  IMPORT_MANAGER:
    'Universal import workspace with template downloads, intelligent mapping, strict validation, preview-first workflows, and safe create/upsert execution.',
  SHOP:
    'Public storefront for clients to browse your catalog, place orders, and pay via Razorpay/Stripe — including content sections (About, Social, FAQ) editable from the dashboard.',
  MIAB_BILLING:
    'Read-only Mail-in-a-Box domain and mailbox inventory mapped to ERP clients, retainers, and recurring invoices.',
};

export const MODULE_FEATURES: Record<ModuleKey, string[]> = {
  WORKFORCE: [
    'Employee directory & profiles',
    'Daily attendance tracking',
    'Leave requests & approvals',
    'Department & designation management',
    'Role-aware HR dashboards',
    'Approval queue with notifications',
  ],
  PAYROLL: [
    'Standalone payroll setup workflow',
    'Workforce-linked setup workflow',
    'Data health checks with go-live readiness checklist',
    'Execution phase controls (Phase 0 → GA)',
    'Read-only preview mode during internal alpha',
    'Posting/export safeguards for controlled rollout',
    'Payroll runs with period-level controls',
    'Payroll posting to ERP ledgers',
    'Liability tracking and settlement workflows',
    'Compliance-ready payroll exports',
    'Labor-cost analytics by team and period',
  ],
  DOCUMENTS: [
    'Upload Center (Inbox) with triage states',
    'OCR extraction with review & correction',
    'Link documents to expenses, invoices, and more',
    'Archive without deletion (audit preserved)',
    'Storage usage meter with plan-based limits',
  ],
  REVENUE_PIPELINE: [
    'Proposal pipeline overview by stage',
    'Accepted-but-unconverted revenue tracking',
    'Converted-but-unpaid cash-flow risk highlights',
    'Stalled deal detection with reason codes',
    'Action task generation for follow-up workflows',
  ],
  CASH_FLOW: [
    'Cash forecast snapshots across multiple horizons',
    'Scenario planning (base, best case, worst case)',
    'Variance analysis vs actuals',
    'Crunch-window and liquidity risk alerts',
    'Manual adjustments and assumption profiles',
  ],
  AR_COLLECTIONS: [
    'Aging buckets and overdue exposure tracking',
    'Collections priority queue by risk and amount',
    'Email payment reminders when SMTP is configured (automation and one-click send)',
    'Follow-up status tracking and collection risk score',
    'Promise-to-pay and escalation workflow states',
  ],
  TAX_ADVANCED: [
    'Tax readiness pipelines and compliance diagnostics',
    'Tax hub summary and operational overview',
    'Tax rate overrides with maker-checker controls',
    'Tax decision history and audit events',
    'Tax document linking and evidence traceability',
    'Tax import templates and batch diagnostics',
  ],
  REPORTING_CENTER: [
    'Preset report gallery for non-technical users',
    'Read-only SQL engine with enforced workspace scoping',
    'Interactive preview table with filter chips and metadata',
    'Enterprise XLSX export with frozen headers and autofilters',
    'Structured audit logs for every report run and export',
  ],
  IMPORT_MANAGER: [
    'Universal import flow for clients, services, shop items, inventory, proposals, and expenses',
    'CSV/XLSX template downloads plus arbitrary file mapping support',
    'Preview-first validation with duplicate detection and per-row issue reporting',
    'Create-only and upsert execution modes with workspace-scoped writes',
    'Run history with actor, source mode, AI usage, and execution summary',
  ],
  SHOP: [
    'Public storefront at /shop/<slug> with hero, products, contact, and JSON-LD SEO',
    'Editable content blocks (About Us, Social profiles, FAQ, custom announcement)',
    'Optional in-shop AI Assist drawer for buyers to capture leads / questions',
    'Order management with status workflow and gateway-aware checkout (Razorpay / Stripe)',
    'RBAC-scoped admin tools: separate orders, content, and settings permissions',
  ],
  MIAB_BILLING: [
    'Mail-in-a-Box server connection',
    'Read-only domain and mailbox inventory sync',
    'Client mapping for hosted domains',
    'Retainer linking and recurring billing setup',
    'Unmapped/unbilled domain detection',
    'Sync status and billing review suggestions',
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// ERRORS
// ─────────────────────────────────────────────────────────────────────────────

export class ModuleDisabledError extends Error {
  public readonly moduleKey: ModuleKey;
  constructor(moduleKey: ModuleKey) {
    super(`Module '${moduleKey}' is not enabled for this workspace.`);
    this.name = 'ModuleDisabledError';
    this.moduleKey = moduleKey;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns whether a specific module is currently enabled for a workspace.
 *
 * - If a WorkspaceModule record exists, its `isEnabled` flag wins.
 * - If no record exists and the module is in DEFAULT_ENABLED_MODULE_KEYS,
 *   the module is treated as enabled (back-compat for legacy modules like SHOP).
 * - Otherwise (no record, not default-enabled), the module is disabled.
 */
export async function isModuleEnabled(
  workspaceId: string,
  moduleKey: ModuleKey,
): Promise<boolean> {
  const record = await prisma.workspaceModule.findUnique({
    where: { workspaceId_moduleKey: { workspaceId, moduleKey } },
    select: { isEnabled: true },
  });
  if (record) return record.isEnabled === true;
  return isDefaultEnabledModule(moduleKey);
}

/**
 * Returns the set of enabled module keys for a workspace.
 * Used by sidebar/dashboard to determine which optional items to render.
 *
 * Includes default-enabled modules (e.g. SHOP) when the workspace has no
 * explicit record for them, preserving the legacy out-of-the-box experience.
 */
export async function getEnabledModules(workspaceId: string): Promise<Set<ModuleKey>> {
  const records = await prisma.workspaceModule.findMany({
    where: { workspaceId },
    select: { moduleKey: true, isEnabled: true },
  });

  const explicit = new Map<string, boolean>(records.map((r) => [r.moduleKey, r.isEnabled]));
  const enabled = new Set<ModuleKey>();

  for (const key of MODULE_KEYS) {
    if (explicit.has(key)) {
      if (explicit.get(key) === true) enabled.add(key);
    } else if (DEFAULT_ENABLED_MODULE_KEYS.has(key)) {
      enabled.add(key);
    }
  }

  return enabled;
}

/**
 * Throws ModuleDisabledError if the module is not enabled.
 * Use in route handlers and Server Components to guard module routes.
 *
 * Dependency policy:
 * - PAYROLL runs standalone (no module dependency required).
 * - WORKFORCE is optional and enhances PAYROLL input quality.
 */
export async function requireModule(
  workspaceId: string,
  moduleKey: ModuleKey,
): Promise<void> {
  const enabled = await isModuleEnabled(workspaceId, moduleKey);
  if (!enabled) {
    throw new ModuleDisabledError(moduleKey);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENABLE / DISABLE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enables a module for a workspace.
 * Creates the WorkspaceModule record if it does not exist.
 * Calls the module-specific initializer on first enable.
 */
export async function enableModule(
  workspaceId: string,
  moduleKey: ModuleKey,
  enabledByUserId?: string,
  configJson?: Record<string, unknown>,
): Promise<void> {
  const existing = await prisma.workspaceModule.findUnique({
    where: { workspaceId_moduleKey: { workspaceId, moduleKey } },
    select: { id: true, isEnabled: true },
  });

  if (existing) {
    if (!existing.isEnabled) {
      await prisma.workspaceModule.update({
        where: { workspaceId_moduleKey: { workspaceId, moduleKey } },
        data: {
          isEnabled: true,
          enabledAt: new Date(),
          enabledByUserId: enabledByUserId ?? null,
          disabledAt: null,
          disabledByUserId: null,
          ...(configJson ? { configJson: configJson as Prisma.InputJsonValue } : {}),
        },
      });
    }
    // Already enabled — no-op
  } else {
    // First time enabling — create record and initialize defaults
    await prisma.workspaceModule.create({
      data: {
        workspaceId,
        moduleKey,
        isEnabled: true,
        enabledByUserId: enabledByUserId ?? null,
        configJson: configJson ? (configJson as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });

    // Run module-specific initialization on first enable
    if (moduleKey === 'WORKFORCE') {
      const { initializeWorkforceDefaults } = await import('@/lib/workforce/index');
      await initializeWorkforceDefaults(workspaceId);
    }
    // DOCUMENTS: no initializer yet (schema-only); keep hook reserved for future defaults.
  }
}

/**
 * Disables a module for a workspace.
 * NON-DESTRUCTIVE: data is preserved, module is hidden/inactive.
 * Re-enabling will restore all data.
 */
export async function disableModule(
  workspaceId: string,
  moduleKey: ModuleKey,
  disabledByUserId?: string,
): Promise<void> {
  await prisma.workspaceModule.upsert({
    where: { workspaceId_moduleKey: { workspaceId, moduleKey } },
    update: {
      isEnabled: false,
      disabledAt: new Date(),
      disabledByUserId: disabledByUserId ?? null,
    },
    create: {
      workspaceId,
      moduleKey,
      isEnabled: false,
      disabledAt: new Date(),
      disabledByUserId: disabledByUserId ?? null,
    },
  });
}
