import type {
  ComplianceTaskStatus,
  FilingFrequency,
  TaxObligationStatus,
} from '@prisma/client';
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfYear,
} from 'date-fns';
import { prisma } from '@/lib/prisma';

type PeriodBounds = {
  periodStart: Date;
  periodEnd: Date;
};

type SchedulerOptions = {
  asOf?: Date;
  workspaceId?: string;
  dueTaskWindowDays?: number;
};

type SchedulerResult = {
  processedWorkspaces: number;
  obligationsCreated: number;
  obligationsUpdated: number;
  periodsCreated: number;
  periodsUpdated: number;
  transitions: {
    openToReady: number;
    readyToFiled: number;
    openToFiled: number;
  };
  tasksCreated: number;
};

const DEFAULT_TASK_WINDOW_DAYS = 14;
const FILING_FREQUENCY = {
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  ANNUAL: 'ANNUAL',
} as const satisfies Record<string, FilingFrequency>;
const OBLIGATION_STATUS = {
  OPEN: 'OPEN',
  READY: 'READY',
  FILED: 'FILED',
} as const satisfies Record<string, TaxObligationStatus>;
const COMPLIANCE_TASK_STATUS = {
  PENDING: 'PENDING',
} as const satisfies Record<string, ComplianceTaskStatus>;

function normalizeDay(day: number): number {
  if (!Number.isFinite(day)) return 1;
  return Math.min(28, Math.max(1, Math.floor(day)));
}

function getPeriodBounds(
  frequency: FilingFrequency,
  offset: number,
  fromDate: Date,
): PeriodBounds {
  if (frequency === FILING_FREQUENCY.QUARTERLY) {
    const quarter = addMonths(startOfQuarter(fromDate), offset * 3);
    return {
      periodStart: startOfQuarter(quarter),
      periodEnd: endOfQuarter(quarter),
    };
  }

  if (frequency === FILING_FREQUENCY.ANNUAL) {
    const year = new Date(fromDate.getFullYear() + offset, 0, 1);
    return {
      periodStart: startOfYear(year),
      periodEnd: endOfYear(year),
    };
  }

  const month = addMonths(startOfMonth(fromDate), offset);
  return {
    periodStart: startOfMonth(month),
    periodEnd: endOfMonth(month),
  };
}

function buildPeriodKey(period: PeriodBounds): string {
  const start = period.periodStart.toISOString().slice(0, 10);
  const end = period.periodEnd.toISOString().slice(0, 10);
  return `${start}_${end}`;
}

function getDueDateForPeriod(
  period: PeriodBounds,
  frequency: FilingFrequency,
  dueDayOfMonth: number,
  dueMonthOfYear: number | null,
): Date {
  const day = normalizeDay(dueDayOfMonth);

  if (frequency === FILING_FREQUENCY.ANNUAL && dueMonthOfYear) {
    const dueMonth = Math.min(12, Math.max(1, dueMonthOfYear));
    const year = period.periodEnd.getFullYear() + (dueMonth === 1 ? 1 : 0);
    return new Date(Date.UTC(year, dueMonth - 1, day, 0, 0, 0, 0));
  }

  const targetMonth = addMonths(startOfMonth(period.periodEnd), 1);
  return new Date(Date.UTC(targetMonth.getFullYear(), targetMonth.getMonth(), day, 0, 0, 0, 0));
}

function getNextStatus(
  current: TaxObligationStatus,
  asOf: Date,
  periodEnd: Date,
  dueDate: Date,
): TaxObligationStatus {
  if (current === OBLIGATION_STATUS.FILED) {
    return OBLIGATION_STATUS.FILED;
  }

  if (asOf.getTime() > dueDate.getTime()) {
    return OBLIGATION_STATUS.FILED;
  }

  if (asOf.getTime() >= periodEnd.getTime()) {
    return OBLIGATION_STATUS.READY;
  }

  return OBLIGATION_STATUS.OPEN;
}

