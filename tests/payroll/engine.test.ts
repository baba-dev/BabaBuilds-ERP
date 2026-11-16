import { describe, expect, it } from 'vitest';
import { computePayslip, sumPayslips } from '@/lib/payroll/engine/engine';
import { computeEsi, computePf, computeProfessionalTax } from '@/lib/payroll/engine/statutory';
import { buildStructureFromCtc } from '@/lib/payroll/engine/ctc';
import type { PayslipInput } from '@/lib/payroll/engine/types';

const base = (over: Partial<PayslipInput> = {}): PayslipInput => ({
  periodStart: '2026-04-01', periodEnd: '2026-04-30', fy: '2026-27', fyMonth: 1,
  components: [
    { code: 'BASIC', label: 'Basic', monthly: 30000, taxable: true, prorate: true, pfWage: true },
    { code: 'HRA', label: 'HRA', monthly: 15000, taxable: true, prorate: true },
    { code: 'SPECIAL', label: 'Special', monthly: 25000, taxable: true, prorate: true },
  ],
  adjustments: [], loanInstalments: [],
  statutory: { pfEnabled: true, pfOnActualBasic: false, esiEnabled: false, ptState: 'KA', hasPan: true },
  tax: { regime: 'new', oldRegimeDeductions: 0, ytdTaxableEarnings: 0, ytdTds: 0, ytdProfessionalTax: 0, ytdEmployeePf: 0 },
  lopBasis: 'CALENDAR_DAYS',
  ...over,
});

describe('provident fund', () => {
  it('caps wages at 15,000 unless on actual basic', () => {
    const capped = computePf(30000, { enabled: true, onActualBasic: false });
    expect(capped.wage).toBe(15000);
    expect(capped.employee).toBe(1800);
    expect(capped.eps).toBe(1250);
    expect(capped.epf).toBe(550);
    expect(capped.admin).toBe(75);
    expect(capped.edli).toBe(75);
    expect(computePf(30000, { enabled: true, onActualBasic: true }).employee).toBe(3600);
  });
  it('splits employer 12% into pension and provident fund', () => {
    const pf = computePf(10000, { enabled: true, onActualBasic: false });
    expect(pf.employee).toBe(1200);
    expect(pf.eps + pf.epf).toBe(1200);
    expect(pf.eps).toBe(833);
  });
  it('is zero when switched off', () => expect(computePf(30000, { enabled: false, onActualBasic: false }).employee).toBe(0));
});

describe('ESI', () => {
  it('rounds up and stops above the wage limit', () => {
    const e = computeEsi(20000, { enabled: true });
    expect(e.employee).toBe(150);
    expect(e.employer).toBe(650);
    expect(computeEsi(15001, { enabled: true }).employee).toBe(113);
    expect(computeEsi(21001, { enabled: true }).applicable).toBe(false);
  });
});

describe('professional tax', () => {
  it('follows state slabs, with the February top-up in Maharashtra', () => {
    expect(computeProfessionalTax(50000, 'KA', 5).amount).toBe(200);
    expect(computeProfessionalTax(20000, 'KA', 5).amount).toBe(0);
    expect(computeProfessionalTax(30000, 'MH', 4).amount).toBe(200);
    expect(computeProfessionalTax(30000, 'MH', 2).amount).toBe(300);
    expect(computeProfessionalTax(50000, 'DL', 5)).toMatchObject({ amount: 0, reason: 'NO_TAX' });
    expect(computeProfessionalTax(50000, 'KL', 5)).toMatchObject({ amount: 0, supported: false, reason: 'NOT_MODELLED' });
  });
});

