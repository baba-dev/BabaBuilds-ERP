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
  lastDayOfMonth,
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
    readyToOverdue: number;
    openToOverdue: number;
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
  OVERDUE: 'OVERDUE',
  FILED: 'FILED',
} as const satisfies Record<string, TaxObligationStatus>;
const COMPLIANCE_TASK_STATUS = {
  PENDING: 'PENDING',
} as const satisfies Record<string, ComplianceTaskStatus>;

function clampDayToMonth(year: number, monthIndexZeroBased: number, day: number): number {
  if (!Number.isFinite(day)) return 1;
  const floored = Math.max(1, Math.floor(day));
  const cap = lastDayOfMonth(new Date(Date.UTC(year, monthIndexZeroBased, 1))).getUTCDate();
  return Math.min(floored, cap);
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
  if (frequency === FILING_FREQUENCY.ANNUAL && dueMonthOfYear) {
    const dueMonth = Math.min(12, Math.max(1, dueMonthOfYear));
    const endY = period.periodEnd.getUTCFullYear();
    const endM = period.periodEnd.getUTCMonth() + 1; // 1-12
    // Annual return due is typically in the calendar year after the period end year
    // when due month is on/before the period end month; otherwise same calendar year as period end.
    const year = dueMonth <= endM ? endY + 1 : endY;
    const day = clampDayToMonth(year, dueMonth - 1, dueDayOfMonth);
    return new Date(Date.UTC(year, dueMonth - 1, day, 0, 0, 0, 0));
  }

  const targetMonth = addMonths(startOfMonth(period.periodEnd), 1);
  const day = clampDayToMonth(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth(), dueDayOfMonth);
  return new Date(Date.UTC(targetMonth.getFullYear(), targetMonth.getMonth(), day, 0, 0, 0, 0));
}

function getNextStatus(
  current: TaxObligationStatus,
  asOf: Date,
  periodEnd: Date,
  dueDate: Date,
  filedAt: Date | null,
): TaxObligationStatus {
  if (current === OBLIGATION_STATUS.FILED || filedAt) {
    return OBLIGATION_STATUS.FILED;
  }

  // Past due and not filed → overdue (even if still within the nominal period window)
  if (asOf.getTime() > dueDate.getTime()) {
    return OBLIGATION_STATUS.OVERDUE;
  }

  if (asOf.getTime() >= periodEnd.getTime()) {
    return OBLIGATION_STATUS.READY;
  }

  return OBLIGATION_STATUS.OPEN;
}

function shouldSetReadyAt(params: { asOf: Date; periodEnd: Date; status: TaxObligationStatus }): boolean {
  if (params.status !== OBLIGATION_STATUS.READY && params.status !== OBLIGATION_STATUS.OVERDUE) return false;
  return params.asOf.getTime() >= params.periodEnd.getTime();
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
      readyToOverdue: 0,
      openToOverdue: 0,
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
          status: { in: [OBLIGATION_STATUS.OPEN, OBLIGATION_STATUS.READY, OBLIGATION_STATUS.OVERDUE] },
          period: {
            is: {
              periodStart: { gte: currentPeriodStart },
            },
          },
        },
      });

      const periodCount = Math.max(1, activeRule.lookaheadPeriods);

      const periodKeys: string[] = [];
      const periodMeta: Array<{
        periodKey: string;
        period: PeriodBounds;
        dueDate: Date;
      }> = [];

      for (let index = 0; index < periodCount; index += 1) {
        const period = getPeriodBounds(registration.frequency, index, asOf);
        const periodKey = buildPeriodKey(period);
        const dueDate = getDueDateForPeriod(
          period,
          registration.frequency,
          activeRule.dueDayOfMonth,
          activeRule.dueMonthOfYear,
        );
        periodKeys.push(periodKey);
        periodMeta.push({ periodKey, period, dueDate });
      }

      const existingRows = await prisma.taxObligation.findMany({
        where: {
          workspaceId: workspace.id,
          taxRegistrationId: registration.id,
          periodKey: { in: periodKeys },
        },
        include: { period: true },
      });
      const existingByKey = new Map(existingRows.map((row) => [row.periodKey, row]));

      for (const { periodKey, period, dueDate } of periodMeta) {
        const existing = existingByKey.get(periodKey) ?? null;

        const existingStatus = existing?.status ?? OBLIGATION_STATUS.OPEN;
        const nextStatus = getNextStatus(
          existingStatus,
          asOf,
          period.periodEnd,
          dueDate,
          existing?.filedAt ?? null,
        );

        if (!existing) {
          await prisma.taxObligation.create({
            data: {
              workspaceId: workspace.id,
              taxRegistrationId: registration.id,
              filingRuleId: activeRule.id,
              dueDate,
              status: nextStatus,
              readyAt: shouldSetReadyAt({ asOf, periodEnd: period.periodEnd, status: nextStatus }) ? asOf : null,
              filedAt: null,
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
          const nextReadyAt =
            existing.readyAt ??
            (shouldSetReadyAt({ asOf, periodEnd: period.periodEnd, status: nextStatus }) ? asOf : null);

          await prisma.taxObligation.update({
            where: { id: existing.id },
            data: {
              filingRuleId: activeRule.id,
              dueDate,
              status: nextStatus,
              readyAt: nextReadyAt,
              filedAt: existing.filedAt,
            },
          });
          result.obligationsUpdated += 1;

          if (existing.period) {
            await prisma.taxObligationPeriod.update({
              where: { id: existing.period.id },
              data: {
                periodStart: period.periodStart,
                periodEnd: period.periodEnd,
                status: nextStatus,
              },
            });
            result.periodsUpdated += 1;
          } else {
            await prisma.taxObligationPeriod.create({
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
        if (existingStatus === OBLIGATION_STATUS.READY && nextStatus === OBLIGATION_STATUS.OVERDUE) {
          result.transitions.readyToOverdue += 1;
        }
        if (existingStatus === OBLIGATION_STATUS.OPEN && nextStatus === OBLIGATION_STATUS.OVERDUE) {
          result.transitions.openToOverdue += 1;
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
        status: { in: [OBLIGATION_STATUS.OPEN, OBLIGATION_STATUS.READY, OBLIGATION_STATUS.OVERDUE] },
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
