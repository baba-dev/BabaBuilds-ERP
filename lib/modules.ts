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

// ─────────────────────────────────────────────────────────────────────────────
// MODULE REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

export const MODULE_KEYS = ['WORKFORCE'] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export function isValidModuleKey(key: unknown): key is ModuleKey {
  return typeof key === 'string' && (MODULE_KEYS as readonly string[]).includes(key);
}

export const MODULE_LABELS: Record<ModuleKey, string> = {
  WORKFORCE: 'Workforce',
};

export const MODULE_DESCRIPTIONS: Record<ModuleKey, string> = {
  WORKFORCE:
    'Employee directory, attendance tracking, leave management, and HR approvals — fully integrated with your ERP.',
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
 * Returns false if no record exists (modules are opt-in).
 */
export async function isModuleEnabled(
  workspaceId: string,
  moduleKey: ModuleKey,
): Promise<boolean> {
  const record = await prisma.workspaceModule.findUnique({
    where: { workspaceId_moduleKey: { workspaceId, moduleKey } },
    select: { isEnabled: true },
  });
  return record?.isEnabled === true;
}

/**
 * Returns the set of enabled module keys for a workspace.
 * Used by sidebar/dashboard to determine which optional items to render.
 */
export async function getEnabledModules(workspaceId: string): Promise<Set<ModuleKey>> {
  const records = await prisma.workspaceModule.findMany({
    where: { workspaceId, isEnabled: true },
    select: { moduleKey: true },
  });
  return new Set(records.map((r) => r.moduleKey as ModuleKey));
}

/**
 * Throws ModuleDisabledError if the module is not enabled.
 * Use in route handlers and Server Components to guard Workforce routes.
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
