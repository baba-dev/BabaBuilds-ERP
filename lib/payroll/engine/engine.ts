import { Prisma } from '@prisma/client';
import { computeIndiaTax } from '@/lib/tax/india-income-tax';
import { computeEsi, computePf, computeProfessionalTax, r2, roundRupee } from './statutory';
import { PAYROLL_RULE_VERSION, type PayLine, type PayslipInput, type PayslipResult } from './types';

const DAY = 86_400_000;
const utc = (iso: string): number => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y!, (m ?? 1) - 1, d ?? 1);
};
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
const roundTo10 = (n: number) => Math.round(n / 10) * 10;

/** Works out one employee's pay for one month, with the reasoning for every line. Pure: same input, same output. */
export function computePayslip(input: PayslipInput): PayslipResult {
  const warnings: string[] = [];
  const start = utc(input.periodStart);
  const end = utc(input.periodEnd);
  const daysInMonth = Math.round((end - start) / DAY) + 1;
  const calMonth = new Date(end).getUTCMonth() + 1;

  const joinMs = input.joinDate ? utc(input.joinDate) : null;
  const exitMs = input.exitDate ? utc(input.exitDate) : null;
  const daysBeforeJoin = joinMs !== null && joinMs > start ? Math.min(daysInMonth, Math.round((joinMs - start) / DAY)) : 0;
  const daysAfterExit = exitMs !== null && exitMs < end ? Math.min(daysInMonth, Math.round((end - exitMs) / DAY)) : 0;
  const notEmployedDays = Math.min(daysInMonth, daysBeforeJoin + daysAfterExit);
  const employedDays = daysInMonth - notEmployedDays;
  const lopRaw = input.adjustments.filter((a) => a.kind === 'LOP_DAYS').reduce((s, a) => s + a.amount, 0);
  const lopDays = clamp(lopRaw, 0, employedDays);
  if (lopRaw > employedDays) warnings.push('LOP_EXCEEDS_DAYS');
  const divisor = input.lopBasis === 'FIXED_30' ? 30 : daysInMonth;
  const factor = clamp(1 - (lopDays + notEmployedDays) / divisor, 0, 1);
  const payableDays = employedDays - lopDays;

  // ---- earnings ----
  const earnings: PayLine[] = [];
  let gross = 0;
  let taxableGross = 0;
  let pfWagesActual = 0;
  let recurringTaxableFullMonth = 0;

  for (const c of input.components) {
    const full = c.monthly;
    const amount = roundRupee(c.prorate ? full * factor : full);
    if (amount === 0 && full === 0) continue;
    earnings.push({
      code: c.code,
      label: c.label,
      amount,
      formula: c.prorate && factor < 1 ? `${full} × ${r2(factor)} (${payableDays} of ${divisor} days paid)` : `${full} a month`,
    });
    gross += amount;
    if (c.taxable) {
      taxableGross += amount;
      recurringTaxableFullMonth += full;
    }
    if (c.pfWage) pfWagesActual += amount;
  }

  let reimbursements = 0;
  for (const a of input.adjustments) {
    if (a.kind === 'LOP_DAYS' || a.kind === 'DEDUCTION' || !(a.amount > 0)) continue;
    const amount = r2(a.amount);
    const taxable = a.kind === 'REIMBURSEMENT' ? false : a.taxable;
    earnings.push({ code: a.code, label: a.label, amount, formula: a.kind === 'REIMBURSEMENT' ? 'Reimbursed as claimed, not taxed' : 'One-off amount added this month' });
    gross += amount;
    if (a.kind === 'REIMBURSEMENT') reimbursements += amount;
    if (taxable) {
      taxableGross += amount;
    }
  }
  gross = r2(gross);
  taxableGross = r2(taxableGross);
  if (gross === 0) warnings.push('NO_EARNINGS');

  // ---- provident fund, ESI, professional tax ----
  const pf = computePf(pfWagesActual, { enabled: input.statutory.pfEnabled, onActualBasic: input.statutory.pfOnActualBasic });
  if (input.statutory.pfEnabled && pfWagesActual === 0) warnings.push('PF_NO_WAGES');
  const esiWages = r2(gross - reimbursements);
  const esi = computeEsi(esiWages, { enabled: input.statutory.esiEnabled });
  if (input.statutory.esiEnabled && !esi.applicable && esiWages > 0) warnings.push('ESI_ABOVE_LIMIT');

  const ptResult = computeProfessionalTax(taxableGross, input.statutory.ptState, calMonth);
  const pt = gross > 0 ? ptResult.amount : 0;
  if (!ptResult.supported && ptResult.reason === 'NOT_MODELLED') warnings.push('PT_STATE_NOT_MODELLED');
  if (ptResult.reason === 'NO_STATE') warnings.push('PT_NO_STATE');

  // ---- tax deducted at source on salary ----
  const leaving = exitMs !== null && exitMs <= end;
  const monthsLeft = leaving ? 1 : Math.max(1, 12 - input.fyMonth + 1);
  const futureMonths = monthsLeft - 1;
  const projectedIncome = r2(input.tax.ytdTaxableEarnings + taxableGross + futureMonths * recurringTaxableFullMonth);
  const projectedPf = input.tax.ytdEmployeePf + pf.employee * monthsLeft;
  const projectedPt = input.tax.ytdProfessionalTax + pt * monthsLeft;
  const deductionsForTax = input.tax.regime === 'old' ? input.tax.oldRegimeDeductions + Math.min(projectedPf, 150_000) + projectedPt : 0;
  const taxResult = computeIndiaTax({
    fy: input.fy,
    regime: input.tax.regime,
    taxpayerType: 'individual',
    residentIndividual: true,
    ageGroup: 'below60',
    taxableIncome: new Prisma.Decimal(Math.max(0, projectedIncome - deductionsForTax)),
    standardDeduction: true,
  });
  const annualTax = taxResult.final.toDecimalPlaces(0).toNumber();
  let tds = roundTo10(Math.max(0, annualTax - input.tax.ytdTds) / monthsLeft);
  const higherRateNoPan = !input.statutory.hasPan;
  if (higherRateNoPan && taxableGross > 0) {
    const floor = roundTo10(taxableGross * 0.2);
    if (floor > tds) tds = floor;
    warnings.push('NO_PAN_HIGHER_TDS');
  }

  // ---- deductions in order of priority ----
  const deductions: PayLine[] = [];
  const addDeduction = (code: string, label: string, amount: number, formula: string) => {
    if (amount > 0) deductions.push({ code, label, amount, formula });
  };
  addDeduction('PF_EMPLOYEE', 'Provident fund (employee)', pf.employee, `12% of PF wages ${pf.wage}`);
  addDeduction('ESI_EMPLOYEE', 'ESI (employee)', esi.employee, `0.75% of ${esi.wage}, rounded up`);
  addDeduction('PROF_TAX', 'Professional tax', pt, `${input.statutory.ptState ?? ''} slab for ${taxableGross}`);
  addDeduction('TDS', 'Income tax (TDS)', tds, `Projected yearly tax ${annualTax} less ${input.tax.ytdTds} already deducted, over ${monthsLeft} month${monthsLeft === 1 ? '' : 's'}`);

  const mandatory = deductions.reduce((s, d) => s + d.amount, 0);
  let available = Math.max(0, gross - mandatory);
  let shortfall = 0;
  const optional: { code: string; label: string; amount: number; formula: string }[] = [];
  for (const a of input.adjustments) if (a.kind === 'DEDUCTION' && a.amount > 0) optional.push({ code: a.code, label: a.label, amount: r2(a.amount), formula: 'One-off deduction this month' });
  for (const l of input.loanInstalments) if (l.amount > 0) optional.push({ code: 'LOAN_EMI', label: l.label, amount: r2(l.amount), formula: 'Loan instalment' });
  for (const o of optional) {
    const take = Math.min(o.amount, available);
    available = r2(available - take);
    if (take < o.amount) shortfall = r2(shortfall + (o.amount - take));
    if (take > 0) deductions.push({ ...o, amount: take, formula: take < o.amount ? `${o.formula}; ${r2(o.amount - take)} could not be taken this month` : o.formula });
  }
  if (shortfall > 0) warnings.push('DEDUCTIONS_CAPPED');

  const totalDeductions = r2(deductions.reduce((s, d) => s + d.amount, 0));
  let netPay = r2(gross - totalDeductions);
  if (netPay < 0) {
    warnings.push('NEGATIVE_NET');
    netPay = 0;
  }

  // ---- employer side ----
  const employer: PayLine[] = [];
  const addEmployer = (code: string, label: string, amount: number, formula: string) => {
    if (amount > 0) employer.push({ code, label, amount, formula });
  };
  addEmployer('PF_EPF', 'Provident fund (employer)', pf.epf, '12% of PF wages less pension share');
  addEmployer('PF_EPS', 'Pension scheme (employer)', pf.eps, '8.33% of PF wages, up to 1,250');
  addEmployer('PF_ADMIN', 'PF admin charge', pf.admin, '0.5% of PF wages');
  addEmployer('PF_EDLI', 'EDLI insurance', pf.edli, '0.5% of PF wages, up to 75');
  addEmployer('ESI_EMPLOYER', 'ESI (employer)', esi.employer, `3.25% of ${esi.wage}, rounded up`);
  const employerCost = r2(employer.reduce((s, d) => s + d.amount, 0));

  return {
    ruleVersion: PAYROLL_RULE_VERSION,
    period: { daysInMonth, lopDays, notEmployedDays, payableDays, factor: r2(factor) },
    earnings,
    deductions,
    employer,
    totals: { gross, taxableGross, totalDeductions, employerCost, netPay, shortfall },
    statutory: {
      pf,
      esi,
      pt,
      tds: { monthly: tds, projectedAnnualTaxableIncome: projectedIncome, annualTax, monthsLeft, higherRateNoPan },
    },
    warnings,
  };
}

/** Totals across a set of payslips, for run headers and reports. */
export function sumPayslips(list: PayslipResult[]) {
  const sum = (f: (p: PayslipResult) => number) => r2(list.reduce((s, p) => s + f(p), 0));
  return {
    gross: sum((p) => p.totals.gross),
    deductions: sum((p) => p.totals.totalDeductions),
    employerCost: sum((p) => p.totals.employerCost),
    netPay: sum((p) => p.totals.netPay),
    pfEmployee: sum((p) => p.statutory.pf.employee),
    pfEmployer: sum((p) => p.statutory.pf.epf + p.statutory.pf.eps + p.statutory.pf.admin + p.statutory.pf.edli),
    esiEmployee: sum((p) => p.statutory.esi.employee),
    esiEmployer: sum((p) => p.statutory.esi.employer),
    pt: sum((p) => p.statutory.pt),
    tds: sum((p) => p.statutory.tds.monthly),
  };
}
