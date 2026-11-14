import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { PAYROLL_ACCOUNT_CODES as A, buildAccrualJournal, ledgerTotalsFromLines, remittanceAmounts } from '@/lib/payroll/posting';

const line = (over: Record<string, unknown> = {}) => ({
  earnings: 70000, employerCosts: 550 + 1250 + 75 + 75, netPay: 0,
  breakdownJson: { deductions: [{ code: 'PF_EMPLOYEE', amount: 1800 }, { code: 'PROF_TAX', amount: 200 }, { code: 'LOAN_EMI', amount: 2000 }] },
  statutoryJson: { pfEmployee: 1800, pfEpf: 550, pfEps: 1250, pfAdmin: 75, pfEdli: 75, pt: 200, tds: 0, esiEmployee: 0, esiEmployer: 0 },
  ...over,
});
// gross 70000 - pf 1800 - pt 200 - loan 2000 = 66000
const full = () => line({ netPay: 66000 });

describe('payroll ledger posting', () => {
  it('splits what is owed into the right liabilities and balances', () => {
    const totals = ledgerTotalsFromLines([full()]);
    expect(totals.pf.toNumber()).toBe(1800 + 550 + 1250 + 75 + 75);
    expect(totals.pt.toNumber()).toBe(200);
    expect(totals.loanRecovery.toNumber()).toBe(2000);
    expect(totals.otherDeductions.toNumber()).toBe(0);
    const { lines, debit, credit } = buildAccrualJournal(totals);
    expect(debit.equals(credit)).toBe(true);
    const by = (code: string) => lines.find((l) => l.accountCode === code)?.amount.toNumber();
    expect(by(A.payrollExpense)).toBe(70000);
    expect(by(A.employerContributions)).toBe(1950);
    expect(by(A.wagesPayable)).toBe(66000);
    expect(by(A.employeeLoans)).toBe(2000);
    expect(by(A.tdsPayable)).toBeUndefined(); // zero lines are left out
  });

  it('puts unexplained deductions into other deductions so the entry still balances', () => {
    const l = line({ netPay: 65000, breakdownJson: { deductions: [{ code: 'PF_EMPLOYEE', amount: 1800 }, { code: 'PROF_TAX', amount: 200 }, { code: 'LOAN_EMI', amount: 2000 }, { code: 'ADV', amount: 1000 }] } });
    const totals = ledgerTotalsFromLines([l]);
    expect(totals.otherDeductions.toNumber()).toBe(1000);
    const { debit, credit } = buildAccrualJournal(totals);
    expect(debit.equals(credit)).toBe(true);
  });

  it('adds several employees', () => {
    const totals = ledgerTotalsFromLines([full(), full()]);
    expect(totals.gross.toNumber()).toBe(140000);
    expect(buildAccrualJournal(totals).debit.equals(buildAccrualJournal(totals).credit)).toBe(true);
  });

  it('lists only the remittances that are owed', () => {
    const totals = ledgerTotalsFromLines([full()]);
    expect(remittanceAmounts(totals).map((r) => r.kind)).toEqual(['PF', 'PT']);
    expect(remittanceAmounts(totals)[0]!.amount).toEqual(new Prisma.Decimal(3750));
  });
});