export async function runTaxObligationScheduler(
  options: SchedulerOptions = {},
): Promise<SchedulerResult> {
  const asOf = options.asOf ?? new Date();
  const taskWindowDays = options.dueTaskWindowDays ?? DEFAULT_TASK_WINDOW_DAYS;

  const workspaces = await prisma.workspace.findMany({
    where: options.workspaceId ? { id: options.workspaceId } : undefined,
    select: { id: true },
  });

  const result: SchedulerResult = {
    processedWorkspaces: workspaces.length,
    obligationsCreated: 0,
    obligationsUpdated: 0,
    periodsCreated: 0,
    periodsUpdated: 0,
    transitions: {
      openToReady: 0,
      readyToFiled: 0,
      openToFiled: 0,
    },
    tasksCreated: 0,
  };

  for (const workspace of workspaces) {
    const registrations = await prisma.workspaceTaxRegistration.findMany({
      where: {
        workspaceId: workspace.id,
        isActive: true,
        effectiveFrom: { lte: asOf },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
      },
      include: {
        filingCalendarRules: {
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    for (const registration of registrations) {
      const activeRule = registration.filingCalendarRules[0] ?? null;
      if (!activeRule) continue;

      const currentPeriodStart = getPeriodBounds(registration.frequency, 0, asOf).periodStart;

      await prisma.taxObligation.deleteMany({
        where: {
          workspaceId: workspace.id,
          taxRegistrationId: registration.id,
          status: { in: [OBLIGATION_STATUS.OPEN, OBLIGATION_STATUS.READY] },
          period: {
            is: {
              periodStart: { gte: currentPeriodStart },
            },
          },
        },
      });

      const periodCount = Math.max(1, activeRule.lookaheadPeriods);

      for (let index = 0; index < periodCount; index += 1) {
        const period = getPeriodBounds(registration.frequency, index, asOf);
        const periodKey = buildPeriodKey(period);
        const dueDate = getDueDateForPeriod(
          period,
          registration.frequency,
          activeRule.dueDayOfMonth,
          activeRule.dueMonthOfYear,
        );

        const existing = await prisma.taxObligation.findUnique({
          where: {
            workspaceId_taxRegistrationId_periodKey: {
              workspaceId: workspace.id,
              taxRegistrationId: registration.id,
              periodKey,
            },
          },
          include: { period: true },
        });

        const existingStatus = existing?.status ?? OBLIGATION_STATUS.OPEN;
        const nextStatus = getNextStatus(existingStatus, asOf, period.periodEnd, dueDate);

        if (!existing) {
          await prisma.taxObligation.create({
            data: {
              workspaceId: workspace.id,
              taxRegistrationId: registration.id,
              filingRuleId: activeRule.id,
              dueDate,
              status: nextStatus,
              readyAt: nextStatus !== OBLIGATION_STATUS.OPEN ? asOf : null,
              filedAt: nextStatus === OBLIGATION_STATUS.FILED ? asOf : null,
              periodKey,
              period: {
                create: {
                  workspaceId: workspace.id,
                  periodStart: period.periodStart,
                  periodEnd: period.periodEnd,
                  status: nextStatus,
                },
              },
            },
          });
          result.obligationsCreated += 1;
          result.periodsCreated += 1;
        } else {
          await prisma.taxObligation.update({
            where: { id: existing.id },
            data: {
              filingRuleId: activeRule.id,
              dueDate,
              status: nextStatus,
              readyAt:
                nextStatus !== OBLIGATION_STATUS.OPEN
                  ? (existing.readyAt ?? asOf)
                  : null,
              filedAt:
                nextStatus === OBLIGATION_STATUS.FILED
                  ? (existing.filedAt ?? asOf)
                  : null,
            },
          });
          result.obligationsUpdated += 1;

          if (existing.period) {
            await prisma.taxPeriod.update({
              where: { id: existing.period.id },
              data: {
                periodStart: period.periodStart,
                periodEnd: period.periodEnd,
                status: nextStatus,
              },
            });
            result.periodsUpdated += 1;
          } else {
            await prisma.taxPeriod.create({
              data: {
                workspaceId: workspace.id,
                obligationId: existing.id,
                periodStart: period.periodStart,
                periodEnd: period.periodEnd,
                status: nextStatus,
              },
            });
            result.periodsCreated += 1;
          }
        }

        if (existingStatus === OBLIGATION_STATUS.OPEN && nextStatus === OBLIGATION_STATUS.READY) {
          result.transitions.openToReady += 1;
        }
        if (existingStatus === OBLIGATION_STATUS.READY && nextStatus === OBLIGATION_STATUS.FILED) {
          result.transitions.readyToFiled += 1;
        }
        if (existingStatus === OBLIGATION_STATUS.OPEN && nextStatus === OBLIGATION_STATUS.FILED) {
          result.transitions.openToFiled += 1;
        }
      }
    }

    const upcomingDueDateStart = startOfDay(asOf);
    const upcomingDueDateEnd = addDays(upcomingDueDateStart, taskWindowDays);

    const upcomingObligations = await prisma.taxObligation.findMany({
      where: {
        workspaceId: workspace.id,
        status: { in: [OBLIGATION_STATUS.OPEN, OBLIGATION_STATUS.READY] },
        dueDate: {
          gte: upcomingDueDateStart,
          lte: upcomingDueDateEnd,
        },
      },
      include: {
        taxRegistration: {
          select: {
            taxType: true,
            jurisdictionCode: true,
          },
        },
      },
    });

    for (const obligation of upcomingObligations) {
      await prisma.complianceTask.upsert({
        where: {
          workspaceId_obligationId_dueDate: {
            workspaceId: workspace.id,
            obligationId: obligation.id,
            dueDate: obligation.dueDate,
          },
        },
        update: {
          title: `${obligation.taxRegistration.taxType} filing due (${obligation.taxRegistration.jurisdictionCode})`,
          status: COMPLIANCE_TASK_STATUS.PENDING,
        },
        create: {
          workspaceId: workspace.id,
          obligationId: obligation.id,
          dueDate: obligation.dueDate,
          title: `${obligation.taxRegistration.taxType} filing due (${obligation.taxRegistration.jurisdictionCode})`,
          status: COMPLIANCE_TASK_STATUS.PENDING,
        },
      });
      result.tasksCreated += 1;
    }
  }

  return result;
}

export const __testables = {
  getPeriodBounds,
  getDueDateForPeriod,
  getNextStatus,
};
