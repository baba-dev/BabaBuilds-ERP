# Payroll

India-first payroll: pay structures, PF, ESI, professional tax, TDS on salary, approval, ledger posting, salary payment, statutory payments, payslips.

## How a month runs

1. **People** hold an effective-dated pay structure (`EmployeeCompensation`): monthly components, tax regime, PF/ESI switches, professional-tax state, encrypted PAN and bank account.
2. **Run payroll** (`/payroll/new`): add one-offs (bonus, arrears, reimbursement, deduction, unpaid days), check the pre-flight findings, calculate. Unpaid days come from Workforce attendance and approved leave when that module is on.
3. **Review and approve** (`/payroll/runs/[id]`). Approval needs `payroll.approve`; except for owners, the approver cannot be the preparer.
4. **Post** books the accrual (`PAYROLL_RUN`): salary expense and employer contributions debited; PF, ESI, professional tax, TDS, loan recoveries, other deductions and wages payable credited. It also creates the statutory dues (`PayrollRemittance`), recovers loan instalments and closes the month.
5. **Pay people** (`PAYROLL_PAYOUT`): clears wages payable against the bank. Download the bank file first.
6. **Pay government** (`PAYROLL_REMITTANCE`): clears the matching liability.

Calculation is a pure function (`lib/payroll/engine`), so the same input always gives the same payslip, line by line, with the working shown.

## Rules (rule version `IN-PAYROLL-2026-27-v1`)

| Item | Rule |
|---|---|
| PF | 12% employee and 12% employer of PF wages. Wage ceiling 15,000 unless "PF on actual basic". Employer share = pension 8.33% (max 1,250) + provident fund balance; admin 0.5%; EDLI 0.5% (max 75). Rounded to the rupee. |
| ESI | Applies when monthly gross is 21,000 or less. Employee 0.75%, employer 3.25%, rounded up. |
| Professional tax | Built-in monthly slabs for MH, KA, WB, TS, AP, GJ, OD, AS. States with no tax are recognised. Other states (including half-yearly ones) are not modelled: the pre-flight says so and the amount can be added as a one-off deduction. |
| TDS (section 192) | Projects the year's taxable pay, applies the chosen regime through `lib/tax/india-income-tax.ts`, subtracts tax already deducted and spreads the rest over the months left, rounded to 10. No PAN: at least 20%. Leaving: remaining tax is settled in the last month. |
| Unpaid days | Per day of pay = monthly pay / actual days in month, or / 30 (setting). Joiners and leavers are prorated the same way. |
| Due dates | PF and ESI 15th, TDS 7th (30 April for March), professional tax month end, all of the following month. |

Verify rates against the latest notifications before relying on them for filing; they live in `lib/payroll/engine/statutory.ts`.

## Known limits

- Earlier months of the financial year are assumed at the current pay when no payroll is on record (flagged as `YTD_ASSUMED`). There is no opening-balance import yet.
- HRA exemption, 80C and similar are one declared figure for the old regime, not itemised.
- No Form 16 / 24Q generation, no gratuity, no full and final settlement beyond proration.
- Payslip PDFs use built-in Latin fonts: English labels, currency written as `INR`.
- Amounts are in rupees; the engine is not multi-currency.
