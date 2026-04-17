import { Prisma } from '@prisma/client';

const toDecimal = (value: Prisma.Decimal | number | string | null | undefined) =>
  new Prisma.Decimal(value ?? 0);

const toPeriodKey = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

export type WithholdingInput = {
  grossAmount: number;
  ratePercent?: number | null;
  explicitWithheldAmount?: number | null;
  deductedAt: Date;
};

export const computeWithheldAmount = (input: WithholdingInput) => {
  if (input.explicitWithheldAmount !== null && input.explicitWithheldAmount !== undefined) {
    return toDecimal(input.explicitWithheldAmount).toDecimalPlaces(2);
  }

  if (input.ratePercent === null || input.ratePercent === undefined) {
    return new Prisma.Decimal(0);
  }

  return toDecimal(input.grossAmount)
    .mul(toDecimal(input.ratePercent).div(100))
    .toDecimalPlaces(2);
};

export const defaultDepositDueDate = (deductedAt: Date) => {
  const dueDate = new Date(Date.UTC(deductedAt.getUTCFullYear(), deductedAt.getUTCMonth() + 1, 7, 0, 0, 0));
  return dueDate;
};

export const deriveReturnPeriodKey = (deductedAt: Date, provided?: string | null) =>
  (provided && provided.trim()) || toPeriodKey(deductedAt);

export type ReadinessIssue = {
  code: string;
  severity: 'warning' | 'blocker';
  message: string;
  periodKey?: string;
  deltaAmount?: number;
};

export type ReconcilePeriodInput = {
  periodKey: string;
  dueDate: Date;
  filedAt?: Date | null;
  withheldAmount: Prisma.Decimal;
  creditedAmount: Prisma.Decimal;
};

export const reconcileWithholdingForPeriod = (input: ReconcilePeriodInput, now: Date): ReadinessIssue[] => {
  const delta = input.withheldAmount.minus(input.creditedAmount).toDecimalPlaces(2);
  const issues: ReadinessIssue[] = [];

  if (!delta.isZero()) {
    const severity: 'warning' | 'blocker' = input.dueDate < now && !input.filedAt ? 'blocker' : 'warning';
    issues.push({
      code: 'WITHHOLDING_CREDIT_MISMATCH',
      severity,
      message: `Withheld and credited amounts differ for ${input.periodKey}.`,
      periodKey: input.periodKey,
      deltaAmount: Number(delta.toString()),
    });
  }

  if (input.dueDate < now && !input.filedAt) {
    issues.push({
      code: 'RETURN_PERIOD_OVERDUE',
      severity: 'blocker',
      message: `Return period ${input.periodKey} is overdue and still unfiled.`,
      periodKey: input.periodKey,
    });
  }

  return issues;
};