describe('payslip', () => {
  it('adds up gross, deductions and net for a full month', () => {
    const r = computePayslip(base());
    expect(r.totals.gross).toBe(70000);
    const names = r.deductions.map((d) => d.code);
    expect(names).toEqual(expect.arrayContaining(['PF_EMPLOYEE', 'PROF_TAX']));
    expect(r.statutory.pf.employee).toBe(1800);
    expect(r.statutory.pt).toBe(200);
    expect(r.totals.netPay).toBeCloseTo(r.totals.gross - r.totals.totalDeductions, 2);
    expect(r.employer.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(r.totals.employerCost, 2);
  });

  it('new regime: 70,000 a month is taxed on the projected year', () => {
    const r = computePayslip(base());
    // 8.4 lakh a year, new regime: after 75,000 standard deduction 7.65 lakh, tax 0 + 5% of 3.65 lakh = 18,250 before rebate; rebate covers it.
    expect(r.statutory.tds.annualTax).toBe(0);
    expect(r.statutory.tds.monthly).toBe(0);
  });

  it('taxes a higher salary evenly across the months left', () => {
    const r = computePayslip(base({ components: [{ code: 'BASIC', label: 'Basic', monthly: 250000, taxable: true, prorate: true, pfWage: true }] }));
    expect(r.statutory.tds.annualTax).toBeGreaterThan(0);
    expect(r.statutory.tds.monthly % 10).toBe(0);
    expect(r.statutory.tds.monthly * 12).toBeGreaterThan(r.statutory.tds.annualTax - 120);
    expect(r.statutory.tds.monthly * 12).toBeLessThan(r.statutory.tds.annualTax + 120);
  });

  it('spreads what is left after tax already deducted', () => {
    const comps = [{ code: 'BASIC', label: 'Basic', monthly: 250000, taxable: true, prorate: true, pfWage: true }];
    const first = computePayslip(base({ components: comps }));
    const later = computePayslip(base({ components: comps, periodStart: '2027-03-01', periodEnd: '2027-03-31', fyMonth: 12,
      tax: { regime: 'new', oldRegimeDeductions: 0, ytdTaxableEarnings: 250000 * 11, ytdTds: first.statutory.tds.monthly * 11, ytdProfessionalTax: 0, ytdEmployeePf: 0 } }));
    expect(later.statutory.tds.monthsLeft).toBe(1);
    expect(Math.abs(later.statutory.tds.monthly - first.statutory.tds.monthly)).toBeLessThanOrEqual(110);
  });

  it('deducts loss of pay days in proportion', () => {
    const r = computePayslip(base({ adjustments: [{ kind: 'LOP_DAYS', code: 'LOP', label: 'Loss of pay', amount: 3, taxable: true }] }));
    expect(r.period.payableDays).toBe(27);
    expect(r.earnings.find((e) => e.code === 'BASIC')!.amount).toBe(27000);
    expect(r.totals.gross).toBe(63000);
  });

  it('uses a 30 day basis when asked', () => {
    const r = computePayslip(base({ lopBasis: 'FIXED_30', adjustments: [{ kind: 'LOP_DAYS', code: 'LOP', label: '', amount: 3, taxable: true }] }));
    expect(r.earnings.find((e) => e.code === 'BASIC')!.amount).toBe(27000);
  });

  it('prorates a mid-month joiner and a leaver', () => {
    const joiner = computePayslip(base({ joinDate: '2026-04-16' }));
    expect(joiner.period.notEmployedDays).toBe(15);
    expect(joiner.earnings.find((e) => e.code === 'BASIC')!.amount).toBe(15000);
    const leaver = computePayslip(base({ exitDate: '2026-04-10' }));
    expect(leaver.period.notEmployedDays).toBe(20);
    expect(leaver.statutory.tds.monthsLeft).toBe(1);
  });

  it('never lets optional deductions take net pay below zero', () => {
    const r = computePayslip(base({ loanInstalments: [{ label: 'Advance', amount: 500000 }] }));
    expect(r.totals.netPay).toBeGreaterThanOrEqual(0);
    expect(r.totals.shortfall).toBeGreaterThan(0);
    expect(r.warnings).toContain('DEDUCTIONS_CAPPED');
    // statutory deductions are not reduced
    expect(r.statutory.pf.employee).toBe(1800);
  });

  it('keeps reimbursements out of tax and ESI wages', () => {
    const r = computePayslip(base({ adjustments: [{ kind: 'REIMBURSEMENT', code: 'TRAVEL', label: 'Travel', amount: 5000, taxable: true }] }));
    expect(r.totals.gross).toBe(75000);
    expect(r.totals.taxableGross).toBe(70000);
  });

  it('applies the higher no-PAN rate', () => {
    const r = computePayslip(base({ statutory: { pfEnabled: true, pfOnActualBasic: false, esiEnabled: false, ptState: 'KA', hasPan: false } }));
    expect(r.statutory.tds.monthly).toBe(14000);
    expect(r.warnings).toContain('NO_PAN_HIGHER_TDS');
  });

  it('flags a state whose professional tax is not built in', () => {
    expect(computePayslip(base({ statutory: { pfEnabled: true, pfOnActualBasic: false, esiEnabled: false, ptState: 'KL', hasPan: true } })).warnings).toContain('PT_STATE_NOT_MODELLED');
  });

  it('is deterministic', () => expect(computePayslip(base())).toEqual(computePayslip(base())));

  it('sums payslips for a run header', () => {
    const a = computePayslip(base());
    const t = sumPayslips([a, a]);
    expect(t.gross).toBe(140000);
    expect(t.netPay).toBeCloseTo(a.totals.netPay * 2, 2);
  });
});

describe('CTC structure', () => {
  it('balances to the monthly cost including employer PF', () => {
    const s = buildStructureFromCtc({ annualCtc: 1_200_000 });
    const basic = s.components.find((c) => c.code === 'BASIC')!.monthly;
    expect(basic).toBe(40000);
    expect(s.employerPfMonthly).toBe(1800);
    expect(s.monthlyGross + s.employerPfMonthly).toBeCloseTo(100000, 0);
  });
});

describe('statutory due dates', () => {
  it('falls in the month after the pay month', async () => {
    const { remittanceDueDate } = await import('@/lib/payroll/service/period');
    const end = new Date(Date.UTC(2026, 9, 31, 23, 59, 59, 999)); // October pay month
    expect(remittanceDueDate('PF', end).toISOString().slice(0, 10)).toBe('2026-11-15');
    expect(remittanceDueDate('ESI', end).toISOString().slice(0, 10)).toBe('2026-11-15');
    expect(remittanceDueDate('TDS', end).toISOString().slice(0, 10)).toBe('2026-11-07');
    expect(remittanceDueDate('PT', end).toISOString().slice(0, 10)).toBe('2026-11-30');
    // March tax is due 30 April
    expect(remittanceDueDate('TDS', new Date(Date.UTC(2027, 2, 31))).toISOString().slice(0, 10)).toBe('2027-04-30');
  });
});

describe('fiscal year helpers', () => {
  it('numbers months from April', async () => {
    const { fyOf } = await import('@/lib/payroll/service/period');
    expect(fyOf(new Date(Date.UTC(2026, 3, 1)))).toMatchObject({ label: '2026-27', fyMonth: 1 });
    expect(fyOf(new Date(Date.UTC(2027, 2, 31)))).toMatchObject({ label: '2026-27', fyMonth: 12 });
    expect(fyOf(new Date(Date.UTC(2026, 2, 31)))).toMatchObject({ label: '2025-26', fyMonth: 12 });
  });
});
