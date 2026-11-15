import 'server-only';

import type { PayComponentCategory, PayrollInputMode, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type PayrollPayComponentInput = {
  name: string;
  code: string;
  category: PayComponentCategory;
  isTaxable?: boolean;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
};

export type StandalonePayrollConfig = {
  allowManualRecords: boolean;
  allowCsvImport: boolean;
  csvTemplateHeaders: string[];
};

export type WorkforceLinkedPayrollConfig = {
  autoMapDepartment: boolean;
  autoMapDesignation: boolean;
  attendancePolicySource: 'NONE' | 'WORKFORCE_ATTENDANCE';
  leavePolicySource: 'NONE' | 'WORKFORCE_LEAVE';
};

const DEFAULT_STANDALONE_CONFIG: StandalonePayrollConfig = {
  allowManualRecords: true,
  allowCsvImport: true,
  csvTemplateHeaders: ['employee_code', 'base_salary', 'allowance', 'variable_pay', 'deductions'],
};

const DEFAULT_WORKFORCE_LINKED_CONFIG: WorkforceLinkedPayrollConfig = {
  autoMapDepartment: true,
  autoMapDesignation: true,
  attendancePolicySource: 'WORKFORCE_ATTENDANCE',
  leavePolicySource: 'WORKFORCE_LEAVE',
};

const DEFAULT_STATUTORY_RULES = {
  professionalTaxEnabled: false,
  socialSecurityEnabled: false,
  providentFundEnabled: false,
  esiEnabled: false,
};

const DEFAULT_PAYMENT_SCHEDULE = {
  frequency: 'MONTHLY',
  payDay: 1,
  processingOffsetDays: 2,
  payoutMethod: 'BANK_TRANSFER',
  lopBasis: 'CALENDAR_DAYS',
};

const DEFAULT_COST_ALLOCATION = {
  strategy: 'DEPARTMENT',
  fallbackCostCenter: 'GENERAL',
  splitBy: [],
};

function asObject<T extends Record<string, unknown>>(value: unknown, fallback: T): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fallback;
  }
  return { ...fallback, ...(value as Record<string, unknown>) } as T;
}

export function toStandaloneConfig(value: unknown): StandalonePayrollConfig {
  return asObject(value, DEFAULT_STANDALONE_CONFIG);
}

export function toWorkforceLinkedConfig(value: unknown): WorkforceLinkedPayrollConfig {
  return asObject(value, DEFAULT_WORKFORCE_LINKED_CONFIG);
}

export function toStatutoryRules(value: unknown): Record<string, unknown> {
  return asObject(value, DEFAULT_STATUTORY_RULES);
}

export function toPaymentSchedule(value: unknown): Record<string, unknown> {
  return asObject(value, DEFAULT_PAYMENT_SCHEDULE);
}

export function toDefaultCostAllocation(value: unknown): Record<string, unknown> {
  return asObject(value, DEFAULT_COST_ALLOCATION);
}

export async function getWorkspaceIdForUser(userId: string): Promise<string | null> {
  const workspaceUser = await prisma.workspaceUser.findFirst({
    where: { userId, isActive: true },
    select: { workspaceId: true },
  });
  return workspaceUser?.workspaceId ?? null;
}

export async function ensurePayrollSettings(workspaceId: string) {
  return prisma.payrollSettings.upsert({
    where: { workspaceId },
    update: {},
    create: { workspaceId },
  });
}

export async function getPayrollSettingsSnapshot(workspaceId: string) {
  const settings = await ensurePayrollSettings(workspaceId);
  const components = await prisma.payrollPayComponent.findMany({
    where: { workspaceId },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });

  return {
    inputMode: settings.inputMode,
    standaloneConfig: toStandaloneConfig(settings.standaloneConfigJson),
    workforceLinkedConfig: toWorkforceLinkedConfig(settings.workforceLinkedConfigJson),
    statutoryRules: toStatutoryRules(settings.statutoryRulesJson),
    paymentSchedule: toPaymentSchedule(settings.paymentScheduleJson),
    defaultCostAllocation: toDefaultCostAllocation(settings.defaultCostAllocationJson),
    components,
  };
}

export async function updatePayrollSettings(
  workspaceId: string,
  data: {
    inputMode?: PayrollInputMode;
    standaloneConfig?: StandalonePayrollConfig;
    workforceLinkedConfig?: WorkforceLinkedPayrollConfig;
    statutoryRules?: Record<string, unknown>;
    paymentSchedule?: Record<string, unknown>;
    defaultCostAllocation?: Record<string, unknown>;
  },
) {
  return prisma.payrollSettings.upsert({
    where: { workspaceId },
    update: {
      ...(data.inputMode ? { inputMode: data.inputMode } : {}),
      ...(data.standaloneConfig ? { standaloneConfigJson: data.standaloneConfig as Prisma.InputJsonValue } : {}),
      ...(data.workforceLinkedConfig ? { workforceLinkedConfigJson: data.workforceLinkedConfig as Prisma.InputJsonValue } : {}),
      ...(data.statutoryRules ? { statutoryRulesJson: data.statutoryRules as Prisma.InputJsonValue } : {}),
      ...(data.paymentSchedule ? { paymentScheduleJson: data.paymentSchedule as Prisma.InputJsonValue } : {}),
      ...(data.defaultCostAllocation
        ? { defaultCostAllocationJson: data.defaultCostAllocation as Prisma.InputJsonValue }
        : {}),
    },
    create: {
      workspaceId,
      inputMode: data.inputMode,
      standaloneConfigJson: (data.standaloneConfig ?? DEFAULT_STANDALONE_CONFIG) as Prisma.InputJsonValue,
      workforceLinkedConfigJson:
        (data.workforceLinkedConfig ?? DEFAULT_WORKFORCE_LINKED_CONFIG) as Prisma.InputJsonValue,
      statutoryRulesJson: (data.statutoryRules ?? DEFAULT_STATUTORY_RULES) as Prisma.InputJsonValue,
      paymentScheduleJson: (data.paymentSchedule ?? DEFAULT_PAYMENT_SCHEDULE) as Prisma.InputJsonValue,
      defaultCostAllocationJson:
        (data.defaultCostAllocation ?? DEFAULT_COST_ALLOCATION) as Prisma.InputJsonValue,
    },
  });
}

export async function replacePayComponents(
  workspaceId: string,
  components: PayrollPayComponentInput[],
) {
  await prisma.$transaction(async (tx) => {
    await tx.payrollPayComponent.deleteMany({ where: { workspaceId } });

    for (const component of components) {
      await tx.payrollPayComponent.create({
        data: {
          workspaceId,
          name: component.name.trim(),
          code: component.code.trim().toUpperCase(),
          category: component.category,
          isTaxable: component.isTaxable ?? true,
          isActive: component.isActive ?? true,
          metadataJson: (component.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
    }
  });

  return prisma.payrollPayComponent.findMany({
    where: { workspaceId },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
}
