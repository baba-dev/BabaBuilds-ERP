import { describe, expect, it } from 'vitest';
import { __testables } from '@/lib/compliance/tax-obligation-scheduler';

describe('tax obligation scheduler helpers', () => {
  it('returns monthly period bounds', () => {
    const bounds = __testables.getPeriodBounds(
      'MONTHLY',
      0,
      new Date('2026-04-17T00:00:00.000Z'),
    );

    expect(bounds.periodStart.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(bounds.periodEnd.toISOString()).toBe('2026-04-30T23:59:59.999Z');
  });

  it('returns annual due date using due month', () => {
    const dueDate = __testables.getDueDateForPeriod(
      {
        periodStart: new Date('2026-01-01T00:00:00.000Z'),
        periodEnd: new Date('2026-12-31T23:59:59.999Z'),
      },
      'ANNUAL',
      31,
      7,
    );

    expect(dueDate.toISOString()).toBe('2026-07-28T00:00:00.000Z');
  });

  it('transitions OPEN to READY when period closes', () => {
    const next = __testables.getNextStatus(
      'OPEN',
      new Date('2026-05-01T00:00:00.000Z'),
      new Date('2026-04-30T23:59:59.999Z'),
      new Date('2026-05-20T00:00:00.000Z'),
    );

    expect(next).toBe('READY');
  });

  it('transitions READY to FILED after due date passes', () => {
    const next = __testables.getNextStatus(
      'READY',
      new Date('2026-05-21T00:00:00.000Z'),
      new Date('2026-04-30T23:59:59.999Z'),
      new Date('2026-05-20T00:00:00.000Z'),
    );

    expect(next).toBe('FILED');
  });
});
