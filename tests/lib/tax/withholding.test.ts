import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { computeWithheldAmount, defaultDepositDueDate, reconcileWithholdingForPeriod } from '../../../lib/tax/withholding';

describe('withholding helpers', () => {
  it('computes withheld amount from rate when explicit value is absent', () => {
    const amount = computeWithheldAmount({
      grossAmount: 1000,
      ratePercent: 10,
      deductedAt: new Date('2026-04-01T00:00:00.000Z'),
    });

    expect(amount.toString()).toBe('100');
  });

  it('defaults due date to 7th of next month', () => {
    const due = defaultDepositDueDate(new Date('2026-04-10T00:00:00.000Z'));
    expect(due.toISOString()).toBe('2026-05-07T00:00:00.000Z');
  });

  it('flags overdue mismatches as blockers', () => {
    const issues = reconcileWithholdingForPeriod(
      {
        periodKey: '2026-03',
        dueDate: new Date('2026-04-05T00:00:00.000Z'),
        filedAt: null,
        withheldAmount: new Prisma.Decimal(500),
        creditedAmount: new Prisma.Decimal(100),
      },
      new Date('2026-04-10T00:00:00.000Z'),
    );

    expect(issues.some((issue) => issue.severity === 'blocker' && issue.code === 'WITHHOLDING_CREDIT_MISMATCH')).toBe(true);
    expect(issues.some((issue) => issue.code === 'RETURN_PERIOD_OVERDUE')).toBe(true);
  });
});
