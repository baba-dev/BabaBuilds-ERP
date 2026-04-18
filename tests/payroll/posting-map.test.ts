import { Prisma } from '@prisma/client';
import { expect, test } from 'vitest';
import { buildPayrollJournalPayload, mapPayrollRunTotalsToJournalAmounts } from '@/lib/payroll/posting';

test('mapPayrollRunTotalsToJournalAmounts produces balanced journal', () => {
  const j = mapPayrollRunTotalsToJournalAmounts({
    totalEarnings: new Prisma.Decimal('10000.00'),
    totalDeductions: new Prisma.Decimal('2000.00'),
    totalEmployerCosts: new Prisma.Decimal('500.00'),
    totalNetPay: new Prisma.Decimal('7500.00'),
  });
  const { totals } = buildPayrollJournalPayload(j);
  expect(totals.debit.equals(totals.credit)).toBe(true);
});

test('mapPayrollRunTotalsToJournalAmounts handles zero remainder', () => {
  const j = mapPayrollRunTotalsToJournalAmounts({
    totalEarnings: new Prisma.Decimal('5000'),
    totalDeductions: new Prisma.Decimal('0'),
    totalEmployerCosts: new Prisma.Decimal('0'),
    totalNetPay: new Prisma.Decimal('5000'),
  });
  expect(j.payrollExpense.equals(new Prisma.Decimal('5000'))).toBe(true);
  expect(j.wagesPayable.equals(new Prisma.Decimal('5000'))).toBe(true);
  const { totals } = buildPayrollJournalPayload(j);
  expect(totals.debit.equals(totals.credit)).toBe(true);
});
